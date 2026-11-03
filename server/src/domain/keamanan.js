// Kata sandi dan token sesi.
//
// Token sengaja bukan JWT: sesi harus bisa dicabut admin. Token acak yang
// di-hash di basis data lebih sederhana dan memenuhi itu (ARSITEKTUR 5).
//
// Sandi memakai Argon2id — sengaja lambat dan rakus memori supaya tidak bisa
// digasak GPU. Bukan MD5/SHA yang cepat.

const crypto = require('crypto')
const argon2 = require('@node-rs/argon2')

// 64 MB: aman di VPS 2 GB, tetap jauh di atas kemampuan serangan kamus.
const OPSI = {
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
}

async function hashSandi(sandi) {
  return argon2.hash(sandi, OPSI)
}

async function sandiCocok(hashTersimpan, sandi) {
  try {
    return await argon2.verify(hashTersimpan, sandi)
  } catch {
    return false
  }
}

function buatToken() {
  return crypto.randomBytes(32).toString('base64url')
}

// Token acak 32 byte: tidak bisa ditebak, jadi hash cepat sudah cukup.
// Ini bukan pengganti Argon2 — beda ancaman, beda alat.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

module.exports = { hashSandi, sandiCocok, buatToken, hashToken, OPSI }
