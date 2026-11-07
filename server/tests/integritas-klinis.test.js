// Regresi integritas data klinis: keputusan nakes dan status gizi tidak boleh
// datang dari tablet, semua tulisan wajib audit, dan validasi massal setara
// dengan validasi tunggal. Murni membaca sumber; tidak butuh basis data.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const akar = path.join(__dirname, '../src')
const baca = (berkas) => fs.readFileSync(path.join(akar, berkas), 'utf8')
const { siapkan, siapkanTerotorisasi, bersihkan } = require('../src/domain/tabel')
const data = baca('routes/data.js')
const repositori = baca('domain/repositori.js')
const tabel = baca('domain/tabel.js')
const konten = baca('routes/konten.js')
const sesi = baca('routes/sesi.js')
const pengguna = baca('routes/pengguna.js')

test('muatan /sinkron tidak bisa menulis keputusan klinis', () => {
  const masuk = {
    id: 'b1', terjadi_pada: '2026-11-06T03:00:00Z',
    divalidasi_oleh: 'p-nakes', divalidasi_pada: '2026-11-06T03:00:00Z',
    status_gizi: 'gizi_baik', persen_median: 105.6, sumber_status: 'WHO 2006',
    status_kehadiran: 'hadir',
  }
  assert.deepEqual(siapkan('kunjungan', masuk), {
    id: 'b1', terjadi_pada: '2026-11-06T03:00:00Z', status_kehadiran: 'hadir',
  })
  assert.deepEqual(siapkan('pengukuran', masuk), {
    id: 'b1', terjadi_pada: '2026-11-06T03:00:00Z',
  })
})

test('jalur terotorisasi hanya membuka kolom keputusan yang memang diizinkan', () => {
  assert.deepEqual(
    siapkanTerotorisasi('pengukuran', {
      status_gizi: 'gizi_baik', persen_median: 105.6, sumber_status: 'WHO 2006',
      berat_kg: 999,
    }),
    { status_gizi: 'gizi_baik', persen_median: 105.6, sumber_status: 'WHO 2006' },
  )
  assert.deepEqual(siapkanTerotorisasi('kunjungan', {
    divalidasi_oleh: 'p-nakes', balita_id: 'b-salah',
  }), { divalidasi_oleh: 'p-nakes' })
})

test('keputusan klinis tetap masuk audit, rahasia tetap dibuang', () => {
  const nilai = {
    divalidasi_oleh: 'p-nakes', status_gizi: 'gizi_baik', persen_median: 105.6,
    kata_sandi: 'rahasia', nik: '1234567890123456', dibuat_pada: 'x',
  }
  assert.equal(bersihkan(nilai).divalidasi_oleh, 'p-nakes')
  assert.equal(bersihkan(nilai).status_gizi, 'gizi_baik')
  assert.equal(bersihkan(nilai).persen_median, 105.6)
  assert.ok(!('kata_sandi' in bersihkan(nilai)))
  assert.ok(!('nik' in bersihkan(nilai)))
  assert.ok(!('dibuat_pada' in bersihkan(nilai)))
})

