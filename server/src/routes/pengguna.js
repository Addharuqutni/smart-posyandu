// Kelola akun (F-17): daftar, buat, nonaktifkan, setel ulang sandi.

const express = require('express')
const { satu, banyak, kueri } = require('../db/pool')
const { butuhLogin, butuhPeran } = require('../middleware/auth')
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
  const { nama_pengguna, nama_lengkap, kata_sandi, peran = 'kader', posyandu_id = null } = minta.body || {}
  if (!nama_pengguna || !nama_lengkap || !kata_sandi) {
    return balas.status(422).json({ detail: 'muatan_tidak_lengkap' })
  }
  if (String(kata_sandi).length < 8) {
    return balas.status(422).json({ detail: 'kata_sandi_terlalu_pendek' })
  }
  if (!NAMA_PERAN[peran]) {
    return balas.status(422).json({ detail: 'peran_tidak_dikenal' })
  }

  // Validasi posyandu_id: kader wajib terikat Posyandu; admin_desa selalu null;
  // nakes boleh terikat satu Posyandu atau null (melihat semua).
  let posyanduId = null
  if (peran === 'admin_desa') {
    posyanduId = null
  } else if (peran === 'kader') {
    const kandidat = posyandu_id || minta.pengguna.posyandu_id
    if (!kandidat) {
      return balas.status(422).json({
        detail: 'posyandu_wajib_diisi',
        rincian: 'Akun kader wajib terikat pada satu Posyandu.',
      })
    }
    const pos = await satu(`SELECT id FROM posyandu WHERE id = $1 AND dihapus_pada IS NULL`, [kandidat])
    if (!pos) return balas.status(422).json({ detail: 'posyandu_tidak_ditemukan' })
    posyanduId = pos.id
  } else if (peran === 'nakes' && posyandu_id) {
    const pos = await satu(`SELECT id FROM posyandu WHERE id = $1 AND dihapus_pada IS NULL`, [posyandu_id])
    if (!pos) return balas.status(422).json({ detail: 'posyandu_tidak_ditemukan' })
    posyanduId = pos.id
  }

  const id = require('crypto').randomUUID()
  const hash = await hashSandi(String(kata_sandi))

  await kueri(
    `INSERT INTO pengguna
       (id, nama_pengguna, nama_lengkap, hash_kata_sandi, peran, posyandu_id, aktif,
        dibuat_pada, diperbarui_pada, dihapus_pada, id_perangkat, harus_ganti_sandi)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, now(), now(), NULL, 'server', FALSE)`,
    [id, nama_pengguna, nama_lengkap, hash, peran, posyanduId],
  )

  const baris = await satu(`SELECT id, nama_pengguna, nama_lengkap, peran, posyandu_id, aktif FROM pengguna WHERE id = $1`, [id])
  // Pembuatan akun adalah aktivitas admin yang harus terlihat di log.
  await kueri(
    `INSERT INTO log_audit
       (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
        nilai_lama, nilai_baru, alamat_ip, terjadi_pada, diterima_pada)
     VALUES (gen_random_uuid(), $1, 'server', 'pengguna', $2, 'buat',
             NULL, $3, $4, now(), now())`,
    [minta.pengguna.id, id,
      JSON.stringify({ nama_lengkap: baris.nama_lengkap, nama_pengguna: baris.nama_pengguna, peran: baris.peran }),
      minta.ip ?? null],
  )
  balas.status(201).json(baris)
})

