// Balita, kunjungan, validasi, tindak lanjut, dan CRUD balita admin.

const express = require('express')
const { satu, banyak, kueri, transaksi } = require('../db/pool')
const { butuhLogin, butuhPeran } = require('../middleware/auth')
const { siapkan } = require('../domain/tabel')
const { ubah, hapus, sisip, tulisTerotorisasi } = require('../domain/repositori')
const { hitung } = require('../domain/status_gizi')
const { lahirDiterima } = require('../domain/usia')

const router = express.Router()

const Admin = butuhPeran('admin_desa')

/** NIK tidak pernah keluar; DATE tetap 'YYYY-MM-DD' agar tidak bergeser. */
function rapikanBaris(baris) {
  const isi = { ...baris }
  if ('nik' in isi) isi.nik = null
  for (const [k, v] of Object.entries(isi)) {
    if (v instanceof Date) {
      isi[k] = k.startsWith('tanggal') ? v.toISOString().slice(0, 10) : v.toISOString()
    }
  }
  return isi
}
const Nakes = butuhPeran('nakes')

function posyanduKader(pengguna) {
  return pengguna.peran === 'kader' ? pengguna.posyandu_id : null
}

/** Wali balita, kontak utama lebih dulu. */
async function waliUntuk(idBalita) {
  return banyak(
    `SELECT ot.id, ot.nama_lengkap, ot.nomor_kontak, ot.alamat,
            bot.hubungan, bot.kontak_utama
     FROM balita_orang_tua bot
     JOIN orang_tua ot ON ot.id = bot.orang_tua_id
     WHERE bot.balita_id = $1 AND bot.dihapus_pada IS NULL
     ORDER BY bot.kontak_utama DESC`,
    [idBalita],
  )
}

/**
 * Wali untuk BANYAK balita sekaligus, dikelompokkan per balita.
 *
 * Dulu daftar balita memanggil `waliUntuk` sekali per baris: 50 balita berarti
 * 51 kueri dan terukur 138 ms per halaman, sedangkan satu kueri gabungan
 * 16,6 ms. Kolom `balita_id` dipakai untuk mengelompokkan lalu dibuang lagi
 * supaya bentuk balasan tidak berubah.
 */
async function waliBanyak(ids) {
  if (!ids.length) return new Map()
  const baris = await banyak(
    `SELECT bot.balita_id, ot.id, ot.nama_lengkap, ot.nomor_kontak, ot.alamat,
            bot.hubungan, bot.kontak_utama
     FROM balita_orang_tua bot
     JOIN orang_tua ot ON ot.id = bot.orang_tua_id
     WHERE bot.balita_id = ANY($1::uuid[]) AND bot.dihapus_pada IS NULL
     ORDER BY bot.kontak_utama DESC`,
    [ids],
  )
  const peta = new Map()
  for (const w of baris) {
    const { balita_id: idBalita, ...sisa } = w
    if (!peta.has(idBalita)) peta.set(idBalita, [])
    peta.get(idBalita).push(sisa)
  }
  return peta
}

router.get('/balita', butuhLogin, async (minta, balas) => {
  const { q, aktif = 'true', posyandu_id: posyanduId } = minta.query || {}
  const batas = Math.min(Math.max(Number(minta.query?.batas) || 200, 1), 500)
  const offset = Math.max(0, Math.floor(Number(minta.query?.offset) || 0))
  const qBersih = String(q ?? '').trim().slice(0, 80)
  const nilai = []
  let syarat = 'dihapus_pada IS NULL'
  if (aktif === 'true') syarat += ' AND aktif = TRUE'
  const pos = posyanduKader(minta.pengguna)
  if (pos) {
    nilai.push(pos)
    syarat += ` AND posyandu_id = $${nilai.length}`
  }
  if (qBersih) {
    nilai.push(`%${qBersih}%`)
    syarat += ` AND nama_lengkap ILIKE $${nilai.length}`
  }
  const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const posFilter = String(posyanduId ?? '').trim()
  if (posFilter) {
    if (!POLA_UUID.test(posFilter)) {
      return balas.status(422).json({ detail: 'posyandu_tidak_sah' })
    }
    nilai.push(posFilter)
    syarat += ` AND posyandu_id = $${nilai.length}`
  }

  // Jumlah keseluruhan dengan syarat yang sama, supaya layar admin bisa
  // menampilkan "200 dari 3000" dan tahu ada halaman berikutnya.
  const jumlah = await satu(
    `SELECT COUNT(*)::int AS n FROM balita WHERE ${syarat}`,
    nilai,
  )

  nilai.push(batas, offset)
  const baris = await banyak(
    `SELECT * FROM balita WHERE ${syarat}
     ORDER BY nama_lengkap LIMIT $${nilai.length - 1} OFFSET $${nilai.length}`,
    nilai,
  )
  const petaWali = await waliBanyak(baris.map((b) => b.id))
  const keluaran = baris.map((b) => ({ ...rapikanBaris(b), wali: petaWali.get(b.id) ?? [] }))
  const total = jumlah?.n ?? keluaran.length
  balas.json({
    balita: keluaran,
    total,
    // `berikutnya` = offset halaman berikut, null bila sudah habis.
    berikutnya: offset + keluaran.length < total ? offset + keluaran.length : null,
    waktu_server: new Date().toISOString(),
  })
})

