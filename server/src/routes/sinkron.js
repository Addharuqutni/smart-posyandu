// Terima dan kirim perubahan tablet (F-09, F-10).

const express = require('express')
const { satu, banyak, kueri, transaksi } = require('../db/pool')
const { enkripsi } = require('../domain/rahasia')
const {
  terima, periksaRentang, periksaMuatan, TOLAK, TERIMA,
  WAKTU_LEWAT_MASA_DEPAN, KALAH_VERSI, MUATAN_TIDAK_SAH,
} = require('../domain/sinkron')
const { TABEL_SINKRON, siapkan } = require('../domain/tabel')
const { bacaKursor, tulisKursor } = require('../domain/kursor')
const { ambilMentah, sisip, ubah, hapus } = require('../domain/repositori')
const { bangunKueriHalaman } = require('../domain/halaman-sinkron')
const { butuhLogin, butuhPosyandu } = require('../middleware/auth')
const { lahirDiterima, kunjunganDiterima } = require('../domain/usia')
const { hapusBalita } = require('../domain/balita')

const router = express.Router()

router.use(butuhPosyandu)

/** Posyandu yang diizinkan pemakai ini. Admin desa/nakes = semua. */
function posyanduDiizinkan(pengguna) {
  return pengguna.peran === 'kader' ? pengguna.posyandu_id : null
}

const samaId = (a, b) => a != null && b != null && String(a) === String(b)

/**
 * Amankan satu perubahan milik kader. `[alasan, muatan]`; muatan yang
 * dikembalikan memakai induk/Posyandu hasil verifikasi basis data, bukan
 * kiriman tablet. `ambil` bisa disuntik untuk uji tanpa DB.
 *
 * `baru.relasi` = petunjuk pasangan (orang_tua_id -> balita_id) dari relasi
 * yang ikut dikirim; `baru.orangTua` = id orang_tua yang sudah diterima dalam
 * permintaan yang sama. Induk tetap diverifikasi dari basis data.
 */
