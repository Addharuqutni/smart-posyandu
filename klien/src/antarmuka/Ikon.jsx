// Ikon garis sederhana, satu sumber. Tidak ada pustaka ikon: aplikasi harus
// tetap ringan dan berfungsi luring (AGENTS 2.1).
const JALUR = {
  posyandu:
    'M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10Z M12 8v6 M9 11h6',
  kunjungan:
    'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M9 16l2 2 4-4',
  balita:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  'balita-hadir':
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M16 11l2 2 4-4',
  'balita-absen':
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 8l4 4 M21 8l-4 4',
  tambah: 'M12 5v14 M5 12h14',
  riwayat: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
  cek: 'm4 12.5 5 5L20 6.5',
  peringatan: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z M12 9v4 M12 17h.01',
  luring:
    'M2 2l20 20 M8.5 16.5a5 5 0 0 1 7 0 M5 12.9a11 11 0 0 1 5.2-2.8 M15.5 10.2A11 11 0 0 1 19 12.9 M2 8.8A16 16 0 0 1 7 5.6 M12 20h.01 M16.7 5.6A16 16 0 0 1 22 8.8',
  sinkron: 'M21 12a9 9 0 0 1-15.5 6.2L3 16 M3 21v-5h5 M3 12A9 9 0 0 1 18.5 5.8L21 8 M21 3v5h-5',
  cari: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3',
  kembali: 'M19 12H5 M12 19l-7-7 7-7',
  keluar: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  rekap: 'M3 3v18h18 M7 16v-5 M12 16V7 M17 16v-8',
  akun:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8v6 M22 11h-6',
  unduh: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  pulihkan: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 8v4l3 2',
  perangkat: 'M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M8 21h8 M12 17v4',
  simpan: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z M17 21v-8H7v8 M7 3v5h8',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 16v-4 M12 8h.01',
  mata: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'mata-tutup':
    'M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9 M9.9 4.2A10.5 10.5 0 0 1 12 4c6.5 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2 M14.1 14.1a3 3 0 1 1-4.2-4.2 M2 2l20 20',
  grafik: 'M3 3v18h18 M7 14l4-4 3 3 5-6',
  anak: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M9 9h.01 M15 9h.01 M9.5 14a3.5 3.5 0 0 0 5 0',
  tutup: 'M18 6 6 18 M6 6l12 12',
  centang: 'M20 6 9 17l-5-5',
}

export default function Ikon({ nama, ukuran = 20, className = '', tebal = 2 }) {
  const jalur = JALUR[nama]
  if (!jalur) return null
  return (
    <svg
      className={`block shrink-0 ${className}`}
      width={ukuran}
      height={ukuran}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={tebal}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={jalur} />
    </svg>
  )
}
