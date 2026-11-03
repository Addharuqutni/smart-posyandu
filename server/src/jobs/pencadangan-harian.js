// Satu putaran pencadangan harian: cadangkan, verifikasi, pangkas.
//
// Dipakai bersama oleh server (penjadwal 02.00 WIB) dan CLI `npm run
// cadangan`, supaya keduanya berperilaku sama dan hanya ada satu
// implementasi.

const fs = require('fs')
const path = require('path')
const { jalankan, daftar, pangkas } = require('./cadangan')
const verifikasi = require('./verifikasi')

function folderCadangan() {
  const env = require('../env').muat()
  return path.resolve(env.folderCadangan)
}

/** Waktu (ms) berkas cadangan terbaru, atau null bila belum ada. */
function cadanganTerakhirMs(folder) {
  const berkas = daftar(folder ?? folderCadangan())
  if (!berkas.length) return null
  const terbaru = berkas[0]
  try {
    return fs.statSync(path.join(folder ?? folderCadangan(), terbaru.nama)).mtimeMs
  } catch {
    return Date.parse(terbaru.dibuat_pada) || null
  }
}

/**
 * Jalankan satu putaran lengkap.
 * @returns {{nama:string, ukuran_byte:number, verifikasi:object, retensi:object}}
 */
async function sekali(folder) {
  const tujuan = folder ?? folderCadangan()
  const dibuat = await jalankan(tujuan)
  const hasilVerifikasi = await verifikasi.periksa(dibuat.nama, tujuan)
  const retensi = pangkas(tujuan)
  return {
    nama: dibuat.nama,
    ukuran_byte: dibuat.ukuran_byte,
    verifikasi: hasilVerifikasi,
    retensi,
  }
}

module.exports = { sekali, cadanganTerakhirMs }
