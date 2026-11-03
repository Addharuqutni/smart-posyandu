# Panduan Pemakai — Smart Posyandu

Dokumen ini untuk **kader, petugas kesehatan, dan admin desa.** Tidak perlu bisa
membaca kode.

---

## 1. Sebelum mulai

Yang perlu disiapkan di tablet:

- Tablet Android yang sudah diisi daya penuh. Bawa charger cadangan saat hari
  layanan.

- **Aktifkan jam otomatis**: Pengaturan → Tanggal dan waktu → aktifkan
  "Tanggal dan waktu otomatis". Jam yang meleset membuat data ditolak server bila
  selisihnya lebih dari 24 jam.

- **Pasang aplikasi**: buka alamat aplikasi di Chrome → menu ⋮ (kanan atas) →
  "Tambahkan ke layar utama". Ikon Smart Posyandu muncul di layar utama. **Selalu
  buka dari ikon itu, bukan dari riwayat Chrome.

- **Pasang pengaman**: aktifkan PIN layar, atur layar mati otomatis ≤ 5 menit.

---

## 2. Masuk

Ketik **username** (nama pengguna) dan kata sandi dari admin desa. Bila kata sandi
masih bawaan, minta admin menggantinya setelah pelatihan.

Setelah masuk, aplikasi ingat siapa kamu. Menutup aplikasi tidak membuatmu keluar —
sesi tetap tersimpan selama 7 hari (tablet kader) atau 8 jam (admin).

---

## 3. Yang bisa dilakukan tiap peran

| Peran | Layar Utama | Kegunaan |
|-------|-------------|----------|
| **Kader** | Balita, Tambah, Perangkat | Mencatat pengukuran balita, mendaftarkan balita baru, cek riwayat sesi perangkat. |
| **Petugas Kesehatan (Nakes)** | Validasi, Perangkat | Memeriksa dan memvalidasi hasil ukur dari kader, memberi catatan tindak lanjut gizi. |
| **Admin Desa** | Balita, Rekap, Akun | Kelola master balita, pantau rekap bulanan & cadangan data, kelola akun pengguna. |

### Kader — alur harian

1. **Balita**: daftar balita per posyandu. Ketik nama di kotak pencarian untuk mencari. Balita yang sudah/belum diukur bulan ini ditandai dengan jelas.

2. **Catat kunjungan**: pilih balita → **Catat** → isi timbang BB, TB, lingkar kepala, cara ukur, dan status kehadiran. Formulir otomatis menyimpan draf lokal saat mengetik.

3. **Tambah balita baru**: buka tab **Tambah** bila ada balita baru yang belum terdata di sistem.

4. **Riwayat & Grafik Pertumbuhan**: buka **Riwayat** pada balita untuk melihat grafik pertumbuhan KMS (berat/umur) dan riwayat kunjungan sebelumnya.

### Nakes — memvalidasi pengukuran

1. Buka layar **Validasi**: berisi daftar pengukuran balita yang masuk dari kader.
2. Periksa angka hasil pengukuran. Bila valid, tekan **Validasi**.
3. Beri catatan **Tindak Lanjut** jika balita memerlukan penanganan khusus (misal: rujukan puskesmas atau PMT).

### Admin Desa — pengelolaan & pengawasan

1. **Balita**: Menambah, mengubah identitas, atau menonaktifkan data balita se-desa.
2. **Rekap**: Melihat ringkasan kehadiran bulanan, status gizi per posyandu, dan tombol **Unduh CSV** untuk laporan.
3. **Akun**: Membuat dan mengelola akun kader/nakes, mengatur kata sandi, serta memutus sesi perangkat jika hilang.
**Cara kerja sinkronisasi (penting dipahami):** data yang kamu catat disimpan dulu
di tablet, lalu dikirim otomatis saat ada sinyal. Jika tidak ada sinyal, aplikasi
tetap menyimpan; kiriman akan terkirim otomatis saat sinyal kembali. Jangan tutup
aplikasi dengan paksa; biarkan aplikasi terbuka agar antrean terkirim.

**Cara membaca indikator:** bila ada tulisan "N catatan menunggu dikirim" → cari
sinyal, lalu tekan **Kirim sekarang**.

**Aturan emas:**

- **Jangan menghapus data Chrome**, jangan "hapus aplikasi", dan jangan memasang
  ulang tanpa menghubungi admin: data yang belum terkirim hanya ada di tablet.

- **Sinkronkan minimal sekali sehari** saat ada sinyal.

- **Jangan mencatat balita baru berulang untuk nama yang sama. Bila ragu, gunakan
  pencarian nama lebih dulu.

- **Tablet mati total sebelum antrean terkirim**: data tetap ada di tablet setelah
  diisi daya. Jangan mengatur ulang perangkat.

- **Tablet hilang atau rusak sebelum antrean terkirim**: data yang belum terkirim
  tidak bisa dipulihkan. Hubungi admin untuk menonaktifkan akun dan mencatat
  kejadian di buku Posyandu.

