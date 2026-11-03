// NIK dienkripsi sebelum masuk antrean luring (KONTRAK_API 3, AGENTS 6).
// Kunci AES-GCM tidak dapat diekspor dan disimpan di IndexedDB; kunci lenyap
// bila data aplikasi dihapus, sesuai sifat data lokal tablet.
import { db } from '../penyimpanan/db.js'

const KUNCI = 'kunci_nik'
let janjiKunci = null

function keB64(nilai) {
  return btoa(String.fromCharCode(...new Uint8Array(nilai)))
}

function dariB64(teks) {
  return Uint8Array.from(atob(teks), (c) => c.charCodeAt(0))
}

function kunci() {
  if (!janjiKunci) {
    janjiKunci = (async () => {
      const tersimpan = await db.penyiapan.get(KUNCI)
      if (tersimpan?.nilai) return tersimpan.nilai
      const baru = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      )
      await db.penyiapan.put({ kunci: KUNCI, nilai: baru })
      return baru
    })()
  }
  return janjiKunci
}

export async function enkripsiNik(nik) {
  if (!nik) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await kunci(),
    new TextEncoder().encode(nik),
  )
  return { iv: keB64(iv), data: keB64(data) }
}

export async function dekripsiNik(bungkus) {
  if (!bungkus) return null
  try {
    const data = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: dariB64(bungkus.iv) },
      await kunci(),
      dariB64(bungkus.data),
    )
    return new TextDecoder().decode(data)
  } catch {
    return null
  }
}
