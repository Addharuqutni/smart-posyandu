// Uji pembacaan cadangan per potongan (jobs/cadangan.js).
//
// Dua bug nyata pernah lolos ke produksi dan hanya tertangkap oleh uji
// berjalan pada basis data sungguhan:
//
// 1. Kursor diambil dari `diperbarui_pada` sebagai Date. node-postgres
//    membulatkan mikrodetik ke milidetik, jadi kursor menjadi LEBIH KECIL dari
//    nilai sebenarnya -> baris yang sama terambil ulang selamanya. Terukur:
//    200 putaran, 1.000.000 baris ganda, proses kehabisan memori.
//
// 2. Kolom bantu kursor dihapus SEBELUM kursor dibaca. `akhir` menunjuk objek
//    yang sama, jadi kursor menjadi undefined dan pembacaan berhenti tepat
//    setelah satu potongan. Terukur: 5.000 dari 12.300 baris tersimpan, tanpa
//    galat apa pun -- cadangan tampak berhasil padahal kehilangan data.
//
// Uji ini memanggil `bacaSemua` yang sebenarnya, bukan menyalin logikanya.
//
// Hanya berjalan bila DATABASE_URL menunjuk basis data UJI (namanya mengandung
// "uji" atau "test"). Tanpa penjaga itu uji akan membuat dan menghapus tabel
// di basis data pengembangan/produksi -- persis yang tidak boleh terjadi pada
// `npm test` yang dijalankan tanpa pikir panjang.

const test = require('node:test')
const assert = require('node:assert')

const { kueri, banyak } = require('../src/db/pool')
const { bacaSemua } = require('../src/jobs/cadangan')

const JUMLAH = 12345 // melewati lebih dari satu potongan (POTONGAN = 5000)

/** Basis data uji saja; jangan pernah menyentuh yang lain. */
function basisDataUji() {
  const url = process.env.DATABASE_URL || ''
  return /[\/_-](uji|test)/i.test(url)
}

async function siapUji(t) {
  if (!basisDataUji()) {
    t.skip('DATABASE_URL bukan basis data uji (namanya harus memuat "uji"/"test")')
    return false
  }
  try {
    await kueri('SELECT 1')
    return true
  } catch {
    t.skip('basis data uji tidak bisa dihubungi')
    return false
  }
}

test('bacaSemua: semua baris terambil tepat sekali walau cap waktunya sama', async (t) => {
  if (!(await siapUji(t))) return

  // Cap waktu SAMA PERSIS untuk semua baris: kasus terburuk, karena kursor
  // hanya bisa dibedakan lewat id. Inilah yang memicu bug pembulatan.
  await kueri(`
    DROP TABLE IF EXISTS uji_cadangan_potong;
    CREATE TABLE uji_cadangan_potong (
      id uuid PRIMARY KEY,
      isi text,
      diperbarui_pada timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO uji_cadangan_potong (id, isi, diperbarui_pada)
    SELECT gen_random_uuid(), 'baris-' || i, '2026-01-01T00:00:00.123456Z'::timestamptz
    FROM generate_series(1, ${JUMLAH}) i;
  `)

  try {
    const baris = await bacaSemua('uji_cadangan_potong')

    assert.equal(baris.length, JUMLAH, 'semua baris harus terambil, bukan hanya satu potongan')
    assert.equal(new Set(baris.map((b) => b.id)).size, JUMLAH, 'tidak boleh ada id ganda')
    assert.ok(!('waktu_kursor' in baris[0]), 'kolom bantu kursor tidak boleh ikut ke hasil')
    // Isi harus utuh. TIDAK memeriksa urutan: semua baris punya cap waktu
    // sama, jadi urutannya ditentukan id (UUID acak), bukan urutan sisip.
    assert.equal(baris.filter((b) => b.isi === 'baris-1').length, 1, 'setiap isi muncul tepat sekali')
  } finally {
    await kueri('DROP TABLE IF EXISTS uji_cadangan_potong').catch(() => {})
  }
})

test('bacaSemua: berjalan tanpa batas waktu (pencadangan tidak boleh dipotong)', async (t) => {
  if (!(await siapUji(t))) return
  await kueri(`
    DROP TABLE IF EXISTS uji_cadangan_batas;
    CREATE TABLE uji_cadangan_batas (
      id uuid PRIMARY KEY,
      diperbarui_pada timestamptz NOT NULL DEFAULT now()
    );
  `)
  try {
    // 6.000 baris memaksa lebih dari satu potongan, sama seperti cadangan asli.
    await kueri(
      `INSERT INTO uji_cadangan_batas (id) SELECT gen_random_uuid() FROM generate_series(1, 6000)`,
    )

    const { tanpaBatasWaktu } = require('../src/db/pool')
    const baris = await tanpaBatasWaktu((klien) =>
      bacaSemua('uji_cadangan_batas', {
        kueri: (teks, nilai) => klien.query(teks, nilai).then((r) => r.rows),
      }),
    )
    assert.equal(baris.length, 6000, 'seluruh baris harus terambil')

    // Batas waktu harus kembali seperti semula supaya API tidak ikut tanpa batas.
    const st = await kueri('SHOW statement_timeout')
    assert.notEqual(st.rows[0].statement_timeout, '0', 'batas waktu API tidak boleh ikut hilang')
  } finally {
    await kueri('DROP TABLE IF EXISTS uji_cadangan_batas').catch(() => {})
  }
})

test('bacaSemua: tabel kosong menghasilkan daftar kosong', async (t) => {
  if (!(await siapUji(t))) return
  await kueri(`
    DROP TABLE IF EXISTS uji_cadangan_kosong;
    CREATE TABLE uji_cadangan_kosong (id uuid PRIMARY KEY, diperbarui_pada timestamptz NOT NULL DEFAULT now());
  `)
  try {
    assert.deepEqual(await bacaSemua('uji_cadangan_kosong'), [])
  } finally {
    await kueri('DROP TABLE IF EXISTS uji_cadangan_kosong').catch(() => {})
  }
})

// Penjaga: bila uji di atas terlewati, JANGAN diam-diam dianggap lulus.
test('penjaga: uji potongan cadangan punya basis data uji', async (t) => {
  if (!basisDataUji()) {
    t.skip('DILEWATI: set DATABASE_URL ke basis data bernama ...uji/...test untuk menjalankannya')
  }
})
