// Pemulihan cadangan (F-21 lanjutan): baca berkas terenkripsi, lalu tulis
// isinya kembali ke basis data.
//
// Aturan yang dipegang:
//   * Pemulihan menimpa baris dengan id yang sama dan menambah baris yang
//     belum ada. Baris yang tidak ada di berkas TIDAK dihapus — menghapus
//     data yang tidak diminta jauh lebih berbahaya daripada menambah.
//   * Sebelum menulis apa pun, dibuat cadangan pengaman. Salah memulihkan
//     masih bisa dibatalkan.
//   * Semua penulisan dalam satu transaksi: gagal di tengah berarti tidak
//     ada yang berubah.
//   * `diperbarui_pada` baris yang baru masuk digeser ke sekarang supaya
//     tablet menariknya lagi pada sinkron berikutnya.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { promisify } = require('util')
const { transaksi } = require('../db/pool')
const { dekripsi } = require('../domain/rahasia')
const { namaSah, TABEL, jalankan: cadangkan, AWALAN_PENGAMAN } = require('./cadangan')

const gunzip = promisify(zlib.gunzip)
const baca = promisify(fs.readFile)

// Satu pernyataan INSERT tidak boleh melewati 65535 parameter.
const BARIS_PER_PERNYATAAN = 400

/** Pemulihan berikutnya menunggu yang sekarang; dua pemulihan bersamaan
 *  akan saling menimpa dan hasilnya sulit dijelaskan. */
let sedangBerjalan = false

function folder() {
  const env = require('../env').muat()
  return path.resolve(env.folderCadangan)
}

function letakBerkas(nama) {
  if (!namaSah(nama)) return null
  const berkas = path.join(folder(), nama)
  return fs.existsSync(berkas) ? berkas : null
}

/** Isi berkas cadangan: JSON semua tabel. Melempar bila kunci salah. */
async function bacaIsi(nama) {
  const berkas = letakBerkas(nama)
  if (!berkas) {
    const salah = new Error('berkas_tidak_ditemukan')
    salah.kode = 'berkas_tidak_ditemukan'
    throw salah
  }
  const terenkripsi = await baca(berkas, 'utf8')
  const terkompres = dekripsi(terenkripsi, 'cadangan')
  if (!terkompres) {
    // Kunci berbeda atau berkas rusak. Jangan menebak isinya.
    const salah = new Error('kunci_cadangan_tidak_cocok')
    salah.kode = 'kunci_cadangan_tidak_cocok'
    throw salah
  }
  let isi
  try {
    isi = JSON.parse((await gunzip(Buffer.from(terkompres, 'base64'))).toString('utf8'))
  } catch {
    const salah = new Error('berkas_cadangan_rusak')
    salah.kode = 'berkas_cadangan_rusak'
    throw salah
  }
  const masalah = periksaIsi(isi)
  if (masalah) {
    const salah = new Error(masalah)
    salah.kode = masalah
    throw salah
  }
  return isi
}

/**
 * Periksa bentuk isi berkas sebelum ada yang ditulis.
 * Mengembalikan kode masalah, atau null bila bentuknya masuk akal.
 */
function periksaIsi(isi) {
  if (!isi || typeof isi !== 'object' || Array.isArray(isi)) return 'isi_cadangan_tidak_sah'
  const tabel = Object.keys(isi)
  if (tabel.length === 0) return 'isi_cadangan_kosong'
  if (!tabel.some((t) => TABEL.includes(t))) return 'tidak_ada_tabel_dikenal'
  for (const t of tabel) {
    if (!Array.isArray(isi[t])) return `tabel_bukan_daftar:${t}`
    for (const baris of isi[t]) {
      if (!baris || typeof baris !== 'object' || !baris.id) return `baris_tanpa_id:${t}`
    }
  }
  return null
}

/** Pecah daftar jadi potongan kecil; dipakai agar jumlah parameter aman. */
function bagian(daftar, ukuran = BARIS_PER_PERNYATAAN) {
  const keluar = []
  for (let i = 0; i < daftar.length; i += ukuran) keluar.push(daftar.slice(i, i + ukuran))
  return keluar
}

