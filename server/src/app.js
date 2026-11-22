// Aplikasi Express: susunan middleware dan rute.

const express = require('express')
const helmet = require('helmet')
const { muat } = require('./env')
const { muatPengguna, butuhPeran } = require('./middleware/auth')
const { kueri, satu, banyak, dapatkan } = require('./db/pool')
const { ringkasPermintaan, usiaJam } = require('./domain/metrik')

function buatAplikasi() {
  const aplikasi = express()
  const env = muat()

  // Penghitung tetap kecil: satu entri per kode status, bukan satu entri per
  // permintaan. Pasang sebelum middleware lain supaya 429 dari pembatas laju
  // ikut terhitung.
  const hitsMetrik = { jumlah: 0, latensiMs: 0, kode: new Map() }
  aplikasi.use((minta, balas, lanjut) => {
    const mulai = Date.now()
    balas.on('finish', () => {
      hitsMetrik.jumlah += 1
      hitsMetrik.latensiMs += Date.now() - mulai
      hitsMetrik.kode.set(balas.statusCode, (hitsMetrik.kode.get(balas.statusCode) || 0) + 1)
    })
    lanjut()
  })

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
        'Content-Type,X-Requested-With,X-Kata-Sandi,X-Nama-Berkas,X-Metrik-Token',
      )
      balas.setHeader('Access-Control-Max-Age', '600')
    }
    if (minta.method === 'OPTIONS') return balas.status(204).send()
    lanjut()
  })

  // Batas laju per IP, disimpan di memori proses.
  // Runs before the CSRF gate so header-less writes still consume quota.
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
  // Login and guardian lookup accept untrusted input, so they get a tighter cap.
  const KUOTA_KETAT = 60
  const JALUR_KETAT = ['/masuk', '/wali/cari']
  const batasJalur = (jalur) =>
    JALUR_KETAT.includes(jalur.replace(/\/+$/, '')) ? KUOTA_KETAT : BATAS_PER_JENDELA
  // ponytail: two quota classes per IP, not per endpoint; move to router-level limiters when more classes are needed.

  // Satu jalur untuk setiap 429 dari pembatas, supaya Retry-After tidak bisa
  // terlewat pada cabang "peta penuh".
  const tolakLaju = (balas) =>
    balas.setHeader('Retry-After', '60').status(429).json({ detail: 'terlalu_banyak_permintaan' })

  const bersihkanKedaluwarsa = (sekarang) => {
    for (const [k, v] of pencatatPercobaan) {
      if (v.reset < sekarang) pencatatPercobaan.delete(k)
    }
  }
  // Jaring pengaman: bersihkan tiap menit, bukan hanya saat ada permintaan.
  const pembersih = setInterval(() => bersihkanKedaluwarsa(Date.now()), JENDELA_MS)
  pembersih.unref?.()

  aplikasi.use((minta, balas, lanjut) => {
    const batas = batasJalur(minta.path)
    const ip = minta.ip || '-'
    const kunci = `${batas}|${ip}`
    const sekarang = Date.now()
    let state = pencatatPercobaan.get(kunci)

    if (!state) {
      // Peta penuh: coba bersihkan dulu, lalu tolak IP baru bila masih penuh.
      // Menolak (429) jauh lebih baik daripada membiarkan memori naik tanpa
      // batas sampai proses mati dan SELURUH layanan ikut mati.
      if (pencatatPercobaan.size >= BATAS_ENTRI) {
        bersihkanKedaluwarsa(sekarang)
        if (pencatatPercobaan.size >= BATAS_ENTRI) {
          return tolakLaju(balas)
        }
      }
      state = { n: 0, reset: sekarang + JENDELA_MS }
      pencatatPercobaan.set(kunci, state)
    } else if (state.reset < sekarang) {
      state.n = 0
      state.reset = sekarang + JENDELA_MS
    }

    state.n += 1
    if (state.n > batas) {
      return tolakLaju(balas)
    }
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

  aplikasi.use(muatPengguna)

  aplikasi.get('/sehat', async (_minta, balas) => {
    try {
      await kueri('SELECT 1')
      balas.json({ status: 'sehat', db: 'ok' })
    } catch {
      balas.status(503).json({ status: 'sakit', db: 'gagal' })
    }
  })

  // Token opsional menggantikan sesi: bila tidak diisi, hanya admin_desa yang
  // boleh melihat metrik. Penjaga ini dipasang setelah muatPengguna.
  const penjagaMetrik = env.metrikToken
    ? (minta, balas, lanjut) => {
        if (minta.header('X-Metrik-Token') === env.metrikToken) return lanjut()
        return balas.status(401).json({ detail: 'metrik_tidak_diizinkan' })
      }
    : butuhPeran('admin_desa')

  aplikasi.get('/metrik', penjagaMetrik, async (_minta, balas) => {
    const pool = dapatkan()
    const uji = await satu(
      `SELECT berkas, cocok, diperiksa_pada
       FROM uji_cadangan ORDER BY diperiksa_pada DESC LIMIT 1`,
    ).catch(() => null)
    const barisAktivitas = await banyak(
      `SELECT COALESCE(state, 'null') AS state, count(*)::int AS jumlah
       FROM pg_stat_activity GROUP BY state ORDER BY jumlah DESC`,
    ).catch(() => null)
    const aktivitas = barisAktivitas
      ? Object.fromEntries(barisAktivitas.map(({ state, jumlah }) => [state, jumlah]))
      : null

    balas.json({
      lingkup: 'proses_ini',
      uptime_detik: process.uptime(),
      rss_mb: Math.round((process.memoryUsage().rss / 1048576) * 100) / 100,
      permintaan: ringkasPermintaan(hitsMetrik),
      koneksi: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
      uji_cadangan_terakhir: uji
        ? { berkas: uji.berkas, cocok: uji.cocok, diperiksa_pada: uji.diperiksa_pada }
        : null,
      uji_cadangan_usia_jam: usiaJam(uji?.diperiksa_pada),
      pg_stat_activity: aktivitas,
    })
  })
  aplikasi.get('/waktu', (minta, balas) =>
    balas.json({ waktu_server: new Date().toISOString() }),
  )

  aplikasi.use(require('./routes/masuk'))
  aplikasi.use(require('./routes/wali'))
  aplikasi.use(require('./routes/sinkron'))
  aplikasi.use(require('./routes/posyandu'))
  aplikasi.use(require('./routes/data'))
  aplikasi.use(require('./routes/pengguna'))
  aplikasi.use(require('./routes/sesi'))
  aplikasi.use(require('./routes/laporan'))
  aplikasi.use(require('./routes/cadangan'))
  aplikasi.use(require('./routes/konten'))
  aplikasi.use(require('./routes/aktivitas'))

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
