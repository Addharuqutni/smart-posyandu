// Uji integritas cadangan tanpa basis data: hash kanonik, berkas lama,
// berkas yang diubah, dan bentuk isi saat pemulihan.

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

process.env.NODE_ENV = 'test'
process.env.KUNCI_RAHASIA = 'kunci-uji'

const folderUji = fs.mkdtempSync(path.join(os.tmpdir(), 'integritas-cadangan-'))
process.env.FOLDER_CADANGAN = folderUji

const pool = require('../src/db/pool')
const { enkripsi } = require('../src/domain/rahasia')
const { hashIsi, TABEL } = require('../src/jobs/cadangan')
const { periksaIsi, bacaIsi, pratinjau } = require('../src/jobs/pemulihan')

// verifikasi.js mengambil banyak/kueri dari pool saat dimuat. Pasang
// pengganti sebelum require itu; tidak ada koneksi PostgreSQL yang dipakai.
let jumlahDiBasisData = {}
pool.banyak = async (teks) => [{ n: jumlahDiBasisData[/FROM\s+(\w+)/.exec(teks)?.[1]] ?? 0 }]
pool.kueri = async () => ({ rowCount: 1 })
const verifikasi = require('../src/jobs/verifikasi')

const NAMA_LAMA = 'posyandu-2026-11-20T00-00-00-000Z.json.gz.enc'
const NAMA_BARU = 'posyandu-2026-11-21T00-00-00-000Z.json.gz.enc'
const NAMA_RUSAK = 'posyandu-2026-11-22T00-00-00-000Z.json.gz.enc'

const isiLama = {
  posyandu: [{ id: 'p1', nama: 'Posyandu A' }],
  balita: [{ id: 'b1' }],
}
const isiBaru = {
  ...isiLama,
  _meta: { format: 1, dibuat_pada: '2026-11-21T00:00:00.000Z', sha256: hashIsi(isiLama) },
}
const isiRusak = {
  ...isiLama,
  posyandu: [{ id: 'p1', nama: 'Diubah tanpa mengubah hash' }],
  _meta: isiBaru._meta,
}

function tulis(nama, isi) {
  const terkompres = zlib.gzipSync(Buffer.from(JSON.stringify(isi), 'utf8'))
  const terenkripsi = enkripsi(terkompres.toString('base64'), 'cadangan')
  fs.writeFileSync(path.join(folderUji, nama), terenkripsi, 'utf8')
}

function samakanBasisData(isi) {
  jumlahDiBasisData = {}
  for (const t of TABEL) jumlahDiBasisData[t] = isi[t]?.length ?? 0
}

tulis(NAMA_LAMA, isiLama)
tulis(NAMA_BARU, isiBaru)
tulis(NAMA_RUSAK, isiRusak)

test.after(() => fs.rmSync(folderUji, { recursive: true, force: true }))

test('hashIsi round-trip: kanonik, stabil, dan mengabaikan _meta', () => {
  const a = { posyandu: [{ id: 'p1', nama: 'A' }], balita: [] }
  const b = { balita: [], posyandu: [{ nama: 'A', id: 'p1' }] }
  const hash = hashIsi(a)

  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.strictEqual(hashIsi(b), hash)
  assert.strictEqual(hashIsi({ ...a, _meta: { sha256: 'asal' } }), hash)
  assert.strictEqual(
    hashIsi({ posyandu: [{ id: 'p1', dibuat_pada: new Date('2026-01-01T00:00:00.000Z') }] }),
    hashIsi({ posyandu: [{ id: 'p1', dibuat_pada: '2026-01-01T00:00:00.000Z' }] }),
  )
  assert.notStrictEqual(hashIsi({ ...a, posyandu: [{ id: 'p2', nama: 'A' }] }), hash)
})

test('cadangan lama tanpa _meta tetap cocok dan diberi catatan', async () => {
  samakanBasisData(isiLama)
  const hasil = await verifikasi.periksa(NAMA_LAMA, folderUji)

  assert.strictEqual(hasil.cocok, true)
  assert.strictEqual(hasil.integritas, 'tanpa_metadata_integritas')
  assert.match(hasil.catatan, /tanpa_metadata_integritas/)
})

test('isi yang diubah ditolak saat dibaca dan ditandai saat diuji', async () => {
  await assert.rejects(
    () => bacaIsi(NAMA_RUSAK),
    (salah) => salah.kode === 'integritas_cadangan_tidak_cocok',
  )

  samakanBasisData(isiRusak)
  const hasil = await verifikasi.periksa(NAMA_RUSAK, folderUji)

  assert.strictEqual(hasil.cocok, false)
  assert.strictEqual(hasil.integritas, 'tidak_cocok')
  assert.match(hasil.catatan, /sha256_tidak_cocok/)
})

test('pemeriksaan bentuk dan pratinjau mengabaikan _meta', async () => {
  assert.strictEqual(periksaIsi({ _meta: { format: 1 }, posyandu: [{ id: 'p1' }] }), null)
  assert.strictEqual(periksaIsi({ _meta: { format: 1 } }), 'isi_cadangan_kosong')

  const ringkas = await pratinjau(NAMA_BARU)
  assert.deepStrictEqual(ringkas.tabel_tidak_dikenal, [])
  assert.strictEqual(ringkas.total_baris, 2)
})
