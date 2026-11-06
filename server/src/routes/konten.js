const express = require('express')
const crypto = require('node:crypto')
const { banyak, satu, kueri } = require('../db/pool')
const { butuhLogin, butuhPeran } = require('../middleware/auth')

const router = express.Router()
const Admin = butuhPeran('admin_desa')
const NakesAtaudmin = butuhPeran('nakes', 'admin_desa')
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const JENIS_SAH = ['jadwal', 'layanan', 'pengumuman', 'edukasi']

// Jenis yang butuh alur persetujuan nakes: jadwal posyandu.
// Admin membuat konten langsung tayang; kader membuat jadwal harus menunggu nakes.
function butuhPersetujuan(jenis, peran) {
  return jenis === 'jadwal' && peran === 'kader'
}

// 1. GET /konten-publik: Ambil konten aktif untuk publik (tidak perlu login)
router.get('/konten-publik', async (minta, balas) => {
  const { jenis } = minta.query
  const syarat = ['dihapus_pada IS NULL', 'aktif = TRUE', "status_persetujuan = 'disetujui'"]
  const params = []

  if (jenis && JENIS_SAH.includes(jenis)) {
    params.push(jenis)
    syarat.push(`jenis = $${params.length}`)
  }

  const baris = await banyak(
    `SELECT id, jenis, judul, isi, kategori, tanggal, penting, urutan, dibuat_pada
     FROM konten_publik
     WHERE ${syarat.join(' AND ')}
     ORDER BY urutan ASC, dibuat_pada DESC`,
    params,
  )
  balas.json({ konten: baris })
})

// 2. GET /konten-publik/semua: Daftar untuk pengelola.
//    Admin boleh semua (bisa intervensi bila kader/nakes kendala);
//    nakes melihat jadwal yang menunggu persetujuan + semua konten lain;
//    kader melihat miliknya sendiri.
router.get('/konten-publik/semua', butuhLogin, async (minta, balas) => {
  const { jenis, status } = minta.query
  const peran = minta.pengguna.peran
  const syarat = ['k.dihapus_pada IS NULL']
  const params = []

  if (jenis && JENIS_SAH.includes(jenis)) {
    params.push(jenis)
    syarat.push(`k.jenis = $${params.length}`)
  }

  if (status && ['menunggu', 'disetujui', 'ditolak'].includes(status)) {
    params.push(status)
    syarat.push(`k.status_persetujuan = $${params.length}`)
  }

  // Kader hanya melihat konten yang ia ajukan.
  if (peran === 'kader') {
    params.push(minta.pengguna.id)
    syarat.push(`k.pengaju_id = $${params.length}`)
  } else if (peran === 'nakes') {
    // Nakes melihat semua; antrean persetujuan ditandai lewat status_persetujuan.
  } else if (peran !== 'admin_desa') {
    return balas.status(403).json({ detail: 'tidak_diizinkan' })
  }

  const baris = await banyak(
    `SELECT k.id, k.jenis, k.judul, k.isi, k.kategori, k.tanggal, k.penting, k.aktif,
            k.urutan, k.status_persetujuan, k.posyandu_id, k.pengaju_id,
            k.diputuskan_oleh, k.diputuskan_pada, k.catatan_peninjau,
            k.dibuat_pada, k.diperbarui_pada,
            p.nama_lengkap AS pengaju_nama, p.peran AS pengaju_peran,
            ps.nama AS posyandu_nama,
            n.nama_lengkap AS peninjau_nama
     FROM konten_publik k
     LEFT JOIN pengguna p ON p.id = k.pengaju_id
     LEFT JOIN posyandu ps ON ps.id = k.posyandu_id
     LEFT JOIN pengguna n ON n.id = k.diputuskan_oleh
     WHERE ${syarat.join(' AND ')}
     ORDER BY (k.status_persetujuan = 'menunggu') DESC, k.urutan ASC, k.dibuat_pada DESC`,
    params,
  )
  balas.json({ konten: baris })
})

