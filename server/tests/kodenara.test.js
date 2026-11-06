// Uji parser KodeNara memakai HTML SUNGGUHAN yang disimpan sebagai fixture,
// bukan HTML karangan. Kalau kodenara.id mengubah strukturnya, uji ini akan
// merah — dan itu memang tujuannya: lebih baik tahu di sini daripada kanal
// desa diam-diam menampilkan daftar kosong.
//
// Perbarui fixture dengan:
//   curl -s https://kodenara.id/insight/public/category/tips \
//     -o server/tests/fixtures/kodenara-tips.html
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { parseDaftar, parseArtikel, idDari, PENANDA } = require('../src/jobs/kodenara')

const baca = (nama) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', nama), 'utf8')

test('daftar artikel terbaca dari halaman kategori', () => {
  const daftar = parseDaftar(baca('kodenara-tips.html'))
  assert.ok(daftar.length > 0, 'tidak ada artikel terbaca — struktur halaman berubah?')
  for (const a of daftar) {
    assert.match(a.tautan, /^https:\/\/kodenara\.id\/insight\/public\/tips\//)
    assert.ok(a.judul.length > 5, `judul terlalu pendek: ${a.judul}`)
    assert.doesNotMatch(a.judul, /</, 'judul masih memuat tag HTML')
  }
})

test('isi artikel terbaca dan cukup panjang untuk ditampilkan', () => {
  const isi = parseArtikel(baca('kodenara-artikel.html'))
  assert.ok(isi.judul.length > 10, `judul artikel tidak terbaca: "${isi.judul}"`)
  assert.ok(isi.isi.length > 200, `isi terlalu pendek: ${isi.isi.length} karakter`)
  assert.doesNotMatch(isi.isi, /<[a-z]/i, 'isi masih memuat tag HTML')
})

test('paragraf formulir berlangganan tidak ikut masuk', () => {
  const isi = parseArtikel(baca('kodenara-artikel.html'))
  assert.doesNotMatch(isi.isi, /Daftarkan email/i)
})

test('HTML yang strukturnya berubah menghasilkan daftar kosong, bukan tebakan', () => {
  assert.deepEqual(parseDaftar('<html><body><p>halaman lain</p></body></html>'), [])
  assert.deepEqual(parseDaftar(''), [])
  assert.deepEqual(parseArtikel('<html></html>'), { judul: '', isi: '' })
})

test('id tetap untuk tautan yang sama, dan berbeda antar tautan', () => {
  const a = idDari('https://kodenara.id/insight/public/tips/satu')
  const b = idDari('https://kodenara.id/insight/public/tips/satu')
  const c = idDari('https://kodenara.id/insight/public/tips/dua')
  assert.equal(a, b, 'id harus stabil supaya tarikan ulang memperbarui baris yang sama')
  assert.notEqual(a, c)
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/, 'bentuk UUID v4')
})

test('jumlah artikel di halaman kategori sesuai isi halaman', () => {
  const daftar = parseDaftar(baca('kodenara-tips.html'))
  // Halaman 1 saat fixture diambil memuat 2 artikel. Kalau angka ini berubah
  // karena halaman diperbarui, perbarui fixture dan nilainya.
  assert.equal(daftar.length, 2)
  assert.ok(daftar.every((a) => a.judul.length > 0))
})

test('penanda sumber dipakai untuk memisahkan konten tarikan dari buatan admin', () => {
  assert.equal(PENANDA, 'kodenara-tips')
})
