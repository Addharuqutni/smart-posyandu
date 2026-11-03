// Uji logika pemulihan yang tidak menyentuh basis data: pemeriksaan bentuk
// isi berkas, pemecahan potongan INSERT, dan penolakan berkas asing.

const test = require('node:test')
const assert = require('node:assert')

process.env.KUNCI_RAHASIA = 'kunci-uji'

const { periksaIsi, bagian } = require('../src/jobs/pemulihan')

test('isi cadangan berbentuk tabel-ke-daftar diterima', () => {
  assert.strictEqual(
    periksaIsi({
      posyandu: [{ id: 'a' }],
      balita: [{ id: 'b' }, { id: 'c' }],
    }),
    null,
  )
})

test('isi kosong atau bukan objek ditolak', () => {
  assert.strictEqual(periksaIsi(null), 'isi_cadangan_tidak_sah')
  assert.strictEqual(periksaIsi([]), 'isi_cadangan_tidak_sah')
  assert.strictEqual(periksaIsi('teks'), 'isi_cadangan_tidak_sah')
  assert.strictEqual(periksaIsi({}), 'isi_cadangan_kosong')
})

test('berkas tanpa tabel yang dikenal aplikasi ditolak', () => {
  assert.strictEqual(periksaIsi({ tabel_lain: [{ id: 'a' }] }), 'tidak_ada_tabel_dikenal')
})

test('tabel yang isinya bukan daftar ditolak', () => {
  assert.strictEqual(periksaIsi({ balita: { id: 'a' } }), 'tabel_bukan_daftar:balita')
})

test('baris tanpa id ditolak: tanpa id tidak bisa ditimpa dengan aman', () => {
  assert.strictEqual(
    periksaIsi({ balita: [{ nama_lengkap: 'Ani' }] }),
    'baris_tanpa_id:balita',
  )
})

test('tabel kosong tidak dianggap masalah', () => {
  assert.strictEqual(periksaIsi({ balita: [] }), null)
})

test('daftar dipecah tanpa kehilangan atau menggandakan baris', () => {
  const daftar = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }))
  const potong = bagian(daftar, 400)
  assert.strictEqual(potong.length, 3)
  assert.deepStrictEqual(
    potong.flat().map((b) => b.id),
    daftar.map((b) => b.id),
  )
  assert.strictEqual(potong[0].length, 400)
  assert.strictEqual(potong[2].length, 200)
})

test('daftar kosong menghasilkan tidak ada potongan', () => {
  assert.deepStrictEqual(bagian([], 400), [])
})
