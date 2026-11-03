// Uji Argon2 dan pembuatan token. Tidak butuh basis data.
const test = require('node:test')
const assert = require('node:assert')
const { hashSandi, sandiCocok, buatToken, hashToken } = require('../src/domain/keamanan')

test('hash sandi tidak menyimpan sandi asli', async () => {
  const hash = await hashSandi('rahasia123')
  assert.ok(hash.length > 20)
  assert.ok(!hash.includes('rahasia123'))
  assert.ok(hash.startsWith('$argon2'))
})

test('sandi benar diterima, salah ditolak', async () => {
  const hash = await hashSandi('rahasia123')
  assert.strictEqual(await sandiCocok(hash, 'rahasia123'), true)
  assert.strictEqual(await sandiCocok(hash, 'salah'), false)
})

test('hash sandi berbeda walau sandi sama (garam acak)', async () => {
  const a = await hashSandi('sama')
  const b = await hashSandi('sama')
  assert.notStrictEqual(a, b)
  assert.strictEqual(await sandiCocok(a, 'sama'), true)
  assert.strictEqual(await sandiCocok(b, 'sama'), true)
})

test('token acak dan hashnya stabil', () => {
  const t1 = buatToken()
  const t2 = buatToken()
  assert.notStrictEqual(t1, t2)
  assert.strictEqual(t1.length >= 40, true)
  assert.strictEqual(hashToken(t1), hashToken(t1))
  assert.notStrictEqual(hashToken(t1), hashToken(t2))
})
