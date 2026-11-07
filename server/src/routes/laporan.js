// Rekap bulanan, ekspor CSV, dan penanda kualitas data (F-18, F-19, F-20).

const express = require('express')
const { satu, banyak, kueri } = require('../db/pool')
const { butuhPeran } = require('../middleware/auth')

const router = express.Router()
const Admin = butuhPeran('admin_desa')
const NakesAtauAdmin = butuhPeran('nakes', 'admin_desa')

function rentangBulan(bulan) {
  const [tahun, nomor] = bulan.split('-').map(Number)
  const awal = new Date(Date.UTC(tahun, nomor - 1, 1))
  const akhir = new Date(Date.UTC(nomor === 12 ? tahun + 1 : tahun, nomor % 12, 1))
  return [awal, akhir]
}

function keGaris(isi) {
  const kepala = 'tanggal_kunjungan,nama_balita,jenis_kelamin,tanggal_lahir,usia_bulan,berat_kg,tinggi_cm,lingkar_kepala_cm,status_gizi,persen_median,divalidasi\n'
  const baris = isi
    .map((b) =>
      [
        b.tanggal_kunjungan, b.nama_lengkap, b.jenis_kelamin, b.tanggal_lahir,
        b.usia_bulan, b.berat_kg, b.tinggi_cm, b.lingkar_kepala_cm,
        b.status_gizi, b.persen_median, b.divalidasi_oleh ? 'ya' : 'belum',
      ].join(','),
    )
    .join('\n')
  return kepala + baris
}

router.get('/rekap', NakesAtauAdmin, async (minta, balas) => {
  const bulan = minta.query.bulan
  if (!/^\d{4}-\d{2}$/.test(bulan || '')) {
    return balas.status(422).json({ detail: 'format_bulan_salah' })
  }
  const [awal, akhir] = rentangBulan(bulan)
  const pengguna = minta.pengguna
  const nilai = [awal, akhir]
  let syarat = 'k.tanggal_kunjungan >= $1 AND k.tanggal_kunjungan < $2 AND k.dihapus_pada IS NULL'
  if (pengguna.peran === 'kader') {
    nilai.push(pengguna.posyandu_id)
    syarat += ` AND k.posyandu_id = $${nilai.length}`
  }

  const jumlah = await satu(`SELECT COUNT(*)::int AS n FROM kunjungan k WHERE ${syarat}`, nilai)

  // Dihitung di SQL, bukan di Node: dulu seluruh baris pengukuran bulan itu
  // diangkut hanya untuk dihitung, terukur 5.331 baris untuk 4 angka.
  const sebaran = { gizi_baik: 0, gizi_kurang: 0, gizi_buruk: 0, gizi_buruk_berat: 0, belum_dinilai: 0 }
  const ukur = await banyak(
    `SELECT COALESCE(p.status_gizi, 'belum_dinilai') AS status, COUNT(*)::int AS n
     FROM pengukuran p JOIN kunjungan k ON k.id = p.kunjungan_id
     WHERE ${syarat} AND p.dihapus_pada IS NULL
     GROUP BY 1`,
    nilai,
  )
  for (const u of ukur) {
    if (sebaran[u.status] !== undefined) sebaran[u.status] = u.n
    else sebaran.belum_dinilai += u.n
  }

  const balita = await satu(
    `SELECT COUNT(DISTINCT k.balita_id)::int AS n FROM kunjungan k WHERE ${syarat}`,
    nilai,
  )
  const rata = await satu(
    `SELECT AVG(p.persen_median)::float AS rata
     FROM pengukuran p JOIN kunjungan k ON k.id = p.kunjungan_id
     WHERE ${syarat} AND p.dihapus_pada IS NULL AND p.persen_median IS NOT NULL`,
    nilai,
  )

  // Balita terdaftar (aktif) dan yang tidak datang bulan ini. Tanpa ini,
  // "Kunjungan" dan "Balita terdaftar" selalu sama bila setiap balita hanya
  // datang sekali — angkanya jadi tidak bermakna.
  const syaratBalita = pengguna.peran === 'kader'
    ? 'b.dihapus_pada IS NULL AND b.aktif = TRUE AND b.posyandu_id = $1'
    : 'b.dihapus_pada IS NULL AND b.aktif = TRUE'
  const nilaiBalita = pengguna.peran === 'kader' ? [pengguna.posyandu_id] : []
  const terdaftar = await satu(
    `SELECT COUNT(*)::int AS n FROM balita b WHERE ${syaratBalita}`,
    nilaiBalita,
  )
  const tidakBerkunjung = await satu(
    `SELECT COUNT(*)::int AS n FROM balita b
     WHERE ${syaratBalita}
       AND NOT EXISTS (SELECT 1 FROM kunjungan k
                       WHERE k.balita_id = b.id AND k.dihapus_pada IS NULL
                         AND k.tanggal_kunjungan >= $${nilaiBalita.length + 1}
                         AND k.tanggal_kunjungan < $${nilaiBalita.length + 2})`,
    [...nilaiBalita, nilai[0], nilai[1]],
  )

  let posyandu = { id: null, nama: null }
  if (pengguna.posyandu_id) {
    const p = await satu(`SELECT id, nama FROM posyandu WHERE id = $1`, [pengguna.posyandu_id])
    if (p) posyandu = p
  }

  balas.json({
    bulan,
    posyandu,
    jumlah_kunjungan: jumlah?.n ?? 0,
    // Balita yang punya kunjungan bulan ini.
    jumlah_balita_tercatat: balita?.n ?? 0,
    // Semua balita aktif terdaftar, dan yang tidak datang bulan ini.
    balita_terdaftar: terdaftar?.n ?? 0,
    balita_tidak_berkunjung: tidakBerkunjung?.n ?? 0,
    sebaran_status_gizi: sebaran,
    rata_persen_median: rata?.rata != null ? Number(rata.rata.toFixed(2)) : null,
  })
})

