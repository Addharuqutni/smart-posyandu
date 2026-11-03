// Aturan penyelesaian benturan saat menerima perubahan dari tablet.
//
// Aturan yang mengikat (AGENTS 2.4): **perubahan terakhir menang**, menurut
// `terjadi_pada` milik perangkat.
// Seri dianggap kalah — baris yang sudah ada dipertahankan, supaya
// pengiriman ulang antrean tidak mengubah apa pun.
//
// Murni: tidak menyentuh basis data maupun HTTP, supaya bisa diuji sendiri.

const WAKTU_LEWAT_MASA_DEPAN = 'waktu_lewat_masa_depan'
const KALAH_VERSI = 'kalah_versi'
const MUATAN_TIDAK_SAH = 'muatan_tidak_sah'
const DI_LUAR_RENTANG = 'di_luar_rentang'

const TERIMA = 'terima'
const TOLAK = 'tolak'

// Rentang wajar (F-11). Sama persis dengan klien (logika/rentang.js).
const RENTANG = {
  berat_kg: [1, 40],
  tinggi_cm: [30, 130],
  lingkar_kepala_cm: [25, 60],
}

function keUtc(nilai) {
  const w = nilai instanceof Date ? nilai : new Date(nilai)
  if (Number.isNaN(w.getTime())) return null
  return w
}

/** Alasan penolakan bila jam perangkat terlalu jauh di masa depan. */
function periksaWaktu(terjadiPada, toleransiJam, sekarang) {
  const t = keUtc(terjadiPada)
  const s = keUtc(sekarang)
  if (!t || !s) return MUATAN_TIDAK_SAH
  const batas = s.getTime() + toleransiJam * 3600_000
  return t.getTime() > batas ? WAKTU_LEWAT_MASA_DEPAN : null
}

/** Putuskan satu perubahan. */
function terima(tersimpan, masuk, toleransiJam, sekarang) {
  if (!masuk || typeof masuk !== 'object' || !masuk.terjadi_pada) {
    return [TOLAK, MUATAN_TIDAK_SAH]
  }
  const alasanWaktu = periksaWaktu(masuk.terjadi_pada, toleransiJam, sekarang)
  if (alasanWaktu) return [TOLAK, alasanWaktu]

  if (!tersimpan) return [TERIMA, null]

  const waktuTersimpan = tersimpan.terjadi_pada
  if (!waktuTersimpan) return [TERIMA, null]

  const tMasuk = keUtc(masuk.terjadi_pada)
  const tSimpan = keUtc(waktuTersimpan)
  if (!tMasuk || !tSimpan) return [TOLAK, MUATAN_TIDAK_SAH]

  // Seri = kalah. Pengiriman ulang antrean tidak boleh menulis apa pun.
  return tMasuk.getTime() > tSimpan.getTime() ? [TERIMA, null] : [TOLAK, KALAH_VERSI]
}

/** Kolom yang nilainya di luar rentang wajar. */
function periksaRentang(muatan) {
  const salah = []
  for (const [kolom, [min, maks]] of Object.entries(RENTANG)) {
    const nilai = muatan?.[kolom]
    if (nilai === undefined || nilai === null || nilai === '') continue
    const angka = Number(nilai)
    if (!Number.isFinite(angka) || angka < min || angka > maks) salah.push(kolom)
  }
  return salah
}

/** Alasan penolakan bila muatan tidak berbentuk yang diharapkan. */
function periksaMuatan(namaTabel, muatan) {
  if (!muatan || typeof muatan !== 'object') return MUATAN_TIDAK_SAH
  if (!muatan.id) return MUATAN_TIDAK_SAH
  if (!('terjadi_pada' in muatan)) return MUATAN_TIDAK_SAH
  return null
}

module.exports = {
  WAKTU_LEWAT_MASA_DEPAN,
  KALAH_VERSI,
  MUATAN_TIDAK_SAH,
  DI_LUAR_RENTANG,
  TERIMA,
  TOLAK,
  RENTANG,
  periksaWaktu,
  terima,
  periksaRentang,
  periksaMuatan,
}