router.get('/posyandu', butuhLogin, async (minta, balas) => {
  const baris = await banyak(
    `SELECT * FROM posyandu WHERE dihapus_pada IS NULL AND aktif = TRUE ORDER BY nama`,
  )
  const pos = posyanduKader(minta.pengguna)
  balas.json({ posyandu: pos ? baris.filter((p) => p.id === pos) : baris })
})

router.get('/balita/:id', butuhLogin, async (minta, balas) => {
  const baris = await satu(
    `SELECT * FROM balita WHERE id = $1 AND dihapus_pada IS NULL`,
    [minta.params.id],
  )
  const pos = posyanduKader(minta.pengguna)
  if (!baris || (pos && baris.posyandu_id !== pos)) {
    return balas.status(404).json({ detail: 'balita_tidak_ditemukan' })
  }
  balas.json({ ...rapikanBaris(baris), wali: await waliUntuk(baris.id) })
})

// --- CRUD balita, khusus admin desa ---------------------------------------

// Validasi ketat: tipe dan panjang, bukan sekadar "ada isinya".
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const POLA_NIK = /^\d{16}$/
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/

function teksNama(nilai) {
  if (typeof nilai !== 'string') return null
  const bersih = nilai.trim()
  return bersih.length >= 1 && bersih.length <= 120 ? bersih : null
}

router.post('/balita', Admin, async (minta, balas) => {
  const b = minta.body || {}
  const posyanduId = typeof b.posyandu_id === 'string' && POLA_UUID.test(b.posyandu_id)
    ? b.posyandu_id : null
  const nama = teksNama(b.nama_lengkap)
  const tanggal = typeof b.tanggal_lahir === 'string' && POLA_TANGGAL.test(b.tanggal_lahir) && lahirDiterima(b.tanggal_lahir)
    ? b.tanggal_lahir : null
  const kelamin = ['laki-laki', 'perempuan'].includes(b.jenis_kelamin) ? b.jenis_kelamin : null
  const nik = b.nik == null || b.nik === '' ? null
    : (typeof b.nik === 'string' && POLA_NIK.test(b.nik) ? b.nik : 'SALAH')

  if (!posyanduId || !nama || !tanggal || !kelamin || nik === 'SALAH') {
    return balas.status(422).json({ detail: 'muatan_tidak_sah' })
  }

  // Pastikan Posyandu benar-benar ada: mencegah baris yatim.
  const pos = await satu(`SELECT id FROM posyandu WHERE id = $1 AND dihapus_pada IS NULL`, [posyanduId])
  if (!pos) return balas.status(422).json({ detail: 'posyandu_tidak_ditemukan' })

  const nilai = siapkan('balita', {
    posyandu_id: posyanduId,
    nama_lengkap: nama,
    jenis_kelamin: kelamin,
    tanggal_lahir: tanggal,
    nama_ibu_kandung: teksNama(b.nama_ibu_kandung) ?? null,
    berat_lahir_kg: b.berat_lahir_kg ?? null,
    panjang_lahir_cm: b.panjang_lahir_cm ?? null,
    aktif: b.aktif !== false,
  })

  const baris = await sisip('balita', {
    ...nilai,
    id: require('crypto').randomUUID(),
    nik: nik ? require('../domain/rahasia').enkripsi(nik) : null,
  }, { penggunaId: minta.pengguna.id, idPerangkat: 'server', ip: minta.ip })
  balas.status(201).json({ ...baris, nik: null })
})

