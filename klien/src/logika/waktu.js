// Waktu dan pengenal. Semua waktu disimpan ISO 8601 UTC (berakhir "Z"),
// sama dengan bentuk yang dipakai server.

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

/** Usia dalam bulan penuh pada tanggal tertentu. Boleh negatif bila salah isi. */
export function usiaBulan(tanggalLahir, tanggal) {
  const lahir = new Date(`${tanggalLahir}T00:00:00Z`)
  const saat = new Date(`${tanggal}T00:00:00Z`)
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
