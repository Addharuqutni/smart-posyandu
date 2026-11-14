// Service worker sederhana: simpan kerangka aplikasi agar bisa dibuka luring.
// Data tetap di IndexedDB; berkas ini tidak pernah menyentuh /sinkron.
// ponytail: tanpa Workbox. Bila aset bertambah rumit, pertimbangkan vite-plugin-pwa.
const CACHE = 'posyandu-v2'
const KERANGKA = ['/', '/index.html', '/manifest.webmanifest', '/logo-32.png', '/logo-192.png']

self.addEventListener('install', (peristiwa) => {
  peristiwa.waitUntil(caches.open(CACHE).then((c) => c.addAll(KERANGKA)))
  self.skipWaiting()
})

self.addEventListener('activate', (peristiwa) => {
  peristiwa.waitUntil(
    caches
      .keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Aplikasi kini memakai cookie sesi, bukan header Authorization. Pemeriksaan
// header saja tidak cukup: permintaan GET ke API otomatis membawa cookie. Bila
// di-cache, data balita tersimpan di CacheStorage browser. Karena itu seluruh
// path API ditolak dari cache; yang di-cache hanya kerangka aplikasi & asetnya.
const API = /^\/(masuk|keluar|saya|akun-saya|sinkron|balita|kunjungan|validasi|posyandu|pengguna|sesi|rekap|ekspor\.csv|kualitas|cadangan|konten-publik|aktivitas|wali|sehat|waktu)(\/|$|\?)/
const ASET = /^\/(assets\/|index\.html$|manifest\.webmanifest$|logo-(32|192|512)\.png$)/

self.addEventListener('fetch', (peristiwa) => {
  const permintaan = peristiwa.request
  if (permintaan.method !== 'GET') return
  if (permintaan.mode === 'navigate') {
    peristiwa.respondWith(
      fetch(permintaan)
        .then((jawab) => {
          const salinan = jawab.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', salinan))
          return jawab
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // Hanya aset aplikasi yang di-cache; API sudah ditolak di atas.
  const alamat = new URL(permintaan.url)
  if (alamat.origin !== self.location.origin) return
  if (API.test(alamat.pathname)) return
  if (!ASET.test(alamat.pathname)) return

  peristiwa.respondWith(
    caches.match(permintaan).then((tersimpan) => {
      const jaringan = fetch(permintaan)
        .then((jawab) => {
          const salinan = jawab.clone()
          caches.open(CACHE).then((c) => c.put(permintaan, salinan))
          return jawab
        })
        .catch(() => tersimpan)
      return tersimpan ?? jaringan
    }),
  )
})
