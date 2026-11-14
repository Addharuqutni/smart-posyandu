// Uji penjaga Cek Perkembangan Anak. Murni tanpa basis data: kontrak yang
// diuji adalah bentuk rute, bukan hasil kueri. Satu kecocokan nama + NIK
// tidak boleh membuka balita lain, dan NIK tak boleh keluar ke wali.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { cocokNik, pilihKandidat, ringkasanDari } = require('../src/routes/wali.js')

const AKAR = path.join(__dirname, '..', '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const wali = baca('server/src/routes/wali.js')
const data = baca('server/src/routes/data.js')
const simpan = baca('klien/src/penyimpanan/balita.js')
const rute = baca('klien/src/logika/rute.js')
const ui = baca('klien/src/antarmuka/CekAnak.jsx')

test('NIK wajib 16 digit di tiga jalur tulis balita', () => {
  assert.match(data, /POLA_NIK\.test\(String\(nilai\.nik \?\? ''\)\)/)
  assert.match(data, /nik_wajib_16_digit/)
  assert.match(baca('server/src/routes/sinkron.js'), /nik_wajib_16_digit/)
  assert.match(simpan, /\^\\d\{16\}\$\/\.test\(String\(nik \?\? ''\)/)
  const sinkron = baca('server/src/routes/sinkron.js')
  assert.match(sinkron, /salinan tablet lama/)
  assert.match(sinkron, /delete muatan\.nik/)
})

test('form kader dan admin menandai NIK wajib', () => {
  for (const berkas of [
    'klien/src/antarmuka/BalitaBaru.jsx',
    'klien/src/antarmuka/KelolaBalita.jsx',
  ]) {
    const teks = baca(berkas)
    assert.match(teks, /pattern="\\d\{16\}"/)
    assert.match(teks, /required/)
    assert.ok(!/NIK balita<\/span>\s*<span[^>]*>\(opsional\)/s.test(teks), `${berkas} masih menulis NIK opsional`)
  }
})

test('pencarian wali menerima nama atau NIK, nama ganda ditolak', () => {
  assert.match(wali, /lower\(b\.nama_lengkap\) = lower\(\$1\)/)
  assert.match(wali, /POLA_NIK\.test\(teks\)/)
  assert.match(wali, /pilihKandidat\(kandidat, nik\)/)
  const budi = { id: 'b-1', nik: '3301010101010009' }
  const budiKembar = { id: 'b-2', nik: '3301010101010010' }
  assert.equal(pilihKandidat([budi], null)?.id, 'b-1')
  assert.equal(pilihKandidat([budi, budiKembar], null), null)
  assert.equal(pilihKandidat([budi, budiKembar], '3301010101010010')?.id, 'b-2')
  assert.equal(pilihKandidat([budi, { ...budiKembar, nik: budi.nik }], budi.nik), null)
  assert.ok(cocokNik('3301010101010009', '3301010101010009'))
  assert.ok(!cocokNik(null, '3301010101010009'))
  assert.ok(!cocokNik('enc:v1:rahasia', '3301010101010009'))
})

test('riwayat wali terikat balita di sesi dan hanya kunjungan tervalidasi', () => {
  assert.match(wali, /WHERE aw\.token_hash = \$1 AND aw\.dicabut_pada IS NULL/)
  assert.match(wali, /AND k\.divalidasi_oleh IS NOT NULL/)
  assert.match(wali, /k\.balita_id = \$1/)
  assert.ok(!/minta\.params/.test(wali), 'id balita tidak boleh dibaca dari URL')
  assert.match(wali, /JOIN orang_tua o ON o\.id = bo\.orang_tua_id/, 'nama wali ikut dikirim')
  assert.ok(!/o\.nik|o\.nomor_kontak|o\.alamat/.test(wali), 'kontak wali tetap rahasia')
  for (const rahasia of ['nik,', 'alamat', 'nomor_kontak', 'kader_id', 'catatan']) {
    assert.ok(!wali.includes(`SELECT ${rahasia}`), `${rahasia} bocor`)
  }
  assert.match(baca('server/src/domain/sesi-cookie.js'), /HttpOnly/)
  assert.match(wali, /token_hash/)
})

test('statistik ringkas dihitung dari urutan kunjungan', () => {
  const hasil = ringkasanDari([
    { berat_kg: 8.5, tinggi_cm: 70, status_gizi: 'gizi_baik' },
    { berat_kg: 9.2, tinggi_cm: 72, status_gizi: null },
  ])
  assert.equal(hasil.jumlah_kunjungan, 2)
  assert.equal(hasil.berat_terakhir_kg, 9.2)
  assert.equal(hasil.tinggi_terakhir_cm, 72)
  assert.equal(hasil.perubahan_berat_kg, 0.7)
  assert.equal(hasil.status_gizi_terakhir, 'gizi_baik')
  assert.equal(ringkasanDari([]).jumlah_kunjungan, 0)
})

test('halaman wali bisa dibuka tamu, punya CTA, dan menampilkan riwayat', () => {
  assert.match(rute, /'publik', 'cek-anak'/)
  assert.match(rute, /jalur === '\/cek-anak'/)
  assert.match(baca('klien/src/antarmuka/KanalPublik.jsx'), /Cek Perkembangan Anak/)
  assert.match(ui, /Riwayat kunjungan/)
  assert.match(ui, /Statistik perkembangan balita/)
  assert.match(ui, /status_gizi_terakhir/)
  assert.match(ui, /waliTeks\(data\.balita\)/, 'nama wali ikut ditampilkan')
  assert.match(ui, /nama_ibu_kandung/, 'nama ibu kandung jadi cadangan')
})
