import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KesalahanApi, cariBalitaWali, daftarPosyandu, masuk } from './api.js'

describe('401 pada jalur publik', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'nama_atau_nik_tidak_cocok' }),
    })))
    vi.stubGlobal('localStorage', { removeItem: vi.fn(), getItem: vi.fn() })
    vi.stubGlobal('sessionStorage', { removeItem: vi.fn(), getItem: vi.fn() })
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  })

  it('Cek Anak tidak mengeluarkan sesi petugas', async () => {
    await expect(cariBalitaWali('Sari', '2020-01-01')).rejects.toBeInstanceOf(KesalahanApi)
    expect(localStorage.removeItem).not.toHaveBeenCalled()
    expect(window.dispatchEvent).not.toHaveBeenCalled()
  })

  it('salah kata sandi tidak mengeluarkan sesi petugas', async () => {
    await expect(masuk('kader', 'salah', 'perangkat')).rejects.toBeInstanceOf(KesalahanApi)
    expect(localStorage.removeItem).not.toHaveBeenCalled()
    expect(window.dispatchEvent).not.toHaveBeenCalled()
  })

  it('jalur petugas tetap mengeluarkan sesi pada 401', async () => {
    await expect(daftarPosyandu()).rejects.toBeInstanceOf(KesalahanApi)
    expect(localStorage.removeItem).toHaveBeenCalled()
    expect(window.dispatchEvent).toHaveBeenCalled()
  })
})
