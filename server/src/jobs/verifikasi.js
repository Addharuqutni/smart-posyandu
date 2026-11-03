// Verifikasi cadangan: bukti bahwa berkas yang baru dibuat benar-benar bisa
// dibaca dan memuat semua baris, bukan sekadar "ada berkas".
//
// Caranya sengaja tidak percaya pada ukuran berkas: berkas dibaca ulang,
// didekripsi, dihitung barisnya per tabel, lalu dibandingkan dengan jumlah
// baris tabel yang sama di basis data saat itu. Hasilnya disimpan di tabel
// `uji_cadangan` supaya layar admin bisa menampilkannya.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { promisify } = require('util')
const { banyak, kueri } = require('../db/pool')
const { dekripsi } = require('../domain/rahasia')
const { TABEL, namaSah } = require('./cadangan')

const gunzip = promisify(zlib.gunzip)
const baca = promisify(fs.readFile)

function folder() {
  const env = require('../env').muat()
  return path.resolve(env.folderCadangan)
}

/** Hitung baris per tabel di basis data saat ini. */
async function jumlahBasisData() {
  const hasil = {}
  for (const t of TABEL) {
    hasil[t] = (await banyak(`SELECT count(*)::int AS n FROM ${t}`))[0].n
  }
  return hasil
}

/**
 * Periksa satu berkas cadangan. Tidak pernah melempar: berkas rusak atau kunci
 * salah dicatat sebagai `cocok: false` supaya penjadwal tidak ikut mati.
 */
async function periksa(nama, folderCadangan) {
  const tujuan = folderCadangan ? path.resolve(folderCadangan) : folder()
  const berkas = path.join(tujuan, String(nama))
  const catatan = []
  let ukuran = 0
  let jumlah = null
  let cocok = false

  try {
    if (!namaSah(nama)) throw new Error('nama_tidak_sah')
    ukuran = fs.statSync(berkas).size
    const terenkripsi = await baca(berkas, 'utf8')
    const terkompres = dekripsi(terenkripsi, 'cadangan')
    if (!terkompres) throw new Error('kunci_cadangan_tidak_cocok')
    const isi = JSON.parse((await gunzip(Buffer.from(terkompres, 'base64'))).toString('utf8'))
    jumlah = {}
    for (const t of TABEL) jumlah[t] = Array.isArray(isi[t]) ? isi[t].length : 0

    const db = await jumlahBasisData()
    const beda = TABEL.filter((t) => jumlah[t] !== db[t])
    // Hanya tabel yang lebih sedikit di berkas yang dianggap masalah: baris
    // yang bertambah SETELAH cadangan dibuat memang wajar tidak ada di berkas.
    const kurang = beda.filter((t) => jumlah[t] < db[t])
    cocok = kurang.length === 0
    if (kurang.length) {
      catatan.push(
        `berkas kurang dari basis data: ${kurang.map((t) => `${t} ${jumlah[t]}/${db[t]}`).join(', ')}`,
      )
    }
    if (beda.length && !kurang.length) {
      catatan.push(`basis data bertambah setelah cadangan: ${beda.join(', ')}`)
    }
    return await simpan({ nama, ukuran, jumlah, db, cocok, catatan })
  } catch (salah) {
    catatan.push(salah.message)
    return await simpan({ nama, ukuran, jumlah, db: null, cocok: false, catatan })
  }
}

async function simpan({ nama, ukuran, jumlah, db, cocok, catatan }) {
  const isiCatatan = catatan.join('; ') || null
  await kueri(
    `INSERT INTO uji_cadangan
       (id, berkas, ukuran_byte, jumlah, jumlah_db, cocok, catatan, diperiksa_pada)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())`,
    [nama, ukuran ?? 0, JSON.stringify(jumlah ?? {}), JSON.stringify(db ?? {}), cocok, isiCatatan],
  )
  return { berkas: nama, ukuran_byte: ukuran, cocok, jumlah, jumlah_db: db, catatan: isiCatatan }
}

/** Verifikasi terbaru untuk ditampilkan di layar admin. */
async function terakhir() {
  const baris = await banyak(
    `SELECT berkas, ukuran_byte, jumlah, jumlah_db, cocok, catatan, diperiksa_pada
     FROM uji_cadangan ORDER BY diperiksa_pada DESC LIMIT 1`,
  )
  return baris[0] ?? null
}

module.exports = { periksa, terakhir, jumlahBasisData }
