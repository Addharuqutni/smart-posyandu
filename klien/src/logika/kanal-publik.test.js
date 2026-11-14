// Penjaga kanal publik: tidak boleh ada jadwal, jam, atau nama desa yang
// dikarang di dalam berkas ini. Warga membaca kanal ini sebagai jadwal
// sungguhan, jadi teks karangan lebih berbahaya daripada ruang kosong.
//
// Latar: blok "Minggu ke-2 (Tgl 10-15) · Pukul 08.30 - 11.30 WIB" pernah
// tertinggal setelah sumber datanya dihapus, dan tampil di kartu setiap
// Posyandu seolah-olah jadwal resmi.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const berkas = fileURLToPath(new URL('../antarmuka/KanalPublik.jsx', import.meta.url))
const sumber = readFileSync(berkas, 'utf8')

/** Buang komentar: penjelasan boleh menyebut contoh, kode tidak. */
const kode = sumber
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('kanal publik tidak mengarang data', () => {
  it('tidak ada jam atau pekan pelayanan yang ditulis langsung', () => {
    expect(kode).not.toMatch(/Minggu ke-\d/)
    expect(kode).not.toMatch(/\d{2}[.:]\d{2}\s*[-–]\s*\d{2}[.:]\d{2}/)
    expect(kode).not.toMatch(/Pukul\s+\d/)
  })

  it('hanya header yang menulis nama desa, selebihnya dari data', () => {
    // Header sengaja statis "Desa Ketenger" atas permintaan pemilik.
    // Di luar baris itu, nama desa/kecamatan tetap harus dari /posyandu/publik.
    expect(kode).toContain('Kanal Warga Desa Ketenger')
    const selainHeader = kode.replace('Kanal Warga Desa Ketenger', '')
    expect(selainHeader).not.toMatch(/Desa Ketenger/)
    expect(kode).not.toMatch(/Kec\.\s*Baturraden/)
  })

  it('tanggal jadwal diformat lewat helper, bukan ditampilkan mentah', () => {
    // Nilai mentah berbentuk '2026-11-09T08:00'; tampil apa adanya berarti bug.
    expect(kode).toMatch(/formatJadwal\(/)
    expect(kode).toMatch(/formatRentang\(/)
  })
})
