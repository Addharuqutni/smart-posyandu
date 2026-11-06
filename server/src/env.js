// Konfigurasi dari variabel lingkungan.
//
// Berkasnya TUNGGAL di root proyek (`.env`), dipakai bersama klien. Salin
// `.env.contoh` jadi `.env` lalu isi. Tanpa nilai ini aplikasi menolak
// menyala — lebih baik gagal terang-terangan daripada memakai kunci contoh.
//
// Dicari dua tempat: root proyek (bila dijalankan lewat skrip root) dan
// folder server sendiri, supaya `npm start` dari dalam server/ tetap jalan.

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const WAJIB = ['DATABASE_URL', 'KUNCI_RAHASIA']

/** Direktori root proyek (yang memuat .env), dipakai sebagai acuan path. */
function cariAkar() {
  return path.resolve(__dirname, '..', '..')
}

/** Untuk uji logika murni: cukup KUNCI_RAHASIA, tanpa basis data. */
const UJI = process.env.NODE_ENV === 'test'

function muat() {
  const kurang = WAJIB.filter((k) => !process.env[k])
  const butuh = UJI ? ['KUNCI_RAHASIA'] : WAJIB
  const tidakAda = butuh.filter((k) => !process.env[k])
  if (tidakAda.length) {
    throw new Error(
      `Variabel lingkungan belum diisi: ${tidakAda.join(', ')}. ` +
        'Salin .env.contoh di root proyek jadi .env lalu isi nilainya.',
    )
  }
  return {
    databaseUrl: process.env.DATABASE_URL || 'postgres://localhost/posyandu_uji',
    kunciRahasia: process.env.KUNCI_RAHASIA,
    kunciEnkripsi: process.env.KUNCI_ENKRIPSI || process.env.KUNCI_RAHASIA,
    kunciCadangan: process.env.KUNCI_CADANGAN || process.env.KUNCI_RAHASIA,
    port: Number(process.env.PORT || 3000),
    // Alamat dengar.
    //
    // Bawaan 127.0.0.1: API hanya bisa dicapai lewat Nginx di mesin yang sama.
    // Sebelumnya `listen(port)` tanpa host membuat Node mendengarkan di SEMUA
    // antarmuka (0.0.0.0), sehingga port 3000 terbuka ke jaringan desa dan
    // bisa diakses langsung tanpa Nginx -- melewati batas laju per IP dan
    // penyajian lewat proksi. Isi HOST=0.0.0.0 hanya bila sengaja memisahkan
    // API dari Nginx.
    host: process.env.HOST || '127.0.0.1',
    toleransiJam: Number(process.env.TOLERANSI_JAM_KE_DEPAN || 24),
    // Relatif ke root proyek, bukan ke folder kerja: kalau tidak, letak
    // cadangan berpindah-pindah tergantung dari mana server dijalankan.
    folderCadangan: path.resolve(cariAkar(), process.env.FOLDER_CADANGAN || 'cadangan'),
    menitSesiTablet: Number(process.env.MENIT_SESI_TABLET || 10080),
    menitSesiAdmin: Number(process.env.MENIT_SESI_ADMIN || 480),
    cadanganHarian: process.env.CADANGAN_HARIAN !== 'false',
    // Tarik artikel tips KodeNara tiap hari. Matikan dengan KODENARA_HARIAN=false
    // bila server tidak boleh menghubungi internet (mis. VPS tertutup).
    kodenaraHarian: process.env.KODENARA_HARIAN !== 'false',
    // Batas waktu satu pernyataan SQL. Lihat db/pool.js.
    batasWaktuKueriMs: Number(process.env.BATAS_WAKTU_KUERI_MS || 10000),
  }
}

module.exports = { muat }