/**
 * Validasi per bidang untuk PATCH balita.
 *
 * Versi lama meneruskan badan permintaan apa adanya: `nik: "123"` tersimpan,
 * `jenis_kelamin: "robot"` dan angka bukan-angka memicu 500 karena melanggar
 * CHECK/NUMERIC di PostgreSQL. POST sudah ketat; PATCH harus sama ketat.
 * @returns {{nilai:object}|{salah:string}}
 */
function nilaiBalitaSah(b) {
  const nilai = {}
  if (b.posyandu_id !== undefined) {
    if (typeof b.posyandu_id !== 'string' || !POLA_UUID.test(b.posyandu_id)) return { salah: 'muatan_tidak_sah' }
    nilai.posyandu_id = b.posyandu_id
  }
  if (b.nama_lengkap !== undefined) {
    const nama = teksNama(b.nama_lengkap)
    if (!nama) return { salah: 'muatan_tidak_sah' }
    nilai.nama_lengkap = nama
  }
  if (b.jenis_kelamin !== undefined) {
    if (!['laki-laki', 'perempuan'].includes(b.jenis_kelamin)) return { salah: 'muatan_tidak_sah' }
    nilai.jenis_kelamin = b.jenis_kelamin
  }
  if (b.tanggal_lahir !== undefined) {
    if (typeof b.tanggal_lahir !== 'string' || !POLA_TANGGAL.test(b.tanggal_lahir)) {
      return { salah: 'muatan_tidak_sah' }
    }
    if (!lahirDiterima(b.tanggal_lahir)) return { salah: 'usia_di_luar_rentang' }
    nilai.tanggal_lahir = b.tanggal_lahir
  }
  if (b.nama_ibu_kandung !== undefined) nilai.nama_ibu_kandung = teksNama(b.nama_ibu_kandung) ?? null
  if (b.nik !== undefined) {
    if (b.nik === null || b.nik === '') nilai.nik = null
    else if (typeof b.nik === 'string' && POLA_NIK.test(b.nik)) nilai.nik = b.nik
    else return { salah: 'muatan_tidak_sah' }
  }
  // Angka: kosong -> null; selain angka wajar -> tolak (bukan 500).
  // Batasnya beda per satuan: berat lahir (kg) maks 40, panjang lahir (cm)
  // maks 70. Bayi lahir normalnya 45-55 cm; memakai 40 untuk keduanya membuat
  // balita yang baru didaftarkan mustahil disunting lewat PATCH.
  for (const [k, maks] of [['berat_lahir_kg', 40], ['panjang_lahir_cm', 70]]) {
    if (b[k] === undefined) continue
    if (b[k] === null || b[k] === '') { nilai[k] = null; continue }
    const angka = Number(b[k])
    if (!Number.isFinite(angka) || angka <= 0 || angka > maks) return { salah: 'muatan_tidak_sah' }
    nilai[k] = angka
  }
  if (b.aktif !== undefined) {
    if (typeof b.aktif !== 'boolean') return { salah: 'muatan_tidak_sah' }
    nilai.aktif = b.aktif
  }
  return { nilai: siapkan('balita', nilai) }
}

router.patch('/balita/:id', Admin, async (minta, balas) => {
  const { nilai, salah } = nilaiBalitaSah(minta.body || {})
  if (salah) return balas.status(422).json({ detail: salah })
  if (Object.keys(nilai).length === 0) {
    return balas.status(422).json({ detail: 'tidak_ada_yang_diubah' })
  }
  if (nilai.nik) nilai.nik = require('../domain/rahasia').enkripsi(nilai.nik)
  const baris = await ubah('balita', minta.params.id, nilai, {
    penggunaId: minta.pengguna.id,
    idPerangkat: 'server',
    terjadiPada: new Date().toISOString(),
    ip: minta.ip,
  })
  if (!baris) return balas.status(404).json({ detail: 'balita_tidak_ditemukan' })
  balas.json({ ...baris, nik: null })
})

/**
 * Hapus balita BESERTA turunannya dalam satu transaksi.
 *
 * Versi lama hanya menandai `balita.dihapus_pada`. Kunjungan, pengukuran,
 * relasi wali, dan tindak lanjutnya tetap hidup, sehingga balita "sudah
 * dihapus" tetapi Posyandunya tetap dianggap terpakai dan tidak bisa dihapus.
 * Semua memakai soft delete yang sama (AGENTS 2.3), bukan DELETE fisik.
 */
