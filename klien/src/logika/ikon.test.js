// Semua ikon UI, termasuk yang dipakai kontrol native lewat CSS,
// harus mengambil path dari satu objek JALUR di Ikon.jsx.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { JALUR, ikonDataUri } from '../antarmuka/Ikon.jsx'

const sumberCss = readFileSync(new URL('../antarmuka/gaya.css', import.meta.url), 'utf8')
const sumberUtama = readFileSync(new URL('../utama.jsx', import.meta.url), 'utf8')

describe('sumber ikon tunggal', () => {
  it('path panah/kalender/jam tersedia di JALUR', () => {
    for (const nama of ['panah-kiri', 'panah-kanan', 'panah-bawah', 'kalender', 'jam']) {
      expect(JALUR[nama]).toMatch(/^M|^m/)
    }
  })

  it('kontrol native memakai variabel yang disuntik dari JALUR, bukan SVG terpisah', () => {
    expect(sumberCss).toContain('var(--ikon-panah-bawah, none)')
    expect(sumberCss).toContain('var(--ikon-kalender, none)')
    expect(sumberCss).toContain('var(--ikon-jam, none)')
    expect(sumberCss).not.toContain("url(\"data:image/svg+xml")
    expect(sumberUtama).toContain("ikonDataUri('panah-bawah'")
    expect(sumberUtama).toContain("ikonDataUri('kalender'")
    expect(sumberUtama).toContain("ikonDataUri('jam'")
  })

  it('data-uri ikon berisi path yang sama dengan komponen React', () => {
    expect(decodeURIComponent(ikonDataUri('kalender'))).toContain(JALUR.kalender)
  })
})
