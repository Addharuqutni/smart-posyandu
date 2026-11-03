// Enkripsi nilai rahasia yang tetap harus bisa dibaca aplikasi.
//
// Dipakai untuk `nik` di balita/orang_tua dan berkas cadangan (AGENTS Bagian 6).
// Pengganti Fernet dari Python: AES-256-GCM. Kunci diturunkan dari
// KUNCI_ENKRIPSI, bila kosong dari KUNCI_RAHASIA.
//
// Format tersimpan: "enc:v1:<base64(iv):base64(tag):base64(cipher)>"

const crypto = require('crypto')

const AWALAN = 'enc:v1:'

/**
 * Kunci enkripsi menurut keperluan.
 * `nik` memakai KUNCI_ENKRIPSI; berkas cadangan memakai KUNCI_CADANGAN.
 * Memisahkan keduanya penting: bocornya kunci NIK tidak otomatis membuka
 * seluruh arsip cadangan (AGENTS Bagian 6).
 */
function kunci(keperluan = 'nik') {
  const env = require('../env').muat()
  const rahasia =
    keperluan === 'cadangan'
      ? env.kunciCadangan || env.kunciRahasia
      : env.kunciEnkripsi || env.kunciRahasia
  return crypto.createHash('sha256').update(String(rahasia)).digest()
}

function enkripsi(nilai, keperluan = 'nik') {
  if (!nilai) return nilai
  if (typeof nilai === 'string' && nilai.startsWith(AWALAN)) return nilai
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', kunci(keperluan), iv)
  const gabung = Buffer.concat([cipher.update(String(nilai), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return AWALAN + [iv.toString('base64'), tag.toString('base64'), gabung.toString('base64')].join(':')
}

function dekripsi(nilai, keperluan = 'nik') {
  if (!nilai || typeof nilai !== 'string' || !nilai.startsWith(AWALAN)) return nilai
  try {
    const [ivB, tagB, isiB] = nilai.slice(AWALAN.length).split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', kunci(keperluan), Buffer.from(ivB, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(isiB, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // Kunci berganti: jangan menebak isinya, jangan pula menjatuhkan aplikasi.
    return null
  }
}

module.exports = { enkripsi, dekripsi, AWALAN }
