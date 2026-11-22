// Agregasi murni untuk statistik permintaan /metrik.
// Fungsi ini tidak menyentuh proses, basis data, atau jam.

/**
 * Ringkas penghitung yang dikumpulkan middleware.
 *
 * `429` dihitung ulang dari kode status dan tetap masuk `4xx` (subset), sesuai
 * pengelompokan HTTP.
 */
function ringkasPermintaan({ jumlah = 0, latensiMs = 0, kode = new Map() } = {}) {
  const pasangan = kode instanceof Map ? [...kode] : Object.entries(kode ?? {})
  const hitung = (dari, sampai) =>
    pasangan.reduce(
      (n, [status, nilai]) =>
        Number(status) >= dari && Number(status) < sampai ? n + Number(nilai) : n,
      0,
    )

  return {
    jumlah,
    '2xx': hitung(200, 300),
    '4xx': hitung(400, 500),
    '403': hitung(403, 404),
    '422': hitung(422, 423),
    '429': hitung(429, 430),
    '5xx': hitung(500, 600),
    rataRataMs: jumlah ? Math.round((latensiMs / jumlah) * 100) / 100 : 0,
  }
}

/** Age in hours; null for missing/invalid timestamps, never negative on clock skew. */
function usiaJam(waktu, sekarang = Date.now()) {
  if (waktu == null || waktu === '') return null
  const stamp = waktu instanceof Date ? waktu.getTime() : new Date(waktu).getTime()
  const now = sekarang instanceof Date ? sekarang.getTime() : Number(sekarang)
  if (!Number.isFinite(stamp) || !Number.isFinite(now)) return null
  return Math.round(Math.max(0, now - stamp) / 36000) / 100
}

module.exports = { ringkasPermintaan, usiaJam }
