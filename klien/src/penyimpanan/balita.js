import { db } from './db.js'
import { idBaru, sekarangIso, tanggalHariIni, usiaDiterima } from '../logika/waktu.js'
import { enkripsiNik } from '../logika/nik.js'

/**
 * Tambah balita + wali, luring (F-03).
 *
 * NIK: dikirim ke server tetapi TIDAK disimpan di tabel `balita` lokal; di
 * antrean pun bentuknya terenkripsi AES-GCM (lihat logika/nik.js).
 */
export async function simpanBalita({
  idPerangkat,
  nama_lengkap,
  jenis_kelamin,
  tanggal_lahir,
  nik = null,
  wali,
  posyandu_id = null,
  pemilik_id = null,
}) {
  if (!nama_lengkap?.trim()) throw new Error('Nama balita wajib diisi.')
  if (!['laki-laki', 'perempuan'].includes(jenis_kelamin)) throw new Error('Jenis kelamin wajib dipilih.')
  if (!tanggal_lahir) throw new Error('Tanggal lahir wajib diisi.')
  if (!/^\d{16}$/.test(String(nik ?? '').trim())) throw new Error('NIK balita wajib 16 digit angka.')
  if (!usiaDiterima(tanggal_lahir, tanggalHariIni())) {
    throw new Error('Usia balita harus antara 0 hari dan 7 tahun (84 bulan).')
  }
  const posyanduId = posyandu_id || wali?.posyandu_id
  if (!posyanduId) {
    throw new Error('Pilih Posyandu lebih dulu.')
  }

  const sekarang = sekarangIso()
  const nikAman = await enkripsiNik(nik)
  const balitaId = idBaru()
  const orangTuaId = idBaru()
  const relasiId = idBaru()

  const balita = {
    id: balitaId,
    posyandu_id: posyanduId,
    nama_lengkap: nama_lengkap.trim(),
    jenis_kelamin,
    tanggal_lahir,
    nama_ibu_kandung: wali.hubungan === 'ibu_kandung' ? wali.nama_lengkap.trim() : null,
    aktif: true,
    terjadi_pada: sekarang,
    versi: 1,
    dibuat_pada: sekarang,
    diperbarui_pada: sekarang,
    dihapus_pada: null,
    id_perangkat: idPerangkat,
  }
  const orangTua = {
    id: orangTuaId,
    nama_lengkap: wali.nama_lengkap.trim(),
    nomor_kontak: wali.nomor_kontak?.trim() || null,
    alamat: wali.alamat?.trim() || null,
    terjadi_pada: sekarang,
    versi: 1,
    dibuat_pada: sekarang,
    diperbarui_pada: sekarang,
    dihapus_pada: null,
    id_perangkat: idPerangkat,
  }
  const relasi = {
    id: relasiId,
    balita_id: balitaId,
    orang_tua_id: orangTuaId,
    hubungan: wali.hubungan,
    kontak_utama: true,
    terjadi_pada: sekarang,
    versi: 1,
    dibuat_pada: sekarang,
    diperbarui_pada: sekarang,
    dihapus_pada: null,
    id_perangkat: idPerangkat,
  }

  await db.transaction('rw', [db.balita, db.orang_tua, db.balita_orang_tua, db.antrean_sinkron], async () => {
    await db.balita.put(balita)
    await db.orang_tua.put(orangTua)
    await db.balita_orang_tua.put(relasi)
    // NIK hanya ikut pada muatan balita, tidak pada baris lokal.
    await tambahAntrean('balita', balitaId, 'buat', { ...balita, nik_terenkripsi: nikAman }, pemilik_id)
    await tambahAntrean('orang_tua', orangTuaId, 'buat', orangTua, pemilik_id)
    await tambahAntrean('balita_orang_tua', relasiId, 'buat', relasi, pemilik_id)
  })
  return balitaId
}

async function tambahAntrean(nama_tabel, id_baris, aksi, muatan, pemilik_id) {
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
    dibuat_pada: sekarangIso(),
  })
}

/** Wali utama sebuah balita, dari salinan lokal. */
export async function waliBalita(balitaId) {
  const relasi = await db.balita_orang_tua.where('balita_id').equals(balitaId).toArray()
  const hasil = []
  for (const r of relasi) {
    if (r.dihapus_pada) continue
    const orang = await db.orang_tua.get(r.orang_tua_id)
    if (orang && !orang.dihapus_pada) hasil.push({ ...orang, hubungan: r.hubungan })
  }
  return hasil
}
