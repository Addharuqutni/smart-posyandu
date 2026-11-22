// Mesin sinkron: kirim antrean, lalu tarik perubahan sejak kursor tersimpan.
// Semua tulisan lokal sudah aman sebelum fungsi ini dipanggil; kegagalan
// jaringan hanya menunda pengiriman, tidak membatalkan apa pun.

import { db } from '../penyimpanan/db.js'
import { GagalJaringan, galatSementara, kirimSinkron, tarikSinkron } from '../jaringan/api.js'
import { sekarangIso } from './waktu.js'
import { dekripsiNik } from './nik.js'

const KUNCI_KURSOR = 'kursor_sinkron'
const KUNCI_WAKTU = 'sinkron_terakhir'
const KUNCI_SELISIH = 'selisih_jam_detik'

export async function ambilPenanda() {
  const [kursor, waktu, selisih] = await Promise.all([
    db.penyiapan.get(KUNCI_KURSOR),
    db.penyiapan.get(KUNCI_WAKTU),
    db.penyiapan.get(KUNCI_SELISIH),
  ])
  return {
    kursor: kursor?.nilai ?? null,
    terakhir: waktu?.nilai ?? null,
    selisihDetik: selisih?.nilai ?? null,
  }
}

/**
 * Jalankan satu putaran sinkron.
 * @returns {{luring:boolean, galat?:string, terkirim:number, ditolak:number, ditarik:number}}
 */
export async function jalankanSinkron(idPerangkat, pemilikId = null) {
  const semua = await db.antrean_sinkron.where('status').equals('menunggu').toArray()
  const antrean = semua.filter((a) => pemilikId == null || a.pemilik_id === pemilikId)
  const hasil = { luring: false, terkirim: 0, ditolak: 0, ditarik: 0 }
  const kalahVersi = []

  if (antrean.length) {
    // Server menolak lebih dari 500 perubahan per permintaan (413), dan
    // `express.json` 1 MB juga membatasi. Kirim bergelombang.
    const BATAS_KIRIM = 200
    for (let i = 0; i < antrean.length; i += BATAS_KIRIM) {
      const potong = antrean.slice(i, i + BATAS_KIRIM)
      const perubahan = []
      for (const a of potong) {
        const muatan = { ...a.muatan }
        if (muatan.nik_terenkripsi) {
          muatan.nik = await dekripsiNik(muatan.nik_terenkripsi)
          delete muatan.nik_terenkripsi
        }
        perubahan.push({
          nama_tabel: a.nama_tabel,
          id_baris: a.id_baris,
          aksi: a.aksi,
          versi: a.versi,
          terjadi_pada: a.terjadi_pada,
          muatan,
        })
      }

      let balasan
      try {
        balasan = await kirimSinkron({
          id_perangkat: idPerangkat,
          perubahan,
        })
      } catch (salah) {
        if (salah instanceof GagalJaringan) return { ...hasil, luring: true }
        if (galatSementara(salah)) return { ...hasil, luring: true, galat: 'sementara' }
        throw salah
      }
      kalahVersi.push(...(await selesaikanAntrean(potong, balasan)))
      hasil.terkirim += balasan.diterima.length
      hasil.ditolak += balasan.ditolak.length
      await simpanPenanda(KUNCI_SELISIH, selisihDetik(balasan.waktu_server))
    }
  }

  let sejak = (await db.penyiapan.get(KUNCI_KURSOR))?.nilai ?? null
  // Jangan batasi jumlah halaman. Dulu berhenti diam-diam di halaman ke-100
  // (50.000 baris) lalu penyiapan tetap ditandai selesai, sehingga tablet
  // hanya punya sebagian data tanpa tanda apa pun. Bila server terus
  // mengirim kursor, teruskan sampai habis.
  let halaman = 0
  for (;;) {
    let balasan
    try {
      balasan = await tarikSinkron(sejak)
    } catch (salah) {
      if (salah instanceof GagalJaringan) return { ...hasil, luring: true }
      if (galatSementara(salah)) return { ...hasil, luring: true, galat: 'sementara' }
      throw salah
    }
    await terapkan(balasan.perubahan)
    hasil.ditarik += balasan.perubahan.length
    await simpanPenanda(KUNCI_WAKTU, balasan.waktu_server)
    if (!balasan.berikutnya) {
      // Tarikan selesai. Bandingkan jumlah balita dengan server: salinan lokal
      // bisa ketinggalan baris lama, atau kelebihan baris karena server
      // di-reset. Sinkron tambahan tidak akan pernah memperbaiki dua-duanya.
      // Hanya di halaman pertama supaya tidak berputar tanpa henti.
      const keadaan = await keadaanSalinan(balasan.jumlah)
      if (keadaan && halaman === 0) {
        if (keadaan === 'lebih') await buangSalinan()
        await simpanPenanda(KUNCI_KURSOR, null)
        sejak = null
        halaman += 1
        continue
      }
      break
    }
    sejak = balasan.berikutnya
    halaman += 1
    await simpanPenanda(KUNCI_KURSOR, sejak)
  }
  // Antrean kalah_versi baru dibuang setelah tarikan tuntas. Bila tarikan
  // gagal, antrean tetap utuh untuk putaran berikutnya.
  if (kalahVersi.length) await db.antrean_sinkron.bulkDelete(kalahVersi)
  return hasil
}

