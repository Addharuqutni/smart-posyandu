// Sesi tablet yang masih aktif (F-17 lanjutan): daftar dan cabut.
//
// Tablet hilang harus bisa diputus dari kantor desa tanpa menunggu token
// kedaluwarsa. `token_hash` tidak pernah keluar dari server.

const express = require('express')
const { satu, banyak, kueri } = require('../db/pool')
const { butuhPeran } = require('../middleware/auth')

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

// Riwayat masuk perangkat sudah dihapus dari antarmuka: satu-satunya konsumen
// `/sesi/riwayat` adalah panel di layar Akun. Endpoint ikut dibuang supaya
// tidak ada query mahal tanpa pemakai yang ikut terpelihara.

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