// 3. POST /konten-publik: Tambah konten baru.
//    Admin: langsung disetujui. Kader (jadwal): menunggu persetujuan nakes.
//    Kader (jenis lain): ditolak, karena konten non-jadwal dikelola admin.
router.post('/konten-publik', butuhLogin, async (minta, balas) => {
  const peran = minta.pengguna.peran
  const { jenis, judul, isi, kategori = null, tanggal = null, penting = false, aktif = true, urutan = 0 } = minta.body || {}

  if (!jenis || !JENIS_SAH.includes(jenis)) {
    return balas.status(422).json({ detail: 'jenis_tidak_sah', rincian: 'Jenis harus jadwal, layanan, pengumuman, atau edukasi.' })
  }
  if (peran === 'nakes') {
    return balas.status(403).json({ detail: 'tidak_diizinkan', rincian: 'Nakes hanya menyetujui jadwal; konten dibuat kader atau admin.' })
  }
  if (!judul || typeof judul !== 'string' || !judul.trim()) {
    return balas.status(422).json({ detail: 'judul_wajib_diisi' })
  }
  if (!isi || typeof isi !== 'string' || !isi.trim()) {
    return balas.status(422).json({ detail: 'isi_wajib_diisi' })
  }

  const perluSetuju = butuhPersetujuan(jenis, peran)
  if (peran === 'kader') {
    if (jenis !== 'jadwal') {
      return balas.status(403).json({
        detail: 'kader_hanya_jadwal',
        rincian: 'Kader hanya boleh mengajukan jadwal Posyandu. Jenis lain dibuat admin desa.',
      })
    }
    if (!minta.pengguna.posyandu_id) {
      return balas.status(422).json({
        detail: 'posyandu_wajib_diisi',
        rincian: 'Akun kader wajib terikat pada satu Posyandu.',
      })
    }
  }

  const id = crypto.randomUUID()
  const baru = await satu(
    `INSERT INTO konten_publik
       (id, jenis, judul, isi, kategori, tanggal, penting, aktif, urutan,
        status_persetujuan, pengaju_id, posyandu_id, dibuat_pada, diperbarui_pada)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
     RETURNING *`,
    [
      id,
      jenis,
      judul.trim(),
      isi.trim(),
      kategori ? String(kategori).trim() : null,
      tanggal ? String(tanggal).trim() : null,
      Boolean(penting),
      // Konten yang belum disetujui tidak boleh tayang walau aktif = TRUE.
      aktif !== false,
      Number(urutan) || 0,
      perluSetuju ? 'menunggu' : 'disetujui',
      minta.pengguna.id,
      peran === 'kader' ? minta.pengguna.posyandu_id : null,
    ],
  )

  balas.status(201).json(baru)
})

// 4. POST /konten-publik/:id/putuskan: Nakes menyetujui atau menolak jadwal.
//    Admin juga boleh memutuskan (jalur darurat bila nakes berhalangan).
router.post('/konten-publik/:id/putuskan', NakesAtaudmin, async (minta, balas) => {
  const { id } = minta.params
  if (!POLA_UUID.test(id)) {
    return balas.status(422).json({ detail: 'id_tidak_sah' })
  }

  const { keputusan, catatan = null } = minta.body || {}
  if (!['disetujui', 'ditolak'].includes(keputusan)) {
    return balas.status(422).json({ detail: 'keputusan_tidak_sah', rincian: 'Keputusan harus disetujui atau ditolak.' })
  }
  if (keputusan === 'ditolak' && (!catatan || !String(catatan).trim())) {
    return balas.status(422).json({ detail: 'alasan_wajib_diisi', rincian: 'Alasan penolakan wajib diisi agar kader tahu yang perlu diperbaiki.' })
  }

  const hasil = await satu(
    `UPDATE konten_publik
     SET status_persetujuan = $1,
         diputuskan_oleh = $2,
         diputuskan_pada = now(),
         catatan_peninjau = $3,
         aktif = ($1 = 'disetujui'),
         diperbarui_pada = now()
     WHERE id = $4 AND dihapus_pada IS NULL AND jenis = 'jadwal'
     RETURNING *`,
    [keputusan, minta.pengguna.id, catatan ? String(catatan).trim() : null, id],
  )
  if (!hasil) {
    return balas.status(404).json({ detail: 'jadwal_tidak_ditemukan', rincian: 'Hanya jadwal Posyandu yang butuh persetujuan.' })
  }

  balas.json(hasil)
})

