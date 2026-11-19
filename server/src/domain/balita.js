// Hapus balita beserta turunannya (soft delete), satu-satunya tempat aturan ini.
//
// Dua jalur menghapus balita: `DELETE /balita/:id` (admin desa) dan
// `aksi: 'hapus'` lewat `/sinkron` (tablet). Sebelumnya keduanya berbeda,
// sehingga kunjungan yatim tertinggal dan tetap terhitung di rekap bulanan.

const { hapus } = require('./repositori')

/**
 * @param {object} klien klien transaksi yang sedang terbuka
 * @param {string} id id balita
 * @param {object} meta `{ penggunaId, idPerangkat, ip, klien }` untuk log audit
 * @returns {Promise<boolean>} false bila balita tidak ada / sudah dihapus
 */
async function hapusBalita(klien, id, meta) {
  const lama = (await klien.query(
    `SELECT id FROM balita WHERE id = $1 AND dihapus_pada IS NULL`, [id],
  )).rows[0]
  if (!lama) return false

  // Kunjungan yang sudah dibatalkan tetap diambil: pengukurannya mungkin
  // masih hidup (pembatalan hanya menyentuh baris kunjungan), dan tanpa ini
  // baris itu jadi yatim saat balita dihapus.
  const kunjungan = (await klien.query(
    `SELECT id FROM kunjungan WHERE balita_id = $1`, [id],
  )).rows.map((r) => r.id)
  if (kunjungan.length) {
    const pengukuran = (await klien.query(
      `SELECT id FROM pengukuran WHERE kunjungan_id = ANY($1::uuid[]) AND dihapus_pada IS NULL`,
      [kunjungan],
    )).rows.map((r) => r.id)
    const tindak = (await klien.query(
      `SELECT id FROM tindak_lanjut WHERE kunjungan_id = ANY($1::uuid[]) AND dihapus_pada IS NULL`,
      [kunjungan],
    )).rows.map((r) => r.id)
    for (const u of pengukuran) await hapus('pengukuran', u, meta)
    for (const t of tindak) await hapus('tindak_lanjut', t, meta)
    for (const k of kunjungan) await hapus('kunjungan', k, meta)
  }
  const relasi = (await klien.query(
    `SELECT id FROM balita_orang_tua WHERE balita_id = $1 AND dihapus_pada IS NULL`, [id],
  )).rows.map((r) => r.id)
  for (const r of relasi) await hapus('balita_orang_tua', r, meta)

  return hapus('balita', id, meta)
}

module.exports = { hapusBalita }
