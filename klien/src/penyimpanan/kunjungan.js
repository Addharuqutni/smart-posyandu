import { db } from '../penyimpanan/db.js'
import { idBaru, sekarangIso, usiaBulan, batasKunjungan } from '../logika/waktu.js'
import { LABEL, periksaRentang } from '../logika/rentang.js'

/**
 * Kunjungan hidup milik balita ini pada tanggal yang sama, atau null.
 *
 * Server sudah punya indeks unik (balita_id, tanggal_kunjungan), tetapi tanpa
 * pemeriksaan di tablet kader baru tahu setelah sinkron gagal — dan baris yang
 * ditolak tertahan di antrean. Mengetahui lebih awal memungkinkan peringatan
 * sebelum data masuk.
 */
export async function kunjunganPadaTanggal(balitaId, tanggal) {
  const daftar = await db.kunjungan
    .where('balita_id')
    .equals(balitaId)
    .filter((k) => !k.dihapus_pada && String(k.tanggal_kunjungan).slice(0, 10) === tanggal)
    .toArray()
  return daftar[0] ?? null
}

/**
 * Simpan satu kunjungan lengkap ke IndexedDB DAN antrean sinkron dalam satu
 * transaksi. Tanpa jaringan pun ini berhasil — itu inti aplikasi (AGENTS 2.1).
 *
 * Melempar Error dengan pesan yang bisa ditampilkan bila nilai di luar rentang.
 * `izinkanGanda` hanya dipakai setelah kader menyetujui peringatan bahwa
 * balita ini sudah punya kunjungan pada tanggal yang sama.
 */
export async function simpanKunjungan({
  balita,
  idPerangkat,
  tanggal,
  izinkanGanda = false,
  berat_kg,
  tinggi_cm,
  lingkar_kepala_cm,
  cara_ukur_tinggi = 'terlentang',
  status_kehadiran = 'hadir',
  catatan = null,
  pemilik_id = null,
}) {
  const tidakHadir = status_kehadiran === 'tidak_hadir'
  const ukur = {
    berat_kg: berat_kg === '' || berat_kg == null ? null : Number(berat_kg),
    tinggi_cm: tinggi_cm === '' || tinggi_cm == null ? null : Number(tinggi_cm),
    lingkar_kepala_cm:
      lingkar_kepala_cm === '' || lingkar_kepala_cm == null ? null : Number(lingkar_kepala_cm),
  }
  if (!tidakHadir && !ukur.berat_kg) throw new Error('Berat wajib diisi.')
  const salah = tidakHadir ? [] : periksaRentang(ukur)
  if (salah.length) {
    throw new Error(`${salah.map((k) => LABEL[k]).join(', ')} di luar rentang wajar. Periksa lagi.`)
  }

  const sekarang = sekarangIso()
  const kunjunganId = idBaru()
  const pengukuranId = idBaru()
  const usia = usiaBulan(balita.tanggal_lahir, tanggal)
  if (!Number.isFinite(usia) || usia < 0) throw new Error('Tanggal kunjungan sebelum tanggal lahir.')
  const batas = batasKunjungan(balita.tanggal_lahir)
  if (!batas || tanggal > batas) {
    throw new Error('Usia balita sudah melewati 7 tahun (84 bulan).')
  }

  if (!izinkanGanda) {
    const sudah = await kunjunganPadaTanggal(balita.id, tanggal)
    if (sudah) {
      // Kode galat, bukan kalimat: layar Catat menampilkan dialog konfirmasi
      // dan bisa mengirim ulang dengan `izinkanGanda: true`.
      const salah = new Error('kunjungan_ganda')
      salah.kode = 'kunjungan_ganda'
      salah.kunjungan = sudah
      throw salah
    }
  }

  const kunjungan = {
    id: kunjunganId,
    balita_id: balita.id,
    posyandu_id: balita.posyandu_id,
    tanggal_kunjungan: tanggal,
    usia_bulan: usia,
    status_kehadiran,
    catatan,
    divalidasi_oleh: null,
    terjadi_pada: sekarang,
    versi: 1,
    dibuat_pada: sekarang,
    diperbarui_pada: sekarang,
    dihapus_pada: null,
    id_perangkat: idPerangkat,
  }
  const pengukuran = tidakHadir
    ? null
    : {
        id: pengukuranId,
        kunjungan_id: kunjunganId,
        ...ukur,
        cara_ukur_tinggi,
        status_gizi: null,
        persen_median: null,
        sumber_status: null,
        terjadi_pada: sekarang,
        versi: 1,
        dibuat_pada: sekarang,
        diperbarui_pada: sekarang,
        dihapus_pada: null,
        id_perangkat: idPerangkat,
      }

  await db.transaction('rw', [db.kunjungan, db.pengukuran, db.antrean_sinkron], async () => {
    await db.kunjungan.put(kunjungan)
    if (pengukuran) await db.pengukuran.put(pengukuran)
    await masukAntrean('kunjungan', kunjunganId, 'buat', kunjungan, pemilik_id)
    if (pengukuran) await masukAntrean('pengukuran', pengukuranId, 'buat', pengukuran, pemilik_id)
  })
  return { kunjungan_id: kunjunganId, pengukuran_id: pengukuran?.id ?? null }
}

