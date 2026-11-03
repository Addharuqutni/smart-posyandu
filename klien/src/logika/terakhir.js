// Memilih kunjungan terbaru per balita.
//
// Dipisah jadi fungsi murni karena aturan ini dulu ada di dalam layar dan
// ikut menentukan status gizi yang tampil. Kalau aturannya berubah, harus ada
// satu tempat yang mengubahnya, dan harus ada uji yang menahannya.

/**
 * @param {Array<{balita_id:string, tanggal_kunjungan:string, terjadi_pada:string, dihapus_pada?:string}>} kunjungan
 * @returns {Map<string, object>} id balita -> kunjungan terbaru
 */
export function kunjunganTerbaruPerBalita(kunjungan) {
  const terakhir = new Map()
  for (const k of kunjungan) {
    if (k.dihapus_pada) continue
    const lama = terakhir.get(k.balita_id)
    if (
      !lama ||
      k.tanggal_kunjungan > lama.tanggal_kunjungan ||
      (k.tanggal_kunjungan === lama.tanggal_kunjungan &&
        String(k.terjadi_pada) > String(lama.terjadi_pada))
    ) {
      terakhir.set(k.balita_id, k)
    }
  }
  return terakhir
}

/** Balita yang sudah punya minimal satu kunjungan tidak terhapus pada bulan itu. */
export function idDiukurBulanIni(kunjungan, bulan) {
  const sudah = new Set()
  for (const k of kunjungan) {
    if (k.dihapus_pada) continue
    if (String(k.tanggal_kunjungan).startsWith(bulan)) sudah.add(k.balita_id)
  }
  return sudah
}

/**
 * Rentang tanggal untuk satu bulan, dipakai kueri indeks `tanggal_kunjungan`.
 * Batas atas EKSKLUSIF (hari pertama bulan berikutnya): "2026-11-31" bukan
 * tanggal yang sah, dan menulis "31" hanya kebetulan benar untuk perbandingan
 * teks.
 */
export function rentangBulan(bulan) {
  const [tahun, bln] = String(bulan).split('-').map(Number)
  const depan = new Date(Date.UTC(tahun, bln, 1))
  const akhir = `${depan.getUTCFullYear()}-${String(depan.getUTCMonth() + 1).padStart(2, '0')}-01`
  return { awal: `${bulan}-01`, akhir }
}
