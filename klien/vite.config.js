import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// Konfigurasi dipusat di `.env` root proyek, dipakai bersama server.
// Tanpa `envDir`, Vite hanya mencari `.env` di dalam folder klien/, sehingga
// VITE_API tidak terbaca bila berkasnya di root.
const akar = fileURLToPath(new URL('..', import.meta.url))

// Path API yang diteruskan ke server Node saat pengembangan.
//
// Saat VITE_API kosong (bawaan, dan bentuk yang benar untuk produksi), klien
// memanggil path relatif ke origin yang sama. Di VPS itu ditangani Nginx. Di
// mesin pengembang origin-nya Vite, yang tanpa proksi ini menjawab setiap
// `/konten-publik` dengan index.html -- `fetch` lalu gagal saat `.json()`, dan
// layar menampilkan galat koneksi padahal server sehat.
//
// Daftarnya sengaja TIDAK disalin dari alat.js: berkas ini berjalan di Vite
// (ESM, tanpa akses ke sana). Penjaganya ada di `server/tests/proksi.test.js`,
// yang membandingkan daftar ini dengan rute yang benar-benar didaftarkan
// Express, sehingga path baru tidak bisa lolos tanpa disadari.
const JALUR_API = [
  'masuk', 'keluar', 'saya', 'akun-saya', 'sinkron', 'balita', 'kunjungan',
  'validasi', 'pengguna', 'sesi', 'rekap', 'ekspor.csv', 'kualitas',
  'cadangan', 'posyandu', 'konten-publik', 'aktivitas', 'sehat', 'waktu',
]

// PORT_SERVER hanya untuk pengembangan lokal saat 3000 dipakai proses lain.
const PORT_SERVER = process.env.PORT_SERVER || 3000
const proksi = Object.fromEntries(
  JALUR_API.map((j) => [`/${j}`, `http://127.0.0.1:${PORT_SERVER}`]),
)

export default defineConfig({
  plugins: [tailwindcss(), react()],
  envDir: akar,
  // Host disamakan dengan API (VITE_API di .env) supaya cookie SameSite=Strict
  // tidak dianggap lintas-situs saat pengembangan di http.
  server: { host: '127.0.0.1', port: Number(process.env.PORT_KLIEN || 5173), proxy: proksi },
})
