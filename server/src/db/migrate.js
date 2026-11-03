// Terapkan skema dan migrasi ke PostgreSQL.
//
// Urutannya penting:
//   1. database/schema.sql      — tabel dasar
//   2. database/migrasi/*.sql   — kolom sinkron, acuan BB/U, dll (idempoten)
//
// Jalankan: node src/db/migrate.js
// Aman dijalankan berulang: setiap berkas migrasi memakai IF NOT EXISTS /
// ON CONFLICT DO NOTHING.

const fs = require('fs')
const path = require('path')
const { dapatkan } = require('./pool')
const { muat } = require('../env')

const AKAR = path.resolve(__dirname, '../../..')

function berkasMigrasi() {
  const folder = path.join(AKAR, 'database/migrasi')
  if (!fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(folder, f))
}

async function terapkan(pool, berkas, label) {
  const sql = fs.readFileSync(berkas, 'utf8')
  try {
    await pool.query(sql)
    console.log(`  ok  ${label}`)
  } catch (salah) {
    throw new Error(`${label} gagal: ${salah.message}`)
  }
}

async function utama() {
  muat()
  const pool = dapatkan()

  // Satu transaksi: bila salah satu gagal, tidak ada yang setengah jadi.
  await pool.query('BEGIN')
  try {
    await terapkan(pool, path.join(AKAR, 'database/schema.sql'), 'database/schema.sql')
    for (const berkas of berkasMigrasi()) {
      await terapkan(pool, berkas, `database/migrasi/${path.basename(berkas)}`)
    }
    await pool.query('COMMIT')
    console.log('Migrasi selesai.')
  } catch (salah) {
    await pool.query('ROLLBACK')
    throw salah
  } finally {
    await pool.end()
  }
}

utama().catch((salah) => {
  console.error('Migrasi gagal:', salah.message)
  process.exit(1)
})
