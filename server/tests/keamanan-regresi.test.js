// Regresi temuan audit keamanan: kepemilikan /sinkron, pembatas memori
// percobaan gagal, batas halaman, dan PII di log. Tes helper murni memakai
// basis data palsu; selebihnya membaca kontrak sumber seperti tes integritas.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..', '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const { amankanKepemilikan } = require('../src/routes/sinkron')
const { buatPembatasGagal } = require('../src/domain/pembatas-gagal')
const { RAHASIA, bersihkan } = require('../src/domain/tabel')

const kader = { id: 'u-1', peran: 'kader', posyandu_id: 'pos-1' }
const kosong = { relasi: new Map(), orangTua: new Set() }

function dbPalsu({ balita = {}, kunjungan = {}, wali = {} } = {}) {
  return {
    satu: async (sql, nilai) => {
      const id = nilai?.[0]
      if (sql.includes('FROM balita')) return balita[String(id)] ?? null
      if (sql.includes('FROM kunjungan')) return kunjungan[String(id)] ?? null
      return null
    },
    banyak: async (_sql, nilai) => wali[String(nilai?.[0])] ?? [],
  }
}

test('kader tidak boleh memindahkan balita ke Posyandu lain', async () => {
  const [alasan, muatan] = await amankanKepemilikan(
    'balita', 'b-1', { id: 'b-1', posyandu_id: 'pos-2' }, null, kader, kosong, dbPalsu(),
  )
  assert.equal(alasan, 'tidak_diizinkan')
  assert.equal(muatan.posyandu_id, 'pos-2')

  const [galat, aman] = await amankanKepemilikan(
    'balita', 'b-2', { id: 'b-2' }, null, kader, kosong, dbPalsu(),
  )
  assert.equal(galat, null)
  assert.equal(aman.posyandu_id, 'pos-1')
})

test('kader tidak boleh mengubah induk kunjungan yang tersimpan', async () => {
  const db = dbPalsu({ balita: { 'b-1': { posyandu_id: 'pos-1' } } })
  const [alasan] = await amankanKepemilikan(
    'kunjungan', 'k-1',
    { id: 'k-1', balita_id: 'b-2', posyandu_id: 'pos-1' },
    { balita_id: 'b-1', posyandu_id: 'pos-1' }, kader, kosong, db,
  )
  assert.equal(alasan, 'tidak_diizinkan')
})

test('kunjungan ke balita Posyandu lain ditolak walau muatan memaksa Posyandu sendiri', async () => {
  const db = dbPalsu({ balita: { 'b-2': { posyandu_id: 'pos-2' } } })
  const [alasan] = await amankanKepemilikan(
    'kunjungan', 'k-2', { id: 'k-2', balita_id: 'b-2', posyandu_id: 'pos-1' },
    null, kader, kosong, db,
  )
  assert.equal(alasan, 'tidak_diizinkan')
})

test('pengukuran wajib bertumpu pada kunjungan milik Posyandu kader', async () => {
  const db = dbPalsu({ kunjungan: { 'k-2': { posyandu_id: 'pos-2' } } })
  const [alasan] = await amankanKepemilikan(
    'pengukuran', 'u-1', { id: 'u-1', kunjungan_id: 'k-2' }, null, kader, kosong, db,
  )
  assert.equal(alasan, 'tidak_diizinkan')
})

test('relasi wali tidak boleh memakai orang tua dari Posyandu lain', async () => {
  const db = dbPalsu({
    balita: { 'b-1': { posyandu_id: 'pos-1' } },
    wali: { 'o-2': [{ posyandu_id: 'pos-2' }] },
  })
  const [alasan] = await amankanKepemilikan(
    'balita_orang_tua', 'r-1', { id: 'r-1', balita_id: 'b-1', orang_tua_id: 'o-2' },
    null, kader, kosong, db,
  )
  assert.equal(alasan, 'tidak_diizinkan')
})

