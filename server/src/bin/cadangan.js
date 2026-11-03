#!/usr/bin/env node
// Cadangkan sekarang juga, lalu verifikasi dan pangkas.
//
// Dipakai untuk cron/systemd timer di VPS, dan untuk mencoba dari terminal:
//   npm run cadangan
//
// Penjadwal di dalam proses (server.js) menjalankan rutin yang sama, jadi
// jam 02.00 WIB tetap terpenuhi walau tidak ada cron sama sekali.

const { sekali } = require('../jobs/pencadangan-harian')

async function utama() {
  const hasil = await sekali()
  const v = hasil.verifikasi
  console.log(`Berkas    : ${hasil.nama}`)
  console.log(`Ukuran    : ${Math.round(hasil.ukuran_byte / 1024)} KB`)
  console.log(`Verifikasi: ${v.cocok ? 'COCOK' : 'GAGAL'}${v.catatan ? ` (${v.catatan})` : ''}`)
  if (v.jumlah) {
    for (const [tabel, n] of Object.entries(v.jumlah)) {
      const db = v.jumlah_db?.[tabel]
      console.log(`  ${tabel.padEnd(20)} berkas ${String(n).padStart(7)}  basis data ${db ?? '-'}`)
    }
  }
  console.log(
    `Retensi   : diperiksa ${hasil.retensi.diperiksa}, disimpan ${hasil.retensi.disimpan.length}, ` +
      `dihapus ${hasil.retensi.dihapus.length}`,
  )
  if (!v.cocok) {
    console.error('Cadangan TIDAK lolos verifikasi. Jangan andalkan berkas ini.')
    process.exit(1)
  }
}

utama().catch((salah) => {
  console.error('Pencadangan gagal:', salah.message)
  process.exit(1)
})
