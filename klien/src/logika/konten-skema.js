// Skema bidang per jenis konten: satu sumber untuk form tambah, form sunting,
// dan validasi. Bidang yang tidak berlaku bagi suatu jenis tidak ditampilkan
// dan tidak dikirim, supaya tidak ada input kosong yang membingungkan.
export const SKEMA = {
  jadwal: {
    label: 'Jadwal Posyandu',
    ikon: 'waktu',
    ket: 'Waktu pelaksanaan, lokasi dusun, dan kebutuhan yang dibawa warga.',
    judul: 'cth. Posyandu Melati: Penimbangan Bulan November',
    isi: 'Tulis agenda: penimbangan, imunisasi, PMT, konsultasi gizi. Sebutkan siapa yang melayani.',
    bidang: [
      { kunci: 'tanggal', label: 'Tanggal & jam', placeholder: 'cth. Sabtu, 14 November 2026 · 08.00–11.00 WIB', wajib: true },
      { kunci: 'kategori', label: 'Dusun / lokasi', placeholder: 'cth. Balai Dusun Melati', wajib: false },
    ],
  },
  layanan: {
    label: 'Informasi Layanan',
    ikon: 'cek',
    ket: 'Jenis pelayanan yang tersedia bagi warga beserta penjelasannya.',
    judul: 'cth. Imunisasi Dasar Lengkap',
    isi: 'Jelaskan layanan: sasaran usia, siapa yang melayani, dan apakah gratis.',
    bidang: [
      { kunci: 'kategori', label: 'Sasaran / kelompok', placeholder: 'cth. Bayi 0–9 bulan', wajib: false },
    ],
  },
  pengumuman: {
    label: 'Pengumuman Desa',
    ikon: 'peringatan',
    ket: 'Pemberitahuan resmi yang harus dibaca warga, mis. perubahan jadwal atau syarat kunjungan.',
    judul: 'cth. Posyandu Bulan Ini Dimajukan',
    isi: 'Tulis isi pengumuman secara ringkas dan jelas: apa yang berubah dan apa yang harus dilakukan warga.',
    bidang: [
      { kunci: 'tanggal', label: 'Berlaku sampai / tanggal', placeholder: 'cth. berlaku 1–15 November 2026', wajib: false },
    ],
  },
  edukasi: {
    label: 'Edukasi Gizi & Kesehatan',
    ikon: 'anak',
    ket: 'Materi ringkas untuk orang tua: gizi, pola asuh, sanitasi, tumbuh kembang.',
    judul: 'cth. Pentingnya Protein Hewani pada MPASI',
    isi: 'Tulis penjelasan singkat yang bisa dipahami orang tua tanpa istilah medis rumit.',
    bidang: [
      { kunci: 'kategori', label: 'Topik', placeholder: 'cth. Pencegahan Stunting', wajib: true },
    ],
  },
}

export const URUT_JENIS = ['jadwal', 'layanan', 'pengumuman', 'edukasi']

/** Bentuk kosong untuk satu jenis konten. */
export function kosong(jenis = 'jadwal') {
  const nilai = { jenis, judul: '', isi: '', penting: false, aktif: true, urutan: 0 }
  for (const b of SKEMA[jenis]?.bidang ?? []) nilai[b.kunci] = ''
  return nilai
}

/** Bidang berisi untuk dikirim; bidang yang tidak ada di skema dibuang. */
export function muatanDari(nilai) {
  const keluar = {
    jenis: nilai.jenis,
    judul: nilai.judul.trim(),
    isi: nilai.isi.trim(),
    penting: Boolean(nilai.penting),
    aktif: nilai.aktif !== false,
    urutan: Number(nilai.urutan) || 0,
  }
  for (const b of SKEMA[nilai.jenis]?.bidang ?? []) {
    const v = typeof nilai[b.kunci] === 'string' ? nilai[b.kunci].trim() : ''
    keluar[b.kunci] = v || null
  }
  return keluar
}

/** Bidang wajib yang masih kosong; nama labelnya dikembalikan. */
export function bidangKurang(nilai) {
  const kurang = []
  if (!nilai.judul?.trim()) kurang.push('Judul')
  if (!nilai.isi?.trim()) kurang.push('Isi')
  for (const b of SKEMA[nilai.jenis]?.bidang ?? []) {
    if (b.wajib && !String(nilai[b.kunci] ?? '').trim()) kurang.push(b.label)
  }
  return kurang
}

/**
 * Lencana status persetujuan, satu sumber untuk tabel dan modal.
 *
 * `ikon` wajib. Status tidak boleh dibawa warna saja: hijau di aplikasi ini
 * sudah berarti "gizi baik" pada tabel balita, jadi lencana persetujuan butuh
 * kanal kedua (ikon) dan ketiga (teks) supaya tidak tertukar saat satu layar
 * memuat dua jenis status sekaligus.
 */
export const LENCANA_STATUS = {
  menunggu: { teks: 'Menunggu nakes', ikon: 'waktu', kelas: 'border-kuning-100 bg-kuning-100 text-kuning-800' },
  disetujui: { teks: 'Disetujui', ikon: 'centang', kelas: 'border-hijau-100 bg-hijau-100 text-hijau-800' },
  ditolak: { teks: 'Ditolak', ikon: 'peringatan', kelas: 'border-merah-100 bg-merah-100 text-merah-800' },
}