/** Ubah pengukuran yang belum divalidasi (F-08). */
export async function ubahPengukuran(id, nilai, idPerangkat, pemilik_id = null) {
  const lama = await db.pengukuran.get(id)
  if (!lama) throw new Error('Pengukuran tidak ditemukan.')
  const bersih = { ...nilai }
  for (const kolom of ['berat_kg', 'tinggi_cm', 'lingkar_kepala_cm']) {
    if (!(kolom in bersih)) continue
    bersih[kolom] = bersih[kolom] === '' || bersih[kolom] == null ? null : Number(bersih[kolom])
  }
  if (!bersih.berat_kg) throw new Error('Berat wajib diisi.')
  const salah = periksaRentang(bersih)
  if (salah.length) {
    throw new Error(`${salah.map((k) => LABEL[k]).join(', ')} di luar rentang wajar.`)
  }
  const sekarang = sekarangIso()
  const baru = {
    ...lama,
    ...bersih,
    diperbarui_pada: sekarang,
    terjadi_pada: sekarang,
    versi: (lama.versi ?? 1) + 1,
    id_perangkat: idPerangkat,
  }
  await db.transaction('rw', [db.pengukuran, db.antrean_sinkron], async () => {
    await db.pengukuran.put(baru)
    await masukAntrean('pengukuran', id, 'ubah', baru, pemilik_id, lama)
  })
  return baru
}

/** Hapus lunak: isi dihapus_pada, jangan hapus baris (AGENTS 2.3). */
export async function hapusKunjungan(id, idPerangkat, pemilik_id = null) {
  const lama = await db.kunjungan.get(id)
  if (!lama) return
  const sekarang = sekarangIso()
  const baru = {
    ...lama,
    dihapus_pada: sekarang,
    diperbarui_pada: sekarang,
    terjadi_pada: sekarang,
    versi: (lama.versi ?? 1) + 1,
    id_perangkat: idPerangkat,
  }
  await db.transaction('rw', [db.kunjungan, db.antrean_sinkron], async () => {
    await db.kunjungan.put(baru)
    await masukAntrean('kunjungan', id, 'hapus', {}, pemilik_id, lama)
  })
}

/** Dipanggil hanya dari dalam transaksi tulis. */
async function masukAntrean(nama_tabel, id_baris, aksi, muatan, pemilik_id, sebelum = null) {
  await db.antrean_sinkron
    .filter((a) => a.status === 'gagal' && a.nama_tabel === nama_tabel && a.id_baris === id_baris)
    .delete()
  await db.antrean_sinkron.add({
    id: idBaru(),
    nama_tabel,
    id_baris,
    aksi,
    versi: muatan.versi ?? 1,
    terjadi_pada: muatan.terjadi_pada ?? sekarangIso(),
    muatan,
    status: 'menunggu',
    jumlah_coba: 0,
    pesan_gagal: null,
    pemilik_id,
    sebelum,
    dibuat_pada: sekarangIso(),
  })
}