async function kolomTabel(klien, namaTabel) {
  const { rows } = await klien.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [namaTabel],
  )
  return new Set(rows.map((b) => b.column_name))
}

/**
 * Ringkasan isi berkas tanpa menyentuh basis data.
 * Dipakai layar admin sebelum menekan tombol pulihkan.
 */
async function pratinjau(nama) {
  const isi = await bacaIsi(nama)
  const berkas = letakBerkas(nama)
  const st = fs.statSync(berkas)
  const tabel = []
  let total = 0
  for (const t of TABEL) {
    if (!Array.isArray(isi[t])) continue
    tabel.push({ nama: t, jumlah: isi[t].length })
    total += isi[t].length
  }
  const tidakDikenal = Object.keys(isi).filter((t) => !TABEL.includes(t))
  return {
    nama,
    ukuran_byte: st.size,
    dibuat_pada: st.mtime.toISOString(),
    tabel,
    total_baris: total,
    tabel_tidak_dikenal: tidakDikenal,
  }
}

/** Susun satu INSERT ... ON CONFLICT untuk sekelompok baris berkolom sama. */
function susunSisip(namaTabel, kolom, daftar, konflik) {
  const nilai = []
  const barisNilai = daftar.map((baris) => {
    const tanda = kolom.map((k) => {
      nilai.push(baris[k] === undefined ? null : baris[k])
      return `$${nilai.length}`
    })
    return `(${tanda.join(', ')})`
  })
  const ubah = kolom
    .filter((k) => k !== 'id' && k !== 'dibuat_pada')
    .map((k) => `${k} = EXCLUDED.${k}`)
  const teks =
    `INSERT INTO ${namaTabel} (${kolom.join(', ')}) VALUES ${barisNilai.join(', ')} ` +
    `ON CONFLICT (${konflik}) DO ${ubah.length ? `UPDATE SET ${ubah.join(', ')}` : 'NOTHING'} ` +
    'RETURNING id, (xmax = 0) AS baru'
  return { teks, nilai }
}

/** Kolom kunci benturan selain id, bila tabel punya batasan unik lain. */
const KONFLIK = {
  // Acuan dikenali dari isinya, bukan dari id-nya: id acuan dibuat acak saat
  // migrasi, jadi dua pemasangan punya id berbeda untuk baris yang sama.
  // Tabel lain sengaja hanya memakai id: bila id berbeda tetapi kunci unik
  // sama, itu berarti data dari pemasangan lain — lebih baik gagal terang-
  // terangan daripada diam-diam menimpa baris yang bukan berasal dari berkas.
  acuan_berat_umur: ['usia_bulan', 'jenis_kelamin', 'sumber'],
}

/** Kunci benturan yang aman dipakai untuk sekelompok kolom. */
function kunciKonflik(namaTabel, kolom) {
  const calon = KONFLIK[namaTabel]
  if (calon && calon.every((k) => kolom.includes(k))) return calon.join(', ')
  return 'id'
}