router.patch('/pengguna/:id', Admin, async (minta, balas) => {
  const { aktif, kata_sandi_baru, posyandu_id } = minta.body || {}
  const nilai = {}
  if (aktif !== undefined) nilai.aktif = Boolean(aktif)
  if (posyandu_id !== undefined) {
    const target = await satu(`SELECT peran FROM pengguna WHERE id = $1 AND dihapus_pada IS NULL`, [minta.params.id])
    if (!target) return balas.status(404).json({ detail: 'pengguna_tidak_ditemukan' })
    if (target.peran === 'kader' && (!posyandu_id || posyandu_id === '')) {
      return balas.status(422).json({
        detail: 'posyandu_wajib_diisi',
        rincian: 'Akun kader wajib terikat pada satu Posyandu.',
      })
    }
    if (posyandu_id === null || posyandu_id === '') {
      nilai.posyandu_id = null
    } else {
      const pos = await satu(`SELECT id FROM posyandu WHERE id = $1 AND dihapus_pada IS NULL`, [posyandu_id])
      if (!pos) return balas.status(422).json({ detail: 'posyandu_tidak_ditemukan' })
      nilai.posyandu_id = pos.id
    }
  }
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


// --- Perbarui data akun ----------------------------------------------------
// Pemakai biasa hanya boleh mengubah akunnya sendiri; admin desa boleh
// mengubah akun mana pun. Peran, status aktif, dan kata sandi TIDAK lewat
// sini (tetap di PATCH /pengguna/:id yang khusus admin).

const POLA_NAMA_PENGGUNA = /^[a-z0-9_.-]{3,50}$/

function teksNama(nilai) {
  if (typeof nilai !== 'string') return null
  const bersih = nilai.trim()
  return bersih.length >= 1 && bersih.length <= 120 ? bersih : null
}

router.patch('/akun-saya', butuhLogin, async (minta, balas) => {
  const b = minta.body || {}
  const id = b.id === undefined ? minta.pengguna.id : b.id
  if (minta.pengguna.peran !== 'admin_desa' && String(id) !== String(minta.pengguna.id)) {
    return balas.status(403).json({ detail: 'tidak_diizinkan' })
  }
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    return balas.status(422).json({ detail: 'id_tidak_sah' })
  }

  const nilai = {}
  if (b.nama_lengkap !== undefined) {
    nilai.nama_lengkap = teksNama(b.nama_lengkap)
    if (!nilai.nama_lengkap) return balas.status(422).json({ detail: 'nama_tidak_sah' })
  }
  if (b.nama_pengguna !== undefined) {
    if (typeof b.nama_pengguna !== 'string' || !POLA_NAMA_PENGGUNA.test(b.nama_pengguna)) {
      return balas.status(422).json({ detail: 'nama_pengguna_tidak_sah' })
    }
    nilai.nama_pengguna = b.nama_pengguna
  }
  if (!Object.keys(nilai).length) {
    return balas.status(422).json({ detail: 'tidak_ada_yang_diubah' })
  }

  const set = Object.keys(nilai).map((k, i) => `${k} = $${i + 1}`).join(', ')
  try {
    const lama = await satu(
      `SELECT nama_pengguna, nama_lengkap FROM pengguna WHERE id = $1 AND dihapus_pada IS NULL`,
      [id],
    )
    if (!lama) return balas.status(404).json({ detail: 'pengguna_tidak_ditemukan' })
    const baris = await satu(
      `UPDATE pengguna SET ${set}, diperbarui_pada = now()
       WHERE id = $${Object.keys(nilai).length + 1} AND dihapus_pada IS NULL
       RETURNING id, nama_pengguna, nama_lengkap, peran, posyandu_id, aktif`,
      [...Object.values(nilai), id],
    )
    if (!baris) return balas.status(404).json({ detail: 'pengguna_tidak_ditemukan' })
    await kueri(
      `INSERT INTO log_audit
         (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
          nilai_lama, nilai_baru, alamat_ip, terjadi_pada, diterima_pada)
       VALUES (gen_random_uuid(), $1, 'server', 'pengguna', $2, 'ubah',
               $3, $4, $5, now(), now())`,
      [minta.pengguna.id, id,
        JSON.stringify(lama),
        JSON.stringify({ nama_pengguna: baris.nama_pengguna, nama_lengkap: baris.nama_lengkap }),
        minta.ip ?? null],
    )
    balas.json(baris)
  } catch (salah) {
    if (salah.code === '23505') {
      return balas.status(409).json({ detail: 'nama_pengguna_sudah_dipakai' })
    }
    throw salah
  }
})

module.exports = router
