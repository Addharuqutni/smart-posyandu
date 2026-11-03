// Uji aturan batas usia balita: 0 hari s.d. 7 tahun (84 bulan).
// Murni: tanpa basis data.
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  MAKS_BULAN, tanggalSah, batasLahir, batasKunjungan, lahirDiterima, kunjunganDiterima,
} = require('../src/domain/usia')

const HARI = '2026-11-03'

test('batas usia tepat 84 bulan', () => {
  assert.equal(MAKS_BULAN, 84)
  assert.equal(batasLahir(HARI), '2019-11-03')
  assert.equal(batasKunjungan('2019-11-03'), HARI)
})

test('lahir hari ini boleh, kemasa depan dan lebih tua 7 tahun ditolak', () => {
  assert.equal(lahirDiterima(HARI, HARI), true)
  assert.equal(lahirDiterima('2019-11-03', HARI), true)
  assert.equal(lahirDiterima('2019-11-02', HARI), false)
  assert.equal(lahirDiterima('2026-11-04', HARI), false)
  assert.equal(lahirDiterima('2026-02-30', HARI), false)
  assert.equal(lahirDiterima('', HARI), false)
})

test('batas 29 Februari dijepit ke akhir Februari', () => {
  assert.equal(batasLahir('2024-02-29'), '2017-02-28')
  assert.equal(lahirDiterima('2017-02-28', '2024-02-29'), true)
  assert.equal(lahirDiterima('2017-02-27', '2024-02-29'), false)
})

test('kunjungan hanya sampai tepat 7 tahun sejak lahir', () => {
  assert.equal(kunjunganDiterima('2019-11-03', '2019-11-03'), true)
  assert.equal(kunjunganDiterima('2019-11-03', HARI), true)
  assert.equal(kunjunganDiterima('2019-11-03', '2026-11-04'), false)
  assert.equal(kunjunganDiterima('2019-11-03', '2019-11-02'), false)
  assert.equal(kunjunganDiterima('2026-02-30', HARI), false)
})

test('tanggal ISO yang tidak ada ditolak', () => {
  assert.equal(tanggalSah('2026-02-30'), null)
  assert.equal(tanggalSah('2026-13-01'), null)
  assert.equal(tanggalSah('2026-11-3'), null)
  assert.ok(tanggalSah('2024-02-29'))
})
