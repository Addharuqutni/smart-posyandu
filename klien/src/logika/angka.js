// Kader mengetik desimal dengan koma (9,45), bukan titik. <input type="number">
// mengembalikan string kosong untuk nilai berkoma di Chrome Android, sehingga
// berat yang sah terlihat "belum diisi". Karena itu input ukur memakai
// type="text" inputMode="decimal" dan normalisasi dilakukan di sini.

/** Ubah teks yang diketik kader menjadi teks angka bertitik, atau '' bila kosong. */
export function rapikanDesimal(nilai) {
  if (nilai == null) return ''
  return String(nilai)
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '')
}

/** Angka dari teks berkoma; NaN bila tidak bisa dibaca. */
export function keAngka(nilai) {
  const bersih = rapikanDesimal(nilai)
  if (bersih === '' || bersih === '.') return NaN
  return Number(bersih)
}
