// Koneksi PostgreSQL. Skema dibuat oleh migrasi, bukan oleh kode ini.

const { Pool } = require('pg')

let pool = null

function dapatkan() {
  if (!pool) {
    const env = require('../env').muat()
    pool = new Pool({
      connectionString: env.databaseUrl,
      // Tanpa batas tunggu, permintaan menggantung selamanya bila PostgreSQL
      // sedang mati/restart. Lebih baik gagal cepat dengan pesan jelas.
      connectionTimeoutMillis: 5000,
      // Batas waktu PER PERNYATAAN, bukan per transaksi.
      //
      // Tanpa ini, satu kueri lambat (atau tabel terkunci saat pemulihan)
      // menahan salah satu dari 10 koneksi sampai selesai; sepuluh kueri
      // lambat berarti seluruh aplikasi berhenti melayani, termasuk login
      // kader. Diukur sebelum perbaikan: `SELECT pg_sleep(8)` berjalan penuh
      // 8,1 detik tanpa dihentikan.
      //
      // 10 detik jauh di atas kueri terlama yang terukur (rekap 48.000 baris
      // = 52 ms), sehingga tidak memotong pemakaian normal. Proses panjang
      // (pemulihan cadangan, demo) memakai `transaksi(fn, { batasWaktuMs })`.
      statement_timeout: Number(env.batasWaktuKueriMs || 10000),
    })

    // Kolom DATE harus tetap 'YYYY-MM-DD'. Tanpa ini driver mengubahnya jadi
    // objek Date lokal, lalu tanggalnya bergeser sehari (mis. 12 -> 11).
    const { types } = require('pg')
    types.setTypeParser(1082, (nilai) => nilai) // 1082 = DATE
    // NUMERIC dikembalikan sebagai angka, bukan string.
    types.setTypeParser(1700, (nilai) => (nilai === null ? null : Number(nilai)))
  }
  return pool
}

async function kueri(teks, nilai = []) {
  return dapatkan().query(teks, nilai)
}

async function satu(teks, nilai = []) {
  const { rows } = await kueri(teks, nilai)
  return rows[0] ?? null
}

async function banyak(teks, nilai = []) {
  const { rows } = await kueri(teks, nilai)
  return rows
}

/**
 * Jalankan fn di dalam satu transaksi.
 *
 * `batasWaktuMs` menimpa batas bawaan untuk SESI koneksi ini saja. Dipakai
 * pemulihan cadangan: pernyataannya tetap kecil (500 baris), tetapi menulis
 * ratusan ribu baris dalam satu transaksi bisa memakan waktu lebih dari batas
 * bawaan. Tanpa jalan keluar ini, pemulihan akan dipotong di tengah jalan.
 * Nilai 0 = tanpa batas.
 */
async function transaksi(fn, { batasWaktuMs } = {}) {
  const klien = await dapatkan().connect()
  try {
    if (batasWaktuMs !== undefined) {
      await klien.query(`SET statement_timeout = ${Number(batasWaktuMs) || 0}`)
    }
    await klien.query('BEGIN')
    const hasil = await fn(klien)
    await klien.query('COMMIT')
    return hasil
  } catch (salah) {
    await klien.query('ROLLBACK')
    throw salah
  } finally {
    // Koneksi dikembalikan ke pool; buang agar SET di atas tidak menular ke
    // pemakai berikutnya lewat koneksi yang sama.
    if (batasWaktuMs !== undefined) {
      await klien.query('RESET statement_timeout').catch(() => {})
    }
    klien.release()
  }
}

/**
 * Jalankan fn dengan satu koneksi TANPA batas waktu pernyataan.
 *
 * Dipakai pencadangan. Alasannya: cadangan yang lambat masih berguna, cadangan
 * yang gagal di tengah tidak. Bila tabel sedang dipegang proses lain (misalnya
 * pemulihan berjalan bersamaan jadwal 02.00), tanpa ini pembacaan dipotong
 * setelah 10 detik dan berkas tidak pernah selesai ditulis.
 *
 * Batas waktunya dikembalikan sebelum koneksi masuk pool lagi, supaya tidak
 * menular ke permintaan API berikutnya yang memakai koneksi sama.
 */
async function tanpaBatasWaktu(fn) {
  const klien = await dapatkan().connect()
  try {
    await klien.query('SET statement_timeout = 0')
    return await fn(klien)
  } finally {
    await klien.query('RESET statement_timeout').catch(() => {})
    klien.release()
  }
}

module.exports = { kueri, satu, banyak, transaksi, dapatkan, tanpaBatasWaktu }
