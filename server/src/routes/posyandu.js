// Kelola data Posyandu (khusus admin desa): daftar, buat, sunting, hapus.
//
// Penghapusan memakai soft delete (AGENTS 2.3) dan dicegah bila data lain
// masih menunjuk Posyandu itu, supaya tidak ada balita/akun yang yatim.

const express = require('express')
const { satu, banyak, transaksi } = require('../db/pool')
const { butuhLogin, butuhPeran } = require('../middleware/auth')
const { catatAudit } = require('../domain/repositori')

const router = express.Router()
const Admin = butuhPeran('admin_desa')
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const KOLOM = ['nama', 'dusun', 'desa', 'kecamatan', 'kabupaten', 'aktif']

function teks(nilai, maks = 120) {
  if (nilai === undefined) return undefined
  if (nilai === null) return null
  if (typeof nilai !== 'string') return false
  const bersih = nilai.trim()
  return bersih.length <= maks ? (bersih || null) : false
}

/** Nilai tervalidasi, atau null bila ada yang tidak sah. */
function muatanSah(badan, wajib) {
  const keluar = {}
  for (const k of KOLOM) {
    if (!(k in (badan || {}))) continue
    if (k === 'aktif') {
      if (typeof badan.aktif !== 'boolean') return null
      keluar.aktif = badan.aktif
      continue
    }
    const nilai = teks(badan[k])
    if (nilai === false) return null
    keluar[k] = nilai
  }
  if (wajib && (!keluar.nama || !keluar.desa)) return null
  if ('nama' in keluar && !keluar.nama) return null
  if ('desa' in keluar && !keluar.desa) return null
  return Object.keys(keluar).length ? keluar : null
}

router.get('/posyandu/semua', Admin, async (minta, balas) => {
  const baris = await banyak(
    `SELECT * FROM posyandu WHERE dihapus_pada IS NULL ORDER BY nama`,
  )
  balas.json({ posyandu: baris })
})

// Detail Posyandu untuk kartu balita. Kader hanya boleh melihat Posyandunya
// sendiri; nakes dan admin desa boleh melihat semua yang belum dihapus.
router.get('/posyandu/:id', butuhLogin, async (minta, balas) => {
  if (!POLA_UUID.test(minta.params.id)) {
    return balas.status(422).json({ detail: 'muatan_tidak_sah' })
  }
  if (minta.pengguna.peran === 'kader' &&
      String(minta.pengguna.posyandu_id ?? '') !== String(minta.params.id)) {
    return balas.status(403).json({ detail: 'tidak_diizinkan' })
  }
  const baris = await satu(
    `SELECT * FROM posyandu WHERE id = $1 AND dihapus_pada IS NULL`,
    [minta.params.id],
  )
  if (!baris) return balas.status(404).json({ detail: 'posyandu_tidak_ditemukan' })
  balas.json(baris)
})

router.post('/posyandu', Admin, async (minta, balas) => {
  const nilai = muatanSah(minta.body, true)
  if (!nilai) return balas.status(422).json({ detail: 'muatan_tidak_sah' })

  const baris = await transaksi(async (klien) => {
    const { rows } = await klien.query(
      `INSERT INTO posyandu (id, nama, dusun, desa, kecamatan, kabupaten, aktif, id_perangkat)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'server')
       RETURNING *`,
      [nilai.nama, nilai.dusun ?? null, nilai.desa, nilai.kecamatan ?? null,
        nilai.kabupaten ?? null, nilai.aktif ?? true],
    )
    klien.penggunaId = minta.pengguna.id
    await catatAudit(klien, 'posyandu', rows[0].id, 'buat', null, rows[0])
    return rows[0]
  })
  balas.status(201).json(baris)
})

router.patch('/posyandu/:id', Admin, async (minta, balas) => {
  if (!POLA_UUID.test(minta.params.id)) {
    return balas.status(422).json({ detail: 'muatan_tidak_sah' })
  }
  const nilai = muatanSah(minta.body, false)
  if (!nilai) return balas.status(422).json({ detail: 'muatan_tidak_sah' })

  const baris = await transaksi(async (klien) => {
    const lama = (await klien.query(
      `SELECT * FROM posyandu WHERE id = $1 AND dihapus_pada IS NULL`,
      [minta.params.id],
    )).rows[0]
    if (!lama) return null
    const kolom = Object.keys(nilai)
    const bagian = kolom.map((k, i) => `${k} = $${i + 1}`).join(', ')
    const { rows } = await klien.query(
      `UPDATE posyandu SET ${bagian}, diperbarui_pada = now(), id_perangkat = 'server'
       WHERE id = $${kolom.length + 1} RETURNING *`,
      [...kolom.map((k) => nilai[k]), minta.params.id],
    )
    klien.penggunaId = minta.pengguna.id
    await catatAudit(klien, 'posyandu', minta.params.id, 'ubah', lama, rows[0])
    return rows[0]
  })
  if (!baris) return balas.status(404).json({ detail: 'posyandu_tidak_ditemukan' })
  balas.json(baris)
})

/** Rujukan aktif yang membuat Posyandu ini tidak boleh dihapus. */
async function jumlahRujukan(id) {
  const r = await satu(
    `SELECT
       (SELECT COUNT(*)::int FROM balita WHERE posyandu_id = $1 AND dihapus_pada IS NULL) AS balita,
       (SELECT COUNT(*)::int FROM kunjungan WHERE posyandu_id = $1 AND dihapus_pada IS NULL) AS kunjungan,
       (SELECT COUNT(*)::int FROM pengguna WHERE posyandu_id = $1 AND dihapus_pada IS NULL) AS pengguna,
       (SELECT COUNT(*)::int FROM kader WHERE posyandu_id = $1 AND dihapus_pada IS NULL) AS kader`,
    [id],
  )
  return r
}

router.delete('/posyandu/:id', Admin, async (minta, balas) => {
  if (!POLA_UUID.test(minta.params.id)) {
    return balas.status(422).json({ detail: 'muatan_tidak_sah' })
  }
  const rujukan = await jumlahRujukan(minta.params.id)
  const terpakai = Object.values(rujukan ?? {}).some((n) => n > 0)
  if (terpakai) {
    return balas.status(409).json({
      detail: 'posyandu_masih_terpakai',
      rujukan,
    })
  }

  const berhasil = await transaksi(async (klien) => {
    const lama = (await klien.query(
      `SELECT * FROM posyandu WHERE id = $1 AND dihapus_pada IS NULL`,
      [minta.params.id],
    )).rows[0]
    if (!lama) return false
    const { rows } = await klien.query(
      `UPDATE posyandu SET dihapus_pada = now(), diperbarui_pada = now(), id_perangkat = 'server'
       WHERE id = $1 RETURNING *`,
      [minta.params.id],
    )
    klien.penggunaId = minta.pengguna.id
    await catatAudit(klien, 'posyandu', minta.params.id, 'hapus', lama, rows[0])
    return true
  })
  if (!berhasil) return balas.status(404).json({ detail: 'posyandu_tidak_ditemukan' })
  balas.status(204).send()
})

module.exports = router
