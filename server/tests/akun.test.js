// Uji otorisasi perubahan data akun (F-11 revisi): pemakai biasa hanya akunnya
// sendiri, admin desa boleh semua. Murni: tanpa basis data, cukup periksa
// kontrak rute yang mengikat dan middleware yang dipasang.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const semua = fs.readFileSync(path.join(__dirname, '../src/routes/pengguna.js'), 'utf8')
const sumber = semua.slice(semua.indexOf("router.patch('/akun-saya'"))

test('perubahan akun mengharuskan login dan menolak id akun lain bagi non-admin', () => {
  assert.match(sumber, /router\.patch\('\/akun-saya', butuhLogin/)
  assert.match(sumber, /peran !== 'admin_desa' && String\(id\) !== String\(minta\.pengguna\.id\)/)
  assert.match(sumber, /tidak_diizinkan/)
})

test('hanya nama lengkap dan username yang bisa diubah lewat endpoint ini', () => {
  assert.match(sumber, /POLA_NAMA_PENGGUNA/)
  assert.ok(!/nilai\.peran/.test(sumber))
  assert.ok(!/nilai\.aktif/.test(sumber))
  assert.ok(!/nilai\.hash_kata_sandi/.test(sumber))
})

test('perubahan akun tercatat di log_audit', () => {
  assert.match(sumber, /INSERT INTO log_audit/)
  assert.match(sumber, /nilai_lama, nilai_baru/)
})
