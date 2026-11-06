// Titik masuk server. Jalankan: node src/server.js

const { buatAplikasi } = require('./app')
const { muat } = require('./env')
const { sekali, cadanganTerakhirMs } = require('./jobs/pencadangan-harian')
const { msKeBerikutnyaWib, perluCatchUp } = require('./jobs/jadwal')
const kodenara = require('./jobs/kodenara')

const env = muat()
const aplikasi = buatAplikasi()

aplikasi.listen(env.port, env.host, () => {
  // Cetak alamat yang SEBENARNYA dipakai. Sebelumnya log selalu menulis
  // 127.0.0.1 padahal Node mendengarkan di semua antarmuka.
  console.log(`API Smart Posyandu menyala di http://${env.host}:${env.port}`)
})

// Pencadangan harian pukul 02.00 WIB.
//
// Bukan `setInterval(24 jam)`: dengan interval, restart server menunda
// cadangan berikutnya satu putaran penuh dan jam 02.00 WIB tidak dijamin.
// Di sini jadwal dihitung ulang setiap selesai, dan saat proses hidup
// dilakukan "catch up" bila cadangan terakhir sudah lewat 24 jam.
if (env.cadanganHarian) {
  let timer = null

  async function putaran() {
    try {
      const hasil = await sekali()
      const v = hasil.verifikasi
      console.log(
        `Cadangan dibuat: ${hasil.nama} (${Math.round(hasil.ukuran_byte / 1024)} KB), ` +
          `verifikasi ${v.cocok ? 'cocok' : 'GAGAL'}${v.catatan ? `: ${v.catatan}` : ''}`,
      )
      if (hasil.retensi?.dihapus?.length) {
        console.log(`Retensi: ${hasil.retensi.dihapus.length} berkas lama dihapus`)
      }
    } catch (salah) {
      console.error('Pencadangan gagal:', salah.message)
    } finally {
      jadwalkan()
    }
  }

  function jadwalkan() {
    const jeda = msKeBerikutnyaWib(2)
    timer = setTimeout(putaran, jeda)
    timer.unref?.()
  }

  if (perluCatchUp(cadanganTerakhirMs())) {
    console.log('Cadangan terakhir sudah lewat 24 jam; menjalankan sekarang.')
    putaran()
  } else {
    jadwalkan()
  }

  process.on('SIGTERM', () => clearTimeout(timer))
}

// Tarik artikel KodeNara sekali sehari pukul 03.00 WIB (satu jam setelah
// pencadangan, supaya keduanya tidak berebut koneksi database).
//
// Kegagalan TIDAK menghentikan apa pun: konten yang sudah tersimpan tetap
// tayang, dan putaran berikutnya mencoba lagi. Ini beda dengan pencadangan
// yang kegagalannya perlu terlihat keras.
if (env.kodenaraHarian !== false) {
  let timerKonten = null

  async function putaranKonten() {
    try {
      const hasil = await kodenara.sekali()
      console.log(
        `Konten KodeNara: ${hasil.disimpan} disimpan, ${hasil.dilewati} dilewati ` +
          `dari ${hasil.diperiksa} artikel.`,
      )
    } catch (salah) {
      console.error('Penarikan konten KodeNara gagal:', salah.message)
    } finally {
      timerKonten = setTimeout(putaranKonten, msKeBerikutnyaWib(3))
      timerKonten.unref?.()
    }
  }

  timerKonten = setTimeout(putaranKonten, msKeBerikutnyaWib(3))
  timerKonten.unref?.()
  process.on('SIGTERM', () => clearTimeout(timerKonten))
}
