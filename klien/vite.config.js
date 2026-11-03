import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Konfigurasi dipusat di `.env` root proyek, dipakai bersama server.
// Tanpa `envDir`, Vite hanya mencari `.env` di dalam folder klien/, sehingga
// VITE_API tidak terbaca bila berkasnya di root.
const akar = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [react()],
  envDir: akar,
  server: { port: 5173 },
})