// 5. PATCH /konten-publik/:id: Perbarui konten.
//    Admin boleh semua. Kader hanya miliknya sendiri dan tetap menunggu persetujuan.
router.patch('/konten-publik/:id', butuhLogin, async (minta, balas) => {
  const peran = minta.pengguna.peran
  const { id } = minta.params
  if (!POLA_UUID.test(id)) {
    return balas.status(422).json({ detail: 'id_tidak_sah' })
  }
  if (peran === 'nakes') {
    return balas.status(403).json({ detail: 'tidak_diizinkan', rincian: 'Nakes tidak menyunting konten; gunakan persetujuan.' })
  }

  const ada = await satu(
    `SELECT id, jenis, pengaju_id, status_persetujuan FROM konten_publik
     WHERE id = $1 AND dihapus_pada IS NULL`,
    [id],
  )
  if (!ada) {
    return balas.status(404).json({ detail: 'konten_tidak_ditemukan' })
  }
  if (peran === 'kader' && String(ada.pengaju_id) !== String(minta.pengguna.id)) {
    return balas.status(403).json({ detail: 'tidak_diizinkan' })
  }

  const { jenis, judul, isi, kategori, tanggal, penting, aktif, urutan } = minta.body || {}
  const nilai = {}

  if (jenis !== undefined) {
    if (!JENIS_SAH.includes(jenis)) return balas.status(422).json({ detail: 'jenis_tidak_sah' })
    if (peran === 'kader' && jenis !== 'jadwal') {
      return balas.status(403).json({ detail: 'kader_hanya_jadwal' })
    }
    nilai.jenis = jenis
  }
  if (judul !== undefined) {
    if (!judul || typeof judul !== 'string' || !judul.trim()) return balas.status(422).json({ detail: 'judul_wajib_diisi' })
    nilai.judul = judul.trim()
  }
  if (isi !== undefined) {
    if (!isi || typeof isi !== 'string' || !isi.trim()) return balas.status(422).json({ detail: 'isi_wajib_diisi' })
    nilai.isi = isi.trim()
  }
  if (kategori !== undefined) nilai.kategori = kategori ? String(kategori).trim() : null
  if (tanggal !== undefined) nilai.tanggal = tanggal ? String(tanggal).trim() : null
  if (penting !== undefined) nilai.penting = Boolean(penting)
  if (urutan !== undefined) nilai.urutan = Number(urutan) || 0

  // Kader menyunting isi jadwalnya: ajuan kembali ke antrean nakes.
  if (peran === 'kader') {
    nilai.status_persetujuan = 'menunggu'
    nilai.diputuskan_oleh = null
    nilai.diputuskan_pada = null
    nilai.catatan_peninjau = null
    nilai.aktif = false
  } else if (aktif !== undefined) {
    nilai.aktif = Boolean(aktif)
  }

  if (Object.keys(nilai).length === 0) {
    return balas.status(422).json({ detail: 'tidak_ada_yang_diubah' })
  }

  const setKlausa = Object.keys(nilai).map((k, i) => `${k} = $${i + 1}`).join(', ')
  const hasil = await satu(
    `UPDATE konten_publik
     SET ${setKlausa}, diperbarui_pada = now()
     WHERE id = $${Object.keys(nilai).length + 1} AND dihapus_pada IS NULL
     RETURNING *`,
    [...Object.values(nilai), id],
  )

  balas.json(hasil)
})

// 6. DELETE /konten-publik/:id: Hapus konten (soft delete).
//    Admin boleh semua. Kader hanya miliknya sendiri.
router.delete('/konten-publik/:id', butuhLogin, async (minta, balas) => {
  const peran = minta.pengguna.peran
  const { id } = minta.params
  if (!POLA_UUID.test(id)) {
    return balas.status(422).json({ detail: 'id_tidak_sah' })
  }

  const syarat = ['id = $1', 'dihapus_pada IS NULL']
  const params = [id]
  if (peran === 'kader') {
    params.push(minta.pengguna.id)
    syarat.push(`pengaju_id = $${params.length}`)
  } else if (peran !== 'admin_desa') {
    return balas.status(403).json({ detail: 'tidak_diizinkan' })
  }

  const hasil = await kueri(
    `UPDATE konten_publik SET dihapus_pada = now() WHERE ${syarat.join(' AND ')}`,
    params,
  )

  if (hasil.rowCount === 0) {
    return balas.status(404).json({ detail: 'konten_tidak_ditemukan' })
  }

  balas.status(204).end()
})

module.exports = router
