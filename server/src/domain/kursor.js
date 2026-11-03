// Kursor halaman untuk tarikan sinkron.
//
// Kursor berbasis waktu saja tidak cukup: beberapa baris bisa punya
// `diperbarui_pada` yang sama persis (satu transaksi menyisipkan beberapa
// tabel, atau `now()` dipakai berulang dalam satu pernyataan). Dengan
// perbandingan `> waktu`, baris yang tersisa pada cap waktu itu tidak pernah
// terkirim. Karena itu kursor diikat ke (waktu, tabel, id).
//
// Bentuk: "<iso>|<nama_tabel>|<id>". Bentuk lama "<iso>" tetap diterima.

function bacaKursor(sejak) {
  if (!sejak) return null
  const [waktu, tabel, id] = String(sejak).split('|')
  const tanggal = new Date(waktu)
  if (Number.isNaN(tanggal.getTime())) return null
  // Cap waktu dipertahankan APA ADANYA, termasuk mikrodetiknya.
  //
  // `new Date(...).toISOString()` membulatkan ke milidetik. Itu berbahaya:
  // begitu ada lebih dari satu milidetik yang sama isinya (mis. seluruh baris
  // hasil `npm run demo`, atau baris hasil pemulihan cadangan yang di-`now()`
  // bersamaan), kursor berhenti bergerak di dalam milidetik itu. Perbandingan
  // di SQL memakai cap waktu penuh, jadi kursor juga harus penuh supaya
  // halaman berikutnya benar-benar mulai setelah baris terakhir halaman ini.
  //
  // Nilai baru selalu ISO UTC ("...Z"); kursor lama bermilidetik tetap sah.
  const teks = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(waktu)
    ? waktu
    : tanggal.toISOString()
  return { waktu: teks, tabel: tabel || '', id: id || '' }
}

function tulisKursor(namaTabel, baris) {
  return `${new Date(baris.diperbarui_pada).toISOString()}|${namaTabel}|${baris.id}`
}

/** Bandingkan dua posisi: negatif bila a lebih dulu, positif bila b lebih dulu. */
function bandingkan(a, b) {
  if (a.waktu !== b.waktu) return a.waktu < b.waktu ? -1 : 1
  if (a.tabel !== b.tabel) return a.tabel < b.tabel ? -1 : 1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/** Posisi satu kandidat, dalam bentuk yang sama dengan kursor. */
function posisi(kandidat) {
  return {
    waktu: new Date(kandidat.baris.diperbarui_pada).toISOString(),
    tabel: kandidat.namaTabel,
    id: String(kandidat.baris.id),
  }
}

/** Benar bila kandidat berada setelah kursor (belum pernah dikirim). */
function lewatKursor(kandidat, kursor) {
  return bandingkan(posisi(kandidat), kursor) > 0
}

module.exports = { bacaKursor, tulisKursor, bandingkan, posisi, lewatKursor }
