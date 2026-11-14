// Cek Perkembangan Anak: wali mencari balita dengan nama + NIK, lalu membaca
// riwayat kunjungan yang sudah divalidasi. Sesi wali sengaja TERPISAH dari
// sesi petugas: cookie sendiri, bukan baris di `pengguna`, dan hanya memegang
// satu balita_id. Tidak ada jalur dari sini ke /balita atau /sinkron.

const express = require('express')
const { satu, banyak } = require('../db/pool')
const { buatToken, hashToken } = require('../domain/keamanan')
const { dekripsi } = require('../domain/rahasia')
const cookie = require('../domain/sesi-cookie')

const router = express.Router()
const NAMA_KUKI = 'posyandu_wali'
const POLA_NIK = /^\d{16}$/
const MENIT_SESI = 30
const BATAS_GAGAL = 5
const MENIT_KUNCI = 15

// ponytail: penghitung di memori satu proses, sama seperti /masuk. Pindahkan
// ke tabel bila server nanti berjalan lebih dari satu proses.
const gagal = new Map()

function kunci(nama, ip) {
  return `${String(nama).trim().toLowerCase()}|${ip || '-'}`
}

function daftarGagal(nama, ip) {
  const batas = Date.now() - MENIT_KUNCI * 60_000
  return (gagal.get(kunci(nama, ip)) || []).filter((w) => w > batas)
}

function terkunci(nama, ip) {
  return daftarGagal(nama, ip).length >= BATAS_GAGAL
}

function catatGagal(nama, ip) {
  gagal.set(kunci(nama, ip), [...daftarGagal(nama, ip), Date.now()])
}

/** NIK tersimpan bisa ciphertext (admin/demo) atau polos (sinkron kader lama). */
function cocokNik(tersimpan, dicari) {
  return String(dekripsi(tersimpan) ?? '') === String(dicari)
}

/** Statistik turunan dari kunjungan berurutan. Murni supaya bisa diuji. */
function ringkasanDari(baris) {
  const ukur = baris.filter((b) => b.berat_kg != null)
  const terakhir = ukur.at(-1) ?? null
  const sebelumnya = ukur.at(-2) ?? null
  const mundur = [...baris].reverse()
  return {
    jumlah_kunjungan: baris.length,
    berat_terakhir_kg: terakhir?.berat_kg ?? null,
    tinggi_terakhir_cm: mundur.find((b) => b.tinggi_cm != null)?.tinggi_cm ?? null,
    status_gizi_terakhir: mundur.find((b) => b.status_gizi)?.status_gizi ?? null,
    perubahan_berat_kg: terakhir && sebelumnya
      ? Number((Number(terakhir.berat_kg) - Number(sebelumnya.berat_kg)).toFixed(2))
      : null,
  }
}

/** Balita diambil DARI SESI, bukan dari parameter URL. */
async function sesiWali(minta) {
  const token = cookie.baca(minta, NAMA_KUKI)
  if (!token) return null
  return satu(
    `SELECT aw.id, aw.balita_id, b.nama_lengkap, b.tanggal_lahir,
            b.jenis_kelamin, b.nama_ibu_kandung, ps.nama AS nama_posyandu
     FROM akses_wali aw
     JOIN balita b ON b.id = aw.balita_id AND b.dihapus_pada IS NULL
     LEFT JOIN posyandu ps ON ps.id = b.posyandu_id
     WHERE aw.token_hash = $1 AND aw.dicabut_pada IS NULL
       AND aw.kadaluarsa_pada > now()`,
    [hashToken(token)],
  )
}

/** Satu hasil saja yang boleh membuka sesi; nama ganda harus memakai NIK. */
function pilihKandidat(kandidat, nik) {
  if (nik) {
    const cocok = kandidat.filter((b) => cocokNik(b.nik, nik))
    return cocok.length === 1 ? cocok[0] : null
  }
  return kandidat.length === 1 ? kandidat[0] : null
}

