// Uji kontrak log aktivitas: hanya admin desa, hanya-baca, dan tiap peristiwa
// penting meninggalkan jejak. Murni: membaca sumber rute, tanpa basis data.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const akar = path.join(__dirname, '../src')
const baca = (berkas) => fs.readFileSync(path.join(akar, berkas), 'utf8')

const aktivitas = baca('routes/aktivitas.js')
const masuk = baca('routes/masuk.js')
const pengguna = baca('routes/pengguna.js')
const domain = baca('domain/aktivitas.js')
const app = baca('app.js')

test('endpoint aktivitas hanya untuk admin desa', () => {
  assert.match(aktivitas, /router\.get\('\/aktivitas', Admin/)
  assert.match(aktivitas, /butuhPeran\('admin_desa'\)/)
  assert.match(app, /routes\/aktivitas/)
})

test('log aktivitas hanya-baca: tidak ada endpoint yang menghapus', () => {
  assert.ok(!/router\.(delete|post|patch|put)\(/.test(aktivitas))
  assert.ok(!/DELETE FROM log_audit/.test(aktivitas))
})

test('aksi yang dicatat dibatasi kosakata yang dikenal', () => {
  assert.match(domain, /AKSI = \['masuk', 'gagal_masuk', 'keluar'\]/)
  assert.match(aktivitas, /AKSI_SAH = \['buat', 'ubah', 'hapus', 'masuk', 'keluar', 'gagal_masuk'\]/)
})

test('masuk, gagal masuk, dan keluar meninggalkan jejak', () => {
  assert.match(masuk, /aksi: 'masuk'/)
  assert.match(masuk, /aksi: 'gagal_masuk'/)
  assert.match(masuk, /aksi: 'keluar'/)
  // Kata sandi tidak boleh ikut ke log, dalam bentuk apa pun.
  assert.ok(!/kata_sandi/i.test(domain))
  assert.match(masuk, /rincian: \{ nama_pengguna, alasan:/)
})

test('pembuatan akun dicatat sebagai aktivitas admin', () => {
  const blok = pengguna.slice(pengguna.indexOf("router.post('/pengguna'"), pengguna.indexOf("router.patch('/pengguna/:id'"))
  assert.match(blok, /INSERT INTO log_audit/)
  assert.match(blok, /'pengguna', \$2, 'buat'/)
})

test('saringan aktivitas divalidasi sebelum masuk kueri', () => {
  assert.match(aktivitas, /AKSI_SAH\.includes\(minta\.query\.aksi\)/)
  assert.match(aktivitas, /NAMA_TABEL|nama_tabel = \$/)
  assert.match(aktivitas, /POLA_UUID\.test\(minta\.query\.pengguna_id/)
  assert.match(aktivitas, /POLA_TANGGAL\.test\(minta\.query\.dari/)
})