test('orang tua baru hanya diterima bila relasinya ke balita kader', async () => {
  const db = dbPalsu({ balita: { 'b-1': { posyandu_id: 'pos-1' } } })
  const muatan = { id: 'o-1', nama_lengkap: 'Sari' }
  const [alasan] = await amankanKepemilikan(
    'orang_tua', 'o-1', muatan, null, kader, kosong, db,
  )
  assert.equal(alasan, 'tidak_diizinkan')

  const baru = { relasi: new Map([['o-1', 'b-1']]), orangTua: new Set() }
  const [galat, aman] = await amankanKepemilikan(
    'orang_tua', 'o-1', muatan, null, kader, baru, db,
  )
  assert.equal(galat, null)
  assert.equal(aman, muatan)
})

test('pembatas gagal mengunci setelah batas dan melepas setelah jendela', () => {
  let waktu = 1_000_000
  const p = buatPembatasGagal({ batas: 2, menit: 15, sekarang: () => waktu })
  p.catat('Uji', '1.2.3.4')
  p.catat('uji', '1.2.3.4')
  assert.equal(p.terkunci('uji', '1.2.3.4'), true)
  waktu += 15 * 60_000 + 1
  assert.equal(p.terkunci('uji', '1.2.3.4'), false)
})

test('pembatas gagal menolak kunci baru saat penuh dan menyapu yang kedaluwarsa', () => {
  let waktu = 1_000_000
  const p = buatPembatasGagal({
    batas: 2, menit: 15, batasEntri: 2, sekarang: () => waktu,
  })
  assert.equal(p.catat('a', 'ip'), true)
  assert.equal(p.catat('b', 'ip'), true)
  assert.equal(p.catat('c', 'ip'), false)
  assert.equal(p.ukuran(), 2)

  waktu += 15 * 60_000 + 1
  assert.equal(p.catat('c', 'ip'), true)
  assert.equal(p.ukuran(), 1)
})


test('kontak dan alamat wali dibuang dari log dan jawaban aktivitas', () => {
  for (const k of ['nomor_kontak', 'alamat']) assert.equal(RAHASIA.has(k), true)
  const bersih = bersihkan({ nama_lengkap: 'Sari', nomor_kontak: '0812', alamat: 'Jl. A' })
  assert.deepEqual(bersih, { nama_lengkap: 'Sari' })
  assert.match(baca('server/src/routes/aktivitas.js'), /b\.nilai_lama = bersihkan\(b\.nilai_lama\)/)
  const migrasi = baca('database/migrasi/012_log_audit_pii.sql')
  assert.match(migrasi, /nilai_lama - 'nomor_kontak' - 'alamat'/)
  assert.match(migrasi, /nilai_baru - 'nomor_kontak' - 'alamat'/)
})

test('kader melewati pemeriksaan kepemilikan sebelum menulis', () => {
  const sinkron = baca('server/src/routes/sinkron.js')
  assert.match(sinkron, /if \(pengguna\.peran === 'kader'\)[\s\S]{0,160}amankanKepemilikan\(/)
  assert.match(sinkron, /muatan = muatanAman/)
  assert.ok(!/posyanduBaris/.test(sinkron), 'helper lama masih dipakai')
})

test('batas halaman sinkron tidak boleh nol atau negatif', () => {
  const sinkron = baca('server/src/routes/sinkron.js')
  assert.match(sinkron, /Math\.min\(Math\.max\(Math\.floor\(Number\(minta\.query\.batas\)\) \|\| 500, 1\), 2000\)/)
})

test('kedua jalur percobaan gagal memakai pembatas yang sama', () => {
  for (const berkas of ['server/src/routes/masuk.js', 'server/src/routes/wali.js']) {
    const teks = baca(berkas)
    assert.match(teks, /require\('\.\.\/domain\/pembatas-gagal'\)/)
    assert.match(teks, /buatPembatasGagal\(\{ batas: BATAS_GAGAL, menit: MENIT_KUNCI \}\)/)
    assert.ok(!/new Map\(\)/.test(teks), `${berkas} masih memakai Map tanpa kap`)
  }
})