- **Ganti tablet**: admin menonaktifkan akun lama lebih dulu. Data yang belum
  terkirim di tablet lama tidak bisa diselamatkan.

- Simpan nomor admin desa dan petugas kesehatan di kartu yang ditempel di dinding
  Posyandu.

---

## 4. Cadangan & pemulihan (admin desa)

Buka layar **Rekap** → bagian **Cadangan**.

| Tombol | Apa yang terjadi |
|--------|------------------|
| **Cadangkan sekarang** | Server membuat berkas cadangan terenkripsi. |
| **Unduh** | Mengunduh berkas cadangan ke perangkat. Simpan di tempat aman kantor desa. |
| **Pulihkan** | Memulihkan data dari berkas cadangan. Diminta kata sandi akun admin. Bila salah 5 kali, akun terkunci 15 menit. |

- **Cadangan otomatis** berjalan tiap hari pukul 02.00 WIB. Bila cadangan terakhir sudah lewat 24 jam, server otomatis mencadangkan saat hidup.
- **Cadangan pengaman**: Sebelum pemulihan berjalan, server otomatis membuat cadangan darurat (berawalan `posyandu-pengaman-`).
## 5. Rekap bulanan (admin desa)

Layar **Rekap**: pilih bulan → tampil ringkasan kunjungan, sebaran status gizi,
dan rata-rata persen median. Ada tombol **Unduh CSV** untuk diolah di Excel.

---

## 6. Keamanan & data pribadi

- **NIK** dienkripsi di penyimpanan; tidak pernah muncul pada ekspor yang diedarkan.

- **Ekspor** selalu membubuhi cap waktu dan nama pemakai, dan dicatat di log audit.

- **Berkas cadangan dienkripsi**; kuncinya disimpan terpisah dari berkasnya.

- **Jangan** membagikan kata sandi. Bila tablet hilang, hubungi admin untuk
  mencabut sesinya (layar Akun → sesi tablet → Cabut).

- **Setelah pemasangan**, ganti kata sandi bawaan (admin1, kader1, nakes1).

---

## 7. Bila ada masalah

| Gejala | Kemungkinan & tindakan |
|--------|------------------------|
| Layar kosong/putih | Pastikan alamat aplikasi benar & server menyala. Coba muat ulang peramban. |
| "Tidak bisa terhubung" | Tidak ada sinyal. Aplikasi tetap menyimpan data secara luring di perangkat. |
| Data tak kunjung terkirim | Pastikan sinyal stabil, biarkan aplikasi terbuka, lalu tekan **Kirim sekarang**. |
| Data ditolak server | Jam perangkat meleset lebih dari 24 jam. Aktifkan tanggal dan waktu otomatis di tablet. |
| Pengukuran ditolak | Angka berat/tinggi di luar batas wajar. Cek kembali angka timbangan. |
| Lupa kata sandi | Hubungi admin desa untuk reset kata sandi lewat menu **Akun**. |

---

## 8. Catatan untuk admin desa (ringkas)

- **Tambah akun**: layar **Akun** → Tambah. Pilih peran: kader / petugas kesehatan / admin desa.
- **Nonaktifkan akun**: layar **Akun** → Nonaktifkan.
- **Cabut sesi tablet**: layar **Akun** → bagian sesi tablet → **Cabut**. Ini menghentikan akses jika tablet hilang.
- **Lihat riwayat masuk perangkat**: layar **Perangkat** (untuk kader & nakes) menampilkan riwayat login perangkat.

---

## 9. Hal yang belum tersedia

Untuk menghindari ekspektasi yang salah, ini belum ada:

- Login dua faktor (2FA). |

- Ekspor PDF. |

- Lampiran foto. |

- Imunisasi & ibu hamil. |

- Dasbor wilayah (kecamatan/kabupaten). |

- Z-skor WHO (saat ini dipakai acuan yang sudah ada di basis data. |

- Pemangkasan otomatis log audit. |

Bila butuh salah satunya, catat di buku hambatan.

---

## 10. Pertanyaan yang sering muncul

**Apakah data hilang kalau tak ada sinyal?** Tidak. Aplikasi menyimpan dulu di
tablet, lalu mengirim otomatis saat sinyal kembali. |

**Berapa lama data tersimpan di tablet?** Sampai terkirim. Jangan hapus data Chrome
sampai antrean kosong. |

**Apakah saya harus menekan tombol sinkron?** Tidak. Sinkron berjalan otomatis.
Tombol "Kirim sekarang" hanya untuk mempercepat. |

**Mengapa jam harus otomatis?** Karena server menolak data yang jamnya meleset
lebih dari 24 jam. |

Nomor admin desa: ________________ (isi di buku Posyandu.)

Nomor petugas kesehatan: ________________.

---

*Dokumen ini untuk pemakai. Untuk pengembang, baca `PANDUAN-PENGEMBANG.md`.*
