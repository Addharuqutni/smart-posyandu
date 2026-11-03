// Status gizi dari persen median BB/U (PRD Bagian 7.1, Opsi A).
//
// Dihitung **hanya di server** (AGENTS 2.6): rumus dan acuan bisa berubah
// tanpa pembaruan tablet, dan klien tidak menghitung ulang.
//
// Batas klasifikasi mengikuti KMS kertas yang sudah dikenal kader
// (ARSITEKTUR 4.4).

// Batas bawah tiap kelas, urut dari terberat.
const BATAS = [
  [80, 'gizi_baik'],
  [70, 'gizi_kurang'],
  [60, 'gizi_buruk'],
]

const PESAN_STATUS = {
  gizi_baik: 'Gizi baik',
  gizi_kurang: 'Gizi kurang',
  gizi_buruk: 'Gizi buruk',
  gizi_buruk_berat: 'Gizi buruk (berat)',
}

/** Klasifikasi persen median. < 60 selalu `gizi_buruk_berat`. */
function klasifikasi(persen) {
  const nilai = Number(persen)
  if (!Number.isFinite(nilai)) return null
  for (const [batas, status] of BATAS) {
    if (nilai >= batas) return status
  }
  return 'gizi_buruk_berat'
}

/** Persen median + status untuk satu pengukuran. */
function hitung(beratKg, medianKg, sumber) {
  const berat = Number(beratKg)
  const median = Number(medianKg)
  if (!Number.isFinite(berat) || !Number.isFinite(median) || median === 0) return null
  const persen = (berat / median) * 100
  return {
    persen_median: Math.round(persen * 100) / 100,
    status_gizi: klasifikasi(persen),
    sumber_status: sumber ?? null,
  }
}

module.exports = { klasifikasi, hitung, BATAS, PESAN_STATUS }
