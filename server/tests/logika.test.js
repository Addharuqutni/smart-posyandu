// Uji aturan murni: sinkron & status gizi. Tidak butuh basis data.
const test = require('node:test')
const assert = require('node:assert')

const {
  terima, periksaWaktu, periksaRentang, periksaMuatan,
  TERIMA, TOLAK, WAKTU_LEWAT_MASA_DEPAN, KALAH_VERSI, MUATAN_TIDAK_SAH,
} = require('../src/domain/sinkron')
const { klasifikasi, hitung } = require('../src/domain/status_gizi')

const SEKARANG = new Date('2026-11-20T12:00:00Z')
const TOLERANSI = 24

test('perubahan baru diterima', () => {
  assert.deepStrictEqual(
    terima(null, { terjadi_pada: '2026-11-20T11:00:00Z' }, TOLERANSI, SEKARANG),
    [TERIMA, null],
  )
})

test('jam terlalu maju ditolak', () => {
  const masuk = { terjadi_pada: '2026-12-01T00:00:00Z' } // jauh ke depan
  assert.deepStrictEqual(terima(null, masuk, TOLERANSI, SEKARANG), [TOLAK, WAKTU_LEWAT_MASA_DEPAN])
})

test('jam mundur tetap diterima', () => {
  assert.deepStrictEqual(
    terima(null, { terjadi_pada: '2026-11-01T00:00:00Z' }, TOLERANSI, SEKARANG),
    [TERIMA, null],
  )
})

test('pengiriman ulang yang sama kalah versi', () => {
  const tersimpan = { terjadi_pada: '2026-11-20T10:00:00Z' }
  const masuk = { terjadi_pada: '2026-11-20T09:00:00Z' } // lebih tua
  assert.deepStrictEqual(terima(tersimpan, masuk, TOLERANSI, SEKARANG), [TOLAK, KALAH_VERSI])
})

test('yang lebih baru menang atas yang tersimpan', () => {
  const tersimpan = { terjadi_pada: '2026-11-20T09:00:00Z' }
  const masuk = { terjadi_pada: '2026-11-20T10:00:00Z' }
  assert.deepStrictEqual(terima(tersimpan, masuk, TOLERANSI, SEKARANG), [TERIMA, null])
})

test('muatan tanpa terjadi_pada ditolak', () => {
  assert.deepStrictEqual(terima(null, { id: 'x' }, TOLERANSI, SEKARANG), [TOLAK, MUATAN_TIDAK_SAH])
})

test('rentang wajar: batas diterima', () => {
  assert.deepStrictEqual(periksaRentang({ berat_kg: 1, tinggi_cm: 30, lingkar_kepala_cm: 25 }), [])
  assert.deepStrictEqual(periksaRentang({ berat_kg: 40, tinggi_cm: 130, lingkar_kepala_cm: 60 }), [])
})

test('rentang wajar: luar batas ditolak', () => {
  assert.deepStrictEqual(periksaRentang({ berat_kg: 41 }), ['berat_kg'])
  assert.deepStrictEqual(periksaRentang({ tinggi_cm: 12 }), ['tinggi_cm'])
})

test('kolom kosong bukan pelanggaran', () => {
  assert.deepStrictEqual(periksaRentang({ berat_kg: '', tinggi_cm: null }), [])
})

test('periksaMuatan menolak yang tidak lengkap', () => {
  assert.strictEqual(periksaMuatan('balita', { id: 'a' }), MUATAN_TIDAK_SAH)
  assert.strictEqual(periksaMuatan('balita', { id: 'a', terjadi_pada: 'x' }), null)
})

test('klasifikasi gizi sesuai batas KMS', () => {
  assert.strictEqual(klasifikasi(95), 'gizi_baik')
  assert.strictEqual(klasifikasi(80), 'gizi_baik')   // tepat batas
  assert.strictEqual(klasifikasi(79), 'gizi_kurang')
  assert.strictEqual(klasifikasi(70), 'gizi_kurang') // tepat batas
  assert.strictEqual(klasifikasi(69), 'gizi_buruk')
  assert.strictEqual(klasifikasi(60), 'gizi_buruk')  // tepat batas
  assert.strictEqual(klasifikasi(59), 'gizi_buruk_berat')
  assert.strictEqual(klasifikasi(10), 'gizi_buruk_berat')
})

test('hitung persen median', () => {
  const hasil = hitung(9, 10, 'WHO 2006') // 90%
  assert.strictEqual(hasil.persen_median, 90)
  assert.strictEqual(hasil.status_gizi, 'gizi_baik')
  assert.strictEqual(hasil.sumber_status, 'WHO 2006')
})

test('hitung menolak median nol', () => {
  assert.strictEqual(hitung(9, 0, 'x'), null)
})
