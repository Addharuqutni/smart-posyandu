// Batas usia balita: 0 hari s.d. 7 tahun (84 bulan).
// Satu sumber kebenaran untuk /balita dan /sinkron. Perbandingan memakai
// tanggal kalender, bukan "bulan penuh": usia 84 bulan 14 hari sudah lewat.

const MAKS_BULAN = 84
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/

/** Tanggal ISO yang benar-benar ada (menolak 2026-02-30 yang diterima Date). */
function tanggalSah(nilai) {
  if (typeof nilai !== 'string' || !POLA_TANGGAL.test(nilai)) return null
  const [t, b, h] = nilai.split('-').map(Number)
  const d = new Date(Date.UTC(t, b - 1, h))
  return d.getUTCFullYear() === t && d.getUTCMonth() + 1 === b && d.getUTCDate() === h ? d : null
}

/** Geser tanggal sekian bulan; hari dijepit ke akhir bulan bila perlu. */
function geserBulan(nilai, bulan) {
  const d = tanggalSah(nilai)
  if (!d) return null
  const t = d.getUTCFullYear()
  const b = d.getUTCMonth() + bulan
  const h = d.getUTCDate()
  const hasil = new Date(Date.UTC(t, b, h))
  if (hasil.getUTCMonth() !== ((b % 12) + 12) % 12) return new Date(Date.UTC(t, b + 1, 0))
  return hasil
}

function iso(d) {
  return d.toISOString().slice(0, 10)
}

/** Tanggal lahir paling awal yang masih sah pada hari ini. */
function batasLahir(hariIni) {
  const d = geserBulan(hariIni, -MAKS_BULAN)
  return d ? iso(d) : null
}

/** Tanggal terakhir balita ini masih boleh diukur. */
function batasKunjungan(tanggalLahir) {
  const d = geserBulan(tanggalLahir, MAKS_BULAN)
  return d ? iso(d) : null
}

/** Lahir hari ini = 0 hari (boleh); masa depan dan lebih tua 7 tahun ditolak. */
function lahirDiterima(lahir, hariIni = new Date().toISOString().slice(0, 10)) {
  if (!tanggalSah(lahir)) return false
  const awal = batasLahir(hariIni)
  return Boolean(awal) && lahir >= awal && lahir <= hariIni
}

/** Kunjungan sah bila tidak sebelum lahir dan tidak lewat 84 bulan. */
function kunjunganDiterima(lahir, tanggal) {
  if (!tanggalSah(lahir) || !tanggalSah(tanggal)) return false
  const akhir = batasKunjungan(lahir)
  return Boolean(akhir) && tanggal >= lahir && tanggal <= akhir
}

module.exports = { MAKS_BULAN, tanggalSah, geserBulan, batasLahir, batasKunjungan, lahirDiterima, kunjunganDiterima }
