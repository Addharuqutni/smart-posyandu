// Skema bidang per jenis konten: satu sumber untuk form tambah, form sunting,
// dan validasi. Bidang yang tidak berlaku bagi suatu jenis tidak ditampilkan
// dan tidak dikirim, supaya tidak ada input kosong yang membingungkan.
//
// `tipe` menentukan kontrol yang dirender:
//   (tidak diisi)  teks biasa
//   'tanggal-jam'  input tanggal + input jam, digabung jadi satu nilai
//   'rentang'      dua input tanggal (mulai s.d. akhir)
//   'posyandu'     pilihan Posyandu; memakai `pilihan` yang disuntik layar
//
// Format tanggal tetap disimpan pada SATU kolom `tanggal` bertipe TEXT yang
// sudah ada. `posyandu_id` ikut dikirim supaya jadwal yang dibuat admin bisa
// dipetakan ke kartu lokasi di kanal publik.
export const SKEMA = {
  jadwal: {
    label: 'Jadwal Posyandu',
    ikon: 'waktu',
    ket: 'Waktu pelaksanaan, lokasi dusun, dan kebutuhan yang dibawa warga.',
    judul: 'cth. Posyandu Melati: Penimbangan Bulan November',
    isi: 'Tulis agenda: penimbangan, imunisasi, PMT, konsultasi gizi. Sebutkan siapa yang melayani.',
    bidang: [
      { kunci: 'posyandu_id', label: 'Posyandu', tipe: 'posyandu', wajib: true, hanyaForm: true },
      { kunci: 'tanggal', label: 'Tanggal & jam', tipe: 'tanggal-jam', wajib: true },
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
      { kunci: 'tanggal', label: 'Masa berlaku', tipe: 'rentang', wajib: false },
    ],
  },
  edukasi: {
    label: 'Edukasi & Pencegahan',
    ikon: 'anak',
    ket: 'Materi ringkas untuk orang tua: gizi, pola asuh, sanitasi, tumbuh kembang.',
    judul: 'cth. Pentingnya Protein Hewani pada MPASI',
    isi: 'Tulis penjelasan singkat yang bisa dipahami orang tua tanpa istilah medis rumit.',
    // Edukasi tidak punya bidang tambahan. Kolom `kategori` tetap ada di
    // database untuk jenis lain; isinya pada edukasi lama tidak dihapus.
    bidang: [],
  },
}

// --- Bentuk nilai bidang tanggal ------------------------------------------
// jadwal      'YYYY-MM-DDTHH:mm'  (jam boleh kosong: 'YYYY-MM-DD')
// pengumuman  'YYYY-MM-DD/YYYY-MM-DD'  (akhir boleh kosong)
//
// Nilai lama yang ditulis bebas (mis. "Sabtu, 14 November") tidak bisa dipecah;
// helper di bawah mengembalikan bagian kosong dan menampilkan nilai aslinya
// apa adanya, jadi data lama tidak hilang dari layar.

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

/** 'YYYY-MM-DD' -> '14 November 2026'. `null` bila bukan tanggal ISO. */
export function formatTanggal(nilai) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nilai ?? '')
  if (!m) return null
  const bulan = BULAN[Number(m[2]) - 1]
  return bulan ? `${Number(m[3])} ${bulan} ${m[1]}` : null
}

export function pecahTanggalJam(nilai) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec(nilai ?? '')
  return m ? { tanggal: m[1], jam: m[2] ?? '' } : { tanggal: '', jam: '' }
}

export function gabungTanggalJam(tanggal, jam) {
  if (!tanggal) return ''
  return jam ? `${tanggal}T${jam}` : tanggal
}

export function pecahRentang(nilai) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(nilai ?? '')
  return m ? { mulai: m[1], akhir: m[2] ?? '' } : { mulai: '', akhir: '' }
}

export function gabungRentang(mulai, akhir) {
  if (!mulai) return ''
  return akhir && akhir !== mulai ? `${mulai}/${akhir}` : mulai
}

/** 'YYYY-MM-DD' -> { hari: '9', bulan: 'Nov' } untuk blok tanggal ringkas. */
export function blokTanggal(nilai) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nilai ?? '')
  if (!m) return null
  const bulan = BULAN[Number(m[2]) - 1]
  if (!bulan) return null
  return { hari: String(Number(m[3])), bulan: bulan.slice(0, 3) }
}

/** '2026-11-14T08:00' -> '14 November 2026 · 08.00'. */
export function formatJadwal(nilai) {
  if (!nilai) return null
  const { tanggal, jam } = pecahTanggalJam(nilai)
  const t = formatTanggal(tanggal)
  if (!t) return nilai
  return jam ? `${t} · ${jam.replace(':', '.')}` : t
}

