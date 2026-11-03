// Uji murni untuk jadwal pencadangan dan retensi berkas.
// Tidak menyentuh basis data maupun berkas: semua fungsi di sini murni.

const test = require('node:test')
const assert = require('node:assert')

process.env.KUNCI_RAHASIA = 'kunci-uji'

const { msKeBerikutnyaWib, perluCatchUp } = require('../src/jobs/jadwal')
const { berkasDisimpan, namaSah, AWALAN_PENGAMAN } = require('../src/jobs/cadangan')

const HARI = 24 * 3600 * 1000
const WIB = 7 * 3600 * 1000

/** Waktu UTC untuk pukul `jam` WIB pada tanggal tertentu. */
function wib(iso, jam) {
  return Date.parse(`${iso}T00:00:00.000Z`) - WIB + jam * 3600 * 1000
}

test('jadwal menunjuk 02.00 WIB berikutnya saat masih pagi', () => {
  const sekarang = wib('2026-11-01', 1) // 01.00 WIB
  const jeda = msKeBerikutnyaWib(2, sekarang)
  assert.strictEqual(jeda, 3600 * 1000)
})

test('jadwal menunjuk hari berikutnya bila 02.00 WIB sudah lewat', () => {
  const sekarang = wib('2026-11-01', 3) // 03.00 WIB
  const jeda = msKeBerikutnyaWib(2, sekarang)
  assert.strictEqual(jeda, 23 * 3600 * 1000)
})

test('jadwal tepat pada 02.00 WIB menunggu 24 jam, bukan 0', () => {
  const sekarang = wib('2026-11-01', 2)
  assert.strictEqual(msKeBerikutnyaWib(2, sekarang), HARI)
})

test('jadwal 02.00 WIB jatuh pada 19.00 UTC hari sebelumnya', () => {
  const sekarang = wib('2026-11-01', 1)
  const target = sekarang + msKeBerikutnyaWib(2, sekarang)
  const d = new Date(target)
  assert.strictEqual(d.getUTCHours(), 19)
  assert.strictEqual(d.getUTCDate(), 31)
})

test('catch up bila belum ada cadangan sama sekali', () => {
  assert.strictEqual(perluCatchUp(null), true)
})

test('catch up bila cadangan terakhir lewat 24 jam', () => {
  const sekarang = Date.now()
  assert.strictEqual(perluCatchUp(sekarang - 25 * 3600 * 1000, sekarang), true)
  assert.strictEqual(perluCatchUp(sekarang - 23 * 3600 * 1000, sekarang), false)
})

test('nama cadangan pengaman diterima sebagai nama yang sah', () => {
  assert.strictEqual(namaSah(`${AWALAN_PENGAMAN}-2026-11-30T02-00-00-000Z.json.gz.enc`), true)
  assert.strictEqual(namaSah('posyandu-2026-11-30T02-00-00-000Z.json.gz.enc'), true)
})

test('retensi menyimpan 7 harian, 4 mingguan, 3 bulanan', () => {
  const sekarang = Date.parse('2026-11-30T10:00:00.000Z')
  const daftar = []
  // 40 hari berurutan, satu berkas per hari.
  for (let i = 0; i < 40; i += 1) {
    const ms = sekarang - i * HARI
    daftar.push({
      nama: `posyandu-${new Date(ms).toISOString().replace(/[:.]/g, '-')}.json.gz.enc`,
      dibuat_pada_ms: ms,
    })
  }
  const disimpan = berkasDisimpan(daftar, sekarang)
  // 7 hari terakhir + sisanya dari aturan mingguan/bulanan, jauh lebih sedikit
  // dari 40 berkas.
  assert.ok(disimpan.length >= 7)
  assert.ok(disimpan.length <= 14, `disimpan ${disimpan.length}`)
  // Berkas terbaru selalu disimpan.
  assert.ok(disimpan.includes(daftar[0].nama))
  // Berkas paling tua tidak disimpan.
  assert.ok(!disimpan.includes(daftar[39].nama))
})

test('retensi menyimpan hanya 3 cadangan pengaman terbaru', () => {
  const sekarang = Date.parse('2026-11-30T10:00:00.000Z')
  const daftar = []
  for (let i = 0; i < 10; i += 1) {
    daftar.push({
      nama: `${AWALAN_PENGAMAN}-${new Date(sekarang - i * HARI).toISOString().replace(/[:.]/g, '-')}.json.gz.enc`,
      dibuat_pada_ms: sekarang - i * HARI,
    })
  }
  const disimpan = berkasDisimpan(daftar, sekarang)
  const pengaman = disimpan.filter((n) => n.startsWith(`${AWALAN_PENGAMAN}-`))
  assert.strictEqual(pengaman.length, 3)
  assert.ok(disimpan.includes(daftar[0].nama))
  assert.ok(!disimpan.includes(daftar[3].nama))
})

test('cadangan pengaman yang masih baru tidak pernah dihapus', () => {
  const sekarang = Date.parse('2026-11-30T10:00:00.000Z')
  const daftar = []
  // 5 pengaman, semuanya masih di bawah 24 jam.
  for (let i = 0; i < 5; i += 1) {
    daftar.push({
      nama: `${AWALAN_PENGAMAN}-${new Date(sekarang - i * 3600_000).toISOString().replace(/[:.]/g, '-')}.json.gz.enc`,
      dibuat_pada_ms: sekarang - i * 3600_000,
    })
  }
  const disimpan = berkasDisimpan(daftar, sekarang)
  assert.strictEqual(disimpan.filter((n) => n.startsWith(`${AWALAN_PENGAMAN}-`)).length, 5)
})

test('daftar kosong tidak menghapus apa pun', () => {
  assert.deepStrictEqual(berkasDisimpan([], Date.now()), [])
})