test('setiap jalur repositori membuka transaksi dan mencatat audit', () => {
  for (const fn of ['sisip', 'ubah', 'tulisTerotorisasi', 'hapus']) {
    const blok = repositori.slice(repositori.indexOf(`async function ${fn}(`))
    assert.match(blok.slice(0, 900), /denganKlien\(metadata/, fn)
    assert.match(blok.slice(0, 1600), /catatAudit\(/, fn)
  }
  assert.match(repositori, /metadata\.klien \? isi\(metadata\.klien\) : transaksi\(isi\)/)
  assert.match(repositori, /alamat_ip/)
})

test('validasi tunggal: kunjungan dan status gizi dalam satu transaksi', () => {
  const blok = data.slice(
    data.indexOf("router.post('/kunjungan/:id/validasi'"),
    data.indexOf("router.post('/validasi/semua'"),
  )
  assert.match(blok, /transaksi\(async \(klien\)/)
  assert.match(blok, /tulisTerotorisasi\('kunjungan'/)
  assert.match(blok, /tulisTerotorisasi\('pengukuran'/)
  assert.match(blok, /const satuDi = async/)
  assert.ok(!/^ub ah\(/m.test(blok))
})

test('validasi massal menghitung status gizi dan nomor parameter konsisten', () => {
  const blok = data.slice(
    data.indexOf("router.post('/validasi/semua'"),
    data.indexOf("router.post('/kunjungan/:id/tindak_lanjut'"),
  )
  assert.match(blok, /UPDATE pengukuran p/)
  assert.match(blok, /status_gizi = CASE/)
  assert.match(blok, /status_gizi IS NULL/)
  assert.match(blok, /median_berat_kg > 0/)
  assert.match(blok, /const tandai = \(v\)/)
  assert.ok(!/\$\{nilai\.length \+ 1\}/.test(blok))
  assert.ok(!/Rebinding: WHERE params came AFTER/.test(blok))
  // Empat ambang klasifikasi harus sama dengan domain/status_gizi.js.
  const ambang = baca('domain/status_gizi.js').match(/\[(\d+), '(gizi_[a-z_]+)'\]/g)
  assert.equal(ambang.length, 3)
  for (const [, angka] of ambang.map((s) => s.match(/\[(\d+),/))) {
    assert.match(blok, new RegExp(`>= ${angka} THEN`))
  }
})

test('tulisan server memakai whitelist terotorisasi, bukan whitelist sinkron', () => {
  assert.match(tabel, /KOLOM_TEROTORISASI/)
  assert.match(data, /const \{ ubah, hapus, sisip, tulisTerotorisasi \}/)
  assert.ok(!/await ubah\('kunjungan', minta\.params\.id, \{\s*divalidasi_oleh/.test(data))
})

// Regresi uji input manual: enam aksi CRUD pernah lolos tanpa jejak audit.
test('setiap CRUD konten, akun, dan sesi mencatat log_audit', () => {
  for (const aksi of ['buat', 'ubah', 'hapus']) {
    assert.match(konten, new RegExp(`catatKonten\\(minta, '${aksi}'`))
  }
  assert.match(sesi, /'sesi', \$2, 'hapus'/)
  const sunting = pengguna.slice(
    pengguna.indexOf("router.patch('/pengguna/:id'"),
    pengguna.indexOf("router.patch('/akun-saya'"),
  )
  assert.match(sunting, /'pengguna', \$2, 'ubah'/)
  // Penolakan harus sebelum UPDATE, bukan sesudahnya.
  assert.ok(sunting.indexOf('admin_tidak_bisa_dinonaktifkan') < sunting.indexOf('UPDATE pengguna SET'))
})

// Regresi: PATCH balita menerima `nik: "123"` (tersimpan) dan melempar 500
// untuk `jenis_kelamin` ngawur atau angka bukan-angka, padahal POST menolak.
test('PATCH balita memakai validasi per bidang seperti POST', () => {
  const blok = data.slice(
    data.indexOf('function nilaiBalitaSah('),
    data.indexOf("router.patch('/balita/:id'"),
  )
  assert.ok(blok.length > 100, 'fungsi nilaiBalitaSah() tidak ditemukan')
  for (const pola of [
    /POLA_NIK\.test\(b\.nik\)/,
    /'laki-laki', 'perempuan'\]\.includes\(b\.jenis_kelamin\)/,
    /POLA_TANGGAL\.test\(b\.tanggal_lahir\)/,
    /Number\.isFinite\(angka\)/,
    /typeof b\.aktif !== 'boolean'/,
  ]) assert.match(blok, pola)
  const rute = data.slice(
    data.indexOf("router.patch('/balita/:id'"),
    data.indexOf("router.delete('/balita/:id'"),
  )
  assert.match(rute, /nilaiBalitaSah\(minta\.body/)
  assert.ok(!/siapkan\('balita', minta\.body\)/.test(rute), 'PATCH masih meneruskan body mentah')
})

test('validasi massal mencatat audit untuk kunjungan dan pengukuran', () => {
  const blok = data.slice(
    data.indexOf("router.post('/validasi/semua'"),
    data.indexOf("router.post('/kunjungan/:id/tindak_lanjut'"),
  )
  assert.match(blok, /audit_kunjungan AS/)
  assert.match(blok, /audit_pengukuran AS/)
  assert.match(blok, /FROM ukur_baru/)
})