/** '2026-11-01/2026-11-15' -> '1 November 2026 s.d. 15 November 2026'. */
export function formatRentang(nilai) {
  if (!nilai) return null
  const { mulai, akhir } = pecahRentang(nilai)
  const a = formatTanggal(mulai)
  if (!a) return nilai
  const b = formatTanggal(akhir)
  return b ? `${a} s.d. ${b}` : a
}

/** Nilai bidang tanggal sesuai jenisnya, atau nilai aslinya bila tak dikenali. */
export function formatTanggalKonten(jenis, nilai) {
  if (!nilai) return null
  return jenis === 'pengumuman' ? formatRentang(nilai) : formatJadwal(nilai)
}

/**
 * Jadwal yang masih akan datang, urut dari yang paling dekat.
 *
 * Server mengirim urut kolom `urutan` (urutan tampil), bukan urut waktu, jadi
 * pengurutan harus dilakukan di sini. Jadwal bertanggal lampau dibuang: warga
 * yang datang berdasarkan kanal ini tidak boleh diarahkan ke kegiatan yang
 * sudah selesai.
 */
export function jadwalMendatang(daftar, hariIni) {
  return (daftar ?? [])
    .filter((k) => k.jenis === 'jadwal' && (!k.tanggal || k.tanggal.slice(0, 10) >= hariIni))
    .sort((a, b) => String(a.tanggal ?? '9999').localeCompare(String(b.tanggal ?? '9999')))
}

/** Jadwal mendatang terdekat per Posyandu; Map posyandu_id -> konten. */
export function jadwalPerPosyandu(daftar, hariIni) {
  const peta = new Map()
  for (const k of jadwalMendatang(daftar, hariIni)) {
    if (!k.posyandu_id || !k.tanggal || peta.has(k.posyandu_id)) continue
    peta.set(k.posyandu_id, k)
  }
  return peta
}

/** Wilayah satu Posyandu: "Dusun Mawar · Desa Ketenger · Kec. Baturraden". */
export function wilayahPosyandu(pos) {
  return [
    // `dusun` sering sudah berbunyi "Dusun Mawar"; prefiks hanya ditambahkan
    // bila belum ada, supaya tidak menjadi "Dusun Dusun Mawar".
    pos?.dusun && (/^dusun\b/i.test(pos.dusun) ? pos.dusun : `Dusun ${pos.dusun}`),
    pos?.desa && `Desa ${pos.desa}`,
    pos?.kecamatan && `Kec. ${pos.kecamatan}`,
  ].filter(Boolean).join(' · ') || 'Wilayah desa'
}

/**
 * Nilai satu bidang untuk ditampilkan (tabel, rincian, antrean).
 * `null` bila kosong, supaya pemanggil bisa memilih sendiri penggantinya.
 */
export function nilaiTampil(bidang, konten) {
  const v = konten?.[bidang.kunci]
  if (!v) return null
  if (bidang.tipe === 'tanggal-jam') return formatJadwal(v)
  if (bidang.tipe === 'rentang') return formatRentang(v)
  return v
}

export const URUT_JENIS = ['jadwal', 'layanan', 'pengumuman', 'edukasi']

/** Bentuk kosong untuk satu jenis konten. */
export function kosong(jenis = 'jadwal') {
  const nilai = { jenis, judul: '', isi: '', penting: false, aktif: true, urutan: 0 }
  for (const b of SKEMA[jenis]?.bidang ?? []) nilai[b.kunci] = ''
  return nilai
}

/** Bidang berisi untuk dikirim; bidang yang tidak ada di skema dibuang. */
export function muatanDari(nilai, { abaikan = [] } = {}) {
  const keluar = {
    jenis: nilai.jenis,
    judul: nilai.judul.trim(),
    isi: nilai.isi.trim(),
    penting: Boolean(nilai.penting),
    aktif: nilai.aktif !== false,
    urutan: Number(nilai.urutan) || 0,
  }
  for (const b of SKEMA[nilai.jenis]?.bidang ?? []) {
    if (abaikan.includes(b.kunci)) continue
    const v = typeof nilai[b.kunci] === 'string' ? nilai[b.kunci].trim() : ''
    keluar[b.kunci] = v || null
  }
  return keluar
}

/**
 * Bidang wajib yang masih kosong; nama labelnya dikembalikan.
 * `abaikan` dipakai untuk field yang tidak dirender pada peran tertentu —
 * misalnya pilihan Posyandu bagi kader, yang sudah diisi server dari akunnya.
 */
export function bidangKurang(nilai, { abaikan = [] } = {}) {
  const kurang = []
  if (!nilai.judul?.trim()) kurang.push('Judul')
  if (!nilai.isi?.trim()) kurang.push('Isi')
  for (const b of SKEMA[nilai.jenis]?.bidang ?? []) {
    if (abaikan.includes(b.kunci)) continue
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
