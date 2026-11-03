// Pencadangan terenkripsi (F-21).
// Berkas = JSON semua tabel, di-gzip, lalu dienkripsi AES-256-GCM.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { promisify } = require('util')
const { banyak, tanpaBatasWaktu } = require('../db/pool')
const { enkripsi, AWALAN } = require('../domain/rahasia')

const gzip = promisify(zlib.gzip)
const tulis = promisify(fs.writeFile)
const baca = promisify(fs.readFile)

// Urutan ini juga dipakai saat memulihkan: tabel induk lebih dulu supaya
// kunci asing tidak dilanggar. `sesi_login` dan `log_audit` sengaja tidak
// ikut: sesi tidak boleh dihidupkan lagi dari cadangan lama, dan log audit
// tidak boleh ditulis ulang.
const TABEL = ['posyandu', 'pengguna', 'kader', 'orang_tua', 'balita', 'balita_orang_tua',
  'kunjungan', 'pengukuran', 'tindak_lanjut', 'acuan_berat_umur']

/**
 * Baca seluruh tabel per potongan KEYSET, bukan satu pernyataan raksasa.
 *
 * Sebelumnya `SELECT * FROM <tabel>` mengambil semuanya sekaligus. Pada
 * 433.000 baris itu satu pernyataan yang berjalan lama; dengan batas waktu
 * per pernyataan (lihat db/pool.js) kueri sebesar itu akan dipotong di tengah
 * dan cadangan gagal justru saat paling dibutuhkan.
 *
 * Kunci `(diperbarui_pada, id)` sudah berindeks (migrasi 002), jadi tiap
 * potongan berhenti setelah ambil baris, bukan memindai ulang dari awal.
 */
const POTONGAN = 5000

async function bacaSemua(namaTabel, { kueri: jalankanKueri = banyak } = {}) {
  const keluar = []
  let kursor = null

  // Cap waktu kursor WAJIB diambil sebagai teks bermikrodetik.
  //
  // node-postgres mengubah timestamptz menjadi Date bermilidetik, sehingga
  // `.878681` terbaca `.878`. Kursor itu jadi LEBIH KECIL dari nilai
  // sebenarnya, baris yang sama terambil ulang, dan pembacaan tidak pernah
  // selesai (terukur: 200 putaran, 1.000.000 baris ganda, memori habis).
  // Siasat yang sama sudah dipakai domain/halaman-sinkron.js.
  const WAKTU =
    `to_char(diperbarui_pada AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS waktu_kursor`

  for (;;) {
    const halaman = kursor
      ? await jalankanKueri(
          `SELECT *, ${WAKTU} FROM ${namaTabel}
           WHERE (diperbarui_pada, id) > ($1::timestamptz, $2::uuid)
           ORDER BY diperbarui_pada, id LIMIT $3`,
          [kursor.waktu, kursor.id, POTONGAN],
        )
      : await jalankanKueri(
          `SELECT *, ${WAKTU} FROM ${namaTabel} ORDER BY diperbarui_pada, id LIMIT $1`,
          [POTONGAN],
        )
    if (halaman.length === 0) break
    const akhir = halaman[halaman.length - 1]
    // Ambil kursor SEBELUM kolom bantu dihapus. `akhir` menunjuk objek yang
    // sama dengan elemen terakhir, jadi menghapus dulu membuat kursor kosong
    // dan pembacaan berhenti tepat setelah satu potongan (terukur: 5.000 dari
    // 12.300 baris tersimpan tanpa galat).
    const kursorBerikut = { waktu: akhir.waktu_kursor, id: akhir.id }
    for (const baris of halaman) {
      delete baris.waktu_kursor
      keluar.push(baris)
    }
    if (halaman.length < POTONGAN) break
    kursor = kursorBerikut
  }
  return keluar
}

async function jalankan(folder, { awalan = 'posyandu' } = {}) {
  const env = require('../env').muat()
  const tujuan = path.resolve(folder || env.folderCadangan)
  fs.mkdirSync(tujuan, { recursive: true })

  // Seluruh pembacaan memakai SATU koneksi tanpa batas waktu.
  //
  // Cadangan yang lambat masih berguna; cadangan yang dipotong di tengah tidak.
  // Satu koneksi dipakai bersama-sama supaya potongan-potongannya melihat
  // keadaan basis data yang sama dan tidak bolak-balik mengambil dari pool.
  const isi = await tanpaBatasWaktu(async (klien) => {
    const kueriKlien = (teks, nilai) => klien.query(teks, nilai).then((r) => r.rows)
    const hasil = {}
    for (const t of TABEL) hasil[t] = await bacaSemua(t, { kueri: kueriKlien })
    return hasil
  })
  const mentah = Buffer.from(JSON.stringify(isi), 'utf8')
  const terkompres = await gzip(mentah)
  // Kunci cadangan terpisah dari kunci NIK (AGENTS Bagian 6).
  const terenkripsi = enkripsi(terkompres.toString('base64'), 'cadangan')

  const cap = new Date().toISOString().replace(/[:.]/g, '-')
  const nama = `${awalan}-${cap}.json.gz.enc`
  await tulis(path.join(tujuan, nama), terenkripsi, 'utf8')
  return { nama, ukuran_byte: Buffer.byteLength(terenkripsi, 'utf8') }
}

