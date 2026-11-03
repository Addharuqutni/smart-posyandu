// Penyimpanan lokal IndexedDB lewat Dexie.
// Ini sumber kebenaran bagi kader, bukan cache (lihat ARSITEKTUR.md 3.1).
import Dexie from 'dexie'

export const db = new Dexie('posyandu')

db.version(1).stores({
  // Kolom wajib sama dengan skema server: id, dibuat_pada, diperbarui_pada,
  // dihapus_pada, id_perangkat (lihat AGENTS.md 3.1).
  balita: 'id, posyandu_id, nama_lengkap, aktif, diperbarui_pada',
  kunjungan: 'id, balita_id, tanggal_kunjungan, divalidasi_oleh, diperbarui_pada',
  pengukuran: 'id, kunjungan_id, diperbarui_pada',
  tindak_lanjut: 'id, kunjungan_id, diperbarui_pada',

  // Antrean sinkron. Tidak pernah dikirim apa adanya; isinya yang dikirim.
  antrean_sinkron: '++urut, id, nama_tabel, id_baris, status, dibuat_pada',

  // Penanda penyiapan awal: layanan ditolak sebelum ini terisi.
  penyiapan: 'kunci',
})

db.version(2).stores({
  orang_tua: 'id, nama_lengkap, diperbarui_pada',
  balita_orang_tua: 'id, balita_id, orang_tua_id',
})

// Nama tabel yang boleh ditulis kader dan ikut sinkron.
export const TABEL_LOKAL = [
  'balita',
  'orang_tua',
  'balita_orang_tua',
  'kunjungan',
  'pengukuran',
  'tindak_lanjut',
]
