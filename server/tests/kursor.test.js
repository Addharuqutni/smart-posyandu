// Uji kursor halaman sinkron. Murni, tanpa basis data.
//
// Regresi: kursor berbasis waktu saja pernah membuat `GET /sinkron`
// kehilangan baris yang `diperbarui_pada`-nya sama persis. Dengan 3000
// balita, tarikan berhenti di 556 baris dari 16.788.

const test = require('node:test')
const assert = require('node:assert')

const { bacaKursor, tulisKursor, bandingkan, posisi, lewatKursor } = require('../src/domain/kursor')

const WAKTU = '2026-11-20T03:14:22.000Z'

test('kursor dibaca kembali sama persis', () => {
  const k = tulisKursor('pengukuran', { id: 'abc', diperbarui_pada: new Date(WAKTU) })
  assert.strictEqual(k, `${WAKTU}|pengukuran|abc`)
  assert.deepStrictEqual(bacaKursor(k), { waktu: WAKTU, tabel: 'pengukuran', id: 'abc' })
})

test('kursor lama berbentuk iso tetap diterima', () => {
  assert.deepStrictEqual(bacaKursor(WAKTU), { waktu: WAKTU, tabel: '', id: '' })
})

test('kursor rusak dianggap tidak ada', () => {
  assert.strictEqual(bacaKursor('bukan-tanggal'), null)
  assert.strictEqual(bacaKursor(''), null)
  assert.strictEqual(bacaKursor(undefined), null)
})

test('baris dengan cap waktu sama tidak terlewat', () => {
  const kursor = bacaKursor(`${WAKTU}|balita|a`)
  const sesudah = { namaTabel: 'balita', baris: { id: 'b', diperbarui_pada: new Date(WAKTU) } }
  const sebelumnya = { namaTabel: 'balita', baris: { id: 'a', diperbarui_pada: new Date(WAKTU) } }
  assert.strictEqual(lewatKursor(sesudah, kursor), true)
  assert.strictEqual(lewatKursor(sebelumnya, kursor), false, 'baris yang jadi kursor tidak diulang')
})

test('urutan tabel memutus seri waktu yang sama', () => {
  const balita = { namaTabel: 'balita', baris: { id: 'z', diperbarui_pada: new Date(WAKTU) } }
  const kunjungan = { namaTabel: 'kunjungan', baris: { id: 'a', diperbarui_pada: new Date(WAKTU) } }
  assert.ok(bandingkan(posisi(balita), posisi(kunjungan)) < 0)
  assert.ok(bandingkan(posisi(kunjungan), posisi(balita)) > 0)
})

test('waktu lebih baru selalu menang atas tabel', () => {
  const lama = { namaTabel: 'tindak_lanjut', baris: { id: 'zzz', diperbarui_pada: new Date(WAKTU) } }
  const baru = {
    namaTabel: 'balita',
    baris: { id: 'aaa', diperbarui_pada: new Date('2026-11-20T03:14:23.000Z') },
  }
  assert.ok(bandingkan(posisi(baru), posisi(lama)) > 0)
})

test('id identik dibandingkan sama', () => {
  const a = { namaTabel: 'balita', baris: { id: 'x', diperbarui_pada: new Date(WAKTU) } }
  assert.strictEqual(bandingkan(posisi(a), posisi(a)), 0)
})
