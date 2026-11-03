// Sesi tablet yang masih aktif (F-17 lanjutan): daftar dan cabut.
//
// Tablet hilang harus bisa diputus dari kantor desa tanpa menunggu token
// kedaluwarsa. `token_hash` tidak pernah keluar dari server.

const express = require('express')
const { satu, banyak, kueri } = require('../db/pool')
const { butuhLogin, butuhPeran } = require('../middleware/auth')

const router = express.Router()
const Admin = butuhPeran('admin_desa')

router.get('/sesi', Admin, async (minta, balas) => {
  const baris = await banyak(
    `SELECT s.id, s.pengguna_id, s.id_perangkat, s.dibuat_pada, s.kadaluarsa_pada,
            p.nama_pengguna, p.nama_lengkap, p.peran
     FROM sesi_login s
     JOIN pengguna p ON p.id = s.pengguna_id
     WHERE s.dicabut_pada IS NULL AND s.kadaluarsa_pada > now()
     ORDER BY s.dibuat_pada DESC`,
  )
  balas.json({ sesi: baris, waktu_server: new Date().toISOString() })
})

// Riwayat masuk: sesi yang pernah dibuat (aktif, selesai, expired, dicabut).
// Bila bukan admin, hanya melihat miliknya sendiri supaya privasi terjaga.
router.get('/sesi/riwayat', butuhLogin, async (minta, balas) => {
  const batas = Math.min(Math.max(Number(minta.query.batas) || 20, 1), 200)
  const offset = Math.max(0, Math.floor(Number(minta.query.offset) || 0))
  const milikSaja = minta.pengguna.peran !== 'admin_desa'
  const param = []
  const syarat = []
  if (milikSaja) {
    param.push(minta.pengguna.id)
    syarat.push(`s.pengguna_id = $${param.length}`)
  }
  // Satu-satunya tempat klausa WHERE-nya dibangun, dan dipakai dua kali:
  // sekali untuk menghitung total (supaya jumlah halaman benar), sekali untuk
  // mengambil satu halaman. Kalau dibangun terpisah, keduanya bisa menyimpang.
  const where = syarat.length ? `WHERE ${syarat.join(' AND ')}` : ''
  const total = (await satu(`SELECT count(*)::int AS n FROM sesi_login s ${where}`, param)).n

  const nilai = [...param, batas, offset]
  const baris = await banyak(
    `SELECT s.id, s.pengguna_id, s.id_perangkat, s.dibuat_pada, s.kadaluarsa_pada,
            s.dicabut_pada, p.nama_pengguna, p.nama_lengkap, p.peran,
            CASE WHEN s.dicabut_pada IS NOT NULL THEN 'Dicabut'
                 WHEN s.kadaluarsa_pada <= now() THEN 'Kedaluwarsa'
                 ELSE 'Aktif'
            END AS status
     FROM sesi_login s
     JOIN pengguna p ON p.id = s.pengguna_id
     ${where}
     ORDER BY s.dibuat_pada DESC
     LIMIT $${nilai.length - 1} OFFSET $${nilai.length}`,
    nilai,
  )
  balas.json({
    riwayat: baris,
    total,
    berikutnya: offset + baris.length < total ? offset + baris.length : null,
    waktu_server: new Date().toISOString(),
  })
})

router.delete('/sesi/:id', Admin, async (minta, balas) => {
  // Hanya sesi yang masih hidup yang perlu dicabut; mengulang permintaan
  // tetap 204 supaya tombol bisa ditekan dua kali tanpa galat.
  const hasil = await kueri(
    `UPDATE sesi_login SET dicabut_pada = now()
     WHERE id = $1 AND dicabut_pada IS NULL`,
    [minta.params.id],
  )
  if (hasil.rowCount === 0) {
    const ada = await satu(`SELECT id FROM sesi_login WHERE id = $1`, [minta.params.id])
    if (!ada) return balas.status(404).json({ detail: 'sesi_tidak_ditemukan' })
  }
  balas.status(204).send()
})

module.exports = router
