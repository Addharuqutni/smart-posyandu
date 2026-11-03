// Endpoint pencadangan: daftar berkas, jalankan sekarang, dan unduh berkas.

const fs = require('fs')
const path = require('path')
const express = require('express')
const { butuhPeran } = require('../middleware/auth')
const { jalankan, daftar, namaSah } = require('../jobs/cadangan')
const { pratinjau, pulihkan } = require('../jobs/pemulihan')
const { periksaKataSandi, tolak } = require('../domain/sandi-pemulihan')
const verifikasi = require('../jobs/verifikasi')
const { kueri } = require('../db/pool')

const router = express.Router()
const Admin = butuhPeran('admin_desa')

router.get('/cadangan', Admin, async (minta, balas) => {
  let uji = null
  try {
    uji = await verifikasi.terakhir()
  } catch {
    // Tabel uji mungkin belum ada di basis data lama; daftar tetap ditampilkan.
  }
  balas.json({ cadangan: daftar(), verifikasi: uji })
})

router.post('/cadangan', Admin, async (minta, balas) => {
  try {
    const hasil = await jalankan()
    balas.status(201).json(hasil)
  } catch (salah) {
    balas.status(500).json({ detail: 'pencadangan_gagal' })
  }
})

// Unduh satu berkas cadangan. Berkasnya sudah terenkripsi, jadi yang keluar
// dari server tetap tidak terbaca tanpa KUNCI_CADANGAN (AGENTS Bagian 6).
router.get('/cadangan/:nama', Admin, async (minta, balas) => {
  const nama = minta.params.nama
  // Tolak sebelum menyentuh sistem berkas: nama datang dari URL.
  if (!namaSah(nama) || nama.includes('/') || nama.includes('\\') || nama.includes('..')) {
    return balas.status(404).json({ detail: 'berkas_tidak_ditemukan' })
  }

  const env = require('../env').muat()
  const berkas = path.join(path.resolve(env.folderCadangan), nama)
  if (!fs.existsSync(berkas)) {
    return balas.status(404).json({ detail: 'berkas_tidak_ditemukan' })
  }

  // Mengunduh cadangan berarti membawa seluruh data keluar server; catat.
  await kueri(
    `INSERT INTO log_audit
       (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
        nilai_lama, nilai_baru, terjadi_pada, diterima_pada)
     VALUES (gen_random_uuid(), $1, 'server', 'cadangan', gen_random_uuid(), 'buat',
             NULL, $2, now(), now())`,
    [minta.pengguna.id, JSON.stringify({ berkas: nama })],
  )

  const ukuran = fs.statSync(berkas).size
  balas.setHeader('Content-Type', 'application/octet-stream')
  balas.setHeader('Content-Length', ukuran)
  balas.setHeader('Content-Disposition', `attachment; filename="${nama}"`)
  balas.setHeader('Cache-Control', 'no-store')
  fs.createReadStream(berkas).pipe(balas)
})

/** Kode galat pemulihan → status HTTP dan pesan untuk layar admin. */
const GALAT_PEMULIHAN = {
  berkas_tidak_ditemukan: [404, 'Berkas cadangan tidak ditemukan.'],
  kunci_cadangan_tidak_cocok: [
    409,
    'Berkas tidak bisa dibuka dengan kunci cadangan yang sekarang. Kunci mungkin pernah diganti.',
  ],
  berkas_cadangan_rusak: [409, 'Berkas cadangan rusak dan tidak bisa dibaca.'],
  isi_cadangan_tidak_sah: [409, 'Isi berkas cadangan tidak berbentuk yang diharapkan.'],
  isi_cadangan_kosong: [409, 'Berkas cadangan tidak memuat tabel apa pun.'],
  tidak_ada_tabel_dikenal: [409, 'Berkas tidak memuat tabel yang dikenal aplikasi ini.'],
  pemulihan_sedang_berjalan: [409, 'Pemulihan lain sedang berjalan. Tunggu sampai selesai.'],
  pemulihan_bentrok_unik: [
    409,
    'Basis data sudah punya baris lain dengan kunci yang sama (mis. satu kunjungan punya dua pengukuran). Tidak ada yang diubah.',
  ],
  pemulihan_bentrok_rujukan: [
    409,
    'Berkas memuat baris yang menunjuk data induk yang tidak ada. Tidak ada yang diubah.',
  ],
}

function jawabGalat(balas, salah) {
  const [status, pesan] = GALAT_PEMULIHAN[salah.kode] ?? [500, 'Pemulihan gagal.']
  balas.status(status).json({ detail: pesan, kode: salah.kode ?? 'pemulihan_gagal' })
}

