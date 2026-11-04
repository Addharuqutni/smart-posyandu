import { describe, expect, it, vi } from 'vitest'
import { idBaru, batasTanggalLahir, batasKunjungan, usiaDiterima, usiaRingkas, rincianUsia } from './waktu.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('idBaru di konteks tidak aman (http)', () => {
  it('memakai getRandomValues bila randomUUID tidak ada', () => {
    const asli = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: (a) => asli.getRandomValues(a),
    })
    try {
      const a = idBaru()
      expect(a).toMatch(UUID_V4)
      expect(idBaru()).not.toBe(a)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('batas usia balita 0 hari s.d. 84 bulan', () => {
  const hari = '2026-11-03'

  it('batas tanggal lahir dan kunjungan tepat 7 tahun', () => {
    expect(batasTanggalLahir(hari)).toBe('2019-11-03')
    expect(batasKunjungan('2019-11-03')).toBe(hari)
    expect(usiaDiterima('2019-11-03', hari)).toBe(true)
    expect(usiaDiterima(hari, hari)).toBe(true)
  })

  it('menolak masa depan, lebih tua 7 tahun, dan tanggal palsu', () => {
    expect(usiaDiterima('2019-11-02', hari)).toBe(false)
    expect(usiaDiterima('2026-11-04', hari)).toBe(false)
    expect(usiaDiterima('2026-02-30', hari)).toBe(false)
    expect(usiaDiterima('', hari)).toBe(false)
  })

  it('29 Februari dijepit ke 28 Februari', () => {
    expect(batasTanggalLahir('2024-02-29')).toBe('2017-02-28')
    expect(usiaDiterima('2017-02-28', '2024-02-29')).toBe(true)
    expect(usiaDiterima('2017-02-27', '2024-02-29')).toBe(false)
  })
})

describe('usiaRingkas untuk tabel', () => {
  const hari = '2026-11-03'

  it('menampilkan tahun dan bulan, bukan angka bulan mentah', () => {
    expect(usiaRingkas('2023-11-03', hari)).toBe('3 tahun')
    expect(usiaRingkas('2023-09-03', hari)).toBe('3 tahun 2 bulan')
    expect(usiaRingkas('2026-01-03', hari)).toBe('10 bulan')
    expect(usiaRingkas(hari, hari)).toBe('0 hari')
    expect(usiaRingkas('2026-10-31', hari)).toBe('3 hari')
  })

  it('rincian usia memisah angka, satuan, dan keterangan', () => {
    expect(rincianUsia('2023-09-03', hari)).toEqual({ nilai: 3, satuan: 'tahun', keterangan: '2 bulan' })
    expect(rincianUsia('2026-01-03', hari)).toEqual({ nilai: 10, satuan: 'bulan', keterangan: null })
  })

  it('menolak data lama atau tanggal tidak sah', () => {
    expect(usiaRingkas('1700-01-01', hari)).toBeNull()
    expect(usiaRingkas('2026-02-30', hari)).toBeNull()
    expect(usiaRingkas('2027-01-01', hari)).toBeNull()
  })
})