async function amankanKepemilikan(
  namaTabel, idBaris, muatanAwal, tersimpan, pengguna, baru, db = { satu, banyak },
) {
  const { satu: ambilSatu, banyak: ambilBanyak } = db
  const pos = pengguna.posyandu_id
  const muatan = muatanAwal
  const tolak = () => ['tidak_diizinkan', muatan]
  const ambilBalita = async (id) => id
    ? ambilSatu(`SELECT posyandu_id FROM balita WHERE id = $1`, [id])
    : null
  const ambilKunjungan = async (id) => id
    ? ambilSatu(`SELECT posyandu_id FROM kunjungan WHERE id = $1`, [id])
    : null
  const ambilWali = async (id) => id
    ? ambilBanyak(
      `SELECT b.posyandu_id FROM balita_orang_tua bot
         JOIN balita b ON b.id = bot.balita_id
        WHERE bot.orang_tua_id = $1 AND bot.dihapus_pada IS NULL`,
      [id],
    )
    : []
  const waliMilikSendiri = (relasi) => relasi.length > 0 &&
    relasi.every((r) => samaId(r.posyandu_id, pos))

  if (namaTabel === 'balita') {
    if (tersimpan && !samaId(tersimpan.posyandu_id, pos)) return tolak()
    if (muatan.posyandu_id !== undefined && !samaId(muatan.posyandu_id, pos)) return tolak()
    return [null, { ...muatan, posyandu_id: pos }]
  }

  if (namaTabel === 'kunjungan') {
    if (tersimpan && muatan.balita_id !== undefined &&
        !samaId(muatan.balita_id, tersimpan.balita_id)) return tolak()
    const idBalita = tersimpan?.balita_id ?? muatan.balita_id
    const induk = await ambilBalita(idBalita)
    if (!samaId(induk?.posyandu_id, pos)) return tolak()
    if (muatan.posyandu_id !== undefined && !samaId(muatan.posyandu_id, pos)) return tolak()
    return [null, { ...muatan, balita_id: idBalita, posyandu_id: pos }]
  }

  if (namaTabel === 'pengukuran' || namaTabel === 'tindak_lanjut') {
    if (tersimpan && muatan.kunjungan_id !== undefined &&
        !samaId(muatan.kunjungan_id, tersimpan.kunjungan_id)) return tolak()
    const idKunjungan = tersimpan?.kunjungan_id ?? muatan.kunjungan_id
    const induk = await ambilKunjungan(idKunjungan)
    if (!samaId(induk?.posyandu_id, pos)) return tolak()
    return [null, { ...muatan, kunjungan_id: idKunjungan }]
  }

  if (namaTabel === 'balita_orang_tua') {
    if (tersimpan && muatan.balita_id !== undefined &&
        !samaId(muatan.balita_id, tersimpan.balita_id)) return tolak()
    if (tersimpan && muatan.orang_tua_id !== undefined &&
        !samaId(muatan.orang_tua_id, tersimpan.orang_tua_id)) return tolak()
    const idBalita = tersimpan?.balita_id ?? muatan.balita_id
    const induk = await ambilBalita(idBalita)
    if (!samaId(induk?.posyandu_id, pos)) return tolak()
    const idOrangTua = tersimpan?.orang_tua_id ?? muatan.orang_tua_id
    const relasi = await ambilWali(idOrangTua)
    if (waliMilikSendiri(relasi) || (!relasi.length && baru.orangTua.has(String(idOrangTua)))) {
      return [null, { ...muatan, balita_id: idBalita, orang_tua_id: idOrangTua }]
    }
    return tolak()
  }

  // `orang_tua` tidak punya posyandu_id. Baris lama memakai relasi tersimpan;
  // baris baru wajib disertai relasi ke balita milik kader dalam permintaan ini.
  if (tersimpan) {
    return waliMilikSendiri(await ambilWali(idBaris)) ? [null, muatan] : tolak()
  }
  const induk = await ambilBalita(baru.relasi.get(String(idBaris)))
  return samaId(induk?.posyandu_id, pos) ? [null, muatan] : tolak()
}
/**
 * Potongan SQL pembatas posyandu untuk satu tabel, atau '' bila pemakai
 * boleh melihat semua. `nilai` diisi di tempat supaya nomor parameter
 * mengikuti parameter yang sudah ada pada kueri pemanggil.
 *
 * Baris tanpa `posyandu_id` sendiri dilingkup lewat induknya: pengukuran dan
 * tindak_lanjut lewat kunjungan, balita_orang_tua lewat balita, orang_tua
 * lewat balita_orang_tua.
 */
function syaratPosyandu(namaTabel, pos, nilai) {
  if (!pos) return ''
  nilai.push(pos)
  const p = `$${nilai.length}`
  if (namaTabel === 'balita' || namaTabel === 'kunjungan') {
    return ` AND posyandu_id = ${p}`
  }
  if (namaTabel === 'pengukuran' || namaTabel === 'tindak_lanjut') {
    return ` AND kunjungan_id IN (SELECT id FROM kunjungan WHERE posyandu_id = ${p})`
  }
  if (namaTabel === 'balita_orang_tua') {
    return ` AND balita_id IN (SELECT id FROM balita WHERE posyandu_id = ${p})`
  }
  return ` AND id IN (SELECT orang_tua_id FROM balita_orang_tua
           WHERE balita_id IN (SELECT id FROM balita WHERE posyandu_id = ${p}))`
}

