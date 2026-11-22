// Rentang wajar (F-11). Sama persis dengan server (KONTRAK_API 1.5) supaya
// kader langsung tahu tanpa menunggu kiriman. Server tetap memeriksa lagi.
export const RENTANG = {
  berat_kg: [1, 40],
  tinggi_cm: [30, 130],
  lingkar_kepala_cm: [25, 60],
}

export const LABEL = {
  berat_kg: 'Berat (kg)',
  tinggi_cm: 'Tinggi (cm)',
  lingkar_kepala_cm: 'Lingkar kepala (cm)',
}

/** Kolom yang nilainya di luar rentang. Kosong = semua wajar. */
export function periksaRentang(nilai) {
  const salah = []
  for (const [kolom, [min, maks]] of Object.entries(RENTANG)) {
    const isi = nilai[kolom]
    if (isi === undefined || isi === null || isi === '') continue
    const angka = Number(isi)
    if (!Number.isFinite(angka) || angka < min || angka > maks) salah.push(kolom)
  }
  return salah
}

export const PESAN_STATUS = {
  gizi_baik: 'Gizi baik',
  gizi_kurang: 'Gizi kurang',
  gizi_buruk: 'Gizi buruk',
  gizi_buruk_berat: 'Gizi buruk (berat)',
  belum_dinilai: 'Belum dinilai',
}

export const ACUAN_TIDAK_TERSEDIA = 'acuan_tidak_tersedia'

/** Reason for a missing assessment; never a nutrition status. */
export const PESAN_ALASAN_STATUS = {
  [ACUAN_TIDAK_TERSEDIA]: 'Acuan belum tersedia',
}

export function labelStatus(status, sumberStatus) {
  if (status) return PESAN_STATUS[status] ?? status
  return PESAN_ALASAN_STATUS[sumberStatus] ?? null
}

export function kelasStatus(status, sumberStatus) {
  if (status) return status
  return sumberStatus === ACUAN_TIDAK_TERSEDIA ? ACUAN_TIDAK_TERSEDIA : 'menunggu'
}
