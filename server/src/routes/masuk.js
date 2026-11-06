// Masuk, keluar, dan identitas sesi (F-01, ARSITEKTUR 5).

const express = require('express')
const { satu } = require('../db/pool')
const { sandiCocok, buatToken, hashToken } = require('../domain/keamanan')
const { muatPengguna, tokenSesi } = require('../middleware/auth')
const cookie = require('../domain/sesi-cookie')
const env = require('../env')
const { catatAktivitas } = require('../domain/aktivitas')

const router = express.Router()

// Penghitung percobaan disimpan di memori proses. Cukup untuk satu VPS satu
// proses; bila nanti lebih dari satu proses, pindahkan ke tabel.
//
// Dikunci per (nama + alamat IP): penyerang tidak bisa mengunci akun orang lain
// hanya dengan menebak nama pengguna, dan tidak bisa menghindari batas dengan
// mengganti huruf besar-kecil.
const gagal = new Map()
const BATAS_GAGAL = 5
const MENIT_KUNCI = 15

function kunciPercobaan(nama, ip) {
  return `${String(nama).trim().toLowerCase()}|${ip || '-'}`
}

function masihTerkunci(nama, ip) {
  const kunci = kunciPercobaan(nama, ip)
  const batas = Date.now() - MENIT_KUNCI * 60_000
  const daftar = (gagal.get(kunci) || []).filter((w) => w > batas)
  gagal.set(kunci, daftar)
  return daftar.length >= BATAS_GAGAL
}

function catatGagal(nama, ip) {
  const kunci = kunciPercobaan(nama, ip)
  const daftar = gagal.get(kunci) || []
  daftar.push(Date.now())
  gagal.set(kunci, daftar)
}

function hapusGagal(nama, ip) {
  gagal.delete(kunciPercobaan(nama, ip))
}

router.post('/masuk', async (minta, balas) => {
  const { nama_pengguna, kata_sandi, id_perangkat } = minta.body || {}
  const ip = minta.ip
  if (typeof nama_pengguna !== 'string' || typeof kata_sandi !== 'string' ||
      typeof id_perangkat !== 'string' ||
      !nama_pengguna || !kata_sandi || !id_perangkat) {
    return balas.status(422).json({ detail: 'muatan_tidak_lengkap' })
  }
  if (nama_pengguna.length > 50 || kata_sandi.length > 128 || id_perangkat.length > 80) {
    return balas.status(422).json({ detail: 'muatan_tidak_lengkap' })
  }

  if (masihTerkunci(nama_pengguna, ip)) {
    return balas
      .status(429)
      .json({ detail: { rincian: 'terkunci_sementara', menit: MENIT_KUNCI } })
  }

  const baris = await satu(
    `SELECT id, nama_pengguna, nama_lengkap, peran, posyandu_id, hash_kata_sandi
     FROM pengguna
     WHERE nama_pengguna = $1 AND dihapus_pada IS NULL AND aktif = TRUE`,
    [nama_pengguna],
  )

  const cocok = baris ? await sandiCocok(baris.hash_kata_sandi, kata_sandi) : false
  if (!baris || !cocok) {
    catatGagal(nama_pengguna, ip)
    // Percobaan gagal juga jejak keamanan: admin perlu melihat tebakan sandi.
    // Nama yang dicoba disimpan, kata sandinya tidak pernah.
    await catatAktivitas({
      idPerangkat: id_perangkat,
      aksi: 'gagal_masuk',
      rincian: { nama_pengguna, alasan: baris ? 'kata_sandi_salah' : 'akun_tidak_ada' },
      ip,
    }).catch(() => {})
    return balas.status(401).json({ detail: 'nama_pengguna_atau_kata_sandi_salah' })
  }
  hapusGagal(nama_pengguna, ip)

  const pengaturan = env.muat()
  const menit =
    baris.peran === 'admin_desa' ? pengaturan.menitSesiAdmin : pengaturan.menitSesiTablet
  const token = buatToken()
  const sesi = await satu(
    `INSERT INTO sesi_login
       (id, pengguna_id, token_hash, id_perangkat, dibuat_pada, kadaluarsa_pada)
     VALUES (gen_random_uuid(), $1, $2, $3, now(), now() + ($4 || ' minutes')::interval)
     RETURNING id`,
    [baris.id, hashToken(token), id_perangkat, String(menit)],
  )
  await catatAktivitas({
    penggunaId: baris.id,
    idPerangkat: id_perangkat,
    aksi: 'masuk',
    barisId: sesi?.id,
    rincian: { peran: baris.peran },
    ip,
  })
  // Token hanya lewat cookie HttpOnly; badan balasan tidak lagi memuatnya.
  cookie.set(balas, token, menit)

  let namaPosyandu = null
  if (baris.posyandu_id) {
    const pos = await satu(`SELECT nama FROM posyandu WHERE id = $1`, [baris.posyandu_id])
    namaPosyandu = pos?.nama ?? null
  }

  balas.json({
    pengguna: {
      id: baris.id,
      nama_pengguna: baris.nama_pengguna,
      nama_lengkap: baris.nama_lengkap,
      peran: baris.peran,
      posyandu_id: baris.posyandu_id ?? null,
      nama_posyandu: namaPosyandu,
    },
    waktu_server: new Date().toISOString(),
  })
})

router.get('/saya', muatPengguna, (minta, balas) => {
  if (!minta.pengguna) return balas.status(401).json({ detail: 'butuh_masuk' })
  balas.json({ pengguna: minta.pengguna, waktu_server: new Date().toISOString() })
})

router.post('/keluar', muatPengguna, async (minta, balas) => {
  const token = tokenSesi(minta)
  if (token) {
    const sesi = await satu(
      `UPDATE sesi_login SET dicabut_pada = now()
       WHERE token_hash = $1 AND dicabut_pada IS NULL
       RETURNING id, id_perangkat`,
      [hashToken(token)],
    )
    if (sesi) {
      await catatAktivitas({
        penggunaId: minta.pengguna?.id ?? null,
        idPerangkat: sesi.id_perangkat,
        aksi: 'keluar',
        barisId: sesi.id,
        rincian: { peran: minta.pengguna?.peran ?? null },
        ip: minta.ip,
      }).catch(() => {})
    }
  }
  cookie.hapus(balas)
  balas.status(204).send()
})

module.exports = router
