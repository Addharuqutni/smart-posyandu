import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const akar = fileURLToPath(new URL('../../', import.meta.url))
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

describe('SEO dasar', () => {
  it('JSON-LD valid dan memakai domain kanonik', () => {
    const blok = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(blok).toBeTruthy()
    const data = JSON.parse(blok[1])
    const url = 'https://posyandudesaketenger.my.id/'
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@graph'].every((n) => !n.url || n.url === url)).toBe(true)
    expect(data['@graph'].map((n) => n['@type'])).toContain('WebSite')
  })

  it('robots.txt tidak memblokir /app/ dan tetap mencantumkan sitemap', () => {
    const robots = readFileSync(new URL('../../public/robots.txt', import.meta.url), 'utf8')
    expect(robots).not.toMatch(/Disallow:\s*\/app\//)
    expect(robots).toMatch(/Sitemap:\s*https:\/\/posyandudesaketenger\.my\.id\/sitemap\.xml/)
  })

  it('aset yang dirujuk head benar-benar ada', () => {
    for (const p of ['favicon.ico', 'logo-32.png', 'og-image.png']) {
      expect(readFileSync(new URL('../../public/' + p, import.meta.url)).length).toBeGreaterThan(0)
    }
    expect(html).toContain('og-image.png')
    expect(html).toContain('favicon.ico')
  })
})