async function selesaikanAntrean(antrean, balasan) {
  const diterima = new Set(balasan.diterima)
  const tolak = new Map(balasan.ditolak.map((t) => [t.id_baris, t]))
  const waktuServer = Date.parse(balasan.waktu_server ?? '')
  const selisih = Number.isFinite(waktuServer) ? Date.now() - waktuServer : 0
  const disesuaikan = []
  const dipulihkan = []
  const kalahVersi = []

  await db.transaction('rw', db.antrean_sinkron, async () => {
    for (const a of antrean) {
      if (diterima.has(a.id_baris)) {
        await db.antrean_sinkron.delete(a.urut)
        continue
      }

      const alasan = tolak.get(a.id_baris)
      if (
        (alasan?.alasan === 'sudah_divalidasi' || alasan?.alasan === 'tidak_diizinkan') &&
        a.sebelum
      ) {
        // Suntingan tidak diterima: jangan tampilkan nilai yang tidak ada di server.
        dipulihkan.push({ nama_tabel: a.nama_tabel, id_baris: a.id_baris, baris: a.sebelum })
      }
      if (alasan?.alasan === 'kalah_versi') {
        // Server punya versi lebih baru. Tarikan yang tuntas akan menimpa
        // lokal; sampai saat itu antrean ini tetap menunggu, bukan hilang.
        await db.antrean_sinkron.update(a.urut, {
          status: 'menunggu',
          pesan_gagal: 'kalah_versi',
        })
        kalahVersi.push(a.urut)
        continue
      }

      if (
        alasan?.alasan === 'waktu_lewat_masa_depan' &&
        Number.isFinite(selisih) &&
        (a.jumlah_coba ?? 0) < 2
      ) {
        // Jam tablet di depan server. Geser ke waktu server, coba lagi.
        // Tanpa ini, catatan kader berhenti selamanya di antrean.
        const waktu = new Date(new Date(a.terjadi_pada).getTime() - selisih - 1000)
        if (Number.isFinite(waktu.getTime())) {
          const iso = waktu.toISOString()
          const muatan = { ...a.muatan, terjadi_pada: iso }
          await db.antrean_sinkron.update(a.urut, {
            status: 'menunggu',
            jumlah_coba: (a.jumlah_coba ?? 0) + 1,
            pesan_gagal: 'waktu_disesuaikan',
            terjadi_pada: iso,
            muatan,
          })
          disesuaikan.push({ nama_tabel: a.nama_tabel, id_baris: a.id_baris, iso })
          continue
        }
      }

      await db.antrean_sinkron.update(a.urut, {
        status: 'gagal',
        jumlah_coba: (a.jumlah_coba ?? 0) + 1,
        pesan_gagal: alasan?.alasan ?? 'tidak_dikenal',
      })
    }
  })

  for (const d of disesuaikan) {
    const tabel = db[d.nama_tabel]
    if (!tabel) continue
    const lokal = await tabel.get(d.id_baris)
    if (lokal) {
      await tabel.put({ ...lokal, terjadi_pada: d.iso, diperbarui_pada: d.iso })
    }
  }
  for (const d of dipulihkan) {
    const tabel = db[d.nama_tabel]
    if (tabel) await tabel.put(d.baris)
  }
  return kalahVersi
}

/**
 * Terapkan perubahan dari server. Aturan sama dengan server: menang bila
 * `terjadi_pada` masuk >= yang tersimpan lokal (AGENTS 2.4).
 *
 * Ditulis berkelompok per tabel: satu `bulkGet` lalu satu `bulkPut`. Versi
 * sebelumnya membaca dan menulis satu baris per transaksi, sehingga tarikan
 * awal 180.000 baris butuh puluhan detik.
 */
