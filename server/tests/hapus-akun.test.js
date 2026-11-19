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

test('hapus akun memakai hapus lunak dan mempertahankan atribusi riwayat', () => {
  assert.match(hapus, /DELETE FROM sesi_login/)
  // Akun dihapus lunak; jejak validasi & audit tidak boleh dinolkan.
  assert.match(hapus, /UPDATE pengguna/)
  assert.match(hapus, /SET aktif = FALSE, dihapus_pada = now\(\)/)
  for (const pasangan of ["'kunjungan', 'divalidasi_oleh'", "'log_audit', 'pengguna_id'"]) {
    assert.ok(!hapus.includes(pasangan), `referensi ${pasangan} tidak boleh dilepas`)
  }
  assert.ok(!/DELETE FROM pengguna/.test(hapus), 'akun tidak boleh dihapus fisik')
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
