// Uji skema konten publik: tiap jenis punya bidang sendiri, dan muatan yang
// dikirim hanya memuat bidang yang relevan bagi jenis itu.
import { describe, expect, it } from 'vitest'
import { SKEMA, URUT_JENIS, bidangKurang, kosong, muatanDari } from './konten-skema.js'

describe('skema konten publik', () => {
  it('setiap jenis punya label, keterangan, dan contoh', () => {
    for (const jenis of URUT_JENIS) {
      const s = SKEMA[jenis]
      expect(s.label, jenis).toBeTruthy()
      expect(s.ket, jenis).toBeTruthy()
      expect(s.judul, jenis).toBeTruthy()
      expect(s.isi, jenis).toBeTruthy()
      expect(Array.isArray(s.bidang), jenis).toBe(true)
    }
  })

  it('bidang tambahan berbeda per jenis', () => {
    expect(SKEMA.jadwal.bidang.map((b) => b.kunci)).toEqual(['tanggal', 'kategori'])
    expect(SKEMA.layanan.bidang.map((b) => b.kunci)).toEqual(['kategori'])
    expect(SKEMA.pengumuman.bidang.map((b) => b.kunci)).toEqual(['tanggal'])
    expect(SKEMA.edukasi.bidang.map((b) => b.kunci)).toEqual(['kategori'])
  })

  it('kosong() hanya memuat bidang milik jenisnya', () => {
    expect(Object.keys(kosong('layanan'))).not.toContain('tanggal')
    expect(Object.keys(kosong('jadwal'))).toContain('tanggal')
    expect(kosong('edukasi').penting).toBe(false)
  })

  it('muatanDari() membuang bidang yang tidak berlaku untuk jenis itu', () => {
    const nilai = { ...kosong('layanan'), judul: 'Imunisasi', isi: 'Gratis', kategori: 'Bayi', tanggal: 'besok' }
    const muatan = muatanDari(nilai)
    expect(muatan.kategori).toBe('Bayi')
    expect(muatan).not.toHaveProperty('tanggal')
  })

  it('muatanDari() mengubah isian kosong menjadi null', () => {
    const muatan = muatanDari({ ...kosong('jadwal'), judul: 'J', isi: 'I', tanggal: '  ', kategori: '' })
    expect(muatan.tanggal).toBeNull()
    expect(muatan.kategori).toBeNull()
  })

  it('bidangKurang() menyebut bidang wajib yang kosong per jenis', () => {
    expect(bidangKurang({ ...kosong('jadwal'), judul: '', isi: '' })).toEqual(
      expect.arrayContaining(['Judul', 'Isi', 'Tanggal & jam']),
    )
    expect(bidangKurang({ ...kosong('edukasi'), judul: 'A', isi: 'B' })).toEqual(['Topik'])
    expect(bidangKurang({ ...kosong('layanan'), judul: 'A', isi: 'B' })).toEqual([])
  })
})
