// Aplikasi Express: susunan middleware dan rute.

const express = require('express')
const helmet = require('helmet')
const { muat } = require('./env')
const { muatPengguna } = require('./middleware/auth')

function buatAplikasi() {
  const aplikasi = express()
  const env = muat()

  // Jangan bocorkan teknologi lewat header.
  aplikasi.disable('x-powered-by')

  // Kepercayaan pada header X-Forwarded-For.
  //
  // Di balik Nginx, IP asli ada di header itu; tanpa mempercayainya semua
  // permintaan terlihat dari satu IP dan batas percobaan masuk jadi kacau.
  //
  // TETAPI `trust proxy: 1` berarti "percayai satu proksi terakhir tanpa
  // syarat". Header bisa dipalsukan siapa pun yang bisa menghubungi server
  // LANGSUNG. Diuji: 8 tebakan sandi dengan X-Forwarded-For berbeda tidak
  // pernah kena 429, sedangkan tanpa header kena pada tebakan ke-6. Artinya
  // batas brute-force bisa dilewati hanya dengan mengganti header.
  //
  // Karena itu kepercayaan dibatasi ke loopback saja: hanya proses di mesin
  // ini (Nginx) yang boleh menentukan IP klien. Bila suatu saat Nginx pindah
  // ke mesin lain, ganti dengan daftar alamat eksplisit lewat TRUST_PROXY.
  const trustProxy = (process.env.TRUST_PROXY || 'loopback').trim()
  aplikasi.set(
    'trust proxy',
    trustProxy === 'false' ? false : trustProxy === 'true' ? true : trustProxy,
  )

  // Header keamanan dasar: CSP, no-sniff, frameguard, HSTS (bila HTTPS).
  aplikasi.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  )

  // Batas 1 MB: muatan sinkron wajar jauh di bawah ini. Batas besar hanya
  // memperbesar peluang kehabisan memori.
  aplikasi.use(express.json({ limit: '1mb' }))

  // CORS: daftar asal eksplisit, bukan '*'. Dengan '*' plus token di header,
  // situs mana pun bisa memicu permintaan atas nama pengguna yang sedang login.
  const asalDiizinkan = (process.env.ASAL_DIIZINKAN || 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)

  aplikasi.use((minta, balas, lanjut) => {
    const asal = minta.header('Origin')
    if (asal && asalDiizinkan.includes(asal)) {
      balas.setHeader('Access-Control-Allow-Origin', asal)
      balas.setHeader('Vary', 'Origin')
      balas.setHeader('Access-Control-Allow-Credentials', 'true')
      balas.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
      balas.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,X-Requested-With,X-Kata-Sandi,X-Nama-Berkas',
      )
      balas.setHeader('Access-Control-Max-Age', '600')
    }
    if (minta.method === 'OPTIONS') return balas.status(204).send()
    lanjut()
  })

  // CSRF: token sekarang ada di cookie, yang otomatis ikut terkirim. Situs
  // lain tidak bisa menambahkan header khusus tanpa lolos CORS, jadi header
  // ini menutup pemalsuan permintaan lintas situs. Hanya berlaku untuk
  // permintaan yang mengubah data; GET dan OPTIONS bebas.
  const METODE_MENGUBAH = ['POST', 'PUT', 'PATCH', 'DELETE']
  aplikasi.use((minta, balas, lanjut) => {
    if (!METODE_MENGUBAH.includes(minta.method)) return lanjut()
    if (minta.header('X-Requested-With') !== 'smart-posyandu') {
      return balas.status(403).json({ detail: 'butuh_header_permintaan' })
    }
    lanjut()
  })

  // Batas laju per IP, disimpan di memori proses.
  //
  // Bahaya pada server PUBLIK: Map ini tumbuh mengikuti jumlah IP SUMBER, bukan
  // jumlah pengguna. Banjir permintaan dari banyak alamat (botnet, atau IPv6
  // acak yang murah) membuat entri menumpuk sebelum jendela 60 detik habis.
  // Diukur: 100.000 IP unik -> 30,5 MB, dan tak satu pun bisa dibersihkan
  // karena semuanya masih baru.
  //
  // Dua penjaga: batas keras jumlah entri (menolak IP baru saat penuh, jadi
  // memori tidak bisa didorong tanpa batas), dan pembersihan berkala yang
  // tidak bergantung pada keberuntungan 1% permintaan.
  const pencatatPercobaan = new Map()
  const BATAS_ENTRI = 20_000
  const JENDELA_MS = 60 * 1000
  const BATAS_PER_JENDELA = 300

  const bersihkanKedaluwarsa = (sekarang) => {
    for (const [k, v] of pencatatPercobaan) {
      if (v.reset < sekarang) pencatatPercobaan.delete(k)
    }
  }
  // Jaring pengaman: bersihkan tiap menit, bukan hanya saat ada permintaan.
  const pembersih = setInterval(() => bersihkanKedaluwarsa(Date.now()), JENDELA_MS)
  pembersih.unref?.()

  aplikasi.use((minta, balas, lanjut) => {
    const ip = minta.ip || '-'
    const sekarang = Date.now()
    let state = pencatatPercobaan.get(ip)

    if (!state) {
      // Peta penuh: coba bersihkan dulu, lalu tolak IP baru bila masih penuh.
      // Menolak (429) jauh lebih baik daripada membiarkan memori naik tanpa
      // batas sampai proses mati dan SELURUH layanan ikut mati.
      if (pencatatPercobaan.size >= BATAS_ENTRI) {
        bersihkanKedaluwarsa(sekarang)
        if (pencatatPercobaan.size >= BATAS_ENTRI) {
          return balas.status(429).json({ detail: 'terlalu_banyak_permintaan' })
        }
      }
      state = { n: 0, reset: sekarang + JENDELA_MS }
      pencatatPercobaan.set(ip, state)
    } else if (state.reset < sekarang) {
      state.n = 0
      state.reset = sekarang + JENDELA_MS
    }

    state.n += 1
    if (state.n > BATAS_PER_JENDELA) {
      return balas.status(429).json({ detail: 'terlalu_banyak_permintaan' })
    }
    lanjut()
  })

  aplikasi.use(muatPengguna)

  aplikasi.get('/sehat', (minta, balas) => balas.json({ status: 'sehat' }))
  aplikasi.get('/waktu', (minta, balas) =>
    balas.json({ waktu_server: new Date().toISOString() }),
  )

  aplikasi.use(require('./routes/masuk'))
  aplikasi.use(require('./routes/sinkron'))
  aplikasi.use(require('./routes/posyandu'))
  aplikasi.use(require('./routes/data'))
  aplikasi.use(require('./routes/pengguna'))
  aplikasi.use(require('./routes/sesi'))
  aplikasi.use(require('./routes/laporan'))
  aplikasi.use(require('./routes/cadangan'))

  aplikasi.use((minta, balas) => {
    balas.status(404).json({ detail: 'endpoint_tidak_ditemukan' })
  })

  aplikasi.use((salah, minta, balas, lanjut) => {
    const status = salah.status || 500
    if (status >= 500) {
      console.error('kesalahan_server', salah.stack || salah.message)
      balas.status(status).json({ detail: 'kesalahan_server' })
      return
    }
    balas.status(status).json({ detail: salah.message || 'kesalahan_server' })
  })

  return aplikasi
}

module.exports = { buatAplikasi }
