import { describe, expect, it, vi } from 'vitest'
import { idBaru } from './waktu.js'

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
