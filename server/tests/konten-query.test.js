// Uji regresi: daftar konten memakai JOIN, sehingga semua kolom di WHERE harus
// dikualifikasi (k.). Tanpa itu PostgreSQL menolak "column reference is ambiguous".
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const sumber = fs.readFileSync(path.join(__dirname, '../src/routes/konten.js'), 'utf8')

test('semua syarat daftar konten memakai alias k. (tidak ambigu saat JOIN)', () => {
  const daftar = sumber.slice(
    sumber.indexOf("router.get('/konten-publik/semua'"),
    sumber.indexOf("router.post('/konten-publik',"),
  )
  const syarat = [...daftar.matchAll(/syarat\.push\(`([^`]+)`\)/g)].map((m) => m[1])
  assert.ok(syarat.length >= 3, 'harus ada syarat jenis/status/pengaju')
  for (const s of syarat) {
    assert.match(s, /^k\./, `syarat tanpa alias: ${s}`)
  }
  assert.match(daftar, /const syarat = \['k\.dihapus_pada IS NULL'\]/)
})
