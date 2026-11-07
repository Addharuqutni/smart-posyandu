// Terima dan kirim perubahan tablet (F-09, F-10).

const express = require('express')
const { satu, banyak, kueri, transaksi } = require('../db/pool')
const {
  terima, periksaRentang, periksaMuatan, TOLAK, TERIMA,
  WAKTU_LEWAT_MASA_DEPAN, KALAH_VERSI, MUATAN_TIDAK_SAH,
} = require('../domain/sinkron')
const { TABEL_SINKRON, siapkan } = require('../domain/tabel')
const { bacaKursor, tulisKursor } = require('../domain/kursor')
const { ambilMentah, sisip, ubah, hapus } = require('../domain/repositori')
const { bangunKueriHalaman } = require('../domain/halaman-sinkron')
const { butuhLogin } = require('../middleware/auth')
const { lahirDiterima, kunjunganDiterima } = require('../domain/usia')

const router = express.Router()

/** Posyandu yang diizinkan pemakai ini. Admin desa/nakes = semua. */
function posyanduDiizinkan(pengguna) {
  return pengguna.peran === 'kader' ? pengguna.posyandu_id : null
}

/** Posyandu pemilik sebuah baris, atau null bila tidak bisa ditentukan. */
async function posyanduBaris(namaTabel, idBaris, muatan) {
  if (namaTabel === 'balita' || namaTabel === 'kunjungan') {
    return muatan?.posyandu_id ?? null
  }
  if (namaTabel === 'pengukuran') {
    const k = await satu(`SELECT posyandu_id FROM kunjungan WHERE id = $1`, [muatan?.kunjungan_id])
    return k?.posyandu_id ?? null
  }
  if (namaTabel === 'tindak_lanjut') {
    const k = await satu(`SELECT posyandu_id FROM kunjungan WHERE id = $1`, [muatan?.kunjungan_id])
    return k?.posyandu_id ?? null
  }
  if (namaTabel === 'balita_orang_tua') {
    const b = await satu(`SELECT posyandu_id FROM balita WHERE id = $1`, [muatan?.balita_id])
    return b?.posyandu_id ?? null
  }
  // orang_tua bukan milik satu Posyandu; kepemilikan lewat balita_orang_tua.
  return null
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
  const idPerangkat = minta.body?.id_perangkat || 'server'
  const toleransi = require('../env').muat().toleransiJam
  const sekarang = new Date()

  const diterima = []
  const ditolak = []

  for (const p of perubahan) {
    const { nama_tabel: namaTabel, id_baris: idBaris, aksi, muatan } = p || {}

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

    const tersimpan = await ambilMentah(namaTabel, idBaris)

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
    if (namaTabel === 'kunjungan') {
      const b = await satu(`SELECT tanggal_lahir FROM balita WHERE id = $1`, [muatan.balita_id])
      const lahir = lahirTersimpan(b?.tanggal_lahir)
      const tanggal = lahirTersimpan(muatan.tanggal_kunjungan)
      if (!lahir || !kunjunganDiterima(lahir, tanggal)) {
        ditolak.push({ id_baris: idBaris, alasan: 'usia_di_luar_rentang' })
        continue
      }
    }

    // Otorisasi kepemilikan: kader hanya boleh menulis ke Posyandunya sendiri.
    // Tanpa ini, kader bisa menitipkan data ke Posyandu lain (bocor lintas unit).
    if (pengguna.peran === 'kader') {
      const posBaris = await posyanduBaris(namaTabel, idBaris, muatan)
      if (posBaris && String(posBaris) !== String(pengguna.posyandu_id)) {
        ditolak.push({ id_baris: idBaris, alasan: 'tidak_diizinkan' })
        continue
      }
      if (tersimpan) {
        const posLama = await posyanduBaris(namaTabel, idBaris, tersimpan)
        if (posLama && String(posLama) !== String(pengguna.posyandu_id)) {
          ditolak.push({ id_baris: idBaris, alasan: 'tidak_diizinkan' })
          continue
        }
      }
    }

    // Kader tidak boleh menyunting yang sudah divalidasi (PRD Bagian 5).
    if (pengguna.peran === 'kader' && tersimpan?.divalidasi_oleh) {
      ditolak.push({ id_baris: idBaris, alasan: 'sudah_divalidasi' })
      continue
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
            await hapus(namaTabel, idBaris, {
              klien, penggunaId: pengguna.id, idPerangkat,
              terjadiPada: muatan.terjadi_pada, ip: minta.ip,
            })
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
    } catch (salah) {
      ditolak.push({ id_baris: idBaris, alasan: MUATAN_TIDAK_SAH })
    }
  }

  balas.json({ diterima, ditolak, waktu_server: sekarang.toISOString() })
})

router.get('/sinkron', butuhLogin, async (minta, balas) => {
  const pengguna = minta.pengguna
  const batas = Math.min(Number(minta.query.batas) || 500, 2000)
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
