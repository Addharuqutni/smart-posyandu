// Penyusun kueri satu halaman tarikan sinkron.
//
// Dua masalah yang sudah terukur, dan bagaimana keduanya ditutup:
//
// 1. Versi pertama (2026-11-01 pagi) menjalankan satu kueri per tabel lalu
//    menggabung dan menyaring kursor di Node. Saat banyak baris berbagi satu
//    cap waktu (hasil `npm run demo`, dan juga hasil pemulihan cadangan yang
//    menggeser `diperbarui_pada`), tabel yang sudah lewat kursor tidak lagi
//    menyumbang baris: terukur 12.006 dari 433.134 baris terkirim lalu tarikan
//    berhenti tanpa galat.
// 2. Versi kedua memakai satu kueri UNION ALL dengan urutan
//    `date_trunc('milliseconds', diperbarui_pada), tabel, id`. Benar, tetapi
//    kunci urutannya tidak bisa dipakai indeks sehingga PostgreSQL menyortir
//    ulang seluruh kelompok cap waktu pada SETIAP halaman: terukur 2,7 sampai
//    4,0 detik per halaman dengan berkas sementara ~90 MB per pekerja.
//
// Versi ini mengurutkan dengan `diperbarui_pada` apa adanya (tanpa potong
// milidetik) sehingga indeks `(diperbarui_pada, id)` di tiap tabel bisa dipakai,
// lalu membatasi tiap cabang dengan `LIMIT batas + 1`. Batas per cabang itu
// aman: satu tabel paling banyak menyumbang `batas` baris ke jendela global,
// jadi mengambil `batas + 1` baris pertama cabang itu selalu cukup.
//
// Karena urutannya kini penuh presisi, kursor juga menyimpan cap waktu apa
// adanya (mikrodetik), bukan versi terpotong. Kursor lama bermilidetik tetap
// diterima; hanya presisinya yang lebih kasar.

/**
 * @param {object} opsi
 * @param {string[]} opsi.tabel
 * @param {{waktu:string,tabel:string,id:string}|null} opsi.kursor
 * @param {number} opsi.batas
 * @param {string|null} opsi.pos Posyandu yang diizinkan, atau null untuk semua.
 * @param {(tabel:string, pos:string|null, nilai:any[])=>string} opsi.syaratPosyandu
 * @returns {{sql:string, param:any[]}}
 */
function bangunKueriHalaman({ tabel, kursor, batas, pos, syaratPosyandu }) {
  const param = []
  const tandai = (nilai) => {
    param.push(nilai)
    return `$${param.length}`
  }

  /**
   * Syarat kursor untuk SATU cabang, ditulis dalam bentuk yang bisa dipakai
   * indeks `(diperbarui_pada, id)`.
   *
   * Perbandingan tuple tiga unsur `(ts, tabel, id) > (…)` tidak bisa memakai
   * indeks itu karena `tabel` bukan kolom di dalam tabel mana pun, sehingga
   * PostgreSQL memindai penuh dan menyortir ulang setiap halaman (terukur 2,7
   * sampai 4,0 detik per halaman dengan berkas sementara ~90 MB).
   *
   * Karena nama tabel tiap cabang adalah tetapan, perbandingan tiga unsur itu
   * bisa disederhanakan per cabang, dengan hasil yang sama persis seperti
   * `bandingkan()` di domain/kursor.js:
   *   - cabang yang namanya LEBIH BESAR dari tabel kursor: semua barisnya di
   *     cap waktu yang sama sudah berada setelah kursor -> `ts >= cts`;
   *   - lebih kecil: semua barisnya di cap waktu yang sama sudah dilewati
   *     -> `ts > cts`;
   *   - sama: sisa ditentukan id -> `(ts, id) > (cts, cid)`.
   */
  function syaratKursorCabang(namaTabel) {
    if (!kursor) return 'TRUE'
    if (namaTabel > kursor.tabel) return `t.diperbarui_pada >= ${tandai(kursor.waktu)}::timestamptz`
    if (namaTabel < kursor.tabel) return `t.diperbarui_pada > ${tandai(kursor.waktu)}::timestamptz`
    const waktu = tandai(kursor.waktu)
    const id = tandai(kursor.id)
    return `(t.diperbarui_pada, t.id) > (${waktu}::timestamptz, ${id}::uuid)`
  }

  const bagian = tabel.map((namaTabel) => {
    const syaratKursor = syaratKursorCabang(namaTabel)
    // Lingkup per posyandu berlaku untuk semua tabel, bukan hanya kunjungan:
    // KONTRAK API 3 menjanjikan kader hanya melihat milik posyandu_id-nya.
    const syaratPos = syaratPosyandu(namaTabel, pos, param)
    const batasCabang = tandai(batas + 1)
    return (
      `(SELECT '${namaTabel}' AS tabel, ` +
      // `diperbarui_pada` WAJIB tetap ikut: penyimpanan lokal tablet
      // (penyimpanan/db.js) memakai kolom itu sebagai indeks, dan menghapusnya
      // membuat baris gagal tersimpan sehingga tarikan berhenti di 2.001 baris.
      // `dihapus_pada` juga tetap ikut karena dibaca `terapkan` di klien.
      // Yang dibuang hanya kolom yang memang tidak dipakai tablet.
      `to_jsonb(t) - 'dibuat_pada' - 'id_perangkat' AS baris, ` +
      // Cap waktu kursor diambil sebagai teks bermikrodetik: node-postgres
      // mengubah timestamptz menjadi Date bermilidetik, dan kursor bermilidetik
      // akan mengirim ulang baris pada milidetik yang sama.
      `to_char(t.diperbarui_pada AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS waktu_teks, ` +
      `t.diperbarui_pada AS diperbarui, t.dihapus_pada AS dihapus, t.id AS id ` +
      `FROM ${namaTabel} t WHERE ${syaratKursor}${syaratPos} ` +
      `ORDER BY t.diperbarui_pada, t.id LIMIT ${batasCabang})`
    )
  })

  // Batas luar ditandai paling akhir karena nomor parameternya mengikuti
  // parameter yang sudah dipakai cabang-cabang di atasnya.
  const batasKeseluruhan = tandai(batas + 1)

  const sql =
    `SELECT x.tabel, x.baris, x.waktu_teks, x.dihapus, x.id FROM (${bagian.join(' UNION ALL ')}) x ` +
    `ORDER BY x.diperbarui, x.tabel, x.id::text LIMIT ${batasKeseluruhan}`

  return { sql, param }
}

module.exports = { bangunKueriHalaman }