router.post('/wali/cari', async (minta, balas) => {
  const teks = typeof minta.body?.kunci === 'string' ? minta.body.kunci.trim() : ''
  if (!teks || teks.length > 120) {
    return balas.status(422).json({ detail: 'muatan_tidak_sah' })
  }
  const nik = POLA_NIK.test(teks) ? teks : null
  if (terkunci(teks, minta.ip)) {
    return balas.status(429).json({ detail: 'nama_atau_nik_tidak_cocok' })
  }

  // Nama saja cukup bila hasilnya tunggal. Nama kembar harus memakai NIK.
  // Kegagalan tetap identik supaya halaman ini tidak menjadi direktori balita.
  let kandidat
  if (nik) {
    // NIK disimpan sebagai ciphertext acak, jadi tidak bisa dicocokkan di SQL.
    // ponytail: pindai + dekripsi; ganti dengan kolom hash bila data membesar.
    kandidat = await banyak(
      `SELECT b.id, b.nik FROM balita b WHERE b.dihapus_pada IS NULL`,
    )
  } else {
    kandidat = await banyak(
      `SELECT b.id, b.nik FROM balita b
       WHERE b.dihapus_pada IS NULL AND lower(b.nama_lengkap) = lower($1)
       LIMIT 2`,
      [teks],
    )
  }
  const cocok = pilihKandidat(kandidat, nik)
  if (!cocok) {
    catatGagal(teks, minta.ip)
    return balas.status(401).json({ detail: 'nama_atau_nik_tidak_cocok' })
  }

  gagal.delete(kunci(teks, minta.ip))
  const token = buatToken()
  await satu(
    `INSERT INTO akses_wali (id, balita_id, token_hash, kadaluarsa_pada, dibuat_pada)
     VALUES (gen_random_uuid(), $1, $2, now() + ($3 || ' minutes')::interval, now())`,
    [cocok.id, hashToken(token), String(MENIT_SESI)],
  )
  cookie.set(balas, token, MENIT_SESI, NAMA_KUKI)
  balas.json({ status: 'cocok', waktu_server: new Date().toISOString() })
})

router.get('/wali/riwayat', async (minta, balas) => {
  const sesi = await sesiWali(minta)
  if (!sesi) return balas.status(401).json({ detail: 'butuh_cari_ulang' })

  // Whitelist kolom: NIK, alamat/kontak wali, kader, catatan internal, dan
  // kunjungan yang belum diperiksa nakes tidak pernah keluar.
  const baris = await banyak(
    `SELECT k.tanggal_kunjungan, k.usia_bulan, k.status_kehadiran,
            p.berat_kg, p.tinggi_cm, p.lingkar_kepala_cm, p.status_gizi
     FROM kunjungan k
     LEFT JOIN pengukuran p ON p.kunjungan_id = k.id AND p.dihapus_pada IS NULL
     WHERE k.balita_id = $1 AND k.dihapus_pada IS NULL
       AND k.divalidasi_oleh IS NOT NULL
     ORDER BY k.tanggal_kunjungan, k.id LIMIT 200`,
    [sesi.balita_id],
  )
  // Nama dan hubungan wali boleh keluar; NIK, kontak, dan alamat tidak.
  const wali = await banyak(
    `SELECT o.nama_lengkap, bo.hubungan
     FROM balita_orang_tua bo
     JOIN orang_tua o ON o.id = bo.orang_tua_id AND o.dihapus_pada IS NULL
     WHERE bo.balita_id = $1 AND bo.dihapus_pada IS NULL
     ORDER BY bo.kontak_utama DESC NULLS LAST, o.dibuat_pada`,
    [sesi.balita_id],
  )
  balas.json({
    balita: {
      nama_lengkap: sesi.nama_lengkap,
      tanggal_lahir: sesi.tanggal_lahir,
      jenis_kelamin: sesi.jenis_kelamin,
      nama_ibu_kandung: sesi.nama_ibu_kandung ?? null,
      nama_posyandu: sesi.nama_posyandu ?? null,
      wali,
    },
    ringkasan: ringkasanDari(baris),
    kunjungan: baris,
    waktu_server: new Date().toISOString(),
  })
})

router.post('/wali/keluar', async (minta, balas) => {
  const token = cookie.baca(minta, NAMA_KUKI)
  if (token) {
    await satu(
      `UPDATE akses_wali SET dicabut_pada = now()
       WHERE token_hash = $1 AND dicabut_pada IS NULL`,
      [hashToken(token)],
    )
  }
  cookie.hapus(balas, NAMA_KUKI)
  balas.json({ status: 'keluar' })
})

module.exports = router
module.exports.cocokNik = cocokNik
module.exports.pilihKandidat = pilihKandidat
module.exports.ringkasanDari = ringkasanDari
