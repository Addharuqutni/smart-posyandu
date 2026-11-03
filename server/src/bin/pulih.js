#!/usr/bin/env node
// Uji pemulihan (drill): pulihkan satu berkas cadangan, lalu buktikan dengan
// membandingkan jumlah baris. Bisa diarahkan ke basis data LAIN supaya data
// hidup tidak tersentuh:
//
//   npm run pulih -- posyandu-2026-11-30T02-00-00-000Z.json.gz.enc --ke postgres://user@host/posyandu_drill
//
// Tanpa `--ke`, perintah ini memulihkan ke basis data yang dipakai server
// (DATABASE_URL), jadi pakai dengan sadar. Cadangan pengaman dimatikan karena
// pemulihan ke basis data terpisah tidak perlu perlindungan tambahan.

const { muat } = require('../env')

function pisahArgumen(daftar) {
  const opsi = { berkas: null, ke: null }
  for (let i = 0; i < daftar.length; i += 1) {
    const a = daftar[i]
    if (a === '--ke') {
      opsi.ke = daftar[i + 1] ?? null
      i += 1
    } else if (!opsi.berkas) {
      opsi.berkas = a
    }
  }
  return opsi
}

async function utama() {
  const { berkas, ke } = pisahArgumen(process.argv.slice(2))
  if (!berkas) {
    console.error('Pakai: npm run pulih -- <berkas> [--ke <DATABASE_URL>]')
    process.exit(2)
  }

  // HARUS sebelum pool dibuat: pool dibaca dari env saat pertama kali dipakai.
  if (ke) process.env.DATABASE_URL = ke
  muat()

  const { pulihkan } = require('../jobs/pemulihan')
  const verifikasi = require('../jobs/verifikasi')
  const { namaSah } = require('../jobs/cadangan')

  if (!namaSah(berkas)) {
    console.error('Nama berkas tidak sesuai pola cadangan:', berkas)
    process.exit(2)
  }

  const sasaran = ke ? ke.replace(/:[^:@/]*@/, ':***@') : process.env.DATABASE_URL
  console.log(`Sasaran   : ${sasaran}`)
  console.log(`Berkas    : ${berkas}`)

  const hasil = await pulihkan(berkas, { buatCadanganPengaman: false, penggunaId: null })
  console.log(`Dipulihkan: ${hasil.total_baris} baris masuk berkas`)
  for (const t of hasil.tabel) {
    console.log(`  ${t.nama.padEnd(20)} baru ${String(t.disisipkan).padStart(7)}  diperbarui ${t.diperbarui}`)
  }

  // Bukti: baca ulang berkasnya dan bandingkan dengan basis data sasaran.
  const v = await verifikasi.periksa(berkas)
  console.log(`Uji       : ${v.cocok ? 'COCOK' : 'TIDAK COCOK'}`)
  if (v.jumlah) {
    for (const [tabel, n] of Object.entries(v.jumlah)) {
      const db = v.jumlah_db?.[tabel]
      const tanda = n === db ? 'ok' : 'beda'
      console.log(`  ${tabel.padEnd(20)} berkas ${String(n).padStart(7)}  basis data ${String(db ?? '-').padStart(7)}  ${tanda}`)
    }
  }
  if (!v.cocok) {
    console.error('Uji pemulihan GAGAL. Periksa catatan di atas.')
    process.exit(1)
  }
}

utama().catch((salah) => {
  console.error('Pemulihan gagal:', salah.message)
  process.exit(1)
})