router.delete('/balita/:id', Admin, async (minta, balas) => {
  const { id } = minta.params
  const metadata = { penggunaId: minta.pengguna.id, idPerangkat: 'server', ip: minta.ip }
  const berhasil = await transaksi(async (klien) => {
    const meta = { ...metadata, klien }
    const lama = (await klien.query(
      `SELECT * FROM balita WHERE id = $1 AND dihapus_pada IS NULL`, [id],
    )).rows[0]
    if (!lama) return false

    const kunjungan = (await klien.query(
      `SELECT id FROM kunjungan WHERE balita_id = $1 AND dihapus_pada IS NULL`, [id],
    )).rows.map((r) => r.id)
    if (kunjungan.length) {
      const pengukuran = (await klien.query(
        `SELECT id FROM pengukuran WHERE kunjungan_id = ANY($1::uuid[]) AND dihapus_pada IS NULL`,
        [kunjungan],
      )).rows.map((r) => r.id)
      const tindak = (await klien.query(
        `SELECT id FROM tindak_lanjut WHERE kunjungan_id = ANY($1::uuid[]) AND dihapus_pada IS NULL`,
        [kunjungan],
      )).rows.map((r) => r.id)
      for (const u of pengukuran) await hapus('pengukuran', u, meta)
      for (const t of tindak) await hapus('tindak_lanjut', t, meta)
      for (const k of kunjungan) await hapus('kunjungan', k, meta)
    }
    const relasi = (await klien.query(
      `SELECT id FROM balita_orang_tua WHERE balita_id = $1 AND dihapus_pada IS NULL`, [id],
    )).rows.map((r) => r.id)
    for (const r of relasi) await hapus('balita_orang_tua', r, meta)

    return hapus('balita', id, meta)
  })
  if (!berhasil) return balas.status(404).json({ detail: 'balita_tidak_ditemukan' })
  balas.status(204).send()
})

// --- Kunjungan & validasi --------------------------------------------------

router.get('/kunjungan', butuhLogin, async (minta, balas) => {
  const pos = posyanduKader(minta.pengguna)
  const nilai = []
  let syarat = 'k.dihapus_pada IS NULL'
  if (pos) {
    nilai.push(pos)
    syarat += ` AND k.posyandu_id = $${nilai.length}`
  }
  nilai.push(Number(minta.query.batas) || 200)
  const baris = await banyak(
    `SELECT k.* FROM kunjungan k WHERE ${syarat}
     ORDER BY k.tanggal_kunjungan DESC LIMIT $${nilai.length}`,
    nilai,
  )
  const ids = baris.map((b) => b.id)
  const ukur = ids.length
    ? await banyak(
        `SELECT * FROM pengukuran WHERE kunjungan_id = ANY($1) AND dihapus_pada IS NULL`,
        [ids],
      )
    : []
  const peta = new Map(ukur.map((u) => [u.kunjungan_id, u]))
  balas.json({
    kunjungan: baris.map((b) => ({ ...b, pengukuran: peta.get(b.id) ?? null })),
    waktu_server: new Date().toISOString(),
  })
})

router.get('/validasi', butuhPeran('nakes', 'admin_desa'), async (minta, balas) => {
  const batas = Math.min(Number(minta.query.batas) || 50, 500)
  const offset = Math.max(0, Number(minta.query.offset) || 0)
  const q = String(minta.query.q ?? '').trim()
  const posyanduId = String(minta.query.posyandu_id ?? '').trim()
  const where = [
    'k.dihapus_pada IS NULL',
    'divalidasi_oleh IS NULL',
    'EXISTS (SELECT 1 FROM pengukuran p WHERE p.kunjungan_id = k.id AND p.dihapus_pada IS NULL)',
  ]
  const nilai = []
  if (q) {
    nilai.push(`%${q}%`)
    where.push(`EXISTS (SELECT 1 FROM balita b WHERE b.id = k.balita_id AND b.nama_lengkap ILIKE $${nilai.length})`)
  }
  if (posyanduId) {
    nilai.push(posyanduId)
    where.push(`k.posyandu_id = $${nilai.length}`)
  }
  const syarat = where.join(' AND ')

  const jumlah = await satu(
    `SELECT COUNT(*)::int AS n FROM kunjungan k WHERE ${syarat}`,
    nilai,
  )
  const baris = await banyak(
    `SELECT k.*, b.nama_lengkap AS nama_balita, b.jenis_kelamin, b.tanggal_lahir
     FROM kunjungan k
     JOIN balita b ON b.id = k.balita_id
     WHERE ${syarat}
     ORDER BY k.tanggal_kunjungan
     LIMIT $${nilai.length + 1} OFFSET $${nilai.length + 2}`,
    [...nilai, batas, offset],
  )
  const ids = baris.map((b) => b.id)
  const ukur = ids.length
    ? await banyak(
        `SELECT * FROM pengukuran WHERE kunjungan_id = ANY($1::uuid[]) AND dihapus_pada IS NULL`,
        [ids],
      )
    : []
  const peta = new Map(ukur.map((u) => [u.kunjungan_id, u]))

  const total = jumlah?.n ?? baris.length
  balas.json({
    validasi: baris.map((b) => ({ ...b, pengukuran: peta.get(b.id) ?? null })),
    total,
    berikutnya: offset + baris.length < total ? offset + baris.length : null,
    waktu_server: new Date().toISOString(),
  })
})

