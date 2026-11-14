// Rute berbasis path (History API): memetakan pathname URL ke layar.
//
// Struktur URL:
// - /              -> Kanal informasi publik desa (tanpa login)
// - /app/login     -> Layar masuk petugas (atau dialihkan bila sudah login)
// - /app/<nama>    -> Layar kerja petugas (beranda, catat, validasi, dsb.)
//
// Kenapa /app/ untuk layar kerja: di Nginx produksi, path root seperti
// /masuk, /validasi, /balita, /posyandu, dan /pengguna diteruskan langsung
// ke API server (Node.js). Awalan /app/ memisahkan antarmuka dari API
// tanpa bentrok namespace dan tanpa perlu konfigurasi Nginx baru.
// ponytail: bila ingin path root untuk semua layar (/beranda, /validasi),
// pindahkan rute API ke awalan /api di server/src/app.js dan Nginx.

export const LAYAR_SAH = [
  'masuk',
  'publik', 'cek-anak',
  'beranda',
  'baru',
  'catat',
  'riwayat',
  'validasi',
  'balita',
  'posyandu',
  'konten',
  'laporan',
  'pengguna',
  'log',
]

// Riwayat butuh objek balita yang tidak ikut ditulis ke URL. Menempel hash ini
// tidak boleh merender layar kosong, jadi diarahkan ke layar bawaan.
// ponytail: bila riwayat perlu dibagikan sebagai tautan, susulkan id balita di
// hash (#/riwayat/<id>) lalu ambil dari IndexedDB.
const BUTUH_MUATAN = ['riwayat']

/** Path URL untuk sebuah layar, mis. '/app/catat' atau '/app/login'. */
export function jalurDari(layar) {
  if (layar.nama === 'publik') return '/'
  if (layar.nama === 'cek-anak') return '/cek-anak'
  if (layar.nama === 'masuk') return '/app/login'
  return `/app/${layar.nama}`
}

/** Kompatibilitas mundur dengan nama lama. */
export const hashDari = jalurDari

/**
 * Layar dari URL (pathname atau hash warisan).
 * `bawaan` dipakai bila path kosong, tidak dikenal, milik peran lain,
 * atau butuh muatan (riwayat) — URL dirapikan kembali ke layar yang sah.
 */
export function layarDari(lokasi, peran, bawaan, muatan) {
  const teks = String(lokasi || '').trim()
  let nama = ''

  if (teks.includes('#')) {
    // Dukung tautan hash warisan: #/konten, #/publik, atau #publik
    const bagianHash = teks.slice(teks.indexOf('#') + 1)
    nama = bagianHash.replace(/^\/?/, '').trim()
  } else {
    // Path bersih: / (publik), /app/login (masuk), /publik (warisan), /app/<nama>
    const jalur = teks.split('?')[0].replace(/\/+$/, '') || '/'
    if (jalur === '/' || jalur === '/publik') nama = 'publik'
    else if (jalur === '/cek-anak') nama = 'cek-anak'
    else if (jalur === '/app/login' || jalur === '/masuk' || jalur === '/login') nama = 'masuk'
    else if (jalur.startsWith('/app/')) nama = jalur.slice(5)
    else if (jalur.startsWith('/')) nama = jalur.slice(1)
  }

  if (!nama || !LAYAR_SAH.includes(nama)) return bawaan
  if (!bolehDibuka(nama, peran)) return bawaan
  // 'riwayat' hanya sah bila objek balita ikut tersimpan di history.state;
  // tautan polos tanpa muatan tetap diarahkan ke layar bawaan.
  if (BUTUH_MUATAN.includes(nama)) return muatan?.balita ? { nama, balita: muatan.balita } : bawaan
  return { nama }
}

/** Apakah peran ini boleh membuka layar tersebut (cermin navigasi). */
export function bolehDibuka(nama, peran) {
  if (!peran) return ['masuk', 'publik', 'cek-anak'].includes(nama)
  if (peran === 'kader') return ['beranda', 'baru', 'catat', 'riwayat', 'konten'].includes(nama)
  if (peran === 'nakes') return ['validasi', 'konten'].includes(nama)
  if (peran === 'admin_desa') return ['balita', 'laporan', 'posyandu', 'pengguna', 'konten', 'log'].includes(nama)
  return false
}
