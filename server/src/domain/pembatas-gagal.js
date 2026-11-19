// Penghitung percobaan gagal di memori proses, dipakai /masuk dan Cek Anak.
// Bukan untuk tabel: cukup untuk satu proses, pindahkan bila multi-proses.

const BATAS_ENTRI = 20_000

function buatPembatasGagal({ batas, menit, batasEntri = BATAS_ENTRI, sekarang = Date.now }) {
  const gagal = new Map()
  const jendela = menit * 60_000
  const kunci = (nama, ip) => `${String(nama).trim().toLowerCase()}|${ip || '-'}`

  function bersihkanKedaluwarsa(waktu) {
    for (const [k, daftar] of gagal) {
      const segar = daftar.filter((w) => w > waktu - jendela)
      if (segar.length) gagal.set(k, segar)
      else gagal.delete(k)
    }
  }

  function daftar(nama, ip) {
    const k = kunci(nama, ip)
    const segar = (gagal.get(k) || []).filter((w) => w > sekarang() - jendela)
    if (segar.length) gagal.set(k, segar)
    else gagal.delete(k)
    return segar
  }

  return {
    kunci,
    daftar,
    ukuran: () => gagal.size,
    terkunci: (nama, ip) => daftar(nama, ip).length >= batas,
    catat(nama, ip) {
      const k = kunci(nama, ip)
      const waktu = sekarang()
      if (!gagal.has(k) && gagal.size >= batasEntri) {
        bersihkanKedaluwarsa(waktu)
        if (gagal.size >= batasEntri) return false
      }
      const segar = (gagal.get(k) || []).filter((w) => w > waktu - jendela)
      segar.push(waktu)
      gagal.set(k, segar.slice(-batas))
      return true
    },
    hapus(nama, ip) {
      gagal.delete(kunci(nama, ip))
    },
  }
}

module.exports = { buatPembatasGagal }
