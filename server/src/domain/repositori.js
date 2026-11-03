// Akses tabel per baris, dengan audit otomatis.

const { satu, banyak, kueri } = require('../db/pool')
const { siapkan, bersihkan, KOLOM } = require('./tabel')

const TABEL_AUDIT = 'log_audit'

async function ambil(namaTabel, id) {
  return satu(
    `SELECT * FROM ${namaTabel} WHERE id = $1 AND dihapus_pada IS NULL`,
    [id],
  )
}

/** Termasuk baris yang sudah dihapus — dipakai penyelesaian benturan. */
async function ambilMentah(namaTabel, id) {
  return satu(`SELECT * FROM ${namaTabel} WHERE id = $1`, [id])
}

async function catatAudit(klien, namaTabel, idBaris, aksi, lama, baru) {
  const sumber = baru || lama || {}
  const terjadiPada = sumber.terjadi_pada || new Date().toISOString()
  await klien.query(
    `INSERT INTO ${TABEL_AUDIT}
       (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
        nilai_lama, nilai_baru, terjadi_pada, diterima_pada)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      klien.penggunaId ?? null,
      klien.idPerangkat ?? 'server',
      namaTabel,
      idBaris,
      aksi,
      bersihkan(lama) ? JSON.stringify(bersihkan(lama)) : null,
      bersihkan(baru) ? JSON.stringify(bersihkan(baru)) : null,
      terjadiPada,
    ],
  )
}

/** Buat baris baru. `id` wajib ada dan dibuat di klien (AGENTS 2.2). */
async function sisip(namaTabel, nilai, { klien, penggunaId, idPerangkat } = {}) {
  const bersih = siapkan(namaTabel, nilai)
  const sekarang = new Date().toISOString()
  const baris = {
    ...bersih,
    dibuat_pada: sekarang,
    diperbarui_pada: sekarang,
    id_perangkat: idPerangkat ?? 'server',
    dihapus_pada: null,
  }
  const kolom = Object.keys(baris)
  const placeholder = kolom.map((_, i) => `$${i + 1}`).join(', ')
  await kueri(
    `INSERT INTO ${namaTabel} (${kolom.join(', ')}) VALUES (${placeholder})`,
    kolom.map((k) => baris[k]),
  )
  if (klien) {
    klien.penggunaId = penggunaId
    klien.idPerangkat = idPerangkat
    await catatAudit(klien, namaTabel, baris.id, 'buat', null, baris)
  }
  return baris
}

/** Ubah baris yang masih hidup. Null bila tidak ada. */
async function ubah(namaTabel, id, nilai, { klien, penggunaId, idPerangkat, terjadiPada } = {}) {
  const lama = await ambilMentah(namaTabel, id)
  if (!lama) return null

  const tambahan = siapkan(namaTabel, nilai)
  const sekarang = new Date().toISOString()
  const perubahan = {
    ...tambahan,
    diperbarui_pada: sekarang,
    id_perangkat: idPerangkat ?? 'server',
  }
  if (terjadiPada) perubahan.terjadi_pada = terjadiPada

  const kolom = Object.keys(perubahan)
  const set = kolom.map((k, i) => `${k} = $${i + 1}`).join(', ')
  await kueri(
    `UPDATE ${namaTabel} SET ${set} WHERE id = $${kolom.length + 1}`,
    [...kolom.map((k) => perubahan[k]), id],
  )

  const hasil = { ...lama, ...perubahan }
  if (klien) {
    klien.penggunaId = penggunaId
    klien.idPerangkat = idPerangkat
    await catatAudit(klien, namaTabel, id, 'ubah', lama, hasil)
  }
  return hasil
}

/** Tandai terhapus. Tidak ada DELETE (AGENTS 2.3). */
async function hapus(namaTabel, id, { klien, penggunaId, idPerangkat, terjadiPada } = {}) {
  const lama = await ambilMentah(namaTabel, id)
  if (!lama) return false

  const sekarang = new Date().toISOString()
  await kueri(
    `UPDATE ${namaTabel}
     SET dihapus_pada = $1, diperbarui_pada = $1, id_perangkat = $2
     WHERE id = $3`,
    [sekarang, idPerangkat ?? 'server', id],
  )
  const hasil = { ...lama, dihapus_pada: sekarang }
  if (klien) {
    klien.penggunaId = penggunaId
    klien.idPerangkat = idPerangkat
    await catatAudit(klien, namaTabel, id, 'hapus', lama, hasil)
  }
  return true
}

module.exports = { ambil, ambilMentah, sisip, ubah, hapus, catatAudit }
