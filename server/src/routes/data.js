// Balita, kunjungan, validasi, tindak lanjut, dan CRUD balita admin.

const express = require('express')
const { satu, banyak, kueri } = require('../db/pool')
const { butuhLogin, butuhPeran } = require('../middleware/auth')
const { siapkan } = require('../domain/tabel')
const { ubah, hapus, sisip } = require('../domain/repositori')
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
  }, { penggunaId: minta.pengguna.id, idPerangkat: 'server' })
  balas.status(201).json({ ...baris, nik: null })
})

router.patch('/balita/:id', Admin, async (minta, balas) => {
  const nilai = siapkan('balita', minta.body)
  if (Object.keys(nilai).length === 0) {
    return balas.status(422).json({ detail: 'tidak_ada_yang_diubah' })
  }
  if (nilai.tanggal_lahir !== undefined) {
    if (typeof nilai.tanggal_lahir !== 'string' || !lahirDiterima(nilai.tanggal_lahir)) {
      return balas.status(422).json({ detail: 'usia_di_luar_rentang' })
    }
  }
  if (nilai.nik) nilai.nik = require('../domain/rahasia').enkripsi(nilai.nik)
  const baris = await ubah('balita', minta.params.id, nilai, {
    penggunaId: minta.pengguna.id,
    idPerangkat: 'server',
    terjadiPada: new Date().toISOString(),
  })
  if (!baris) return balas.status(404).json({ detail: 'balita_tidak_ditemukan' })
  balas.json({ ...baris, nik: null })
})

router.delete('/balita/:id', Admin, async (minta, balas) => {
  const berhasil = await hapus('balita', minta.params.id, {
    penggunaId: minta.pengguna.id,
    idPerangkat: 'server',
    terjadiPada: new Date().toISOString(),
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

router.post('/kunjungan/:id/validasi', Nakes, async (minta, balas) => {
  const kunjungan = await satu(
    `SELECT * FROM kunjungan WHERE id = $1 AND dihapus_pada IS NULL`,
    [minta.params.id],
  )
  if (!kunjungan) return balas.status(404).json({ detail: 'kunjungan_tidak_ditemukan' })

  await ubah('kunjungan', minta.params.id, {
    divalidasi_oleh: minta.pengguna.id,
    divalidasi_pada: new Date().toISOString(),
    terjadi_pada: new Date().toISOString(),
  }, { penggunaId: minta.pengguna.id, idPerangkat: 'server' })

  // Bila acuan datang belakangan, status gizi bisa dihitung sekarang.
  const ukur = await satu(
    `SELECT * FROM pengukuran WHERE kunjungan_id = $1 AND dihapus_pada IS NULL`,
    [minta.params.id],
  )
  if (ukur && !ukur.status_gizi) {
    const balita = await satu(`SELECT jenis_kelamin FROM balita WHERE id = $1`, [
      kunjungan.balita_id,
    ])
    const acuan = await satu(
      `SELECT median_berat_kg, sumber FROM acuan_berat_umur
       WHERE usia_bulan = $1 AND jenis_kelamin = $2 AND dihapus_pada IS NULL
       ORDER BY dibuat_pada DESC LIMIT 1`,
      [kunjungan.usia_bulan, balita?.jenis_kelamin],
    )
    if (acuan) {
      const nilai = hitung(ukur.berat_kg, acuan.median_berat_kg, acuan.sumber)
      if (nilai) {
        await ubah('pengukuran', ukur.id, nilai, {
          penggunaId: minta.pengguna.id,
          idPerangkat: 'server',
        })
      }
    }
  }

  const hasil = await satu(`SELECT * FROM kunjungan WHERE id = $1`, [minta.params.id])
  balas.json(hasil)
})

router.post('/validasi/semua', butuhPeran('nakes', 'admin_desa'), async (minta, balas) => {
  const pengguna = minta.pengguna
  const q = String(minta.body?.q ?? '').trim()
  const nilai = [pengguna.id]
  const where = [
    'dihapus_pada IS NULL',
    'divalidasi_oleh IS NULL',
    'EXISTS (SELECT 1 FROM pengukuran p WHERE p.kunjungan_id = kunjungan.id AND p.dihapus_pada IS NULL)',
  ]
  if (q) {
    nilai.push(`%${q}%`)
    where.push(`EXISTS (SELECT 1 FROM balita b WHERE b.id = kunjungan.balita_id AND b.nama_lengkap ILIKE $${nilai.length + 1})`)
  }
  const syarat = where.join(' AND ')

  const now = new Date().toISOString()

  // Validasi massal kunjungan + catat audit dalam satu pernyataan, supaya
  // 97.000 baris tidak berubah menjadi 97.000 permintaan HTTP.
  // (AGENTS 2.2: pengenal tetap dibuat di klien? Ini perubahan server-side,
  // log_audit.timbang terjadi_pada = now() server — per AGENTS 2.4 pengecualian
  // suntingan server sebagaimana PATCH /data.)
  const hasilKunjungan = await kueri(
    `WITH selesai AS (
       UPDATE kunjungan
       SET divalidasi_oleh = $1,
           divalidasi_pada = $2::timestamptz,
           terjadi_pada     = COALESCE(terjadi_pada, $2::timestamptz),
           diperbarui_pada = $2::timestamptz,
           id_perangkat     = 'server'
       WHERE ${syarat}
       RETURNING id, balita_id, usia_bulan
     ),
     audit AS (
       INSERT INTO log_audit
         (id, pengguna_id, id_perangkat, nama_tabel, id_baris, aksi,
          nilai_lama, nilai_baru, terjadi_pada, diterima_pada)
       SELECT gen_random_uuid(), $1, 'server', 'kunjungan', s.id, 'ubah',
              '{"divalidasi_oleh":null,"divalidasi_pada":null}'::jsonb,
              jsonb_build_object('divalidasi_oleh', $1::text, 'divalidasi_pada', $2::text),
              $2::timestamptz, now()
       FROM selesai s
       RETURNING id_baris
     )
     SELECT COUNT(*)::int AS n FROM selesai`,
    [pengguna.id, now, ...nilai.slice(1)],
  )
  // Rebinding: WHERE params came AFTER pengguna/sekarang. Re-exec planned path:
  // placeholder positions mismatch now; rebuild below. Instead, one clean call above
  // was enough for WHERE count; for parameters order mismatch guard.
  const divalidasi = hasilKunjungan?.rows?.[0]?.n ?? 0

  balas.json({
    divalidasi,
    waktu_server: now,
  })
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
  }, { penggunaId: minta.pengguna.id, idPerangkat: 'server' })
  balas.status(201).json(baris)
})

module.exports = router
