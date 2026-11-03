// Uji enkripsi NIK (pengganti Fernet Python).
const test = require('node:test')
const assert = require('node:assert')

process.env.KUNCI_RAHASIA = 'kunci-uji'

const { enkripsi, dekripsi, AWALAN } = require('../src/domain/rahasia')

test('enkripsi lalu dekripsi mengembalikan nilai asli', () => {
  const asli = '3301010101010001'
  const tersimpan = enkripsi(asli)
  assert.ok(tersimpan.startsWith(AWALAN))
  assert.notStrictEqual(tersimpan, asli)
  assert.strictEqual(dekripsi(tersimpan), asli)
})

test('enkripsi idempoten: tidak mengenkripsi dua kali', () => {
  const sekali = enkripsi('3301010101010001')
  const dua = enkripsi(sekali)
  assert.strictEqual(sekali, dua)
})

test('nilai kosong dan null tetap apa adanya', () => {
  assert.strictEqual(enkripsi(null), null)
  assert.strictEqual(enkripsi(''), '')
  assert.strictEqual(dekripsi(null), null)
})

test('dekripsi dengan nilai yang bukan terenkripsi dikembalikan apa adanya', () => {
  assert.strictEqual(dekripsi('teks-biasa'), 'teks-biasa')
})
