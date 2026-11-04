import { describe, it, expect } from 'vitest'
import { rapikanDesimal, keAngka } from './angka.js'

describe('rapikanDesimal', () => {
  it('mengubah koma menjadi titik', () => {
    expect(rapikanDesimal('9,45')).toBe('9.45')
    expect(rapikanDesimal('74,0')).toBe('74.0')
  })

  it('membuang karakter selain angka dan titik', () => {
    expect(rapikanDesimal('9,4 kg')).toBe('9.4')
    expect(rapikanDesimal('abc')).toBe('')
  })

  it('mengembalikan string kosong untuk nilai kosong', () => {
    expect(rapikanDesimal('')).toBe('')
    expect(rapikanDesimal(null)).toBe('')
    expect(rapikanDesimal(undefined)).toBe('')
  })
})

describe('keAngka', () => {
  it('membaca desimal berkoma', () => {
    expect(keAngka('9,45')).toBe(9.45)
    expect(keAngka('9.45')).toBe(9.45)
    expect(keAngka(9.45)).toBe(9.45)
  })

  it('NaN untuk teks yang tidak bisa dibaca', () => {
    expect(Number.isNaN(keAngka(''))).toBe(true)
    expect(Number.isNaN(keAngka('.'))).toBe(true)
    expect(Number.isNaN(keAngka('abc'))).toBe(true)
  })
})
