// Tarik artikel tips KodeNara ke konten_publik.
//
//   npm run konten:kodenara          tarik sekarang
//   npm run konten:kodenara:bersih   buang semua hasil tarikan
//
// Penjadwalan harian sudah berjalan di dalam server (03.00 WIB); perintah ini
// untuk menarik segera setelah memasang, atau memeriksa hasilnya.
const { muat } = require('../env')
const kodenara = require('../jobs/kodenara')

async function utama() {
  muat()
  const bersih = process.argv.includes('--bersih')

  if (bersih) {
    const jumlah = await kodenara.hapusSemua()
    console.log(`${jumlah} artikel tarikan dibuang. Konten buatan admin tidak tersentuh.`)
    process.exit(0)
  }

  console.log(`Menarik dari ${kodenara.SUMBER} …`)
  const hasil = await kodenara.sekali()
  console.log(
    `Selesai: ${hasil.disimpan} disimpan, ${hasil.dilewati} dilewati, ` +
      `dari ${hasil.diperiksa} artikel ditemukan.`,
  )
  console.log(`${await kodenara.jumlahTayang()} artikel tarikan sedang tayang.`)
  process.exit(0)
}

utama().catch((salah) => {
  console.error('Gagal menarik konten KodeNara:', salah.message)
  process.exit(1)
})
