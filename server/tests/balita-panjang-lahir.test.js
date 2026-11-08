// Regresi: PATCH balita menolak panjang lahir wajar (49.5 cm) karena batas
// 40 dipakai bareng untuk berat (kg) dan panjang (cm). Bayi lahir normalnya
// 45-55 cm, jadi baris yang baru didaftarkan mustahil disunting.
//
// Fungsi dijalankan dari sumber asli lewat vm agar test mengeksekusi kode
// produksi, bukan salinan logika (yang bisa lolos walau produksi masih salah).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SUMBER = fs.readFileSync(path.join(__dirname, '../src/routes/data.js'), 'utf8')
const MULAI = SUMBER.indexOf('function nilaiBalitaSah(')
const AKHIR = SUMBER.indexOf("router.patch('/balita/:id'")
assert.ok(MULAI > 0 && AKHIR > MULAI, 'nilaiBalitaSah() tidak ditemukan di data.js')
const KODE = SUMBER.slice(MULAI, AKHIR)

const konteks = {
  POLA_UUID: /^[0-9a-f-]{36}$/i,
  POLA_TANGGAL: /^\d{4}-\d{2}-\d{2}$/,
  POLA_NIK: /^\d{16}$/,
  teksNama: (v) => (typeof v === 'string' && v.trim() ? v.trim() : null),
  lahirDiterima: () => true,
  siapkan: (_tabel, nilai) => nilai,
}
vm.createContext(konteks)
vm.runInContext(KODE + '\nthis.nilaiBalitaSah = nilaiBalitaSah;', konteks)
const nilaiBalitaSah = konteks.nilaiBalitaSah

test('panjang lahir 49.5 cm diterima PATCH', () => {
  const hasil = nilaiBalitaSah({ panjang_lahir_cm: 49.5 })
  assert.ok(hasil.nilai, `ditolak: ${hasil.salah}`)
  assert.strictEqual(hasil.nilai.panjang_lahir_cm, 49.5)
})

test('berat lahir 3.2 kg diterima, 41 kg ditolak', () => {
  assert.strictEqual(nilaiBalitaSah({ berat_lahir_kg: 3.2 }).nilai.berat_lahir_kg, 3.2)
  assert.strictEqual(nilaiBalitaSah({ berat_lahir_kg: 41 }).salah, 'muatan_tidak_sah')
})

test('panjang lahir 130 cm ditolak (di luar rentang bayi)', () => {
  assert.strictEqual(nilaiBalitaSah({ panjang_lahir_cm: 130 }).salah, 'muatan_tidak_sah')
})

test('muatan PATCH lengkap balita hasil daftar kader tetap sah', () => {
  const hasil = nilaiBalitaSah({
    posyandu_id: 'd14d71fa-6420-4bea-9c10-e2f99eeafb7b',
    nama_lengkap: 'Balita Uji',
    jenis_kelamin: 'laki-laki',
    tanggal_lahir: '2024-05-10',
    nama_ibu_kandung: 'Ibu Uji',
    berat_lahir_kg: 3.2,
    panjang_lahir_cm: 49.5,
    aktif: true,
  })
  assert.ok(hasil.nilai, `ditolak: ${hasil.salah}`)
  assert.strictEqual(hasil.nilai.panjang_lahir_cm, 49.5)
})
