import { describe, expect, test } from 'vitest'
import { ariaBerikutnya } from './validasi-aksesibel.js'

// Kontrak kecil tapi mudah salah: `aria-invalid` harus mengikuti kapan
// peramban menganggap kolom salah (:user-invalid), dan penanda dari server
// (mis. layar Catat) tidak boleh ditimpa.
describe('ariaBerikutnya', () => {
  test('kolom yang baru disentuh dan salah jadi true', () => {
    expect(ariaBerikutnya({ salah: true, dariSkrip: false, ariaLama: null })).toBe('true')
  })

  test('kolom wajib kosong yang belum disentuh tetap false, bukan diumumkan', () => {
    expect(ariaBerikutnya({ salah: false, dariSkrip: false, ariaLama: null })).toBe('false')
  })

  test('galat hilang saat kolom diperbaiki', () => {
    expect(ariaBerikutnya({ salah: false, dariSkrip: true, ariaLama: 'true' })).toBe('false')
  })

  test('aria-invalid dari server tidak ditimpa', () => {
    expect(ariaBerikutnya({ salah: false, dariSkrip: false, ariaLama: 'true' })).toBeNull()
  })

  test('kolom yang salah tetap ditandai walau penanda lama dari server', () => {
    expect(ariaBerikutnya({ salah: true, dariSkrip: false, ariaLama: 'true' })).toBe('true')
  })
})
