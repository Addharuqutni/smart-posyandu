// Waktu dan pengenal. Semua waktu disimpan ISO 8601 UTC (berakhir "Z"),
// sama dengan bentuk yang dipakai server.

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/

export function sekarangIso() {
  return new Date().toISOString()
}

/**
 * Pengenal acak. `crypto.randomUUID` hanya ada di konteks aman (HTTPS atau
 * localhost), jadi di pemasangan lewat `http://<ip-vps>` ia `undefined` dan
 * setiap pembuatan id melempar TypeError — tampil sebagai "tidak bisa
 * menghubungi server" padahal jaringan baik-baik saja. Cadangan ini memakai
 * `getRandomValues` (tersedia di http) dengan bentuk UUID v4 yang sama.
 */
export function idBaru() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const heks = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${heks.slice(0, 8)}-${heks.slice(8, 12)}-${heks.slice(12, 16)}-${heks.slice(16, 20)}-${heks.slice(20)}`
}

function tanggalSah(nilai) {
  if (typeof nilai !== 'string' || !POLA_TANGGAL.test(nilai)) return null
  const [t, b, h] = nilai.split('-').map(Number)
  const d = new Date(Date.UTC(t, b - 1, h))
  return d.getUTCFullYear() === t && d.getUTCMonth() + 1 === b && d.getUTCDate() === h ? d : null
}

/** Usia dalam bulan penuh pada tanggal tertentu. Boleh negatif bila salah isi. */
export function usiaBulan(tanggalLahir, tanggal) {
  const lahir = tanggalSah(tanggalLahir)
  const saat = tanggalSah(tanggal)
  if (!lahir || !saat) return NaN
  let bulan = (saat.getUTCFullYear() - lahir.getUTCFullYear()) * 12
  bulan += saat.getUTCMonth() - lahir.getUTCMonth()
  if (saat.getUTCDate() < lahir.getUTCDate()) bulan -= 1
  return bulan
}

export function tanggalHariIni() {
  const d = new Date()
  const bulan = String(d.getMonth() + 1).padStart(2, '0')
  const hari = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${bulan}-${hari}`
}

// --- Batas usia balita: 0 hari s.d. 7 tahun (84 bulan) ----------------------
// Aturan kalender (bukan sekadar "bulan penuh") disamakan dengan
// server/src/domain/usia.js supaya data luring tidak ditolak saat dikirim.
export const USIA_MAKS_BULAN = 84

/** Geser tanggal ISO sekian bulan; hari dijepit ke akhir bulan bila perlu. */
function geserBulan(nilai, bulan) {
  const d = tanggalSah(nilai)
  if (!d) return null
  const bulanBaru = d.getUTCMonth() + bulan
  const hasil = new Date(Date.UTC(d.getUTCFullYear(), bulanBaru, d.getUTCDate()))
  if (hasil.getUTCMonth() !== ((bulanBaru % 12) + 12) % 12) {
    return new Date(Date.UTC(d.getUTCFullYear(), bulanBaru + 1, 0)).toISOString().slice(0, 10)
  }
  return hasil.toISOString().slice(0, 10)
}

/** Tanggal lahir paling awal yang masih boleh didaftarkan pada hari ini. */
export function batasTanggalLahir(hariIni = tanggalHariIni()) {
  return geserBulan(hariIni, -USIA_MAKS_BULAN)
}

/** Tanggal terakhir balita kelahiran ini masih boleh diukur. */
export function batasKunjungan(tanggalLahir) {
  return geserBulan(tanggalLahir, USIA_MAKS_BULAN)
}

/** Usia 0 hari s.d. 84 bulan pada tanggal itu. */
export function usiaDiterima(tanggalLahir, tanggal = tanggalHariIni()) {
  const awal = batasTanggalLahir(tanggal)
  return Boolean(awal && tanggalSah(tanggalLahir)) && tanggalLahir >= awal && tanggalLahir <= tanggal
}

/** Waktu ringkas untuk tabel: "1 Nov, 09.57". Bentuk tak dikenal dikembalikan apa adanya. */
export function waktuPendek(iso) {
  if (!iso) return '—'
  const waktu = new Date(iso)
  if (Number.isNaN(waktu.getTime())) return iso
  return waktu.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Usia untuk tabel: angka besar + satuan lengkap, dan keterangan tahun bila
 * sudah genap satu tahun. `null` bila tanggal lahir di luar rentang balita.
 */
export function rincianUsia(tanggalLahir, tanggal = tanggalHariIni()) {
  if (!usiaDiterima(tanggalLahir, tanggal)) return null
  const bulan = usiaBulan(tanggalLahir, tanggal)
  if (bulan === 0) {
    const hari = (tanggalSah(tanggal).getTime() - tanggalSah(tanggalLahir).getTime()) / 86400000
    return { nilai: Math.round(hari), satuan: 'hari', keterangan: null }
  }
  const tahun = Math.floor(bulan / 12)
  const sisa = bulan % 12
  return {
    nilai: tahun > 0 ? tahun : sisa,
    satuan: tahun > 0 ? 'tahun' : 'bulan',
    keterangan: tahun > 0 && sisa > 0 ? `${sisa} bulan` : null,
  }
}

/** Bentuk teks pendek untuk tempat yang tidak butuh rincian. */
export function usiaRingkas(tanggalLahir, tanggal = tanggalHariIni()) {
  const u = rincianUsia(tanggalLahir, tanggal)
  if (!u) return null
  return u.keterangan ? `${u.nilai} ${u.satuan} ${u.keterangan}` : `${u.nilai} ${u.satuan}`
}
