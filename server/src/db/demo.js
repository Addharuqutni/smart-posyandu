// Data demo untuk menguji tampilan dan beban data.
//
//   node src/db/demo.js --balita=3000        # isi
//   node src/db/demo.js --hapus              # buang semua baris demo
//
// Alat pengembangan, BUKAN bagian aplikasi:
//  - Semua baris diberi id_perangkat = 'demo-seed' supaya bisa dibuang lagi.
//  - Penghapusan di sini fisik (DELETE), berbeda dari aturan AGENTS 2.3 yang
//    berlaku untuk data pemakai. Jangan jalankan di basis data produksi.
//  - log_audit tidak diisi: ini bukan aktivitas pemakai.
//
// Deterministik: benih tetap, jadi angka dan nama sama setiap kali dijalankan.
// Aman diulang: memakai ON CONFLICT DO NOTHING pada id tetap.

const { muat } = require('../env')
const { satu, banyak, transaksi } = require('../db/pool')
const { enkripsi } = require('../domain/rahasia')
const { klasifikasi } = require('../domain/status_gizi')

const PENANDA = 'demo-seed'

// --- argumen ---------------------------------------------------------------

function argumen() {
  // kunjunganMaks = 0 berarti "seluruh riwayat bulanan" (bawaan).
  const hasil = { balita: 3000, kunjunganMaks: 0, posyandu: 1, benih: 20261030, hapus: false }
  for (const a of process.argv.slice(2)) {
    const [kunci, nilai] = a.replace(/^--/, '').split('=')
    if (kunci === 'hapus') hasil.hapus = true
    else if (kunci === 'balita') hasil.balita = Number(nilai)
    else if (kunci === 'kunjungan') hasil.kunjunganMaks = Number(nilai)
    else if (kunci === 'posyandu') hasil.posyandu = Number(nilai)
    else if (kunci === 'benih') hasil.benih = Number(nilai)
  }
  if (!Number.isFinite(hasil.balita) || hasil.balita < 1 || hasil.balita > 200000) {
    throw new Error('--balita harus 1..200000')
  }
  return hasil
}

// --- pembangkit acak deterministik (mulberry32) -----------------------------

