// Waktu dan pengenal. Semua waktu disimpan ISO 8601 UTC (berakhir "Z"),
// sama dengan bentuk yang dipakai server.

export function sekarangIso() {
  return new Date().toISOString()
}

export function idBaru() {
  return crypto.randomUUID()
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