/** Cadangan pengaman sebelum pemulihan; dibedakan supaya aturan retensi tahu. */
const AWALAN_PENGAMAN = 'posyandu-pengaman'

function namaSah(nama) {
  return (
    typeof nama === 'string' &&
    /^posyandu-[A-Za-z0-9._-]+\.json\.gz\.enc$/.test(nama) &&
    !nama.includes('..')
  )
}

function daftar(folder) {
  const env = require('../env').muat()
  const tujuan = path.resolve(folder || env.folderCadangan)
  if (!fs.existsSync(tujuan)) return []
  return fs
    .readdirSync(tujuan)
    .filter((f) => f.startsWith('posyandu-') && f.endsWith('.json.gz.enc'))
    .map((f) => {
      const st = fs.statSync(path.join(tujuan, f))
      return {
        nama: f,
        ukuran_byte: st.size,
        dibuat_pada: st.mtime.toISOString(),
      }
    })
    .sort((a, b) => (a.dibuat_pada < b.dibuat_pada ? 1 : -1))
}

/** Awal hari (00.00) dari sebuah waktu, dalam milidetik lokal server. */
function awalHari(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Kunci minggu ISO (Senin sebagai hari pertama). */
function kunciMinggu(ms) {
  const d = new Date(awalHari(ms))
  const hari = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - hari)
  return d.getTime()
}

function kunciBulan(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Berkas mana yang harus DISIMPAN menurut aturan dokumen: 7 harian, 4
 * mingguan, 3 bulanan. Cadangan pengaman diperlakukan terpisah (3 terbaru,
 * dan tidak pernah dihapus dalam 24 jam pertama) karena itu jaring penyelamat
 * saat pemulihan salah, bukan cadangan harian biasa.
 *
 * Dipisah jadi fungsi murni supaya bisa diuji tanpa menyentuh berkas.
 */
function berkasDisimpan(daftarBerkas, sekarang = Date.now()) {
  const semua = [...daftarBerkas].sort((a, b) => b.dibuat_pada_ms - a.dibuat_pada_ms)
  const simpan = new Set()
  const ambilTerbaruPerKunci = (kandidat, kunci, batas) => {
    const terlihat = new Set()
    for (const b of kandidat) {
      const k = kunci(b.dibuat_pada_ms)
      if (terlihat.has(k)) continue
      terlihat.add(k)
      if (terlihat.size > batas) return
      simpan.add(b.nama)
    }
  }

  const pengaman = semua.filter((b) => b.nama.startsWith(`${AWALAN_PENGAMAN}-`))
  const biasa = semua.filter((b) => !pengaman.includes(b))

  for (const b of pengaman) {
    if (sekarang - b.dibuat_pada_ms < 24 * 3600_000) simpan.add(b.nama)
  }
  // Tiga terbaru, apa pun umurnya: cadangan pengaman adalah jaring saat
  // pemulihan salah, jadi tidak boleh habis hanya karena berumur.
  for (const b of pengaman.slice(0, 3)) simpan.add(b.nama)

  ambilTerbaruPerKunci(biasa, awalHari, 7)
  ambilTerbaruPerKunci(biasa, kunciMinggu, 4)
  ambilTerbaruPerKunci(biasa, kunciBulan, 3)

  return [...simpan]
}

/** Terapkan retensi: hapus yang tidak disimpan. */
function pangkas(folder) {
  const env = require('../env').muat()
  const tujuan = path.resolve(folder || env.folderCadangan)
  if (!fs.existsSync(tujuan)) return { diperiksa: 0, dihapus: [], disimpan: [] }
  const berkas = fs
    .readdirSync(tujuan)
    .filter((f) => namaSah(f))
    .map((f) => ({
      nama: f,
      dibuat_pada_ms: fs.statSync(path.join(tujuan, f)).mtimeMs,
    }))
  const simpan = new Set(berkasDisimpan(berkas))
  const dihapus = []
  for (const b of berkas) {
    if (simpan.has(b.nama)) continue
    try {
      fs.unlinkSync(path.join(tujuan, b.nama))
      dihapus.push(b.nama)
    } catch {
      // Berkas sudah hilang atau tidak boleh dihapus; retensi bukan hal kritis.
    }
  }
  return { diperiksa: berkas.length, dihapus, disimpan: [...simpan] }
}

// `bacaSemua` diekspor agar bisa diuji langsung (tests/cadangan-potong.test.js)
// tanpa menulis berkas cadangan.
module.exports = { jalankan, daftar, namaSah, pangkas, berkasDisimpan, AWALAN_PENGAMAN, TABEL, bacaSemua }