router.post('/sinkron', butuhLogin, async (minta, balas) => {
  const pengguna = minta.pengguna
  const perubahan = Array.isArray(minta.body?.perubahan) ? minta.body.perubahan : []
  // Satu permintaan = satu jalur kueri berurutan per baris; badan 1 MB bisa
  // memuat ribuan baris dan menghabiskan koneksi basis data.
  const BATAS_PERUBAHAN = 500
  if (perubahan.length > BATAS_PERUBAHAN) {
    return balas.status(413).json({ detail: 'terlalu_banyak_perubahan', batas: BATAS_PERUBAHAN })
  }
  const idPerangkat = minta.body?.id_perangkat || 'server'
  const toleransi = require('../env').muat().toleransiJam
  const sekarang = new Date()

  const diterima = []
  const ditolak = []
  const baru = { relasi: new Map(), orangTua: new Set() }
  for (const p of perubahan) {
    if (p?.nama_tabel === 'balita_orang_tua' && p.aksi !== 'hapus' &&
        p.muatan?.orang_tua_id && p.muatan?.balita_id) {
      baru.relasi.set(String(p.muatan.orang_tua_id), p.muatan.balita_id)
    }
  }
  for (const p of perubahan) {
    const { nama_tabel: namaTabel, id_baris: idBaris, aksi } = p || {}
    let muatan = p?.muatan

    if (!TABEL_SINKRON.includes(namaTabel)) {
      ditolak.push({ id_baris: idBaris, alasan: 'tabel_tidak_dikenal' })
      continue
    }
    const masalahMuatan = periksaMuatan(namaTabel, muatan)
    if (masalahMuatan) {
      ditolak.push({ id_baris: idBaris, alasan: masalahMuatan })
      continue
    }

    // Tindak lanjut hanya petugas kesehatan.
    if (namaTabel === 'tindak_lanjut' && pengguna.peran !== 'nakes') {
      ditolak.push({ id_baris: idBaris, alasan: 'tidak_diizinkan' })
      continue
    }

    // Menghapus data induk hanya admin desa, sama seperti DELETE HTTP-nya.
    if (aksi === 'hapus' && (namaTabel === 'balita' || namaTabel === 'orang_tua') &&
        pengguna.peran !== 'admin_desa') {
      ditolak.push({ id_baris: idBaris, alasan: 'tidak_diizinkan' })
      continue
    }

    const tersimpan = await ambilMentah(namaTabel, idBaris)

    // Kader hanya boleh menulis baris yang induk/Posyandunya masih miliknya.
    // Muatan yang sudah disanitasi dipakai oleh semua pemeriksaan di bawah.
    if (pengguna.peran === 'kader') {
      const [alasanKepemilikan, muatanAman] = await amankanKepemilikan(
        namaTabel, idBaris, muatan, tersimpan, pengguna, baru,
      )
      if (alasanKepemilikan) {
        ditolak.push({ id_baris: idBaris, alasan: alasanKepemilikan })
        continue
      }
      muatan = muatanAman
    }
    // Batas usia balita 0 hari s.d. 7 tahun. Baris lama (mis. sudah tidak
    // aktif) tetap boleh disunting/dihapus agar riwayatnya tidak macet di
    // antrean sinkron; yang dilarang adalah memasukkan usia baru yang salah.
    const tanggalServer = sekarang.toISOString().slice(0, 10)
    const lahirTersimpan = (t) => typeof t === 'string'
      ? t.slice(0, 10) : t?.toISOString?.().slice(0, 10)
    if (namaTabel === 'balita') {
      const lahir = siapkan(namaTabel, muatan).tanggal_lahir ?? lahirTersimpan(tersimpan?.tanggal_lahir)
      if (!lahir || (muatan.tanggal_lahir !== undefined && !lahirDiterima(lahir, tanggalServer))) {
        ditolak.push({ id_baris: idBaris, alasan: 'usia_di_luar_rentang' })
        continue
      }
    }
    // NIK selalu tersimpan terenkripsi. Wajib 16 digit hanya untuk balita
    // (membedakan nama kembar); NIK wali opsional.
    if (namaTabel === 'balita' || namaTabel === 'orang_tua') {
      const nikMasuk = muatan.nik
      if (!tersimpan && namaTabel === 'balita' && !/^\d{16}$/.test(String(nikMasuk ?? ''))) {
        ditolak.push({ id_baris: idBaris, alasan: 'nik_wajib_16_digit' })
        continue
      }
      if (nikMasuk == null || nikMasuk === '') {
        // salinan tablet lama mengirim `nik: null`; jangan menimpa ciphertext.
        if (tersimpan) {
          muatan = { ...muatan }
          delete muatan.nik
        }
      } else if (/^\d{16}$/.test(String(nikMasuk))) {
        muatan = { ...muatan, nik: enkripsi(nikMasuk) }
      } else {
        ditolak.push({ id_baris: idBaris, alasan: 'nik_wajib_16_digit' })
        continue
      }
    }
    if (namaTabel === 'balita' && !tersimpan) {
      const posBaru = siapkan(namaTabel, muatan).posyandu_id
      const pos = posBaru ? await satu(
        `SELECT id FROM posyandu WHERE id = $1 AND dihapus_pada IS NULL`,
        [posBaru],
      ) : null
      if (!pos) {
        ditolak.push({ id_baris: idBaris, alasan: 'posyandu_tidak_ditemukan' })
        continue
      }
    }
    // Pembatalan kunjungan hanya mengirim { id, terjadi_pada }: tidak ada usia
    // baru yang masuk, jadi cek usia dilewati. Tanpa ini setiap "Batalkan
    // pencatatan" ditolak `usia_di_luar_rentang` dan tertahan selamanya.
    if (namaTabel === 'kunjungan' && aksi !== 'hapus') {
      const b = await satu(`SELECT tanggal_lahir FROM balita WHERE id = $1`, [muatan.balita_id])
      const lahir = lahirTersimpan(b?.tanggal_lahir)
      const tanggal = lahirTersimpan(muatan.tanggal_kunjungan)
      if (!lahir || !kunjunganDiterima(lahir, tanggal)) {
        ditolak.push({ id_baris: idBaris, alasan: 'usia_di_luar_rentang' })
        continue
      }
    }

    // Kader tidak boleh menyunting/menghapus yang sudah divalidasi (PRD 5).
    // `pengukuran`/`tindak_lanjut` mewarisi status dari kunjungannya.
    if (pengguna.peran === 'kader') {
      let divalidasi = Boolean(tersimpan?.divalidasi_oleh)
      if (!divalidasi && (namaTabel === 'pengukuran' || namaTabel === 'tindak_lanjut')) {
        const k = await satu(`SELECT divalidasi_oleh FROM kunjungan WHERE id = $1`, [
          muatan?.kunjungan_id ?? tersimpan?.kunjungan_id,
        ])
        divalidasi = Boolean(k?.divalidasi_oleh)
      }
      if (divalidasi) {
        ditolak.push({ id_baris: idBaris, alasan: 'sudah_divalidasi' })
        continue
      }
    }

    // Rentang wajar (F-11) diperiksa sebelum keputusan benturan.
    const melanggar = periksaRentang(muatan)
    if (melanggar.length) {
      ditolak.push({ id_baris: idBaris, alasan: 'di_luar_rentang', kolom: melanggar })
      continue
    }

    const [keputusan, alasan] = terima(tersimpan, muatan, toleransi, sekarang)
    if (keputusan === TOLAK) {
      const jawab = { id_baris: idBaris, alasan }
      if (alasan === KALAH_VERSI && tersimpan?.terjadi_pada) {
        jawab.terjadi_pada_tersimpan = tersimpan.terjadi_pada
      }
      ditolak.push(jawab)
      continue
    }

    try {
      await transaksi(async (klien) => {
        if (aksi === 'hapus') {
          if (tersimpan) {
            const meta = {
              klien, penggunaId: pengguna.id, idPerangkat,
              terjadiPada: muatan.terjadi_pada, ip: minta.ip,
            }
            // Balita menghapus turunannya; tabel lain cukup barisnya sendiri.
            if (namaTabel === 'balita') await hapusBalita(klien, idBaris, meta)
            else await hapus(namaTabel, idBaris, meta)
          }
        } else if (tersimpan) {
          await ubah(namaTabel, idBaris, siapkan(namaTabel, muatan), {
            klien, penggunaId: pengguna.id, idPerangkat,
            terjadiPada: muatan.terjadi_pada, ip: minta.ip,
          })
        } else {
          await sisip(namaTabel, muatan, {
            klien, penggunaId: pengguna.id, idPerangkat, ip: minta.ip,
          })
        }
      })
      diterima.push(idBaris)
      if (namaTabel === 'orang_tua' && !tersimpan) baru.orangTua.add(String(idBaris))
    } catch (salah) {
      ditolak.push({ id_baris: idBaris, alasan: MUATAN_TIDAK_SAH })
    }
  }

  balas.json({ diterima, ditolak, waktu_server: sekarang.toISOString() })
})

