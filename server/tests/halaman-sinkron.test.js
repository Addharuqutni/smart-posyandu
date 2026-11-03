// Uji penyusun kueri halaman sinkron. Murni: tanpa basis data.
//
// Yang diuji di sini adalah bentuk kueri, karena bentuk itulah yang menentukan
// dua sifat yang pernah rusak dan sudah terukur di basis data:
//
//  1. Setiap baris terkirim tepat satu kali. Versi yang menyaring kursor di
//     Node kehilangan 421.128 dari 433.134 baris ketika banyak baris berbagi
//     satu cap waktu, lalu berhenti tanpa galat.
//  2. Syarat kursor harus bisa dipakai indeks (diperbarui_pada, id). Versi yang
//     memakai perbandingan tuple tiga unsur memaksa penyortiran ulang setiap
//     halaman: 2,7 sampai 4,0 detik per halaman, berkas sementara ~90 MB.

const test = require('node:test')
const assert = require('node:assert')

process.env.KUNCI_RAHASIA = 'kunci-uji'

const { bangunKueriHalaman } = require('../src/domain/halaman-sinkron')

const TABEL = ['balita', 'kunjungan']
const KURSOR = { waktu: '2026-11-01T00:00:00.000000Z', tabel: 'balita', id: 'abc' }

// Pengganti syaratPosyandu asli: menambah satu parameter dan memakai nomornya.
function syaratPosyanduPalsu(tabel, pos, nilai) {
  if (!pos) return ''
  nilai.push(pos)
  return ` AND posyandu_id = $${nilai.length}`
}

function susun({ tabel = TABEL, kursor = null, batas = 100, pos = null } = {}) {
  return bangunKueriHalaman({ tabel, kursor, batas, pos, syaratPosyandu: syaratPosyanduPalsu })
}

const cabang = (sql) => sql.split(' UNION ALL ')

test('satu kueri dengan satu urutan global, bukan satu kueri per tabel', () => {
  const { sql } = susun()
  assert.ok(sql.startsWith('SELECT x.tabel, x.baris, x.waktu_teks, x.dihapus, x.id FROM ('))
  assert.strictEqual(cabang(sql).length, TABEL.length)
  // Urutan global wajib (cap waktu, tabel, id) dan memakai cap waktu APA ADANYA
  // supaya urutannya sama dengan urutan indeks tiap cabang.
  assert.ok(sql.includes('ORDER BY x.diperbarui, x.tabel, x.id::text'))
})

test('tiap cabang dibatasi sendiri, plus satu batas keseluruhan', () => {
  const { sql, param } = susun({ batas: 100 })
  // Dua cabang + satu batas keseluruhan, semuanya batas + 1.
  assert.strictEqual((sql.match(/LIMIT \$\d+/g) || []).length, TABEL.length + 1)
  assert.strictEqual(param.filter((p) => p === 101).length, TABEL.length + 1)
})

test('tanpa kursor: tidak ada syarat kursor, tetapi urutan tetap ada', () => {
  const { sql, param } = susun()
  assert.strictEqual((sql.match(/WHERE TRUE/g) || []).length, TABEL.length)
  assert.ok(sql.includes('ORDER BY t.diperbarui_pada, t.id'))
  assert.deepStrictEqual(param, [101, 101, 101])
})

test('cabang yang namanya sama dengan tabel kursor memakai (ts, id) > (…)', () => {
  // Perbandingan dua kolom inilah yang bisa dipakai indeks (diperbarui_pada, id).
  const { sql } = susun({ kursor: KURSOR })
  assert.ok(sql.includes('(t.diperbarui_pada, t.id) > ('))
  // Tuple tiga unsur yang memuat nama tabel sebagai unsur tidak boleh muncul:
  // itulah bentuk yang memaksa penyortiran ulang tiap halaman.
  assert.ok(!sql.includes("', t.id::text) >"))
})

test('cabang yang lebih besar dari tabel kursor memakai ts >=', () => {
  // 'kunjungan' > 'balita': semua barisnya di cap waktu kursor sudah dianggap
  // setelah kursor, jadi >= (bukan >) supaya tidak ada baris yang terlewat.
  const { sql } = susun({ kursor: KURSOR, tabel: ['kunjungan'] })
  assert.ok(sql.includes('t.diperbarui_pada >= '))
})

test('cabang yang lebih kecil dari tabel kursor memakai ts >', () => {
  const { sql } = susun({ kursor: { ...KURSOR, tabel: 'kunjungan' }, tabel: ['balita'] })
  assert.ok(sql.includes('t.diperbarui_pada > '))
  assert.ok(!sql.includes('t.diperbarui_pada >= '))
})

test('cap waktu kursor diambil bermikrodetik sebagai teks', () => {
  const { sql } = susun()
  // node-postgres mengubah timestamptz menjadi Date bermilidetik; kursor dari
  // objek Date itu akan mengirim ulang baris pada milidetik yang sama.
  assert.ok(sql.includes("to_char(t.diperbarui_pada AT TIME ZONE 'UTC'"))
  assert.ok(sql.includes('HH24:MI:SS.US'))
  assert.ok(sql.includes('AS waktu_teks'))
})

test('kolom yang dipakai tablet tetap ikut, yang tidak dipakai dibuang', () => {
  const { sql } = susun({ tabel: ['balita'] })
  // `diperbarui_pada` dan `dihapus_pada` WAJIB ada: penyimpanan lokal tablet
  // mengindeks `diperbarui_pada`, dan `terapkan` membaca `dihapus_pada`.
  // Membuang `diperbarui_pada` pernah membuat tarikan berhenti di 2.001 baris.
  assert.ok(!sql.includes("- 'diperbarui_pada'"), 'diperbarui_pada tidak boleh dibuang')
  assert.ok(!sql.includes("- 'dihapus_pada'"), 'dihapus_pada tidak boleh dibuang')
  assert.ok(sql.includes("- 'dibuat_pada'"))
  assert.ok(sql.includes("- 'id_perangkat'"))
  // Cap waktu penuh dan penanda hapus tetap tersedia sebagai kolom terpisah
  // untuk kursor dan penulisan `aksi`.
  assert.ok(sql.includes('t.diperbarui_pada AS diperbarui'))
  assert.ok(sql.includes('t.dihapus_pada AS dihapus'))
})

test('lingkup posyandu menambah satu parameter per cabang', () => {
  const { sql, param } = susun({ kursor: KURSOR, pos: 'posyandu-1' })
  // Untuk tiap cabang: parameter kursor (1 atau 2), posyandu (1), batas (1).
  // Cabang 'balita' memakai (ts, id) -> 2 parameter kursor; 'kunjungan' memakai
  // >= -> 1 parameter. Lalu batas keseluruhan.
  assert.strictEqual(param.filter((p) => p === 'posyandu-1').length, TABEL.length)
  assert.strictEqual(param[param.length - 1], 101)
  const posyanduPertama = param.indexOf('posyandu-1') + 1
  assert.ok(sql.includes(`posyandu_id = $${posyanduPertama}`))
})

test('semua penanda parameter yang dipakai ada di daftar parameter', () => {
  for (const kursor of [null, KURSOR]) {
    for (const pos of [null, 'posyandu-1']) {
      const { sql, param } = susun({ kursor, pos })
      const dipakai = new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))
      for (const n of dipakai) {
        assert.ok(n >= 1 && n <= param.length, `$${n} di luar jangkauan ${param.length} parameter`)
      }
    }
  }
})
