// Pemeriksaan sebelum menyalakan server di produksi. Hanya MEMBACA berkas
// konfigurasi dan bundel; tidak menulis .env atau berkas lain. Nilai variabel
// lingkungan tidak pernah dicetak -- pesan hanya menyebut nama variabel dan
// tindakan perbaikannya.

process.env.DOTENV_CONFIG_QUIET = 'true' // dotenv 18: jangan cetak ringkasan pemuatan .env
require('../env') // memuat .env; sengaja tidak memanggil muat() agar DB tidak diperlukan
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.resolve(__dirname, '..', '..', '..')
const KUNCI_CONTOH = 'ganti-ini-di-produksi'
const galat = []
const peringatan = []

const nilai = (nama) => String(process.env[nama] ?? '').trim()
const bendera = (nama) => nilai(nama).toLowerCase()

if (nilai('NODE_ENV') !== 'production') {
  galat.push('NODE_ENV belum production. Set NODE_ENV di layanan/systemd atau .env menjadi production, lalu mulai ulang server.')
}
if (['false', '0', 'no'].includes(bendera('COOKIE_SECURE'))) {
  galat.push('COOKIE_SECURE dinonaktifkan di produksi. Hapus variabel itu atau set ke true; cookie Secure hanya dikirim lewat HTTPS.')
}
if (nilai('KUNCI_RAHASIA') === KUNCI_CONTOH) {
  galat.push('KUNCI_RAHASIA masih memakai nilai contoh. Buat kunci baru, isi di .env, lalu putar ulang sesi dan cadangan yang terenkripsi.')
}
if (nilai('HOST') === '0.0.0.0' && bendera('TRUST_PROXY') === 'true') {
  galat.push('HOST membuka semua antarmuka sementara TRUST_PROXY menerima header proksi dari siapa pun. Set HOST ke alamat loopback dan TRUST_PROXY ke loopback.')
}

function daftarJs(folder) {
  const hasil = []
  for (const entri of fs.readdirSync(folder, { withFileTypes: true })) {
    const penuh = path.join(folder, entri.name)
    if (entri.isDirectory()) hasil.push(...daftarJs(penuh))
    else if (entri.isFile() && /\.(?:js|mjs|cjs)$/.test(entri.name)) hasil.push(penuh)
  }
  return hasil
}

const dist = path.join(AKAR, 'klien', 'dist')
if (!fs.existsSync(dist)) {
  peringatan.push('Folder klien/dist belum ada. Jalankan npm run bangun di root proyek sebelum memeriksa bundel.')
} else {
  const tersangkut = daftarJs(dist).some((berkas) =>
    fs.readFileSync(berkas, 'utf8').includes('http://127.0.0.1:3000'))
  if (tersangkut) {
    galat.push('Bundel klien/dist masih menanam alamat API loopback. Kosongkan VITE_API, jalankan ulang npm run bangun, lalu periksa lagi.')
  }
}

if (!nilai('KUNCI_CADANGAN')) {
  peringatan.push('KUNCI_CADANGAN belum diisi. Simpan kunci terpisah dari folder cadangan agar berkas cadangan tetap terenkripsi.')
}
try {
  const folderCadangan = path.resolve(AKAR, nilai('FOLDER_CADANGAN') || 'cadangan')
  fs.accessSync(folderCadangan, fs.constants.W_OK)
} catch {
  peringatan.push('Folder cadangan tidak bisa ditulis. Pastikan direktori ada dan dimiliki oleh pengguna yang menjalankan layanan.')
}

for (const pesan of peringatan) console.warn(`PERINGATAN: ${pesan}`)
for (const pesan of galat) console.error(`GAGAL: ${pesan}`)

if (galat.length) {
  console.error(`Pemeriksaan produksi gagal (${galat.length} masalah). Perbaiki lalu jalankan npm run periksa:produksi lagi.`)
  process.exitCode = 1
} else {
  console.log('Pemeriksaan produksi lulus.')
}
