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

test('penambahan akun admin_desa tidak mewajibkan posyandu_id sedangkan kader wajib', () => {
  const sumberPost = semua.slice(semua.indexOf("router.post('/pengguna'"), semua.indexOf("router.patch('/pengguna/:id'"))
  assert.match(sumberPost, /if \(peran === 'admin_desa'\) \{\s*posyanduId = null/)
  assert.match(sumberPost, /else if \(peran === 'kader'\)/)
  assert.match(sumberPost, /detail: 'posyandu_wajib_diisi'/)
})

test('pengubahan akun kader menolak posyandu_id kosong', () => {
  const sumberPatch = semua.slice(semua.indexOf("router.patch('/pengguna/:id'"), semua.indexOf("router.patch('/akun-saya'"))
  assert.match(sumberPatch, /target\.peran === 'kader' && \(!posyandu_id \|\| posyandu_id === ''\)/)
  assert.match(sumberPatch, /detail: 'posyandu_wajib_diisi'/)
})