async function pulihkan(nama, { penggunaId = null, buatCadanganPengaman = true } = {}) {
  if (sedangBerjalan) {
    const salah = new Error('pemulihan_sedang_berjalan')
    salah.kode = 'pemulihan_sedang_berjalan'
    throw salah
  }
  sedangBerjalan = true
  try {
    const isi = await bacaIsi(nama)
    const berkas = letakBerkas(nama)
    const st = fs.statSync(berkas)

    // Cadangan pengaman dibuat lebih dulu: bila pemulihan salah, keadaan
    // sebelum tombol ditekan masih bisa dikembalikan.
    let pengaman = null
    if (buatCadanganPengaman) pengaman = await cadangkan(undefined, { awalan: AWALAN_PENGAMAN })

    const ringkas = {
      berkas: nama,
      ukuran_byte: st.size,
      dibuat_pada: st.mtime.toISOString(),
      cadangan_pengaman: pengaman?.nama ?? null,
      tabel: [],
      tabel_tidak_dikenal: Object.keys(isi).filter((t) => !TABEL.includes(t)),
      kolom_tidak_dikenal: [],
      kader_id_dikosongkan: 0,
      total_baris: 0,
    }

    await transaksi(async (klien) => {
      // Kader yang boleh dirujuk: yang ada di basis data sekarang, ditambah
      // yang akan masuk dari berkas ini. Cadangan lama (sebelum tabel kader
      // ikut disalin) bisa memuat kunjungan yang menunjuk kader tak dikenal;
      // rujukannya dikosongkan, bukan membuat pemulihan gagal total.
      const kaderAda = new Set(
        (await klien.query(`SELECT id FROM kader`)).rows.map((r) => String(r.id)),
      )
      for (const k of isi.kader ?? []) kaderAda.add(String(k.id))

      for (const namaTabel of TABEL) {
        const daftar = isi[namaTabel]
        if (!Array.isArray(daftar) || daftar.length === 0) continue

        const kolomDb = await kolomTabel(klien, namaTabel)
        const bersih = []

        for (const baris of daftar) {
          const hasil = {}
          for (const [k, v] of Object.entries(baris)) {
            if (!kolomDb.has(k)) {
              ringkas.kolom_tidak_dikenal.push(`${namaTabel}.${k}`)
              continue
            }
            hasil[k] = v
          }
          if (namaTabel === 'kunjungan' && hasil.kader_id && !kaderAda.has(String(hasil.kader_id))) {
            hasil.kader_id = null
            ringkas.kader_id_dikosongkan += 1
          }
          if (!hasil.id) continue
          bersih.push(hasil)
        }

        if (bersih.length === 0) continue

        // Kolom yang dipakai = gabungan kolom semua baris. Baris yang tidak
        // punya kolom itu diisi NULL hanya bila kolomnya memang dipakai;
        // pengelompokan di bawah memisahkan baris yang bentuknya berbeda.
        const kelompok = new Map()
        for (const baris of bersih) {
          const kunci = Object.keys(baris).sort().join(',')
          if (!kelompok.has(kunci)) kelompok.set(kunci, [])
          kelompok.get(kunci).push(baris)
        }

        let disisipkan = 0
        let diperbarui = 0
        const idBaru = []

        for (const [kunci, isiKelompok] of kelompok) {
          const kolom = kunci.split(',')
          for (const potong of bagian(isiKelompok)) {
            const { teks, nilai } = susunSisip(
              namaTabel,
              kolom,
              potong,
              kunciKonflik(namaTabel, kolom),
            )
            const hasil = await klien.query(teks, nilai)
            for (const r of hasil.rows) {
              if (r.baru) {
                disisipkan += 1
                idBaru.push(r.id)
              } else {
                diperbarui += 1
              }
            }
          }
        }

        // Baris yang baru masuk membawa `diperbarui_pada` dari berkas. Bila
        // cap waktu itu lebih lama dari kursor tablet, tablet tidak akan
        // pernah menariknya. Geser ke sekarang supaya ikut tersinkron.
        for (const potong of bagian(idBaru, 1000)) {
          await klien.query(
            `UPDATE ${namaTabel} SET diperbarui_pada = now() WHERE id = ANY($1::uuid[])`,
            [potong],
          )
        }

        ringkas.tabel.push({ nama: namaTabel, disisipkan, diperbarui, total: bersih.length })
        ringkas.total_baris += bersih.length
      }

      // Pemulihan mengubah data secara massal; catat sekali, jangan per baris.
      await klien.query(
        `INSERT INTO log_audit
           (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
            nilai_lama, nilai_baru, terjadi_pada, diterima_pada)
         VALUES (gen_random_uuid(), $1, 'server', 'cadangan', gen_random_uuid(), 'ubah',
                 NULL, $2, now(), now())`,
        [penggunaId, JSON.stringify({ pulihkan: nama, tabel: ringkas.tabel })],
      )
    }, { batasWaktuMs: 0 })

    return ringkas
  } finally {
    sedangBerjalan = false
  }
}

module.exports = { periksaIsi, bagian, pratinjau, pulihkan, bacaIsi }
