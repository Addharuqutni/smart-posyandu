// Uji penjaga: setiap path API yang didaftarkan Express harus punya padanan
// di dua tempat yang meneruskannya. Tanpa uji ini, rute baru tetap berjalan
// di mesin pengembang (Vite memakai proksi) tetapi bisa terkena cache service
// worker di produksi.
//
// Yang diperiksa:
//   1. klien/vite.config.js  -- proksi pengembangan
//   2. klien/public/sw.js    -- daftar path yang tidak boleh di-cache
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..', '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

/** Segmen pertama setiap rute yang didaftarkan di server/src/routes/*.js. */
function ruteServer() {
  const folder = path.join(AKAR, 'server', 'src', 'routes')
  const segmen = new Set()
  for (const berkas of fs.readdirSync(folder)) {
    if (!berkas.endsWith('.js')) continue
    const teks = fs.readFileSync(path.join(folder, berkas), 'utf8')
    for (const m of teks.matchAll(/router\.(?:get|post|patch|put|delete)\(\s*'([^']+)'/g)) {
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