router.post('/kunjungan/:id/validasi', Nakes, async (minta, balas, lanjut) => {
  const metadata = {
    penggunaId: minta.pengguna.id,
    idPerangkat: 'server',
    ip: minta.ip,
  }
  const sekarang = new Date().toISOString()
  try {
    // Satu transaksi: bila hitung status gizi gagal, tanda validasi ikut
    // dibatalkan. Tanpa ini kunjungan bisa "Tervalidasi" dengan status NULL.
    const hasil = await transaksi(async (klien) => {
      const meta = { ...metadata, klien }
      const satuDi = async (sql, nilai) => (await klien.query(sql, nilai)).rows[0] ?? null
      const kunjungan = await satuDi(
        `SELECT * FROM kunjungan WHERE id = $1 AND dihapus_pada IS NULL`,
        [minta.params.id],
      )
      if (!kunjungan) return null

      await tulisTerotorisasi('kunjungan', minta.params.id, {
        divalidasi_oleh: minta.pengguna.id,
        divalidasi_pada: sekarang,
        terjadi_pada: sekarang,
      }, meta)

      const ukur = await satuDi(
        `SELECT * FROM pengukuran WHERE kunjungan_id = $1 AND dihapus_pada IS NULL`,
        [minta.params.id],
      )
      if (ukur && !ukur.status_gizi) {
        const balita = await satuDi(`SELECT jenis_kelamin FROM balita WHERE id = $1`, [
          kunjungan.balita_id,
        ])
        const acuan = await satuDi(
          `SELECT median_berat_kg, sumber FROM acuan_berat_umur
           WHERE usia_bulan = $1 AND jenis_kelamin = $2 AND dihapus_pada IS NULL
           ORDER BY dibuat_pada DESC LIMIT 1`,
          [kunjungan.usia_bulan, balita?.jenis_kelamin],
        )
        if (acuan) {
          const nilai = hitung(ukur.berat_kg, acuan.median_berat_kg, acuan.sumber)
          if (nilai) await tulisTerotorisasi('pengukuran', ukur.id, nilai, meta)
        }
      }
      return satuDi(`SELECT * FROM kunjungan WHERE id = $1`, [minta.params.id])
    })
    if (!hasil) return balas.status(404).json({ detail: 'kunjungan_tidak_ditemukan' })
    balas.json(hasil)
  } catch (salah) {
    lanjut(salah)
  }
})

/**
 * Validasi massal: kunjungan, status gizi, dan audit dalam SATU transaksi.
 *
 * Versi lama hanya menandai kunjungan, sehingga baris bisa tampil
 * "Tervalidasi" padahal status_gizi masih NULL. Nomor parameter `$3` juga
 * bentrok dengan filter `q`. Semua nomor kini dibuat oleh `tandai()`.
 */
