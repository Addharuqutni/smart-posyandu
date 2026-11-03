// Identitas pemakai yang sedang masuk dan pengenal perangkat.
//
// Token sesi TIDAK ada di sini: token hidup di cookie HttpOnly yang tidak bisa
// dibaca JavaScript, dan umurnya melewati tutup tab. Yang disimpan lokal hanya
// data tampilan pemakai (nama, peran, posyandu) supaya aplikasi bisa dibuka
// luring dan tahu harus menampilkan layar peran yang mana. Cookie tetap satu-
// satunya bukti masuk yang diakui server, dan setiap kali ada jaringan, sesi
// diverifikasi ulang lewat `GET /saya`.
//
// ponytail: bila kelak data pemakai ini dianggap sensitif di tablet bersama,
// simpan hanya `id` + `peran` dan ambil sisanya dari server saat daring.

import { idBaru } from '../logika/waktu.js'
const KUNCI_PENGGUNA = 'posyandu_pengguna'
const KUNCI_PERANGKAT = 'posyandu_id_perangkat'
const KUNCI_LAMA = 'posyandu_sesi'

export function simpanPengguna(pengguna) {
  localStorage.setItem(KUNCI_PENGGUNA, JSON.stringify(pengguna))
}

export function bacaPengguna() {
  try {
    // Sisa versi lama (token di penyimpanan web) dibuang, tidak dimigrasi.
    sessionStorage.removeItem(KUNCI_LAMA)
    localStorage.removeItem(KUNCI_LAMA)
    return JSON.parse(localStorage.getItem(KUNCI_PENGGUNA)) ?? null
  } catch {
    return null
  }
}

export function hapusSesi() {
  localStorage.removeItem(KUNCI_PENGGUNA)
  sessionStorage.removeItem(KUNCI_LAMA)
  localStorage.removeItem(KUNCI_LAMA)
}

/** Pengenal perangkat stabil untuk kolom id_perangkat (bukan kredensial). */
function slugPerangkat(ua) {
  // Coba tarik model perangkat dari user agent (banyak tablet mencantumkannya),
  // lalu jatuh ke kepalan berdasarkan platform.
  let model = ''
  if (ua) {
    const android = ua.match(/Android[^;]*;\s*([^)]+)\)/i)
    if (android) model = android[1]
    else if (/iPhone/i.test(ua)) model = 'iphone'
    else if (/iPad/i.test(ua)) model = 'ipad'
    else if (/Macintosh/i.test(ua)) model = 'mac'
    else if (/Windows/i.test(ua)) model = 'windows'
    else if (/Linux/i.test(ua)) model = 'linux'
  }
  const slug = model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'perangkat'
}

export function idPerangkat() {
  let id = localStorage.getItem(KUNCI_PERANGKAT)
  if (!id) {
    const basis = slugPerangkat(navigator.userAgent || '')
    // Ujung acak kecil menjaga keunikan bila dua perangkat punya UA mirip.
    id = `${basis}-${idBaru().slice(0, 6)}`
    localStorage.setItem(KUNCI_PERANGKAT, id)
  }
  return id
}

/** Deteksi riil perangkat yang dipakai (tanpa input manual), sekali saja. */
export async function deteksiPerangkatRil() {
  const lama = localStorage.getItem(KUNCI_PERANGKAT)
  if (lama) return lama
  let model = ''
  try {
    const data = await (navigator.userAgentData?.getHighEntropyValues?.([
      'model',
      'platform',
      'architecture',
    ]) ?? Promise.resolve(null))
    if (data?.model) model = data.model
    else if (data?.platform) model = data.platform
  } catch {
    // abaikan, fallback ke user agent biasa
  }
  if (!model) return idPerangkat()
  const slug = String(model)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const id = `${slug || 'perangkat'}-${idBaru().slice(0, 6)}`
  localStorage.setItem(KUNCI_PERANGKAT, id)
  return id
}
