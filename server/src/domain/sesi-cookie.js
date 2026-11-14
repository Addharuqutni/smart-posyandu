// Cookie sesi: satu-satunya tempat token disimpan di sisi klien.
//
// Sebelumnya token dikirim lewat header Authorization dan disimpan di
// sessionStorage, sehingga skrip apa pun yang jalan di halaman bisa
// membacanya, dan menutup tab berarti kader harus masuk ulang (butuh sinyal).
// Cookie `HttpOnly` menutup keduanya: JavaScript tidak bisa membacanya, dan
// umurnya melewati tutup tab.
//
// `SameSite=Strict` menahan permintaan lintas situs, dan permintaan yang
// mengubah data masih wajib membawa header `X-Requested-With` (lihat app.js)
// sebagai pertahanan kedua terhadap CSRF.

const NAMA = 'posyandu_sesi'

/** Sesi admin boleh pendek; tablet kader boleh panjang karena dipakai luring. */
function umurMenit(peran) {
  const env = require('../env').muat()
  return peran === 'admin_desa' ? env.menitSesiAdmin : env.menitSesiTablet
}

function baca(minta, namaCookie = NAMA) {
  const mentah = minta.headers?.cookie
  if (!mentah) return null
  for (const potongan of String(mentah).split(';')) {
    const pisah = potongan.indexOf('=')
    if (pisah < 0) continue
    const nama = potongan.slice(0, pisah).trim()
    if (nama !== namaCookie) continue
    try {
      return decodeURIComponent(potongan.slice(pisah + 1).trim()) || null
    } catch {
      return null
    }
  }
  return null
}

/**
 * Apakah cookie wajib `Secure` (hanya dikirim lewat HTTPS)?
 *
 * Selain NODE_ENV, ada KUKI_SECURE terpisah karena pemasangan di jaringan
 * desa sering diakses lewat `http://<ip-vps>` tanpa domain/HTTPS.
 *
 * Latar: `NODE_ENV=production` memaksa `Secure`. Browser MENGABAIKAN cookie
 * `Secure` yang datang lewat http, jadi login tampak berhasil lalu pengguna
 * langsung terlempar kembali ke halaman masuk -- tanpa pesan yang menjelaskan.
 * Mematikan NODE_ENV bukan jalan keluar, karena itu juga mematikan perilaku
 * produksi lain.
 *
 * Bawaan: ikut NODE_ENV (aman). Setel COOKIE_SECURE=false HANYA bila benar-benar
 * berjalan di http pada jaringan tertutup. Port tetap harus tidak terbuka ke
 * internet, dan kata sandi melintas tanpa enkripsi.
 */
function wajibSecure() {
  const nilai = (process.env.COOKIE_SECURE || '').trim().toLowerCase()
  if (nilai === 'false' || nilai === '0' || nilai === 'no') return false
  if (nilai === 'true' || nilai === '1' || nilai === 'yes') return true
  return process.env.NODE_ENV === 'production'
}

function set(balas, token, menit, namaCookie = NAMA) {
  const bagian = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${menit * 60}`]
  if (wajibSecure()) bagian.push('Secure')
  balas.append('Set-Cookie', `${namaCookie}=${encodeURIComponent(token)}; ${bagian.join('; ')}`)
}

function hapus(balas, namaCookie = NAMA) {
  balas.append('Set-Cookie', `${namaCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`)
}

module.exports = { NAMA, baca, set, hapus, umurMenit, wajibSecure }