// Pratinjau isi berkas: jumlah baris per tabel, tanpa menulis apa pun.
// Langkah ini yang dipakai prosedur mingguan untuk memastikan berkas tidak kosong.
router.get('/cadangan/:nama/pratinjau', Admin, async (minta, balas) => {
  try {
    balas.json(await pratinjau(minta.params.nama))
  } catch (salah) {
    jawabGalat(balas, salah)
  }
})

// Pulihkan isi berkas ke basis data. Menimpa baris ber-id sama, menambah
// baris yang belum ada, dan tidak menghapus apa pun.
router.post('/cadangan/:nama/pulihkan', Admin, async (minta, balas) => {
  try {
    if (minta.body?.konfirmasi !== minta.params.nama) {
      return balas.status(422).json({
        detail: 'Ketik nama berkas persis untuk mengonfirmasi pemulihan.',
        kode: 'konfirmasi_tidak_cocok',
      })
    }
    const sandiHasil = await periksaKataSandi(minta.pengguna.id, minta.body?.kata_sandi)
    if (tolak(balas, sandiHasil)) return
    const hasil = await pulihkan(minta.params.nama, { penggunaId: minta.pengguna.id })
    balas.json(hasil)
  } catch (salah) {
    if (salah.kode) return jawabGalat(balas, salah)
    if (salah.code === '23505') {
      return jawabGalat(balas, { kode: 'pemulihan_bentrok_unik' })
    }
    if (salah.code === '23503') {
      return jawabGalat(balas, { kode: 'pemulihan_bentrok_rujukan' })
    }
    console.error('Pemulihan gagal:', salah.message)
    balas.status(500).json({ detail: 'Pemulihan gagal.', kode: 'pemulihan_gagal' })
  }
})

// Pulihkan dari berkas yang diunggah (misalnya dari SSD/HDD kantor desa).
// Berkasnya sudah terenkripsi, jadi yang masuk ke server tetap tidak terbaca
// tanpa KUNCI_CADANGAN (AGENTS Bagian 6).
router.post(
  '/cadangan/pulihkan-unggah',
  Admin,
  express.raw({ type: '*/*', limit: '256mb' }),
  async (minta, balas) => {
    let berkasTersimpan = null
    try {
      // Kata sandi diperiksa lebih dulu: jangan simpan berkas apa pun sebelum
      // pemakainya terbukti memang admin yang berniat memulihkan.
      const sandiHasil = await periksaKataSandi(minta.pengguna.id, minta.header('X-Kata-Sandi'))
      if (tolak(balas, sandiHasil)) return

      if (!Buffer.isBuffer(minta.body) || minta.body.length === 0) {
        return balas.status(400).json({ detail: 'Berkas kosong.', kode: 'berkas_kosong' })
      }

      let nama = minta.query?.nama || minta.header('X-Nama-Berkas') || ''
      try {
        nama = decodeURIComponent(nama)
      } catch {
        nama = ''
      }
      if (!namaSah(nama)) {
        const cap = new Date().toISOString().replace(/[:.]/g, '-')
        nama = `posyandu-unggah-${cap}.json.gz.enc`
      }

      const env = require('../env').muat()
      const tujuan = path.resolve(env.folderCadangan)
      fs.mkdirSync(tujuan, { recursive: true })
      let berkas = path.join(tujuan, nama)
      if (fs.existsSync(berkas)) {
        const cap = new Date().toISOString().replace(/[:.]/g, '-')
        nama = `posyandu-unggah-${cap}.json.gz.enc`
        berkas = path.join(tujuan, nama)
      }
      fs.writeFileSync(berkas, minta.body)
      berkasTersimpan = berkas

      const hasil = await pulihkan(nama, { penggunaId: minta.pengguna.id })
      balas.json(hasil)
    } catch (salah) {
      if (berkasTersimpan) {
        try { fs.unlinkSync(berkasTersimpan) } catch {}
      }
      if (salah.kode) return jawabGalat(balas, salah)
      if (salah.code === '23505') {
        return jawabGalat(balas, { kode: 'pemulihan_bentrok_unik' })
      }
      if (salah.code === '23503') {
        return jawabGalat(balas, { kode: 'pemulihan_bentrok_rujukan' })
      }
      console.error('Pemulihan unggah gagal:', salah.message)
      balas.status(500).json({ detail: 'Pemulihan gagal.', kode: 'pemulihan_gagal' })
    }
  },
)

module.exports = router
