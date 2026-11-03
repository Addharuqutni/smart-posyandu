#!/usr/bin/env node
// Membuat akun admin desa pertama (dan Posyandu bila belum ada).
//
// Menggantikan `seed` yang membuat tiga akun dengan kata sandi contoh di kode
// ("admin12345" dan kawan-kawan). Kata sandi yang tertulis di kode akan ikut ke
// setiap pemasangan, jadi skrip ini meminta kata sandi secara interaktif dan
// tidak pernah menyimpannya di berkas mana pun.
//
// Pemakaian:
//   npm run buat-admin -- <username> "<Nama Lengkap>" [--posyandu "<Nama Posyandu>"]
//
// Contoh:
//   npm run buat-admin -- admin_desa "Budi Santoso" --posyandu "Posyandu Melati"

const readline = require('node:readline')
const { muat } = require('../env')
const { satu, kueri } = require('../db/pool')
const { hashSandi } = require('../domain/keamanan')

const PANJANG_MINIMAL = 12

/**
 * Satu antarmuka readline untuk seluruh percakapan, dipakai berurutan.
 *
 * Catatan: kata sandi TIDAK disembunyikan saat diketik. Menyembunyikan lewat
 * `_writeToOutput` terbukti rapuh (prompt hilang, proses menggantung) dan tetap
 * tidak melindungi dari hal yang sebenarnya penting di sini: kata sandi tidak
 * pernah tertulis di berkas kode. Jalankan di terminal pribadi, bukan terminal
 * bersama, dan hapus riwayat shell bila perlu.
 */
function percakapan() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const tanya = (pertanyaan) => new Promise((selesai) => rl.question(pertanyaan, selesai))
  return { tanya, tutup: () => rl.close() }
}

/** Baca seluruh stdin sebagai daftar baris (mode non-interaktif). */
function bacaStdin() {
  return new Promise((selesai) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (potongan) => {
      data += potongan
    })
    process.stdin.on('end', () => {
      selesai(data.split(/\r?\n/).map((b) => b.trim()).filter(Boolean))
    })
  })
}

function uraiArgumen(daftar) {
  const hasil = { pengguna: null, nama: null, posyandu: 'Posyandu Melati', desa: 'Ketenger' }
  const sisa = []
  for (let i = 0; i < daftar.length; i += 1) {
    if (daftar[i] === '--posyandu') {
      hasil.posyandu = daftar[i + 1] ?? hasil.posyandu
      i += 1
    } else if (daftar[i] === '--desa') {
      hasil.desa = daftar[i + 1] ?? hasil.desa
      i += 1
    } else {
      sisa.push(daftar[i])
    }
  }
  hasil.pengguna = sisa[0] ?? null
  hasil.nama = sisa.slice(1).join(' ') || null
  return hasil
}

async function utama() {
  muat()
  const opsi = uraiArgumen(process.argv.slice(2))

  if (!opsi.pengguna || !opsi.nama) {
    console.error('Pakai: npm run buat-admin -- <username> "<Nama Lengkap>" [--posyandu "<Nama>"]')
    process.exit(2)
  }
  if (!/^[a-z0-9_.-]{3,50}$/.test(opsi.pengguna)) {
    console.error('Username hanya huruf kecil, angka, titik, garis bawah, strip (3-50 karakter).')
    process.exit(2)
  }

  const ada = await satu('SELECT id FROM pengguna WHERE nama_pengguna = $1', [opsi.pengguna])
  if (ada) {
    console.error(`Akun "${opsi.pengguna}" sudah ada. Tidak ada yang diubah.`)
    console.error('Untuk menyetel ulang kata sandinya, pakai layar Akun di aplikasi.')
    process.exit(1)
  }

  let sandi
  let ulang

  if (opsi.sandiStdin || !process.stdin.isTTY) {
    // Non-interaktif (pipe/skrip). `readline` tidak bisa mengajukan dua
    // pertanyaan berurutan dari pipe — terbukti menggantung di percobaan ini.
    const baris = await bacaStdin()
    sandi = baris[0] ?? ''
    ulang = baris[1] ?? ''
  } else {
    const tanyaSaja = percakapan()
    sandi = await tanyaSaja.tanya(
      `Kata sandi untuk ${opsi.pengguna} (minimal ${PANJANG_MINIMAL} karakter, akan terlihat): `,
    )
    ulang = await tanyaSaja.tanya('Ulangi kata sandi: ')
    tanyaSaja.tutup()
  }
  if (sandi.length < PANJANG_MINIMAL) {
    console.error(
      `Kata sandi terlalu pendek (minimal ${PANJANG_MINIMAL} karakter). Tidak ada yang dibuat.`,
    )
    process.exit(1)
  }
  if (sandi !== ulang) {
    console.error('Kata sandi tidak sama. Tidak ada yang dibuat.')
    process.exit(1)
  }

  // Posyandu dibuat bila belum ada; admin desa tidak terikat Posyandu.
  let pos = await satu('SELECT id FROM posyandu WHERE nama = $1', [opsi.posyandu])
  if (!pos) {
    pos = await satu(
      `INSERT INTO posyandu (id, nama, desa, aktif, dibuat_pada, diperbarui_pada)
       VALUES (gen_random_uuid(), $1, $2, TRUE, now(), now())
       RETURNING id`,
      [opsi.posyandu, opsi.desa],
    )
    console.log(`Posyandu "${opsi.posyandu}" dibuat.`)
  } else {
    console.log(`Posyandu "${opsi.posyandu}" sudah ada.`)
  }

  const hash = await hashSandi(sandi)
  await kueri(
    `INSERT INTO pengguna
       (id, nama_pengguna, nama_lengkap, hash_kata_sandi, peran, posyandu_id,
        aktif, dibuat_pada, diperbarui_pada, dihapus_pada, id_perangkat,
        harus_ganti_sandi)
     VALUES (gen_random_uuid(), $1, $2, $3, 'admin_desa', NULL, TRUE, now(), now(),
             NULL, 'server', FALSE)`,
    [opsi.pengguna, opsi.nama, hash],
  )

  console.log(`Akun admin desa "${opsi.pengguna}" dibuat.`)
  console.log('Masuk ke aplikasi dengan akun itu, lalu buat akun kader & petugas kesehatan')
  console.log('dari layar Akun. Jangan bagikan kata sandi ini lewat pesan.')
  process.exit(0)
}

utama().catch((salah) => {
  console.error('Gagal membuat admin:', salah.message)
  process.exit(1)
})
