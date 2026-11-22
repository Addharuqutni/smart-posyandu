// Tes murni untuk agregasi /metrik dan kontrak sumber pengamanannya.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..', '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const { ringkasPermintaan, usiaJam } = require('../src/domain/metrik')

test('agregasi memisahkan bucket dan menghitung rata-rata latensi', () => {
  const hasil = ringkasPermintaan({
    jumlah: 12,
    latensiMs: 600,
    kode: new Map([
      [200, 3],
      [201, 1],
      [403, 2],
      [404, 2],
      [422, 1],
      [429, 2],
      [500, 1],
    ]),
  })
  assert.deepEqual(hasil, {
    jumlah: 12,
    '2xx': 4,
    '4xx': 7,
    '403': 2,
    '422': 1,
    '429': 2,
    '5xx': 1,
    rataRataMs: 50,
  })
})

test('agregasi tanpa permintaan tidak membagi dengan nol', () => {
  assert.deepEqual(ringkasPermintaan(), {
    jumlah: 0,
    '2xx': 0,
    '4xx': 0,
    '403': 0,
    '422': 0,
    '429': 0,
    '5xx': 0,
    rataRataMs: 0,
  })
})

test('kedua cabang 429 pembatas laju memakai Retry-After 60', () => {
  const sumber = baca('server/src/app.js')
  assert.match(sumber, /balas\.setHeader\('Retry-After',\s*'60'\)/)
  assert.equal((sumber.match(/\.status\(429\)/g) || []).length, 1)
  assert.equal((sumber.match(/tolakLaju\(balas\)/g) || []).length, 2)
})

test('/metrik diproteksi token bila diisi, otherwise sesi admin_desa', () => {
  const sumber = baca('server/src/app.js')
  const konfigurasi = baca('server/src/env.js')
  const awal = sumber.indexOf('const penjagaMetrik')
  const akhir = sumber.indexOf("aplikasi.get('/metrik'")
  assert.ok(awal >= 0 && akhir > awal)
  const penjaga = sumber.slice(awal, akhir)

  assert.match(konfigurasi, /metrikToken:\s*process\.env\.METRIK_TOKEN\s*\|\|\s*null/)
  assert.match(sumber, /aplikasi\.get\('\/metrik',\s*penjagaMetrik/)
  assert.match(penjaga, /env\.metrikToken/)
  assert.match(penjaga, /X-Metrik-Token/)
  assert.match(penjaga, /butuhPeran\('admin_desa'\)/)
})

test('/metrik tetap hidup bila tabel uji cadangan belum ada', () => {
  const sumber = baca('server/src/app.js')
  const awal = sumber.indexOf("aplikasi.get('/metrik'")
  const akhir = sumber.indexOf("aplikasi.get('/waktu'", awal)
  assert.ok(awal >= 0 && akhir > awal)
  const rute = sumber.slice(awal, akhir)
  assert.equal((rute.match(/\)\.catch\(\(\) => null\)/g) || []).length, 2)
  assert.match(sumber, /'Content-Type,X-Requested-With,X-Kata-Sandi,X-Nama-Berkas,X-Metrik-Token'/)
})

test('usia verifikasi cadangan dihitung dari cap waktu, bukan jam proses', () => {
  const sekarang = new Date('2026-11-22T12:00:00.000Z')
  assert.equal(usiaJam('2026-11-22T09:30:00.000Z', sekarang), 2.5)
  assert.equal(usiaJam(new Date('2026-11-22T12:00:00.000Z'), sekarang), 0)
  assert.equal(usiaJam('2026-11-22T13:00:00.000Z', sekarang), 0)
  assert.equal(usiaJam(null, sekarang), null)
  assert.equal(usiaJam('bukan-waktu', sekarang), null)
})

test('/metrik menandai cakupan satu proses dan umur drill', () => {
  const sumber = baca('server/src/app.js')
  assert.match(sumber, /lingkup: 'proses_ini'/)
  assert.match(sumber, /uji_cadangan_usia_jam: usiaJam\(uji\?\.diperiksa_pada\)/)
})

test('pembatas laju mendahului CSRF dan memisahkan kuota jalur sensitif', async () => {
  process.env.NODE_ENV = 'test'
  process.env.KUNCI_RAHASIA = 'kunci-uji'
  const { buatAplikasi } = require('../src/app.js')
  const server = buatAplikasi().listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  const dasar = `http://127.0.0.1:${server.address().port}`
  const kirim = async (jalur) => {
    const balasan = await fetch(dasar + jalur, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      redirect: 'manual',
    })
    await balasan.text()
    return balasan
  }

  try {
    // 60 header-less writes still get 403; the tight quota is not exceeded yet.
    for (let i = 0; i < 60; i += 1) {
      assert.equal((await kirim('/masuk')).status, 403, `attempt ${i + 1} should be CSRF 403`)
    }
    // The 61st is 429 before CSRF can reject it: the limiter now runs first.
    const lebih = await kirim('/masuk')
    assert.equal(lebih.status, 429)
    assert.equal(lebih.headers.get('Retry-After'), '60')
    // A trailing slash must not fall back to the general 300/min bucket.
    assert.equal((await kirim('/masuk/')).status, 429)
    // The general class has a separate bucket, so another path is not locked.
    assert.equal((await kirim('/tidak-ada')).status, 403)
  } finally {
    server.closeAllConnections?.()
    server.close()
  }
})
