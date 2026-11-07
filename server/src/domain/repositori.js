// Akses tabel per baris, dengan audit otomatis.
//
// Semua tulisan (dari /sinkron maupun dari endpoint server) wajib masuk
// log_audit dan wajib berada dalam satu transaksi bersama baris datanya.
// Sebelumnya `catatAudit()` hanya dipanggil bila pemanggil kebetulan memberi
// `klien`; CRUD balita admin memanggil tanpa itu, jadi perubahan datanya tidak
// pernah tercatat.

const { satu, kueri, transaksi } = require('../db/pool')
const { siapkan, siapkanTerotorisasi, bersihkan } = require('./tabel')

const TABEL_AUDIT = 'log_audit'

async function ambil(namaTabel, id) {
  return satu(
    `SELECT * FROM ${namaTabel} WHERE id = $1 AND dihapus_pada IS NULL`,
    [id],
  )
}

/**
 * Termasuk baris yang sudah dihapus — dipakai penyelesaian benturan dan audit.
 * `klien` transaksi dipakai bila ada supaya `nilai_lama` dibaca dari keadaan
 * yang sama dengan tulisannya, bukan dari koneksi pool lain.
 */
async function ambilMentah(namaTabel, id, klien = null) {
  const teks = `SELECT * FROM ${namaTabel} WHERE id = $1`
  return ((klien ? await klien.query(teks, [id]) : await kueri(teks, [id])).rows[0]) ?? null
}

async function catatAudit(klien, namaTabel, idBaris, aksi, lama, baru, ip = klien.ip ?? null) {
  const sumber = baru || lama || {}
  const terjadiPada = sumber.terjadi_pada || new Date().toISOString()
  const lamaBersih = bersihkan(lama)
  const baruBersih = bersihkan(baru)
  await klien.query(
    `INSERT INTO ${TABEL_AUDIT}
       (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
        nilai_lama, nilai_baru, alamat_ip, terjadi_pada, diterima_pada)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
    [
      klien.penggunaId ?? null,
      klien.idPerangkat ?? 'server',
      namaTabel,
      idBaris,
      aksi,
      lamaBersih ? JSON.stringify(lamaBersih) : null,
      baruBersih ? JSON.stringify(baruBersih) : null,
      ip,
      terjadiPada,
    ],
  )
}

/**
 * Satu transaksi untuk tulisan + auditnya.
 * Bila pemanggil sudah membuka transaksi (/sinkron, validasi massal), pakai
 * klien itu agar tidak ada BEGIN bertingkat; kalau belum, buka sendiri.
 */
async function denganKlien(metadata, fn) {
  const isi = (klien) => {
    klien.penggunaId = metadata.penggunaId ?? null
    klien.idPerangkat = metadata.idPerangkat ?? 'server'
    klien.ip = metadata.ip ?? null
    return fn(klien)
  }
  return metadata.klien ? isi(metadata.klien) : transaksi(isi)
}

/** Buat baris baru. `id` wajib ada dan dibuat di klien (AGENTS 2.2). */
async function sisip(namaTabel, nilai, metadata = {}) {
  const bersih = siapkan(namaTabel, nilai)
  return denganKlien(metadata, async (klien) => {
    const sekarang = new Date().toISOString()
    const baris = {
      ...bersih,
      dibuat_pada: sekarang,
      diperbarui_pada: sekarang,
      id_perangkat: metadata.idPerangkat ?? 'server',
      dihapus_pada: null,
    }
    const kolom = Object.keys(baris)
    const placeholder = kolom.map((_, i) => `$${i + 1}`).join(', ')
    await klien.query(
      `INSERT INTO ${namaTabel} (${kolom.join(', ')}) VALUES (${placeholder})`,
      kolom.map((k) => baris[k]),
    )
    await catatAudit(klien, namaTabel, baris.id, 'buat', null, baris)
    return baris
  })
}

/** Ubah baris yang masih hidup. Null bila tidak ada. */
async function ubah(namaTabel, id, nilai, metadata = {}) {
  const tambahan = siapkan(namaTabel, nilai)
  return denganKlien(metadata, async (klien) => {
    const lama = await ambilMentah(namaTabel, id, klien)
    if (!lama) return null

    const sekarang = new Date().toISOString()
    const perubahan = {
      ...tambahan,
      diperbarui_pada: sekarang,
      id_perangkat: metadata.idPerangkat ?? 'server',
    }
    if (metadata.terjadiPada) perubahan.terjadi_pada = metadata.terjadiPada

    const kolom = Object.keys(perubahan)
    const set = kolom.map((k, i) => `${k} = $${i + 1}`).join(', ')
    await klien.query(
      `UPDATE ${namaTabel} SET ${set} WHERE id = $${kolom.length + 1}`,
      [...kolom.map((k) => perubahan[k]), id],
    )
    const hasil = { ...lama, ...perubahan }
    await catatAudit(klien, namaTabel, id, 'ubah', lama, hasil)
    return hasil
  })
}

/**
 * Tulis nilai yang HANYA boleh berasal dari server setelah otorisasi:
 * keputusan validasi nakes dan hasil hitung status gizi. Muatan /sinkron tidak
 * bisa mencapai kolom ini karena `siapkan()` sudah membuangnya dari whitelist.
 */
async function tulisTerotorisasi(namaTabel, id, nilai, metadata = {}) {
  const bersih = siapkanTerotorisasi(namaTabel, nilai)
  if (!Object.keys(bersih).length) throw new Error('tidak_ada_yang_diubah')
  return denganKlien(metadata, async (klien) => {
    const lama = await ambilMentah(namaTabel, id, klien)
    if (!lama) return null
    const kolom = Object.keys(bersih)
    const set = kolom.map((k, i) => `${k} = $${i + 1}`).join(', ')
    await klien.query(
      `UPDATE ${namaTabel} SET ${set}, diperbarui_pada = now() WHERE id = $${kolom.length + 1}`,
      [...kolom.map((k) => bersih[k]), id],
    )
    const hasil = { ...lama, ...bersih }
    await catatAudit(klien, namaTabel, id, 'ubah', lama, hasil)
    return hasil
  })
}

/** Tandai terhapus. Tidak ada DELETE (AGENTS 2.3). */
async function hapus(namaTabel, id, metadata = {}) {
  return denganKlien(metadata, async (klien) => {
    const lama = await ambilMentah(namaTabel, id, klien)
    if (!lama) return false

    const sekarang = new Date().toISOString()
    await klien.query(
      `UPDATE ${namaTabel}
       SET dihapus_pada = $1, diperbarui_pada = $1, id_perangkat = $2
       WHERE id = $3`,
      [sekarang, metadata.idPerangkat ?? 'server', id],
    )
    await catatAudit(klien, namaTabel, id, 'hapus', lama, { ...lama, dihapus_pada: sekarang })
    return true
  })
}

module.exports = {
  ambil, ambilMentah, sisip, ubah, hapus, tulisTerotorisasi, catatAudit,
}
