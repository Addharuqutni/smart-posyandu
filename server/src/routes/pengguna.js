// Kelola akun (F-17): daftar, buat, nonaktifkan, setel ulang sandi.

const express = require('express')
const { satu, banyak, kueri } = require('../db/pool')
const { butuhPeran } = require('../middleware/auth')
const { hashSandi } = require('../domain/keamanan')

const router = express.Router()
const Admin = butuhPeran('admin_desa')

const NAMA_PERAN = {
  kader: 'Kader',
  nakes: 'Petugas kesehatan',
  admin_desa: 'Admin desa',
}

router.get('/pengguna', Admin, async (minta, balas) => {
  const baris = await banyak(
    `SELECT id, nama_pengguna, nama_lengkap, peran, posyandu_id, aktif, dibuat_pada
     FROM pengguna WHERE dihapus_pada IS NULL
     ORDER BY nama_lengkap`,
  )
  balas.json({ pengguna: baris })
})

router.post('/pengguna', Admin, async (minta, balas) => {
  const { nama_pengguna, nama_lengkap, kata_sandi, peran = 'kader' } = minta.body || {}
  if (!nama_pengguna || !nama_lengkap || !kata_sandi) {
    return balas.status(422).json({ detail: 'muatan_tidak_lengkap' })
  }
  if (String(kata_sandi).length < 8) {
    return balas.status(422).json({ detail: 'kata_sandi_terlalu_pendek' })
  }
  if (!NAMA_PERAN[peran]) {
    return balas.status(422).json({ detail: 'peran_tidak_dikenal' })
  }

  const id = require('crypto').randomUUID()
  const hash = await hashSandi(String(kata_sandi))
  // Admin desa tidak terikat satu Posyandu; kader memakai Posyandu pembuatnya.
  const posyanduId = peran === 'admin_desa' ? null : minta.pengguna.posyandu_id

  await kueri(
    `INSERT INTO pengguna
       (id, nama_pengguna, nama_lengkap, hash_kata_sandi, peran, posyandu_id, aktif,
        dibuat_pada, diperbarui_pada, dihapus_pada, id_perangkat, harus_ganti_sandi)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, now(), now(), NULL, 'server', FALSE)`,
    [id, nama_pengguna, nama_lengkap, hash, peran, posyanduId],
  )

  const baris = await satu(`SELECT id, nama_pengguna, nama_lengkap, peran, posyandu_id, aktif FROM pengguna WHERE id = $1`, [id])
  balas.status(201).json(baris)
})

router.patch('/pengguna/:id', Admin, async (minta, balas) => {
  const { aktif, kata_sandi_baru } = minta.body || {}
  const nilai = {}
  if (aktif !== undefined) nilai.aktif = Boolean(aktif)
  if (kata_sandi_baru) {
    if (String(kata_sandi_baru).length < 8) {
      return balas.status(422).json({ detail: 'kata_sandi_terlalu_pendek' })
    }
    nilai.hash_kata_sandi = await hashSandi(String(kata_sandi_baru))
  }
  if (Object.keys(nilai).length === 0) {
    return balas.status(422).json({ detail: 'tidak_ada_yang_diubah' })
  }

  const set = Object.keys(nilai).map((k, i) => `${k} = $${i + 1}`).join(', ')
  const hasil = await satu(
    `UPDATE pengguna SET ${set}, diperbarui_pada = now()
     WHERE id = $${Object.keys(nilai).length + 1} AND dihapus_pada IS NULL
     RETURNING id, nama_pengguna, nama_lengkap, peran, posyandu_id, aktif`,
    [...Object.values(nilai), minta.params.id],
  )
  if (!hasil) return balas.status(404).json({ detail: 'pengguna_tidak_ditemukan' })

  // Setel ulang sandi memutus sesi lama.
  if (kata_sandi_baru) {
    await kueri(
      `UPDATE sesi_login SET dicabut_pada = now()
       WHERE pengguna_id = $1 AND dicabut_pada IS NULL`,
      [minta.params.id],
    )
  }

  // Admin desa tidak boleh dinonaktifkan dari layar ini (cegah terkunci).
  if (aktif === false && hasil.peran === 'admin_desa') {
    return balas.status(403).json({ detail: 'admin_tidak_bisa_dinonaktifkan' })
  }

  balas.json(hasil)
})

module.exports = router
