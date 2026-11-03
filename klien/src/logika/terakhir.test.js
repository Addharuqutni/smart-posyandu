import { describe, expect, it } from 'vitest'
import { kunjunganTerbaruPerBalita, idDiukurBulanIni, rentangBulan } from './terakhir.js'

function kunjungan(isi) {
  return {
    id: isi.id ?? 'k-1',
    balita_id: isi.balita_id ?? 'b-1',
    tanggal_kunjungan: isi.tanggal_kunjungan ?? '2026-11-01',
    terjadi_pada: isi.terjadi_pada ?? '2026-11-01T02:00:00.000Z',
    dihapus_pada: isi.dihapus_pada ?? null,
  }
}

describe('kunjunganTerbaruPerBalita', () => {
  it('memilih tanggal kunjungan yang paling baru', () => {
    const peta = kunjunganTerbaruPerBalita([
      kunjungan({ id: 'lama', tanggal_kunjungan: '2026-09-10' }),
      kunjungan({ id: 'baru', tanggal_kunjungan: '2026-11-01' }),
      kunjungan({ id: 'tengah', tanggal_kunjungan: '2026-10-05' }),
    ])
    expect(peta.get('b-1').id).toBe('baru')
  })

  it('saat tanggal sama, terjadi_pada yang lebih baru menang', () => {
    const peta = kunjunganTerbaruPerBalita([
      kunjungan({ id: 'pagi', terjadi_pada: '2026-11-01T01:00:00.000Z' }),
      kunjungan({ id: 'siang', terjadi_pada: '2026-11-01T05:00:00.000Z' }),
    ])
    expect(peta.get('b-1').id).toBe('siang')
  })

  it('kunjungan terhapus tidak pernah dipilih', () => {
    const peta = kunjunganTerbaruPerBalita([
      kunjungan({ id: 'dihapus', tanggal_kunjungan: '2026-11-02', dihapus_pada: '2026-11-03T00:00:00.000Z' }),
      kunjungan({ id: 'hidup', tanggal_kunjungan: '2026-11-01' }),
    ])
    expect(peta.get('b-1').id).toBe('hidup')
  })

  it('memisahkan balita satu dengan yang lain', () => {
    const peta = kunjunganTerbaruPerBalita([
      kunjungan({ id: 'a', balita_id: 'b-1' }),
      kunjungan({ id: 'b', balita_id: 'b-2', tanggal_kunjungan: '2026-10-01' }),
    ])
    expect(peta.size).toBe(2)
    expect(peta.get('b-1').id).toBe('a')
    expect(peta.get('b-2').id).toBe('b')
  })

  it('daftar kosong menghasilkan peta kosong', () => {
    expect(kunjunganTerbaruPerBalita([]).size).toBe(0)
  })
})

describe('idDiukurBulanIni', () => {
  it('hanya menghitung kunjungan pada bulan yang diminta', () => {
    const sudah = idDiukurBulanIni(
      [
        kunjungan({ balita_id: 'b-1', tanggal_kunjungan: '2026-11-05' }),
        kunjungan({ balita_id: 'b-2', tanggal_kunjungan: '2026-10-05' }),
        kunjungan({ balita_id: 'b-1', tanggal_kunjungan: '2026-11-20' }),
      ],
      '2026-11',
    )
    expect([...sudah]).toEqual(['b-1'])
  })

  it('mengabaikan kunjungan yang terhapus', () => {
    const sudah = idDiukurBulanIni(
      [kunjungan({ balita_id: 'b-3', tanggal_kunjungan: '2026-11-05', dihapus_pada: '2026-11-06T00:00:00.000Z' })],
      '2026-11',
    )
    expect(sudah.size).toBe(0)
  })
})

describe('rentangBulan', () => {
  it('batas atas adalah hari pertama bulan berikutnya', () => {
    expect(rentangBulan('2026-11')).toEqual({ awal: '2026-11-01', akhir: '2026-12-01' })
  })

  it('bulan Desember menyeberang tahun', () => {
    expect(rentangBulan('2026-12')).toEqual({ awal: '2026-12-01', akhir: '2027-01-01' })
  })

  it('tidak pernah menghasilkan tanggal yang tidak ada', () => {
    for (const bulan of ['2026-02', '2026-04', '2026-06', '2026-11']) {
      const { akhir } = rentangBulan(bulan)
      const [t, b, h] = akhir.split('-').map(Number)
      const d = new Date(Date.UTC(t, b - 1, h))
      expect(d.getUTCMonth() + 1).toBe(b)
      expect(d.getUTCDate()).toBe(h)
    }
  })
})
