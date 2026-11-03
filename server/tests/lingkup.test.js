// Uji penyaringan posyandu pada tarikan sinkron (KONTRAK_API 3).
// Murni, tanpa basis data: hanya memeriksa potongan SQL yang dihasilkan.
//
// Regresi: filter pernah terpasang hanya pada `kunjungan`, sehingga kader
// menerima balita, pengukuran, dan orang tua dari seluruh posyandu.

const test = require('node:test')
const assert = require('node:assert')
const { syaratPosyandu } = require('../src/routes/sinkron')

const POS = 'd0c4a137-06fb-4684-9d74-96564cb2cbf0'

test('tanpa batasan posyandu tidak ada filter', () => {
  for (const t of ['balita', 'kunjungan', 'pengukuran', 'tindak_lanjut', 'orang_tua']) {
    const nilai = []
    assert.strictEqual(syaratPosyandu(t, null, nilai), '')
    assert.deepStrictEqual(nilai, [], `${t} tidak boleh menambah parameter`)
  }
})

test('tabel ber-posyandu_id sendiri disaring langsung', () => {
  for (const t of ['balita', 'kunjungan']) {
    const nilai = []
    assert.strictEqual(syaratPosyandu(t, POS, nilai), ' AND posyandu_id = $1')
    assert.deepStrictEqual(nilai, [POS])
  }
})

test('pengukuran dan tindak_lanjut disaring lewat kunjungan', () => {
  for (const t of ['pengukuran', 'tindak_lanjut']) {
    const nilai = []
    assert.strictEqual(
      syaratPosyandu(t, POS, nilai),
      ' AND kunjungan_id IN (SELECT id FROM kunjungan WHERE posyandu_id = $1)',
    )
    assert.deepStrictEqual(nilai, [POS])
  }
})

test('balita_orang_tua disaring lewat balita', () => {
  const nilai = []
  assert.strictEqual(
    syaratPosyandu('balita_orang_tua', POS, nilai),
    ' AND balita_id IN (SELECT id FROM balita WHERE posyandu_id = $1)',
  )
  assert.deepStrictEqual(nilai, [POS])
})

test('orang_tua disaring lewat balita_orang_tua lalu balita', () => {
  const nilai = []
  const s = syaratPosyandu('orang_tua', POS, nilai)
  assert.ok(s.includes('balita_orang_tua'))
  assert.ok(s.includes('FROM balita WHERE posyandu_id = $1'))
  assert.deepStrictEqual(nilai, [POS])
})

test('nomor parameter mengikuti parameter yang sudah ada', () => {
  const nilai = ['2026-10-02T00:00:00.000Z']
  assert.strictEqual(syaratPosyandu('balita', POS, nilai), ' AND posyandu_id = $2')
  assert.deepStrictEqual(nilai, ['2026-10-02T00:00:00.000Z', POS])
})
