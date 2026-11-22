// Uji penjaga: setiap path API yang didaftarkan Express harus punya padanan
// di tiga tempat yang meneruskannya. Tanpa uji ini, rute baru tetap berjalan
// di mesin pengembang (Vite memakai proksi) tetapi bisa terkena cache service
// worker atau jatuh ke fallback SPA di Nginx produksi.
//
// Yang diperiksa:
//   1. klien/vite.config.js  -- proksi pengembangan
//   2. klien/public/sw.js    -- daftar path yang tidak boleh di-cache
//   3. docs/PANDUAN-TLS.md   -- proksi Nginx produksi
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..', '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

/** Segmen pertama setiap rute: routes/*.js DAN rute langsung di app.js. */
function ruteServer() {
  const folder = path.join(AKAR, 'server', 'src', 'routes')
  const berkas = fs.readdirSync(folder)
    .filter((b) => b.endsWith('.js'))
    .map((b) => path.join(folder, b))
  berkas.push(path.join(AKAR, 'server', 'src', 'app.js'))
  const segmen = new Set()
  for (const penuh of berkas) {
    const teks = fs.readFileSync(penuh, 'utf8')
    for (const m of teks.matchAll(/(?:router|aplikasi)\.(?:get|post|patch|put|delete)\(\s*'([^']+)'/g)) {
      // '/konten-publik/:id/putuskan' -> 'konten-publik'
      const pertama = m[1].split('/').filter(Boolean)[0]
      if (pertama) segmen.add(pertama)
    }
  }
  return [...segmen].sort()
}

/** Isi array literal `const JALUR_API = [...]` pada sebuah berkas. */
function daftarJalur(berkas) {
  const teks = baca(berkas)
  const m = teks.match(/const JALUR_API = \[([\s\S]*?)\]/)
  assert.ok(m, `const JALUR_API tidak ditemukan di ${berkas}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/** Isi grup path pada blok `location ~ ^/(...)` panduan Nginx. */
function daftarNginx() {
  const teks = baca('docs/PANDUAN-TLS.md')
  const m = teks.match(/location ~ \^\/\(([^)]*)\)/)
  assert.ok(m, 'blok location API tidak ditemukan di docs/PANDUAN-TLS.md')
  return m[1].split('|')
}

test('proksi Nginx produksi mencakup setiap rute server', () => {
  const proksi = daftarNginx()
  const kurang = ruteServer().filter((r) => !proksi.includes(r.replace(/\./g, '\\.')))
  assert.deepEqual(kurang, [], `rute tanpa proksi Nginx: ${kurang.join(', ')}`)
})

test('proksi Vite mencakup setiap rute server', () => {
  const proksi = daftarJalur('klien/vite.config.js')
  const kurang = ruteServer().filter((r) => !proksi.includes(r))
  assert.deepEqual(kurang, [], `rute tanpa proksi: ${kurang.join(', ')}`)
})


test('service worker tidak men-cache path API', () => {
  const teks = baca('klien/public/sw.js')
  const m = teks.match(/const API = \/\^\\\/\(([^)]*)\)/)
  assert.ok(m, 'pola API tidak ditemukan di sw.js')
  const tercakup = m[1].split('|')
  const kurang = ruteServer().filter((r) => !tercakup.includes(r.replace(/\./g, '\\.')))
  assert.deepEqual(kurang, [], `path API yang bisa ter-cache: ${kurang.join(', ')}`)
})
