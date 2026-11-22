import { describe, expect, test } from 'vitest'
import { ACUAN_TIDAK_TERSEDIA, kelasStatus, labelStatus } from './rentang.js'

// A missing growth reference is a reason, never a nutrition status.
describe('labelStatus / kelasStatus', () => {
  test('alasan acuan tampil netral bila status kosong', () => {
    expect(labelStatus(null, ACUAN_TIDAK_TERSEDIA)).toBe('Acuan belum tersedia')
    expect(kelasStatus(null, ACUAN_TIDAK_TERSEDIA)).toBe(ACUAN_TIDAK_TERSEDIA)
  })

  test('tanpa status dan tanpa alasan jatuh ke fallback pemanggil', () => {
    expect(labelStatus(null, null)).toBeNull()
    expect(kelasStatus(null, null)).toBe('menunggu')
  })

  test('status klinis menang atas alasan apa pun', () => {
    expect(labelStatus('gizi_baik', ACUAN_TIDAK_TERSEDIA)).toBe('Gizi baik')
    expect(kelasStatus('gizi_baik', ACUAN_TIDAK_TERSEDIA)).toBe('gizi_baik')
  })

  test('kunci legacy sebaran tetap punya label manusia', () => {
    expect(labelStatus('belum_dinilai')).toBe('Belum dinilai')
  })
})
