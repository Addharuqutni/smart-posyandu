// Regresi: tambah balita admin dulu hanya menulis `nama_ibu_kandung`, sehingga
// Riwayat kader (yang membaca relasi wali) menampilkan "Wali belum tercatat".
// Uji ini menjalankan fungsi produksi lewat vm dengan transaksi palsu.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SUMBER = fs.readFileSync(path.join(__dirname, '../src/routes/data.js'), 'utf8')
const MULAI = SUMBER.indexOf('async function tulisWali(')
const AKHIR = SUMBER.indexOf("router.post('/balita'")
assert.ok(MULAI > 0 && AKHIR > MULAI, 'sisipBersamaWali() tidak ditemukan di data.js')

const tulis = []
let urutId = 0

const AWAL_NIK = SUMBER.indexOf('function rapikanBaris(')
const AKHIR_NIK = SUMBER.indexOf('const Nakes =')
assert.ok(AWAL_NIK > 0 && AKHIR_NIK > AWAL_NIK, 'tandaiNik() tidak ditemukan di data.js')
const konteksNik = {
  Date,
  dekripsi: (v) => (typeof v === 'string' ? v.replace(/^enc:/, '') : v),
}
vm.createContext(konteksNik)
vm.runInContext(SUMBER.slice(AWAL_NIK, AKHIR_NIK) + '\nthis.tandaiNik = tandaiNik;', konteksNik)
const konteks = {
  require: (nama) => (nama === 'crypto' ? { randomUUID: () => `id-${++urutId}` } : {}),
  Date,
  enkripsi: (n) => `enc:${n}`,
  transaksi: async (fn) => fn({}),
  sisip: async (tabel, nilai) => {
    tulis.push({ tabel, aksi: 'buat', nilai })
    return nilai
  },
  ubah: async (tabel, _id, nilai) => {
    tulis.push({ tabel, aksi: 'ubah', nilai })
    return nilai
  },
}
vm.createContext(konteks)
vm.runInContext(SUMBER.slice(MULAI, AKHIR) + '\nthis.sisipBersamaWali = sisipBersamaWali; this.tulisWali = tulisWali;', konteks)

test('NIK asli hanya ikut untuk admin desa', () => {
  const baris = {
    nik: 'enc:3301010101010009',
    nama_lengkap: 'Budi',
    tanggal_lahir: new Date('2024-01-01T00:00:00Z'),
  }
  const admin = konteksNik.tandaiNik(baris, true)
  const kader = konteksNik.tandaiNik(baris)
  assert.equal(admin.nik, '3301010101010009')
  assert.equal(admin.nik_ada, true)
  assert.equal(admin.tanggal_lahir, '2024-01-01')
  assert.equal(kader.nik, null)
  assert.equal(kader.nik_ada, true)
})

test('POST admin menulis balita, orang_tua, dan relasinya dalam satu transaksi', async () => {
  urutId = 0
  tulis.length = 0
  const wali = { nama_lengkap: 'Siti', hubungan: 'ibu_kandung', nomor_kontak: '0812', alamat: null }
  const hasil = await konteks.sisipBersamaWali(
    { nama_lengkap: 'Budi', posyandu_id: 'p1', nik: '3301010101010009', aktif: true },
    wali,
    {},
  )
  assert.deepStrictEqual(tulis.map((t) => t.tabel), ['balita', 'orang_tua', 'balita_orang_tua'])
  assert.equal(tulis[0].nilai.nama_ibu_kandung, 'Siti')
  assert.equal(tulis[0].nilai.nik, 'enc:3301010101010009')
  assert.equal(hasil.nik, null)
  assert.equal(tulis[1].nilai.nama_lengkap, 'Siti')
  assert.equal(tulis[2].nilai.balita_id, tulis[0].nilai.id)
  assert.equal(tulis[2].nilai.orang_tua_id, tulis[1].nilai.id)
  assert.equal(tulis[2].nilai.kontak_utama, true)
})

test('sunting admin memperbarui wali lama atau membuat relasi bila belum ada', async () => {
  const wali = { nama_lengkap: 'Budi', hubungan: 'ayah_kandung', nomor_kontak: null, alamat: 'Dusun' }
  let relasi = { relasi_id: 'r-1', orang_tua_id: 'o-1' }
  const klien = { query: async () => ({ rows: relasi ? [relasi] : [] }) }

  tulis.length = 0
  await konteks.tulisWali(klien, 'b-1', wali, {})
  assert.deepStrictEqual(tulis.map((t) => `${t.aksi}:${t.tabel}`),
    ['ubah:orang_tua', 'ubah:balita_orang_tua'])
  assert.equal(tulis[0].nilai.nama_lengkap, 'Budi')
  assert.equal(tulis[1].nilai.hubungan, 'ayah_kandung')

  relasi = null
  urutId = 0
  tulis.length = 0
  await konteks.tulisWali(klien, 'b-1', wali, {})
  assert.deepStrictEqual(tulis.map((t) => `${t.aksi}:${t.tabel}`),
    ['buat:orang_tua', 'buat:balita_orang_tua'])
  assert.equal(tulis[1].nilai.orang_tua_id, tulis[0].nilai.id)
  assert.equal(tulis[1].nilai.balita_id, 'b-1')
})