export async function terapkan(perubahan) {
  const perTabel = new Map()
  for (const p of perubahan) {
    if (!db[p.nama_tabel]) continue
    if (!perTabel.has(p.nama_tabel)) perTabel.set(p.nama_tabel, [])
    perTabel.get(p.nama_tabel).push(p)
  }

  for (const [namaTabel, daftar] of perTabel) {
    const tabel = db[namaTabel]
    const id = daftar.map((p) => p.id_baris)
    const lokal = await tabel.bulkGet(id)
    const petaLokal = new Map()
    lokal.forEach((baris, i) => {
      if (baris) petaLokal.set(id[i], baris)
    })

    const akanDitulis = []
    for (const p of daftar) {
      const ada = petaLokal.get(p.id_baris)
      const masuk = new Date(p.terjadi_pada).getTime()
      const lama = ada?.terjadi_pada ? new Date(ada.terjadi_pada).getTime() : -Infinity
      if (ada && masuk < lama) continue

      if (p.aksi === 'hapus' || p.dihapus_pada) {
        akanDitulis.push({
          ...(ada ?? { id: p.id_baris }),
          ...p.muatan,
          id: p.id_baris,
          dihapus_pada: p.dihapus_pada ?? p.muatan?.dihapus_pada ?? sekarangIso(),
        })
      } else {
        akanDitulis.push({ ...p.muatan, id: p.id_baris })
      }
    }

    if (akanDitulis.length) await tabel.bulkPut(akanDitulis)
  }
}

function selisihDetik(waktuServer) {
  return Math.round((Date.now() - new Date(waktuServer).getTime()) / 1000)
}

async function simpanPenanda(kunci, nilai) {
  await db.penyiapan.put({ kunci, nilai })
}

/** Hapus semua data lokal (dipakai saat uji dan saat keluar perangkat). */
export async function kosongkan() {
  await db.delete()
  await db.open()
}

/**
 * Hapus HANYA salinan 6 tabel data, biarkan antrean dan penanda utuh.
 *
 * Dipakai bila server punya lebih sedikit balita daripada tablet — artinya
 * basis data server di-reset atau dicadangkan ke titik lebih awal, dan salinan
 * lama tidak akan pernah dihapus lewat sinkron tambahan (sinkron hanya menarik
 * perubahan SEJAK kursor, tidak pernah berkata "baris ini tidak ada lagi").
 * `kosongkan()` tidak dipakai di sini karena ia ikut membuang antrean gagal dan
 * penyiapan, yang bisa berisi catatan warga yang belum sempat terkirim.
 */
async function buangSalinan() {
  await db.transaction('rw', [
    db.balita, db.orang_tua, db.balita_orang_tua,
    db.kunjungan, db.pengukuran, db.tindak_lanjut,
  ], async () => {
    await Promise.all([
      db.balita.clear(), db.orang_tua.clear(), db.balita_orang_tua.clear(),
      db.kunjungan.clear(), db.pengukuran.clear(), db.tindak_lanjut.clear(),
    ])
  })
}

/**
 * Bandingkan jumlah balita di tablet dengan server.
 *   'kurang' -> tablet ketinggalan baris lama; tarik ulang dari awal.
 *   'lebih'  -> server di-reset; buang salinan lalu tarik ulang dari awal.
 *   null     -> sudah cocok.
 * Hanya `balita` yang diperiksa: bila daftar balita tidak cocok, kader tidak
 * bisa menemukan anak yang seharusnya muncul — itu kegagalan yang paling
 * merugikan dan paling mudah dihitung, dan 6 tabel lainnya mengikuti balita.
 */
async function keadaanSalinan(jumlahServer) {
  const harus = Number(jumlahServer?.balita)
  if (!Number.isFinite(harus)) return null
  const punya = await db.balita.count()
  if (punya < harus) return 'kurang'
  if (punya === harus) return null
  // Tablet wajar UNGGUL dari server saat antrean belum terkirim; itu bukan
  // tanda server di-reset. Tanpa koreksi ini, mengisi 100 balita luring lalu
  // menekan sinkron menghapus salinan lokal yang belum terkirim.
  const menunggu = await db.antrean_sinkron
    .filter((a) => a.nama_tabel === 'balita' && a.aksi !== 'hapus')
    .count()
  return punya - harus > menunggu ? 'lebih' : null
}
