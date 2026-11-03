// Konfirmasi kata sandi sebelum memulihkan cadangan.
//
// Pemulihan adalah satu-satunya aksi yang bisa menimpa kerja sebulan, jadi
// sekadar mengetik nama berkas terlalu ringan: admin yang lelah atau salah
// pilih berkas tetap lolos. Kata sandi akun sendiri diminta ulang, dengan
// pembatas percobaan supaya tidak bisa ditebak berulang dari sesi yang sudah
// terbuka (mis. tablet yang ditinggal tanpa dikunci).

const { satu } = require('../db/pool')
const { sandiCocok } = require('./keamanan')

const BATAS_GAGAL = 5
const MENIT_KUNCI = 15

// Penghitung di memori proses, pola sama seperti routes/masuk.js. Cukup untuk
// satu VPS satu proses; bila nanti multi-proses, pindahkan ke tabel.
const gagal = new Map()

function masihTerkunci(penggunaId) {
  const batas = Date.now() - MENIT_KUNCI * 60_000
  const daftar = (gagal.get(penggunaId) || []).filter((w) => w > batas)
  gagal.set(penggunaId, daftar)
  return daftar.length >= BATAS_GAGAL
}

function catatGagal(penggunaId) {
  const daftar = gagal.get(penggunaId) || []
  daftar.push(Date.now())
  gagal.set(penggunaId, daftar)
}

/**
 * Periksa kata sandi pemakai yang sedang masuk.
 * @returns {'ok'|'kosong'|'kunci'|'salah'}
 */
async function periksaKataSandi(penggunaId, kataSandi) {
  if (masihTerkunci(penggunaId)) return 'kunci'
  const bersih = typeof kataSandi === 'string' ? kataSandi : ''
  if (!bersih) return 'kosong'
  const baris = await satu(`SELECT hash_kata_sandi FROM pengguna WHERE id = $1`, [penggunaId])
  const cocok = baris ? await sandiCocok(baris.hash_kata_sandi, bersih) : false
  if (!cocok) {
    catatGagal(penggunaId)
    return 'salah'
  }
  gagal.delete(penggunaId)
  return 'ok'
}

/** Balasan standar untuk tiap hasil, atau null bila boleh lanjut. */
function tolak(balas, hasil) {
  if (hasil === 'kunci') {
    balas.status(429).json({
      detail: `Terlalu banyak percobaan. Coba lagi ${MENIT_KUNCI} menit lagi.`,
      kode: 'terlalu_banyak_percobaan',
    })
    return true
  }
  if (hasil !== 'ok') {
    balas.status(401).json({
      detail: 'Kata sandi tidak cocok. Pemulihan dibatalkan sebelum ada yang diubah.',
      kode: 'kata_sandi_salah',
    })
    return true
  }
  return false
}

module.exports = { periksaKataSandi, tolak }
