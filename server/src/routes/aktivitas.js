// Log aktivitas untuk admin desa (F-17 lanjutan).
//
// Membaca `log_audit` yang sudah diisi repositori (perubahan data), rute
// ekspor/cadangan, dan domain/aktivitas (masuk, keluar, gagal masuk).
// Hanya-baca: tidak ada endpoint hapus, audit harus utuh.

const express = require('express')
const { banyak, satu } = require('../db/pool')
const { butuhPeran } = require('../middleware/auth')

const router = express.Router()
const Admin = butuhPeran('admin_desa')

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/
const AKSI_SAH = ['buat', 'ubah', 'hapus', 'masuk', 'keluar', 'gagal_masuk']

// Ringkasan satu baris tanpa membuka JSONB di klien: nama orang, judul konten,
// nama berkas, atau tanggal kunjungan, tergantung jenis barisnya.
const RINGKASAN = `COALESCE(
  NULLIF(l.nilai_baru->>'nama_lengkap', ''),
  NULLIF(l.nilai_baru->>'nama', ''),
  CASE WHEN l.nama_tabel = 'balita'
       THEN (SELECT nama_lengkap FROM balita WHERE id = l.id_baris) END,
  CASE WHEN l.nama_tabel = 'kunjungan'
       THEN (SELECT b.nama_lengkap FROM kunjungan k JOIN balita b ON b.id = k.balita_id
             WHERE k.id = l.id_baris) END,
  CASE WHEN l.nama_tabel = 'pengukuran'
       THEN (SELECT b.nama_lengkap FROM pengukuran u
             JOIN kunjungan k ON k.id = u.kunjungan_id
             JOIN balita b ON b.id = k.balita_id WHERE u.id = l.id_baris) END,
  CASE WHEN l.nama_tabel = 'tindak_lanjut'
       THEN (SELECT b.nama_lengkap FROM tindak_lanjut t
             JOIN kunjungan k ON k.id = t.kunjungan_id
             JOIN balita b ON b.id = k.balita_id WHERE t.id = l.id_baris) END,
  CASE WHEN l.nama_tabel = 'pengguna'
       THEN (SELECT nama_lengkap FROM pengguna WHERE id = l.id_baris) END,
  CASE WHEN l.nama_tabel = 'posyandu'
       THEN (SELECT nama FROM posyandu WHERE id = l.id_baris) END,
  NULLIF(l.nilai_baru->>'judul', ''),
  NULLIF(l.nilai_baru->>'berkas', ''),
  NULLIF(l.nilai_baru->>'tanggal_kunjungan', ''),
  ''
)`

const POLA_UUID_NILAI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ganti nilai UUID di nilai_lama/nilai_baru dengan nama yang bisa dibaca.
 * Satu kueri untuk semua baris di halaman ini, bukan satu per sel.
 */
async function terjemahkanId(baris) {
  const id = new Set()
  for (const b of baris) {
    for (const sisi of [b.nilai_lama, b.nilai_baru]) {
      if (!sisi || typeof sisi !== 'object') continue
      for (const nilai of Object.values(sisi)) {
        if (typeof nilai === 'string' && POLA_UUID_NILAI.test(nilai)) id.add(nilai)
      }
    }
  }
  if (!id.size) return
  const nama = await banyak(
    `SELECT id, nama_lengkap FROM pengguna WHERE id = ANY($1::uuid[])`,
    [[...id]],
  )
  const peta = new Map(nama.map((n) => [n.id, n.nama_lengkap]))
  for (const b of baris) {
    for (const sisi of [b.nilai_lama, b.nilai_baru]) {
      if (!sisi || typeof sisi !== 'object') continue
      for (const [kunci, nilai] of Object.entries(sisi)) {
        if (typeof nilai === 'string' && peta.has(nilai)) sisi[kunci] = peta.get(nilai)
      }
    }
  }
}

router.get('/aktivitas', Admin, async (minta, balas) => {
  const batas = Math.min(Math.max(Number(minta.query.batas) || 50, 1), 200)
  const offset = Math.max(0, Math.floor(Number(minta.query.offset) || 0))

  const aksi = AKSI_SAH.includes(minta.query.aksi) ? minta.query.aksi : ''
  const tabel = typeof minta.query.tabel === 'string' ? minta.query.tabel.trim().slice(0, 40) : ''
  const penggunaId = POLA_UUID.test(minta.query.pengguna_id || '') ? minta.query.pengguna_id : ''
  const dari = POLA_TANGGAL.test(minta.query.dari || '') ? minta.query.dari : ''
  const sampai = POLA_TANGGAL.test(minta.query.sampai || '') ? minta.query.sampai : ''

  const syarat = []
  const nilai = []

  if (aksi) syarat.push(`l.aksi = $${nilai.push(aksi)}`)
  if (tabel) syarat.push(`l.nama_tabel = $${nilai.push(tabel)}`)
  if (penggunaId) syarat.push(`l.pengguna_id = $${nilai.push(penggunaId)}`)
  if (dari) syarat.push(`l.diterima_pada >= $${nilai.push(dari)}::date`)
  if (sampai) syarat.push(`l.diterima_pada < $${nilai.push(sampai)}::date + 1`)

  const where = syarat.length ? `WHERE ${syarat.join(' AND ')}` : ''
  const dariTabel = `FROM log_audit l LEFT JOIN pengguna p ON p.id = l.pengguna_id ${where}`

  const [total, baris] = await Promise.all([
    satu(`SELECT COUNT(*)::int AS n ${dariTabel}`, nilai),
    banyak(
      `SELECT l.id, l.aksi, l.nama_tabel, l.id_baris, l.id_perangkat, l.alamat_ip,
              l.terjadi_pada, l.diterima_pada,
              COALESCE(p.nama_lengkap, l.nilai_baru->>'nama_pengguna') AS aktor_nama,
              COALESCE(p.peran, l.nilai_baru->>'peran') AS aktor_peran,
              ${RINGKASAN} AS ringkasan,
              l.nilai_lama, l.nilai_baru
       ${dariTabel}
       ORDER BY l.diterima_pada DESC, l.id DESC
       LIMIT $${nilai.length + 1} OFFSET $${nilai.length + 2}`,
      [...nilai, batas, offset],
    ),
  ])

  // Pilihan filter. Daftar aktor dibatasi; tabel hanya sedikit namanya.
  const [aktor, daftarTabel] = await Promise.all([
    banyak(
      `SELECT p.id, p.nama_lengkap, p.nama_pengguna
       FROM pengguna p
       WHERE p.dihapus_pada IS NULL
         AND EXISTS (SELECT 1 FROM log_audit l WHERE l.pengguna_id = p.id)
       ORDER BY p.nama_lengkap
       LIMIT 200`,
    ),
    banyak(`SELECT DISTINCT nama_tabel FROM log_audit ORDER BY nama_tabel`),
  ])

  // Nilai JSONB sering berupa UUID (mis. divalidasi_oleh). Tanpa penerjemahan,
  // rincian hanya memperlihatkan deret angka yang tidak berarti bagi admin.
  await terjemahkanId(baris)

  balas.json({
    aktivitas: baris,
    total: total?.n ?? 0,
    aktor,
    tabel: daftarTabel.map((t) => t.nama_tabel),
    waktu_server: new Date().toISOString(),
  })
})

module.exports = router
