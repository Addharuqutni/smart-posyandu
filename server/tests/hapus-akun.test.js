// Uji regresi kontrak hapus akun permanen: otorisasi, pelepasan referensi,
// pencabutan sesi, dan jejak audit. Murni tanpa basis data.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..', '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const pengguna = baca('server/src/routes/pengguna.js')
const hapus = pengguna.slice(
  pengguna.indexOf("router.delete('/pengguna/:id'"),
  pengguna.indexOf("router.patch('/akun-saya'"),
)

test('hapus akun hanya untuk admin, menolak diri sendiri, dan admin terakhir', () => {
  assert.match(hapus, /router\.delete\('\/pengguna\/:id', Admin/)
  assert.match(hapus, /tidak_bisa_hapus_diri/)
  assert.match(hapus, /admin_terakhir/)
})

test('hapus akun melepas semua referensi dan mencabut sesi sebelum DELETE', () => {
  assert.match(hapus, /DELETE FROM sesi_login/)
  for (const pasangan of [
    "['kader', 'pengguna_id']",
    "['konten_publik', 'pengaju_id']",
    "['konten_publik', 'diputuskan_oleh']",
    "['kunjungan', 'divalidasi_oleh']",
    "['log_audit', 'pengguna_id']",
    "['tindak_lanjut', 'petugas_id']",
  ]) {
    assert.ok(hapus.includes(pasangan), `pasangan ${pasangan} hilang`)
  }
  assert.match(hapus, /UPDATE \$\{tabel\} SET \$\{kolom\} = NULL WHERE \$\{kolom\} = \$1/)
  assert.ok(hapus.indexOf('DELETE FROM pengguna') > hapus.indexOf('DELETE FROM sesi_login'))
  assert.match(hapus, /INSERT INTO log_audit/)
})

test('UI kelola akun memanggil hapusPengguna lewat konfirmasi', () => {
  const akunUi = baca('klien/src/antarmuka/Pengguna.jsx')
  assert.match(akunUi, /hapusPengguna\(akun\.id\)/)
  assert.match(akunUi, /Hapus akun permanen\?/)
  assert.ok(!/Edit posyandu/.test(akunUi))
})

test('setel sandi menyatu dengan modal Sunting, bukan form halaman terpisah', () => {
  const akunUi = baca('klien/src/antarmuka/Pengguna.jsx')
  assert.match(akunUi, /id="modal-akun-sandi"/)
  assert.match(akunUi, /kata_sandi_baru: sandi/)
  assert.ok(!/Setel sandi/.test(akunUi))
  assert.ok(!/simpanSandi/.test(akunUi))
})