router.get('/sinkron', butuhLogin, async (minta, balas) => {
  const pengguna = minta.pengguna
  const batas = Math.min(Math.max(Math.floor(Number(minta.query.batas)) || 500, 1), 2000)
  const pos = posyanduDiizinkan(pengguna)
  const kursor = bacaKursor(minta.query.sejak)

  // Kursor = diperbarui_pada (waktu server), bukan terjadi_pada.
  // Diikat ke (waktu, tabel, id) karena banyak baris bisa berbagi cap waktu
  // yang sama persis (mis. satu transaksi menyisipkan beberapa tabel).
  //
  // Seluruh halaman diambil lewat satu kueri: tiap tabel dibaca berurutan
  // lewat indeks (diperbarui_pada, id) dengan LIMIT per cabang, lalu digabung
  // dan diurutkan sekali. Lihat domain/halaman-sinkron.js untuk riwayat dua
  // kesalahan yang sudah diukur di sini.
  const { sql, param } = bangunKueriHalaman({
    tabel: TABEL_SINKRON,
    kursor,
    batas,
    pos,
    syaratPosyandu,
  })
  const halaman = (await banyak(sql, param)).slice(0, batas)

  const perubahan = []
  let berikutnya = null
  for (const { tabel: namaTabel, baris: b, waktu_teks: waktuTeks, dihapus } of halaman) {
    // Kolom yang dibuang itu dibawa sebagai kolom terpisah oleh penyusun
    // kueri, jadi tidak perlu lagi dihapus dari `muatan` di sini.
    const isi = { ...b }

    // NIK tidak pernah dikirim ke tablet (AGENTS Bagian 6).
    if ('nik' in isi) isi.nik = null

    // `to_jsonb` mengembalikan waktu sebagai teks dengan offset zona server,
    // sedangkan sebelumnya berupa objek Date. Bentuk keluaran diseragamkan
    // lagi jadi UTC ("...Z") supaya tablet yang sudah beredar tidak melihat
    // perubahan bentuk yang tidak perlu.
    for (const [k, v] of Object.entries(isi)) {
      if (typeof v !== 'string') continue
      if (k.startsWith('tanggal')) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const d = new Date(v)
          if (!Number.isNaN(d.getTime())) isi[k] = d.toISOString().slice(0, 10)
        }
      } else if (k.endsWith('_pada')) {
        const d = new Date(v)
        if (!Number.isNaN(d.getTime())) isi[k] = d.toISOString()
      }
    }

    perubahan.push({
      nama_tabel: namaTabel,
      id_baris: isi.id,
      aksi: dihapus ? 'hapus' : 'ubah',
      versi: isi.versi ?? 1,
      terjadi_pada: isi.terjadi_pada,
      dihapus_pada: dihapus ? new Date(dihapus).toISOString() : null,
      muatan: isi,
    })

    // `waktuTeks` sudah ISO bermikrodetik dalam UTC, jadi ditulis apa adanya;
    // lewat `new Date()` presisinya akan menyusut ke milidetik.
    berikutnya = `${waktuTeks}|${namaTabel}|${b.id}`
  }

  // Kursor dikirim setiap kali ada baris, termasuk pada halaman terakhir.
  // Klien menyimpan kursor ini lalu meminta sekali lagi; jawaban kosong
  // dengan `berikutnya: null` yang menandakan selesai. Tanpa ini, halaman
  // terakhir diunduh ulang pada setiap sinkronisasi.
  // Halaman kosong = akhir tarikan. Sertakan jumlah baris server agar tablet
  // bisa mendeteksi salinan lokal yang tidak akan pernah lengkap.
  // ponytail: ~250 ms sekali per putaran sinkron (hitung penuh per tabel).
  // Bila ini terasa, hitung hanya `balita` atau simpan rekap di cache.
  let jumlah = null
  if (!halaman.length) {
    // Hanya balita yang dicek klien sebagai salinan basi, jadi cukup balita.
    // Menghitung empat tabel lainnya tadi menambah ~250 ms per putaran sinkron.
    const nilai = []
    jumlah = {
      balita: (await satu(
        `SELECT count(*)::int AS n FROM balita WHERE TRUE${syaratPosyandu('balita', pos, nilai)}`,
        nilai,
      )).n,
    }
  }

  balas.json({
    perubahan,
    waktu_server: new Date().toISOString(),
    berikutnya,
    jumlah,
  })
})

module.exports = router
module.exports.syaratPosyandu = syaratPosyandu
module.exports.amankanKepemilikan = amankanKepemilikan
