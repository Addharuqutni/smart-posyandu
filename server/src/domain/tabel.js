// Definisi tabel sinkron dalam JavaScript.
//
// Sumber kebenaran struktur tetap database/schema.sql. berkas ini hanya
// menyalin nama tabel dan kolom supaya server tahu apa yang boleh ditulis
// dan apa yang rahasia — bukan untuk membuat DDL.

const TABEL_SINKRON = [
  'balita',
  'orang_tua',
  'balita_orang_tua',
  'kunjungan',
  'pengukuran',
  'tindak_lanjut',
]

// Kolom yang boleh diisi dari muatan sinkron, per tabel.
// Kolom audit (dibuat_pada, versi, dihapus_pada) diurus server, bukan klien.
// Kolom keputusan klinis (divalidasi_*, status_gizi, persen_median,
// sumber_status) sengaja TIDAK ada di sini: nilainya hanya boleh ditulis
// server lewat `tulisTerotorisasi()` setelah nakes memvalidasi.
const KOLOM = {
  balita: [
    'id', 'posyandu_id', 'nama_lengkap', 'nik', 'jenis_kelamin',
    'tanggal_lahir', 'nama_ibu_kandung', 'berat_lahir_kg',
    'panjang_lahir_cm', 'aktif', 'terjadi_pada',
  ],
  orang_tua: [
    'id', 'nama_lengkap', 'nik', 'nomor_kontak', 'alamat', 'terjadi_pada',
  ],
  balita_orang_tua: [
    'id', 'balita_id', 'orang_tua_id', 'hubungan', 'kontak_utama', 'terjadi_pada',
  ],
  kunjungan: [
    'id', 'balita_id', 'posyandu_id', 'kader_id', 'tanggal_kunjungan',
    'usia_bulan', 'status_kehadiran', 'catatan', 'terjadi_pada',
  ],
  pengukuran: [
    'id', 'kunjungan_id', 'berat_kg', 'tinggi_cm', 'lingkar_kepala_cm',
    'cara_ukur_tinggi', 'z_berat_umur', 'z_tinggi_umur', 'z_berat_tinggi',
    'sumber_z', 'terjadi_pada',
  ],
  tindak_lanjut: [
    'id', 'kunjungan_id', 'petugas_id', 'jenis', 'isi',
    'tanggal_tindak_lanjut', 'selesai', 'terjadi_pada',
  ],
}

// Tidak boleh muncul di nilai_lama / nilai_baru log_audit.
const RAHASIA = new Set(['hash_kata_sandi', 'token_hash', 'kata_sandi', 'nik'])

// Kolom yang diurus server dan tidak boleh ditimpa muatan klien.
const KOLOM_SERVER = new Set([
  'dibuat_pada', 'diperbarui_pada', 'dihapus_pada', 'versi', 'id_perangkat',
])

// Kolom yang hanya boleh ditulis server setelah otorisasi. Tidak ada di KOLOM
// karena KOLOM adalah whitelist muatan /sinkron yang datang dari tablet.
// Tetap masuk audit (tidak termasuk KOLOM_SERVER) supaya keputusan nakes
// dan hasil hitung status gizi tercatat di nilai_baru.
const KOLOM_TEROTORISASI = {
  kunjungan: ['divalidasi_oleh', 'divalidasi_pada', 'terjadi_pada'],
  pengukuran: ['status_gizi', 'sumber_status', 'persen_median'],
}

/** Batasi ke kolom yang dikenal tabel ini. Kunci asing dibuang diam-diam. */
function siapkan(namaTabel, nilai) {
  const boleh = KOLOM[namaTabel]
  if (!boleh) {
    const salah = new Error(`tabel_tidak_dikenal: ${namaTabel}`)
    salah.kode = 'tabel_tidak_dikenal'
    throw salah
  }
  const keluar = {}
  for (const k of boleh) {
    if (nilai[k] !== undefined) keluar[k] = nilai[k]
  }
  return keluar
}

/** Kolom yang boleh ditulis lewat jalur server yang sudah diotorisasi. */
function siapkanTerotorisasi(namaTabel, nilai) {
  const boleh = KOLOM_TEROTORISASI[namaTabel] ?? []
  const keluar = {}
  for (const k of boleh) {
    if (nilai[k] !== undefined) keluar[k] = nilai[k]
  }
  return keluar
}

/** Buang rahasia sebelum masuk log_audit. */
function bersihkan(nilai) {
  if (!nilai) return null
  const keluar = {}
  for (const [k, v] of Object.entries(nilai)) {
    if (!RAHASIA.has(k) && !KOLOM_SERVER.has(k)) keluar[k] = v
  }
  return keluar
}

module.exports = {
  TABEL_SINKRON, KOLOM, RAHASIA, siapkan, siapkanTerotorisasi, bersihkan,
}
