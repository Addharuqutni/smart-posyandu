// Jadwal pencadangan: pukul 02.00 WIB (UTC+7), bukan "24 jam sejak proses
// hidup". Versi sebelumnya memakai setInterval sehingga restart server
// menunda cadangan berikutnya satu putaran penuh, dan dokumen menjanjikan
// 02.00 WIB. Fungsi di sini murni supaya bisa diuji tanpa menunggu jam nyata.

const WIB_MS = 7 * 3600_000
const HARI_MS = 24 * 3600_000

/** Milidetik sampai pukul `jamWib` berikutnya. */
function msKeBerikutnyaWib(jamWib = 2, sekarang = Date.now()) {
  const lokal = sekarang + WIB_MS
  const awalHariIni = Math.floor(lokal / HARI_MS) * HARI_MS
  let target = awalHariIni + jamWib * 3600_000
  if (target <= lokal) target += HARI_MS
  return target - lokal
}

/** Cadangan terakhir sudah lewat masa 24 jam (atau belum ada sama sekali)? */
function perluCatchUp(cadanganTerakhirMs, sekarang = Date.now()) {
  if (!cadanganTerakhirMs) return true
  return sekarang - cadanganTerakhirMs > HARI_MS
}

module.exports = { msKeBerikutnyaWib, perluCatchUp, HARI_MS, WIB_MS }
