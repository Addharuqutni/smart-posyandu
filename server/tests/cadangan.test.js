// Uji nama berkas cadangan sebelum menyentuh sistem berkas.
// Nama datang dari URL, jadi harus dipastikan hanya berkas cadangan yang lolos.

const test = require('node:test')
const assert = require('node:assert')
const { namaSah } = require('../src/jobs/cadangan')

test('nama berkas cadangan yang dibuat server diterima', () => {
  assert.strictEqual(namaSah('posyandu-2026-10-31T02-00-00-000Z.json.gz.enc'), true)
})

test('nama di luar pola cadangan ditolak', () => {
  for (const nama of ['catatan.txt', 'posyandu.json.gz', 'posyandu-.json.gz.enc', '', null]) {
    assert.strictEqual(namaSah(nama), false, `${nama} seharusnya ditolak`)
  }
})

test('percobaan keluar dari folder cadangan ditolak', () => {
  for (const nama of [
    '../posyandu-a.json.gz.enc',
    'posyandu-../../rahasia.json.gz.enc',
    'posyandu-a/b.json.gz.enc',
    'posyandu-a\\b.json.gz.enc',
  ]) {
    assert.strictEqual(namaSah(nama), false, `${nama} seharusnya ditolak`)
  }
})
