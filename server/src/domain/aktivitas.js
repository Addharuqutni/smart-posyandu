// Satu pintu penulisan log_audit untuk peristiwa yang bukan perubahan baris
// (masuk, keluar, gagal masuk). Perubahan baris tetap ditulis repositori.
//
// `rincian` tidak boleh memuat kata sandi, token, atau hash: layar admin
// membaca kolom ini apa adanya.

const crypto = require('crypto')
const { satu } = require('../db/pool')

const AKSI = ['masuk', 'gagal_masuk', 'keluar']

/**
 * Tulis satu baris log_audit.
 * `barisId` adalah id sesi terkait; bila tidak ada, dibuat baris acak supaya
 * kolom NOT NULL tetap terisi tanpa mengarang referensi.
 */
async function catatAktivitas({
  penggunaId = null,
  idPerangkat = null,
  aksi,
  tabel = 'sesi',
  barisId,
  rincian = null,
  ip = null,
}) {
  if (!AKSI.includes(aksi)) throw new Error(`aksi tidak dikenal: ${aksi}`)
  const id = await satu(
    `INSERT INTO log_audit
       (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
        nilai_lama, nilai_baru, alamat_ip, terjadi_pada, diterima_pada)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, $6, $7, now(), now())
     RETURNING id`,
    [
      penggunaId,
      idPerangkat,
      tabel,
      barisId || crypto.randomUUID(),
      aksi,
      rincian ? JSON.stringify(rincian) : null,
      ip || null,
    ],
  )
  return id?.id ?? null
}

module.exports = { catatAktivitas }
