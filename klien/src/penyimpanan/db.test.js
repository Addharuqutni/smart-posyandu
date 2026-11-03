// Uji kerangka klien. Uji wajib (luring, benturan, hapus, rentang, audit)
// menyusul bersama fiturnya pada minggu 3.
import { describe, it, expect } from 'vitest'
// IndexedDB tidak ada di Node; polyfill hanya untuk uji.
import 'fake-indexeddb/auto'
import { db } from './db.js'
describe('skema penyimpanan lokal', () => {
  it('memuat tabel antrean sinkron', () => {
    // Antrean wajib ada sejak awal: tanpa itu data luring tak bisa terkirim.
    expect(db.antrean_sinkron).toBeDefined()
  })

  it('memuat penanda penyiapan awal', async () => {
    // Penyiapan menolak layanan bila salinan balita belum pernah diunduh
    // (ARSITEKTUR.md 3.4) — mencegah balita kembar.
    await db.penyiapan.put({ kunci: 'sudah_disiapkan', nilai: true })
    const baris = await db.penyiapan.get('sudah_disiapkan')
    expect(baris.nilai).toBe(true)
    await db.penyiapan.clear()
  })
})
