// Uji pemetaan rute: URL → layar, dan penjagaan per peran.
import { describe, expect, it } from 'vitest'
import { LAYAR_SAH, bolehDibuka, jalurDari, layarDari } from './rute.js'

const BAWAAN_KADER = { nama: 'beranda' }
const BAWAAN_NAKES = { nama: 'validasi' }
const BAWAAN_ADMIN = { nama: 'laporan' }

describe('layarDari', () => {
  it('membaca path bersih menjadi layar', () => {
    expect(layarDari('/app/konten', 'admin_desa', BAWAAN_ADMIN)).toEqual({ nama: 'konten' })
    expect(layarDari('/app/catat', 'kader', BAWAAN_KADER)).toEqual({ nama: 'catat' })
    expect(layarDari('/app/validasi', 'nakes', BAWAAN_NAKES)).toEqual({ nama: 'validasi' })
    expect(layarDari('/', undefined, { nama: 'publik' })).toEqual({ nama: 'publik' })
    expect(layarDari('/app/login', undefined, { nama: 'publik' })).toEqual({ nama: 'masuk' })
  })

  it('tetap mendukung hash warisan', () => {
    expect(layarDari('#/konten', 'admin_desa', BAWAAN_ADMIN)).toEqual({ nama: 'konten' })
    expect(layarDari('#/catat', 'kader', BAWAAN_KADER)).toEqual({ nama: 'catat' })
    expect(layarDari('#validasi', 'nakes', BAWAAN_NAKES)).toEqual({ nama: 'validasi' })
    expect(layarDari('#/publik', undefined, { nama: 'masuk' })).toEqual({ nama: 'publik' })
  })

  it('path kosong atau tidak dikenal memakai layar bawaan', () => {
    expect(layarDari('', 'kader', BAWAAN_KADER)).toBe(BAWAAN_KADER)
    expect(layarDari('/app/entah', 'kader', BAWAAN_KADER)).toBe(BAWAAN_KADER)
    expect(layarDari('#/entah', 'kader', BAWAAN_KADER)).toBe(BAWAAN_KADER)
    expect(layarDari(null, 'kader', BAWAAN_KADER)).toBe(BAWAAN_KADER)
  })

  it('menolak layar milik peran lain', () => {
    // Kader menempel URL admin → kembali ke beranda, bukan membuka laporan.
    expect(layarDari('#/laporan', 'kader', BAWAAN_KADER)).toBe(BAWAAN_KADER)
    expect(layarDari('#/pengguna', 'nakes', BAWAAN_NAKES)).toBe(BAWAAN_NAKES)
    expect(layarDari('#/validasi', 'admin_desa', BAWAAN_ADMIN)).toBe(BAWAAN_ADMIN)
  })

  it('tamu hanya boleh masuk dan kanal publik', () => {
    expect(layarDari('/', undefined, { nama: 'publik' })).toEqual({ nama: 'publik' })
    expect(layarDari('/app/login', undefined, { nama: 'publik' })).toEqual({ nama: 'masuk' })
    expect(layarDari('/app/laporan', undefined, { nama: 'publik' })).toEqual({ nama: 'publik' })
  })

  it('riwayat tanpa muatan balita tidak dibuka dari tautan', () => {
    expect(layarDari('#/riwayat', 'kader', BAWAAN_KADER)).toBe(BAWAAN_KADER)
  })

  it('riwayat dibuka bila muatan balita ikut di history.state', () => {
    const balita = { id: 'b-1', nama_lengkap: 'Balita Uji' }
    expect(layarDari('/app/riwayat', 'kader', BAWAAN_KADER, { balita })).toEqual({
      nama: 'riwayat',
      balita,
    })
    // Tanpa muatan tetap ditolak, dan peran lain tak boleh memakainya.
    expect(layarDari('/app/riwayat', 'kader', BAWAAN_KADER)).toBe(BAWAAN_KADER)
    expect(layarDari('/app/riwayat', 'nakes', BAWAAN_NAKES, { balita })).toBe(BAWAAN_NAKES)
  })

  it('setiap nama layar sah dibuka minimal satu peran', () => {
    for (const nama of LAYAR_SAH) {
      const pemilik = [undefined, 'kader', 'nakes', 'admin_desa'].filter((p) => bolehDibuka(nama, p))
      expect(pemilik.length, nama).toBeGreaterThanOrEqual(1)
    }
    // 'konten' sengaja dipakai ketiga peran; 'catat'/'riwayat' hanya kader.
    expect(['kader', 'nakes', 'admin_desa'].filter((p) => bolehDibuka('konten', p))).toHaveLength(3)
    expect(['nakes', 'admin_desa'].filter((p) => bolehDibuka('catat', p))).toHaveLength(0)
  })
})

describe('bolehDibuka', () => {
  it('kader hanya layar pencatatan dan jadwal', () => {
    expect(bolehDibuka('beranda', 'kader')).toBe(true)
    expect(bolehDibuka('laporan', 'kader')).toBe(false)
    expect(bolehDibuka('pengguna', 'kader')).toBe(false)
  })

  it('nakes hanya validasi dan jadwal', () => {
    expect(bolehDibuka('validasi', 'nakes')).toBe(true)
    expect(bolehDibuka('konten', 'nakes')).toBe(true)
    expect(bolehDibuka('balita', 'nakes')).toBe(false)
    expect(bolehDibuka('log', 'nakes')).toBe(false)
  })

  it('log aktivitas hanya untuk admin desa', () => {
    expect(bolehDibuka('log', 'admin_desa')).toBe(true)
    expect(bolehDibuka('log', 'kader')).toBe(false)
    expect(bolehDibuka('log', undefined)).toBe(false)
  })

  it('peran tak dikenal tidak boleh apa pun', () => {
    expect(LAYAR_SAH.every((n) => !bolehDibuka(n, 'tamu'))).toBe(true)
  })

  it('tamu boleh kanal publik, petugas tidak', () => {
    expect(bolehDibuka('publik', undefined)).toBe(true)
    expect(bolehDibuka('publik', 'kader')).toBe(false)
  })
})

describe('jalurDari', () => {
  it('menghasilkan path bersih tanpa hash', () => {
    expect(jalurDari({ nama: 'publik' })).toBe('/')
    expect(jalurDari({ nama: 'masuk' })).toBe('/app/login')
    expect(jalurDari({ nama: 'beranda' })).toBe('/app/beranda')
    expect(jalurDari({ nama: 'konten' })).toBe('/app/konten')
  })

  it('bisa dibaca balik oleh layarDari', () => {
    for (const nama of ['balita', 'laporan', 'posyandu', 'pengguna', 'konten']) {
      expect(layarDari(jalurDari({ nama }), 'admin_desa', { nama: 'laporan' })).toEqual({ nama })
    }
  })

  it('layar yang bukan milik peran tidak bisa dipulihkan dari path', () => {
    expect(layarDari(jalurDari({ nama: 'validasi' }), 'admin_desa', { nama: 'laporan' })).toEqual({
      nama: 'laporan',
    })
  })
})
