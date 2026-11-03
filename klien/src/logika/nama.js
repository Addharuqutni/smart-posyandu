// Inisial nama untuk avatar teks. Dipakai daftar balita dan daftar akun.
export function inisial(nama) {
  return String(nama ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((bagian) => bagian[0]?.toUpperCase() ?? '')
    .join('')
}