router.post('/validasi/semua', butuhPeran('nakes', 'admin_desa'), async (minta, balas, lanjut) => {
  const param = []
  const tandai = (v) => {
    param.push(v)
    return `$${param.length}`
  }

  const pengguna = tandai(minta.pengguna.id)
  const sekarang = tandai(new Date().toISOString())
  const ip = tandai(minta.ip ?? null)
  let cari = ''
  const q = String(minta.body?.q ?? '').trim()
  if (q) cari = `AND b.nama_lengkap ILIKE ${tandai(`%${q}%`)}`

  try {
    const hasil = await kueri(
      `WITH kandidat AS (
         SELECT k.id, k.balita_id, k.usia_bulan, b.jenis_kelamin,
                p.id AS ukur_id, p.berat_kg
         FROM kunjungan k
         JOIN balita b ON b.id = k.balita_id
         JOIN pengukuran p ON p.kunjungan_id = k.id AND p.dihapus_pada IS NULL
         WHERE k.dihapus_pada IS NULL AND k.divalidasi_oleh IS NULL ${cari}
       ),
       nilai_gizi AS (
         SELECT kandidat.*, a.median_berat_kg, a.sumber
         FROM kandidat
         LEFT JOIN LATERAL (
           SELECT median_berat_kg, sumber FROM acuan_berat_umur
           WHERE usia_bulan = kandidat.usia_bulan
             AND jenis_kelamin = kandidat.jenis_kelamin
             AND dihapus_pada IS NULL
           ORDER BY dibuat_pada DESC LIMIT 1
         ) a ON TRUE
       ),
       selesai AS (
         UPDATE kunjungan k
         SET divalidasi_oleh = ${pengguna}::uuid,
             divalidasi_pada = ${sekarang}::timestamptz,
             terjadi_pada = ${sekarang}::timestamptz,
             diperbarui_pada = ${sekarang}::timestamptz,
             id_perangkat = 'server'
         FROM nilai_gizi n
         WHERE k.id = n.id
         RETURNING k.id
       ),
       ukur_baru AS (
         UPDATE pengukuran p
         SET persen_median = ROUND((n.berat_kg::numeric / n.median_berat_kg) * 100, 2),
             status_gizi = CASE
               WHEN (n.berat_kg::numeric / n.median_berat_kg) * 100 >= 80 THEN 'gizi_baik'
               WHEN (n.berat_kg::numeric / n.median_berat_kg) * 100 >= 70 THEN 'gizi_kurang'
               WHEN (n.berat_kg::numeric / n.median_berat_kg) * 100 >= 60 THEN 'gizi_buruk'
               ELSE 'gizi_buruk_berat'
             END,
             sumber_status = n.sumber,
             diperbarui_pada = ${sekarang}::timestamptz,
             id_perangkat = 'server'
         FROM nilai_gizi n
         WHERE p.id = n.ukur_id AND p.status_gizi IS NULL
           AND n.median_berat_kg IS NOT NULL AND n.median_berat_kg > 0
           AND n.id IN (SELECT id FROM selesai)
         RETURNING p.id
       ),
       audit_kunjungan AS (
         INSERT INTO log_audit
           (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
            nilai_lama, nilai_baru, alamat_ip, terjadi_pada, diterima_pada)
         SELECT gen_random_uuid(), ${pengguna}::uuid, 'server', 'kunjungan', id, 'ubah',
                '{"divalidasi_oleh":null}'::jsonb,
                jsonb_build_object('divalidasi_oleh', ${pengguna}::text,
                                   'divalidasi_pada', ${sekarang}::text),
                ${ip}::text, ${sekarang}::timestamptz, now()
         FROM selesai
       ),
       audit_pengukuran AS (
         INSERT INTO log_audit
           (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
            nilai_lama, nilai_baru, alamat_ip, terjadi_pada, diterima_pada)
         SELECT gen_random_uuid(), ${pengguna}::uuid, 'server', 'pengukuran', id, 'ubah',
                '{"status_gizi":null}'::jsonb,
                jsonb_build_object('status_gizi', 'dihitung_server'),
                ${ip}::text, ${sekarang}::timestamptz, now()
         FROM ukur_baru
       )
       SELECT COUNT(*)::int AS n FROM selesai`,
      param,
    )
    balas.json({
      divalidasi: hasil?.rows?.[0]?.n ?? 0,
      waktu_server: param[1],
    })
  } catch (salah) {
    lanjut(salah)
  }
})


router.post('/kunjungan/:id/tindak_lanjut', Nakes, async (minta, balas) => {
  const { jenis, isi, tanggal_tindak_lanjut } = minta.body || {}
  if (!jenis || !isi) return balas.status(422).json({ detail: 'muatan_tidak_lengkap' })
  const baris = await sisip('tindak_lanjut', {
    id: require('crypto').randomUUID(),
    kunjungan_id: minta.params.id,
    petugas_id: minta.pengguna.id,
    jenis,
    isi,
    tanggal_tindak_lanjut: tanggal_tindak_lanjut ?? null,
    selesai: false,
    terjadi_pada: new Date().toISOString(),
  }, { penggunaId: minta.pengguna.id, idPerangkat: 'server', ip: minta.ip })
  balas.status(201).json(baris)
})

module.exports = router