router.get('/ekspor.csv', Admin, async (minta, balas) => {
  const bulan = minta.query.bulan
  if (!/^\d{4}-\d{2}$/.test(bulan || '')) {
    return balas.status(422).json({ detail: 'format_bulan_salah' })
  }
  const [awal, akhir] = rentangBulan(bulan)
  const baris = await banyak(
    `SELECT k.tanggal_kunjungan, b.nama_lengkap, b.jenis_kelamin, b.tanggal_lahir,
            k.usia_bulan, p.berat_kg, p.tinggi_cm, p.lingkar_kepala_cm,
            p.status_gizi, p.persen_median, k.divalidasi_oleh
     FROM kunjungan k
     JOIN balita b ON b.id = k.balita_id
     JOIN pengukuran p ON p.kunjungan_id = k.id
     WHERE k.tanggal_kunjungan >= $1 AND k.tanggal_kunjungan < $2
       AND k.dihapus_pada IS NULL AND p.dihapus_pada IS NULL
     ORDER BY k.tanggal_kunjungan, b.nama_lengkap`,
    [awal, akhir],
  )

  // Ekspor selalu tercatat (AGENTS Bagian 6).
  const cap = new Date()
  await kueri(
    `INSERT INTO log_audit
       (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
        nilai_lama, nilai_baru, alamat_ip, terjadi_pada, diterima_pada)
     VALUES (gen_random_uuid(), $1, 'server', 'ekspor', gen_random_uuid(), 'buat',
             NULL, $2, $3, now(), now())`,
    [minta.pengguna.id, JSON.stringify({ bulan, baris: baris.length }), minta.ip ?? null],
  )

  const namaBerkas = `posyandu-${bulan}-${cap.toISOString().slice(0, 10)}.csv`
  balas.setHeader('Content-Type', 'text/csv; charset=utf-8')
  balas.setHeader('Content-Disposition', `attachment; filename="${namaBerkas}"`)
  balas.send(`# diekspor oleh ${minta.pengguna.nama_lengkap} pada ${cap.toISOString()}\n` + keGaris(baris))
})

router.get('/kualitas', Admin, async (minta, balas) => {
  // Hanya kunjungan yang punya pengukuran yang bisa divalidasi petugas.
  // Kunjungan "tidak hadir" tidak punya angka untuk diperiksa, jadi jangan
  // dihitung sebagai antrean validasi — dulu ini membuat "Belum divalidasi"
  // selalu besar walau antrean sebenarnya kosong (8.532 dari 8.532).
  const belum = await satu(
    `SELECT COUNT(*)::int AS n FROM kunjungan k
     WHERE k.dihapus_pada IS NULL AND k.divalidasi_oleh IS NULL
       AND EXISTS (SELECT 1 FROM pengukuran p
                   WHERE p.kunjungan_id = k.id AND p.dihapus_pada IS NULL)`,
  )
  const tanpaUkur = await satu(
    `SELECT COUNT(*)::int AS n FROM kunjungan k
     WHERE k.dihapus_pada IS NULL AND k.divalidasi_oleh IS NULL
       AND NOT EXISTS (SELECT 1 FROM pengukuran p
                       WHERE p.kunjungan_id = k.id AND p.dihapus_pada IS NULL)`,
  )
  const perangkat = await banyak(
    `SELECT id_perangkat, MAX(diperbarui_pada) AS sinkron_terakhir
     FROM (
       SELECT id_perangkat, diperbarui_pada FROM kunjungan
       UNION ALL SELECT id_perangkat, diperbarui_pada FROM pengukuran
       UNION ALL SELECT id_perangkat, diperbarui_pada FROM balita
       UNION ALL SELECT id_perangkat, diperbarui_pada FROM tindak_lanjut
     ) g
     WHERE id_perangkat IS NOT NULL AND id_perangkat <> 'server'
     GROUP BY id_perangkat
     ORDER BY sinkron_terakhir`,
  )
  const tinjau = await banyak(
    `SELECT id_baris, nama_tabel, diterima_pada, terjadi_pada
     FROM log_audit
     WHERE nilai_baru->>'ditolak' = 'waktu_lewat_masa_depan'
     ORDER BY diterima_pada DESC LIMIT 50`,
  )

  balas.json({
    sinkron_terakhir: perangkat.length ? perangkat[perangkat.length - 1].sinkron_terakhir : null,
    perangkat,
    belum_divalidasi: belum?.n ?? 0,
    // Kunjungan tidak hadir: tidak punya pengukuran, jadi bukan antrean validasi.
    kunjungan_tanpa_ukur: tanpaUkur?.n ?? 0,
    belum_terkirim_perkiraan: 0,
    perlu_tinjauan: tinjau.map((b) => ({
      id_baris: b.id_baris,
      nama_tabel: b.nama_tabel,
      alasan: 'waktu_lewat_masa_depan',
      diterima_pada: b.diterima_pada,
    })),
  })
})

module.exports = router