function acak(benih) {
  let a = benih >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * UUID tetap dari benih + nomor urut. Kunci utama harus sama setiap kali
 * dijalankan, supaya `ON CONFLICT (id) DO NOTHING` benar-benar membuat
 * skrip ini idempoten. `crypto.randomUUID()` membuat baris baru setiap
 * kali, sehingga menjalankan ulang akan menggandakan data.
 */
function buatId(ac, urut) {
  const heks = []
  for (let i = 0; i < 16; i += 1) {
    heks.push(Math.floor(ac() * 256).toString(16).padStart(2, '0'))
  }
  // Versi 4 dan varian RFC 4122, walau tidak dipakai untuk keamanan.
  heks[6] = ((parseInt(heks[6], 16) & 0x0f) | 0x40).toString(16).padStart(2, '0')
  heks[8] = ((parseInt(heks[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')
  const h = heks.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const BUAT = {
  depanL: ['Budi', 'Agus', 'Dimas', 'Eko', 'Fajar', 'Gilang', 'Hendra', 'Irfan', 'Joko', 'Krisna',
    'Lukman', 'Miko', 'Nanda', 'Oki', 'Panji', 'Rafi', 'Satria', 'Teguh', 'Umar', 'Wahyu',
    'Yoga', 'Zaki', 'Arif', 'Bayu', 'Cahyo', 'Dedi', 'Fauzi', 'Galih', 'Hafiz', 'Iqbal'],
  depanP: ['Ayu', 'Bella', 'Citra', 'Dewi', 'Elsa', 'Fitri', 'Gita', 'Hana', 'Indah', 'Jihan',
    'Kartika', 'Lestari', 'Maya', 'Nadia', 'Oktavia', 'Putri', 'Rani', 'Sari', 'Tiara', 'Ulfa',
    'Vina', 'Wulan', 'Yuni', 'Zahra', 'Anisa', 'Bunga', 'Cahya', 'Dinda', 'Erika', 'Farah'],
  tengah: ['Adi', 'Bagus', 'Candra', 'Dwi', 'Eka', 'Firman', 'Gunawan', 'Hadi', 'Iwan', 'Jaya',
    'Kurnia', 'Maulana', 'Nugroho', 'Pratama', 'Rahayu', 'Santoso', 'Tri', 'Utami', 'Wijaya',
    'Yulianto'],
  akhir: ['Santoso', 'Wijaya', 'Pratama', 'Nugroho', 'Saputra', 'Hidayat', 'Setiawan', 'Kusuma',
    'Permana', 'Wibowo', 'Susanto', 'Handoko', 'Mulyani', 'Rahmawati', 'Anggraini', 'Safitri',
    'Puspita', 'Ramadhani', 'Firdaus', 'Maulida'],
  dusun: ['Dukuh Krajan', 'Dukuh Karang', 'Dukuh Melati', 'Dukuh Slamet', 'Dukuh Sari'],
}

function pilih(ac, senarai) {
  return senarai[Math.floor(ac() * senarai.length)]
}

function angka(ac, min, max) {
  return min + ac() * (max - min)
}

/** Bulatkan ke kelipatan tertentu, mis. 0,05 kg. */
function bulat(nilai, langkah) {
  return Math.round(nilai / langkah) * langkah
}

function iso(tanggal) {
  return tanggal.toISOString()
}

function tanggalDari(teks) {
  return new Date(`${teks}T00:00:00Z`)
}

function tambahHari(tanggal, hari) {
  const salinan = new Date(tanggal.getTime())
  salinan.setUTCDate(salinan.getUTCDate() + hari)
  return salinan
}

function usiaBulan(lahir, saat) {
  let bulan = (saat.getUTCFullYear() - lahir.getUTCFullYear()) * 12
  bulan += saat.getUTCMonth() - lahir.getUTCMonth()
  if (saat.getUTCDate() < lahir.getUTCDate()) bulan -= 1
  return bulan
}

function tanggalLahirAcak(ac, hariIni, usiaMin, usiaMaks) {
  const usia = Math.floor(angka(ac, usiaMin, usiaMaks + 1))
  const sisaHari = Math.floor(ac() * 28)
  return tambahHari(tambahHari(hariIni, -(usia * 30 + sisaHari)), 0)
}

// --- penyisipan berkelompok ------------------------------------------------

/**
 * Sisipkan banyak baris dengan satu perintah per kelompok.
 * `kolom` urut dan tetap; `baris` array nilai sepanjang kolom.
 * Mengembalikan jumlah baris yang benar-benar baru (bukan yang sudah ada).
 */
async function sisipBanyak(klien, tabel, kolom, baris, ukuran = 500) {
  let baru = 0
  for (let i = 0; i < baris.length; i += ukuran) {
    const kelompok = baris.slice(i, i + ukuran)
    const nilai = []
    const bagian = kelompok.map((r, indeks) => {
      const tanda = r.map((_, k) => `$${indeks * kolom.length + k + 1}`)
      nilai.push(...r)
      return `(${tanda.join(', ')})`
    })
    const hasil = await klien.query(
      `INSERT INTO ${tabel} (${kolom.join(', ')}) VALUES ${bagian.join(', ')}
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      nilai,
    )
    baru += hasil.rowCount
  }
  return baru
}

// --- konten publik ---------------------------------------------------------
//
// `konten_publik` tidak punya kolom id_perangkat (migrasi 005), jadi baris
// demo tidak bisa ditandai seperti tabel lain. Yang dipakai: id deterministik
// dari `buatId()` + daftar tetap di bawah. `hapusDemo()` menghapus tepat
// id-id itu, bukan menyapu tabel — konten yang dibuat orang lain tetap utuh.
//
// Tanggal disimpan sebagai teks sesuai bentuk yang dipakai form:
//   jadwal      'YYYY-MM-DDTHH:mm'
//   pengumuman  'YYYY-MM-DD/YYYY-MM-DD'
function kontenDemo(ac, { posyanduId, kaderId, nakesId, adminId, hariIni }) {
  const geser = (hari) => {
    const d = new Date(hariIni)
    d.setUTCDate(d.getUTCDate() + hari)
    return d.toISOString().slice(0, 10)
  }

  const baris = [
    // --- Jadwal (kader ajukan, nakes setujui) ---
    {
      jenis: 'jadwal',
      judul: 'Penimbangan Balita Dusun Melati',
      isi: 'Penimbangan berat dan tinggi badan, pengukuran lingkar kepala, serta konsultasi gizi. Bawa Buku KIA.',
      kategori: 'Balai Dusun Melati',
      tanggal: `${geser(3)}T08:00`,
      status: 'disetujui',
      pengaju: kaderId,
      posyandu: posyanduId,
      putuskan: nakesId,
    },
    {
      jenis: 'jadwal',
      judul: 'Imunisasi Dasar Lengkap Bayi',
      isi: 'Imunisasi BCG, Polio, dan DPT-HB-Hib untuk bayi 0-11 bulan bersama Bidan Desa.',
      kategori: 'Balai Dusun Melati',
      tanggal: `${geser(17)}T09:00`,
      status: 'disetujui',
      pengaju: kaderId,
      posyandu: posyanduId,
      putuskan: nakesId,
    },
    {
      jenis: 'jadwal',
      judul: 'Pemberian Vitamin A dan PMT',
      isi: 'Pemberian kapsul Vitamin A dosis biru untuk bayi 6-11 bulan dan merah untuk balita 12-59 bulan, disertai makanan tambahan.',
      kategori: 'Pendopo Desa Ketenger',
      tanggal: `${geser(31)}T08:30`,
      status: 'disetujui',
      pengaju: adminId,
      posyandu: posyanduId,
      putuskan: adminId,
    },
    {
      jenis: 'jadwal',
      judul: 'Kelas Ibu Balita: MPASI Bergizi',
      isi: 'Praktik memasak MPASI berbahan pangan lokal bersama kader dan ahli gizi Puskesmas.',
      kategori: 'Balai Dusun Melati',
      tanggal: `${geser(45)}T10:00`,
      status: 'menunggu',
      pengaju: kaderId,
      posyandu: posyanduId,
      putuskan: null,
    },
    {
      jenis: 'jadwal',
      judul: 'Posyandu Remaja (uji coba)',
      isi: 'Pemeriksaan kesehatan remaja: anemia, kebersihan diri, dan konseling gizi.',
      kategori: 'Balai Dusun Melati',
      tanggal: `${geser(-10)}T08:00`,
      status: 'ditolak',
      pengaju: kaderId,
      posyandu: posyanduId,
      putuskan: nakesId,
      catatan: 'Bukan program posyandu balita. Ajukan lewat Puskesmas, bukan kanal ini.',
    },

    // --- Informasi Layanan ---
    {
      jenis: 'layanan',
      judul: 'Penimbangan dan Pengukuran Rutin',
      isi: 'Berat badan, tinggi/panjang badan, dan lingkar kepala setiap bulan untuk deteksi dini risiko stunting. Gratis untuk semua balita.',
      kategori: 'Semua balita 0-59 bulan',
      status: 'disetujui',
      pengaju: adminId,
    },
    {
      jenis: 'layanan',
      judul: 'Imunisasi Dasar Lengkap',
      isi: 'Vaksinasi BCG, Polio, DPT-HB-Hib, dan Campak-Rubela sesuai jadwal usia anak, bekerja sama dengan Puskesmas Baturraden.',
      kategori: 'Bayi 0-11 bulan',
      status: 'disetujui',
      pengaju: adminId,
    },
    {
      jenis: 'layanan',
      judul: 'Konsultasi Gizi dan Tumbuh Kembang',
      isi: 'Konseling pengasuhan, MPASI, dan pemantauan grafik KMS bersama kader terlatih dan Bidan Desa.',
      kategori: 'Orang tua balita',
      status: 'disetujui',
      pengaju: adminId,
    },
    {
      jenis: 'layanan',
      judul: 'Pemberian Makanan Tambahan (PMT)',
      isi: 'PMT berbahan pangan lokal kaya protein hewani bagi balita dengan berat badan di bawah garis normal.',
      kategori: 'Balita risiko stunting',
      status: 'disetujui',
      pengaju: adminId,
    },

    // --- Pengumuman Desa ---
    {
      jenis: 'pengumuman',
      judul: 'Jadwal Posyandu Bulan Ini Dimajukan',
      isi: 'Pelaksanaan Posyandu Dusun Melati dimajukan satu pekan karena bertepatan dengan hari besar. Mohon hadir sesuai tanggal baru.',
      kategori: 'Wajib dibaca',
      tanggal: `${geser(0)}/${geser(14)}`,
      penting: true,
      status: 'disetujui',
      pengaju: adminId,
    },
    {
      jenis: 'pengumuman',
      judul: 'Membawa Buku KIA Saat Berkunjung',
      isi: 'Mulai bulan ini setiap balita wajib membawa Buku KIA. Balita tanpa Buku KIA tetap dilayani, tetapi pencatatan dilakukan menyusul.',
      kategori: 'Syarat kunjungan',
      tanggal: `${geser(0)}/${geser(60)}`,
      status: 'disetujui',
      pengaju: adminId,
    },
    {
      jenis: 'pengumuman',
      judul: 'Posyandu Libur Hari Raya',
      isi: 'Tidak ada pelayanan pada pekan hari raya. Jadwal pengganti akan diumumkan melalui kader dusun.',
      kategori: 'Libur',
      tanggal: `${geser(-20)}/${geser(-6)}`,
      status: 'disetujui',
      pengaju: adminId,
    },

    // --- Edukasi Gizi & Kesehatan ---
    {
      jenis: 'edukasi',
      judul: 'Protein Hewani Wajib Ada di Setiap MPASI',
      isi: 'Telur, ikan, ayam, dan daging merah mengandung asam amino esensial yang tidak bisa digantikan karbohidrat. Kenalkan sejak usia 6 bulan, satu butir telur sehari sudah cukup.',
      kategori: 'Pencegahan Stunting',
      status: 'disetujui',
      pengaju: adminId,
    },
    {
      jenis: 'edukasi',
      judul: 'Dua Kali Tidak Naik Berat Badan adalah Alarm',
      isi: 'Bila berat badan balita tidak naik dua kali penimbangan berturut-turut (2T), segera rujuk ke Bidan Desa. Jangan menunggu sampai turun.',
      kategori: 'Pemantauan KMS',
      status: 'disetujui',
      pengaju: adminId,
    },
    {
      jenis: 'edukasi',
      judul: 'Air Bersih dan Cuci Tangan Cegah Diare Berulang',
      isi: 'Diare berulang menghambat penyerapan gizi dan memicu stunting. Masak air hingga matang dan biasakan cuci tangan pakai sabun sebelum menyuapi anak.',
      kategori: 'Sanitasi',
      status: 'disetujui',
      pengaju: adminId,
    },
    {
      jenis: 'edukasi',
      judul: 'ASI Eksklusif Sampai 6 Bulan',
      isi: 'ASI saja tanpa tambahan air atau makanan sampai usia 6 bulan. Setelah itu lanjutkan ASI disertai MPASI sampai 2 tahun.',
      kategori: 'Gizi Bayi',
      status: 'disetujui',
      pengaju: adminId,
    },
  ]

  return baris.map((k, urut) => ({
    id: buatId(ac, 9000 + urut),
    jenis: k.jenis,
    judul: k.judul,
    isi: k.isi,
    kategori: k.kategori ?? null,
    tanggal: k.tanggal ?? null,
    penting: Boolean(k.penting),
    aktif: k.status === 'disetujui',
    urutan: urut,
    status: k.status,
    pengaju: k.pengaju ?? null,
    posyandu: k.posyandu ?? null,
    putuskan: k.putuskan ?? null,
    catatan: k.catatan ?? null,
  }))
}

// --- program utama ---------------------------------------------------------

async function hapusDemo() {
  const { tanpaBatasWaktu } = require('../db/pool')
  const hasil = {}

  // Menghapus 200 ribu kunjungan butuh lebih dari batas 10 detik milik pool.
  // `tanpaBatasWaktu` memberi koneksi dengan statement_timeout = 0 khusus
  // untuk pembersihan ini; koneksi lain tetap dibatasi.
  return tanpaBatasWaktu(async (klien) => {
    const kueri = (teks, nilai) => klien.query(teks, nilai)

    // Kunjungan dan turunannya ikut terhapus lewat rantai balita_id.
    // Penting: jangan hanya menyaring id_perangkat. Begitu kunjungan
    // divalidasi petugas, id_perangkat-nya menjadi 'server' (bukan
    // 'demo-seed'), jadi baris itu tidak pernah ikut terhapus dan
    // mengunci balita lewat kunci asing.
    const { rows: idBalita } = await kueri(
      `SELECT id FROM balita WHERE id_perangkat = $1`,
      [PENANDA],
    )
    const daftar = idBalita.map((b) => b.id)

    const hapus = async (tabel, teks, nilai) => {
      const { rowCount } = await kueri(teks, nilai)
      hasil[tabel] = rowCount
    }

    if (daftar.length) {
      await hapus('tindak_lanjut',
        `DELETE FROM tindak_lanjut WHERE kunjungan_id IN
           (SELECT id FROM kunjungan WHERE balita_id = ANY($1::uuid[]))`, [daftar])
      await hapus('pengukuran',
        `DELETE FROM pengukuran WHERE kunjungan_id IN
           (SELECT id FROM kunjungan WHERE balita_id = ANY($1::uuid[]))`, [daftar])
      await hapus('kunjungan', `DELETE FROM kunjungan WHERE balita_id = ANY($1::uuid[])`, [daftar])
      await hapus('balita_orang_tua',
        `DELETE FROM balita_orang_tua WHERE balita_id = ANY($1::uuid[])`, [daftar])
    }

    await hapus('orang_tua', `DELETE FROM orang_tua WHERE id_perangkat = $1`, [PENANDA])
    await hapus('balita', `DELETE FROM balita WHERE id_perangkat = $1`, [PENANDA])
    await hapus('kader', `DELETE FROM kader WHERE id_perangkat = $1`, [PENANDA])

    // konten_publik tidak punya id_perangkat; id demo dibuat deterministik
    // dari benih yang sama (namespace +7), jadi bisa dihitung ulang di sini.
    // Hanya id itu yang dihapus — konten buatan orang lain tidak tersentuh.
    const acHapus = acak(argumen().benih + 7)
    const idKonten = kontenDemo(acHapus, {
      posyanduId: null, kaderId: null, nakesId: null, adminId: null, hariIni: '2026-01-01',
    }).map((k) => k.id)
    await hapus('konten_publik',
      `DELETE FROM konten_publik WHERE id = ANY($1::uuid[])`, [idKonten])

    return hasil
  })
}

async function utama() {
  muat()
  const opsi = argumen()

  if (opsi.hapus) {
    const hasil = await hapusDemo()
    console.log('Baris demo dibuang:')
    for (const [t, n] of Object.entries(hasil)) console.log(`  ${t.padEnd(18)} ${n}`)
    process.exit(0)
  }

  const ac = acak(opsi.benih)
  const hariIni = tanggalDari(new Date().toISOString().slice(0, 10))

  // Acuan median BB/U, dipakai agar status gizi realistis dan konsisten
  // dengan perhitungan server.
  const acuan = await banyak(
    `SELECT usia_bulan, jenis_kelamin, median_berat_kg, sumber
     FROM acuan_berat_umur WHERE dihapus_pada IS NULL`,
  )
  if (!acuan.length) throw new Error('acuan_berat_umur kosong — jalankan npm run migrasi dulu')
  const median = new Map(acuan.map((a) => [`${a.jenis_kelamin}:${a.usia_bulan}`, a]))
  const sumber = acuan[0].sumber

  // Posyandu: pakai yang sudah ada, tambah bila diminta lebih dari satu.
  let daftarPos = await banyak(
    `SELECT id, nama FROM posyandu WHERE dihapus_pada IS NULL ORDER BY dibuat_pada`,
  )
  if (!daftarPos.length) throw new Error('belum ada Posyandu — jalankan npm run seed dulu')
  if (opsi.posyandu > daftarPos.length) {
    for (let i = daftarPos.length; i < opsi.posyandu; i += 1) {
      const nama = `Posyandu Demo ${i + 1}`
      const id = buatId(ac)
      await require('../db/pool').kueri(
        `INSERT INTO posyandu (id, nama, dusun, desa, kecamatan, kabupaten, aktif,
                               dibuat_pada, diperbarui_pada, id_perangkat)
         VALUES ($1, $2, $3, 'Ketenger', 'Baturraden', 'Banyumas', TRUE, now(), now(), $4)`,
        [id, nama, pilih(ac, BUAT.dusun), PENANDA],
      )
      daftarPos.push({ id, nama })
    }
  }
  daftarPos = daftarPos.slice(0, opsi.posyandu)

  // Kader pelaksana. kunjungan.kader_id menunjuk ke tabel ini.
  const penggunaKader = await satu(
    `SELECT id FROM pengguna WHERE peran = 'kader' AND dihapus_pada IS NULL ORDER BY dibuat_pada LIMIT 1`,
  )
  const kaderPerPos = []
  for (const pos of daftarPos) {
    const id = buatId(ac)
    await require('../db/pool').kueri(
      `INSERT INTO kader (id, pengguna_id, posyandu_id, nama_lengkap, jabatan, aktif,
                          dibuat_pada, diperbarui_pada, id_perangkat)
       VALUES ($1, $2, $3, $4, 'Kader Posyandu', TRUE, now(), now(), $5)
       ON CONFLICT (id) DO NOTHING`,
      [id, penggunaKader?.id ?? null, pos.id, `Kader ${pos.nama}`, PENANDA],
    )
    kaderPerPos.push(id)
  }

  // Waktu dasar: satu detik per baris supaya kursor sinkron (`diperbarui_pada`)
  // unik. Tanpa ini, halaman kedua `GET /sinkron` akan melewatkan baris yang
  // cap waktunya sama.
  let detak = Date.UTC(2026, 9, 1, 0, 0, 0)
  const berikut = () => {
    detak += 1000
    return iso(new Date(detak))
  }

  const orangTua = []
  const balita = []
  const relasi = []
  const kunjungan = []
  const pengukuran = []
  const tindakLanjut = []

  for (let i = 0; i < opsi.balita; i += 1) {
    const pos = daftarPos[i % daftarPos.length]
    const kaderId = kaderPerPos[i % kaderPerPos.length]
    const perempuan = ac() < 0.5
    const jenis = perempuan ? 'perempuan' : 'laki-laki'
    const nama = [
      pilih(ac, perempuan ? BUAT.depanP : BUAT.depanL),
      pilih(ac, BUAT.tengah),
      pilih(ac, BUAT.akhir),
    ].join(' ')

    // Usia minimum 10 bulan: kunjungan bulanan sejak lahir, jadi balita
    // termuda pun punya >= 10 titik riwayat (syarat data demo).
    const lahir = tanggalLahirAcak(ac, hariIni, 10, 59)
    const lahirTeks = lahir.toISOString().slice(0, 10)
    const usiaSekarang = usiaBulan(lahir, hariIni)

    const idBalita = buatId(ac)
    const waktuBalita = berikut()

    // Wali: satu ibu kandung per balita, kontak utama.
    const idWali = buatId(ac)
    const waktuWali = berikut()
    const namaIbu = `${pilih(ac, BUAT.depanP)} ${pilih(ac, BUAT.akhir)}`
    const nikIbu = `33${String(Math.floor(angka(ac, 1e12, 9.9e12))).slice(0, 14)}`

    orangTua.push([
      idWali,
      namaIbu,
      enkripsi(nikIbu),
      `08${Math.floor(angka(ac, 1000000000, 9999999999))}`,
      `RT ${String(Math.floor(angka(ac, 1, 9))).padStart(2, '0')} / RW ${String(Math.floor(angka(ac, 1, 6))).padStart(2, '0')}, ${pilih(ac, BUAT.dusun)}`,
      `${String(Math.floor(angka(ac, 1, 9))).padStart(2, '0')}/${String(Math.floor(angka(ac, 1, 6))).padStart(2, '0')}`,
      waktuWali,
      waktuWali,
      waktuWali,
      PENANDA,
    ])

    balita.push([
      idBalita,
      pos.id,
      nama,
      enkripsi(`33${String(Math.floor(angka(ac, 1e12, 9.9e12))).slice(0, 14)}`),
      jenis,
      lahirTeks,
      namaIbu,
      bulat(angka(ac, 2.4, 4.3), 0.01),
      bulat(angka(ac, 44, 53), 0.1),
      usiaSekarang <= 60,
      waktuBalita,
      waktuBalita,
      waktuBalita,
      PENANDA,
    ])

    relasi.push([
      buatId(ac),
      idBalita,
      idWali,
      'ibu_kandung',
      true,
      waktuBalita,
      waktuBalita,
      waktuBalita,
      PENANDA,
    ])

    // Riwayat kunjungan. Posyandu nyata: satu balita bisa beberapa kunjungan
    // dalam sebulan — penimbangan rutin, imunisasi, konsultasi gizi, pemantauan
    // balita bermasalah. Karena itu tiap bulan dibuat 1-3 kunjungan pada hari
    // berbeda, bukan hanya satu.
    // `--kunjungan=` membatasi jumlah titik per balita untuk menguji data besar.
    const bulanSejakLahir = Math.max(1, usiaSekarang + 1)
    const rencana = Math.min(bulanSejakLahir, opsi.kunjunganMaks || bulanSejakLahir)
    // Bila dibatasi, ambil bulan-bulan terakhir supaya tetap dekat hari ini.
    const mulaiBulan = Math.max(0, bulanSejakLahir - rencana)
    const dipakai = new Set()
    let dibuatKunjungan = 0
    // Kecenderungan gizi balita ini, dipakai ulang di semua kunjungannya.
    let kecenderungan = null
    const simpanganTinggi = angka(ac, -3, 3)
    const simpanganLingkar = angka(ac, -1.5, 1.5)

    // Kandidat tanggal per bulan: beberapa hari berbeda, jadi satu balita bisa
    // punya lebih dari satu kunjungan dalam bulan yang sama.
    const tanggalUntuk = (b) => {
      const tahun = lahir.getUTCFullYear()
      const bulan = lahir.getUTCMonth() + b
      // Ambil hari-hari berbeda secara acak dari 1..28, tanpa kembar.
      const hariTerpakai = new Set()
      const hasil = []
      // Penimbangan rutin: satu kunjungan.
      let rutin = 8 + Math.floor(ac() * 8)
      hariTerpakai.add(rutin)
      hasil.push(new Date(Date.UTC(tahun, bulan, rutin)))
      // Kunjungan tambahan (imunisasi/konsultasi/pemantauan) 0-2 kali.
      const tambahan = Math.floor(ac() * 3)
      for (let n = 0; n < tambahan; n += 1) {
        for (let coba = 0; coba < 8; coba += 1) {
          const hari = 1 + Math.floor(ac() * 28)
          if (hariTerpakai.has(hari)) continue
          hariTerpakai.add(hari)
          hasil.push(new Date(Date.UTC(tahun, bulan, hari)))
          break
        }
      }
      return hasil
    }

    for (let b = mulaiBulan; b < bulanSejakLahir; b += 1) {
      for (const calon of tanggalUntuk(b)) {
      // Jadwal Posyandu: pada bulan lahir jangan sampai tanggalnya
      // mendahului hari lahir (usia jadi negatif dan kunjungan itu hilang).
      let tanggalKunjungan = calon
      if (tanggalKunjungan > hariIni) continue
      if (tanggalKunjungan < lahir) continue
      const kunciTanggal = tanggalKunjungan.toISOString().slice(0, 10)
      if (dipakai.has(kunciTanggal)) continue
      // Tandai dipakai sebelum membuat baris, bukan sesudah: kalau kunjungan
      // ini batal karena usia di luar 0-60, tanggalnya tetap tidak boleh
      // dipakai ulang (indeks unik balita_id + tanggal).
      dipakai.add(kunciTanggal)

      const usia = usiaBulan(lahir, tanggalKunjungan)
      if (usia < 0 || usia > 60) continue

      const hadir = ac() > 0.08
      const dirujuk = hadir && ac() < 0.04
      const idKunjungan = buatId(ac)
      const waktuKunjungan = berikut()

      dibuatKunjungan += 1
      kunjungan.push([
        idKunjungan,
        idBalita,
        pos.id,
        kaderId,
        kunciTanggal,
        usia,
        !hadir ? 'tidak_hadir' : dirujuk ? 'dirujuk' : 'hadir',
        ac() < 0.1 ? 'Ibu menanyakan jadwal imunisasi berikutnya.' : null,
        // Sebagian besar belum divalidasi, seperti keadaan nyata di lapangan.
        null,
        null,
        waktuKunjungan,
        waktuKunjungan,
        waktuKunjungan,
        PENANDA,
      ])

      if (!hadir) continue

      const acuanUsia = median.get(`${jenis}:${usia}`)
      if (!acuanUsia) continue

      // Sebaran status: 78% baik, 13% kurang, 6% buruk, 3% buruk berat.
      // Satu balita mempertahankan kecenderungannya antar kunjungan, supaya
      // grafiknya masuk akal (tidak melompat baik-buruk-baik).
      if (kecenderungan === null) {
        const undian = ac()
        // Persen median: >=80 baik, 70-80 kurang, 60-70 buruk, <60 buruk berat.
        kecenderungan = undian < 0.78 ? 1 : undian < 0.91 ? 0.76 : undian < 0.97 ? 0.65 : 0.56
      }
      const faktor = Math.min(1.15, Math.max(0.5, kecenderungan + angka(ac, -0.02, 0.02)))
      const berat = Math.min(40, Math.max(1, bulat(Number(acuanUsia.median_berat_kg) * faktor, 0.05)))
      // Tinggi memakai satu simpangan tetap per balita, supaya grafiknya naik
      // terus dan tidak berayun antar kunjungan.
      const tinggi = Math.min(130, Math.max(30, bulat(45 + usia * 1.15 + simpanganTinggi, 0.1)))
      const lingkar = Math.min(60, Math.max(25, bulat(33 + usia * 0.25 + simpanganLingkar, 0.1)))
      const persen = Math.round((berat / Number(acuanUsia.median_berat_kg)) * 10000) / 100

      pengukuran.push([
        buatId(ac),
        idKunjungan,
        berat,
        tinggi,
        lingkar,
        usia < 24 ? 'terlentang' : 'berdiri',
        null,
        null,
        null,
        klasifikasi(persen),
        null,
        acuanUsia.sumber,
        waktuKunjungan,
        1,
        persen,
        waktuKunjungan,
        waktuKunjungan,
        PENANDA,
      ])

      const status = klasifikasi(persen)
      if ((status === 'gizi_kurang' || status === 'gizi_buruk' || status === 'gizi_buruk_berat') && ac() < 0.55) {
        tindakLanjut.push([
          buatId(ac),
          idKunjungan,
          null,
          status === 'gizi_baik' ? 'edukasi' : ac() < 0.5 ? 'pmt' : 'rujukan',
          status === 'gizi_buruk_berat'
            ? 'Rujuk ke puskesmas untuk pemeriksaan lanjutan dan pemberian makanan tambahan.'
            : 'Edukasi gizi ibu: tambah protein hewani dan pantau berat tiap bulan.',
          tambahHari(tanggalKunjungan, 14).toISOString().slice(0, 10),
          ac() < 0.4,
          berikut(),
          berikut(),
          berikut(),
          PENANDA,
        ])
      }
      }
    }

    // Jaring pengaman: bila karena satu dan lain hal kunjungan bulanan kurang
    // dari 10, tambahkan kunjungan susulan pada bulan-bulan terakhir. Dengan
    // usia minimum 10 bulan ini normalnya tidak pernah jalan.
    if (dibuatKunjungan < 10) {
      // Isi kekurangan dengan hari-hari yang belum dipakai, mundur satu per
      // satu dari hari ini. Bukan lompat 30 hari: itu bisa menghasilkan tanggal
      // yang sudah dipakai kunjungan bulanan.
      let perlu = 10 - dibuatKunjungan
      for (let mundur = 1; mundur <= 400 && perlu > 0; mundur += 1) {
        const tanggalKunjungan = tambahHari(hariIni, -mundur)
        if (tanggalKunjungan < lahir) break
        const kunciTanggal = tanggalKunjungan.toISOString().slice(0, 10)
        if (dipakai.has(kunciTanggal)) continue
        dipakai.add(kunciTanggal)
        perlu -= 1

        const usia = usiaBulan(lahir, tanggalKunjungan)
        if (usia < 0 || usia > 60) continue

        const acuanUsia = median.get(`${jenis}:${usia}`)
        const idKunjungan = buatId(ac)
        const waktuKunjungan = berikut()
        kunjungan.push([
          idKunjungan,
          idBalita,
          pos.id,
          kaderId,
          kunciTanggal,
          usia,
          'hadir',
          'Kunjungan susulan.',
          null,
          null,
          waktuKunjungan,
          waktuKunjungan,
          waktuKunjungan,
          PENANDA,
        ])
        if (!acuanUsia) continue

        if (kecenderungan === null) {
          const undian = ac()
          kecenderungan = undian < 0.78 ? 1 : undian < 0.91 ? 0.76 : undian < 0.97 ? 0.65 : 0.56
        }
        const faktor = Math.min(1.15, Math.max(0.5, kecenderungan + angka(ac, -0.02, 0.02)))
        const berat = Math.min(40, Math.max(1, bulat(Number(acuanUsia.median_berat_kg) * faktor, 0.05)))
        const persen = Math.round((berat / Number(acuanUsia.median_berat_kg)) * 10000) / 100
        pengukuran.push([
          buatId(ac),
          idKunjungan,
          berat,
          Math.min(130, Math.max(30, bulat(45 + usia * 1.15 + simpanganTinggi, 0.1))),
          Math.min(60, Math.max(25, bulat(33 + usia * 0.25 + simpanganLingkar, 0.1))),
          usia < 24 ? 'terlentang' : 'berdiri',
          null,
          null,
          null,
          klasifikasi(persen),
          null,
          acuanUsia.sumber,
          waktuKunjungan,
          1,
          persen,
          waktuKunjungan,
          waktuKunjungan,
          PENANDA,
        ])
      }
    }
  }

  console.log(`Menyiapkan ${opsi.balita} balita di ${daftarPos.length} Posyandu…`)

  // Konten publik: butuh id pengguna untuk pengaju dan pemutus.
  //
  // Generator acak DIPISAH dari `ac` yang dipakai balita. Kalau memakai `ac`
  // yang sama, jumlah balita (--balita) menggeser urutan angka dan id konten
  // ikut berubah — `--hapus` lalu tidak menemukan barisnya lagi.
  const acKonten = acak(opsi.benih + 7)
  const [akunKader, akunNakes, akunAdmin] = await Promise.all([
    satu(`SELECT id FROM pengguna WHERE peran = 'kader' AND dihapus_pada IS NULL ORDER BY dibuat_pada LIMIT 1`),
    satu(`SELECT id FROM pengguna WHERE peran = 'nakes' AND dihapus_pada IS NULL ORDER BY dibuat_pada LIMIT 1`),
    satu(`SELECT id FROM pengguna WHERE peran = 'admin_desa' AND dihapus_pada IS NULL ORDER BY dibuat_pada LIMIT 1`),
  ])
  const konten = kontenDemo(acKonten, {
    posyanduId: daftarPos[0].id,
    kaderId: akunKader?.id ?? null,
    nakesId: akunNakes?.id ?? null,
    adminId: akunAdmin?.id ?? null,
    hariIni: new Date(hariIni).toISOString().slice(0, 10),
  }).map((k) => [
    k.id, k.jenis, k.judul, k.isi, k.kategori, k.tanggal, k.penting, k.aktif, k.urutan,
    k.status, k.pengaju, k.posyandu, k.putuskan,
    k.status === 'menunggu' ? null : new Date().toISOString(),
    k.catatan, new Date().toISOString(), new Date().toISOString(),
  ])

  const hasil = await transaksi(async (klien) => {
    const hitung = {}
    hitung.orang_tua = await sisipBanyak(klien, 'orang_tua',
      ['id', 'nama_lengkap', 'nik', 'nomor_kontak', 'alamat', 'rt_rw', 'terjadi_pada',
        'dibuat_pada', 'diperbarui_pada', 'id_perangkat'], orangTua)
    hitung.balita = await sisipBanyak(klien, 'balita',
      ['id', 'posyandu_id', 'nama_lengkap', 'nik', 'jenis_kelamin', 'tanggal_lahir',
        'nama_ibu_kandung', 'berat_lahir_kg', 'panjang_lahir_cm', 'aktif', 'terjadi_pada',
        'dibuat_pada', 'diperbarui_pada', 'id_perangkat'], balita)
    hitung.balita_orang_tua = await sisipBanyak(klien, 'balita_orang_tua',
      ['id', 'balita_id', 'orang_tua_id', 'hubungan', 'kontak_utama', 'terjadi_pada',
        'dibuat_pada', 'diperbarui_pada', 'id_perangkat'], relasi)
    hitung.kunjungan = await sisipBanyak(klien, 'kunjungan',
      ['id', 'balita_id', 'posyandu_id', 'kader_id', 'tanggal_kunjungan', 'usia_bulan',
        'status_kehadiran', 'catatan', 'divalidasi_oleh', 'divalidasi_pada', 'terjadi_pada',
        'dibuat_pada', 'diperbarui_pada', 'id_perangkat'], kunjungan)
    hitung.pengukuran = await sisipBanyak(klien, 'pengukuran',
      ['id', 'kunjungan_id', 'berat_kg', 'tinggi_cm', 'lingkar_kepala_cm', 'cara_ukur_tinggi',
        'z_berat_umur', 'z_tinggi_umur', 'z_berat_tinggi', 'status_gizi', 'sumber_z',
        'sumber_status', 'terjadi_pada', 'versi', 'persen_median', 'dibuat_pada',
        'diperbarui_pada', 'id_perangkat'], pengukuran)
    hitung.tindak_lanjut = await sisipBanyak(klien, 'tindak_lanjut',
      ['id', 'kunjungan_id', 'petugas_id', 'jenis', 'isi', 'tanggal_tindak_lanjut',
        'selesai', 'terjadi_pada', 'dibuat_pada', 'diperbarui_pada', 'id_perangkat'],
      tindakLanjut)
    hitung.konten_publik = await sisipBanyak(klien, 'konten_publik',
      ['id', 'jenis', 'judul', 'isi', 'kategori', 'tanggal', 'penting', 'aktif', 'urutan',
        'status_persetujuan', 'pengaju_id', 'posyandu_id', 'diputuskan_oleh', 'diputuskan_pada',
        'catatan_peninjau', 'dibuat_pada', 'diperbarui_pada'], konten)
    return hitung
  })

  console.log('Selesai. Baris tersimpan:')
  for (const [t, n] of Object.entries(hasil)) console.log(`  ${t.padEnd(18)} ${n}`)

  const status = await banyak(
    `SELECT status_gizi, COUNT(*)::int AS n FROM pengukuran
     WHERE id_perangkat = $1 AND dihapus_pada IS NULL GROUP BY 1 ORDER BY 2 DESC`,
    [PENANDA],
  )
  console.log('Sebaran status gizi:')
  for (const s of status) console.log(`  ${String(s.status_gizi).padEnd(18)} ${s.n}`)

  console.log('\nBuang lagi dengan: npm run demo:hapus')
  process.exit(0)
}

utama().catch((salah) => {
  console.error('Gagal membuat data demo:', salah.message)
  process.exit(1)
})
