# VALIDASI KLINIS — Lembar Keputusan Tenaga Kesehatan

**Status: menunggu keputusan/tanda tangan nakes**

Dokumen ini adalah daftar pendinginan keputusan klinis, **bukan persetujuan klinis**.
Aplikasi belum boleh dianggap telah disetujui secara medis sebelum lembar ini
ditandatangani. Tidak ada nilai median WHO/Kemenkes baru yang ditambahkan oleh
perubahan ini; angka yang disebut di bawah hanya mengutip batas yang sudah ada
di basis data dan kode.

## 1. Yang harus diputuskan nakes

| No | Keputusan | Kondisi implementasi saat ini | Pilihan / keputusan nakes | Tanda tangan & tanggal |
|----|-----------|-------------------------------|---------------------------|------------------------|
| 1 | Sumber acuan pertumbuhan | Kolom `sumber` di `acuan_berat_umur` mencatat asal nilai; aplikasi tidak memilih antara **WHO 2006** dan **Kemenkes** secara default | ☐ WHO 2006 &nbsp; ☐ Kemenkes &nbsp; ☐ lain: ______ | ________________ |
| 2 | Cara menilai gizi | Implementasi memakai **persen median BB/U** (berat ÷ median menurut usia) dengan ambang yang sudah tertulis di `domain/status_gizi.js` (`80`, `70`, `60`) | ☐ pertahankan persen median BB/U &nbsp; ☐ ubah ke z-skor BB/U &nbsp; ☐ lain: ______ | ________________ |
| 3 | Status berbasis TB-U / stunting | Kolom `z_tinggi_umur` dan `z_berat_tinggi` tersedia tetapi belum diisi; klasifikasi stunting belum diterapkan | ☐ tidak masuk cakupan sekarang &nbsp; ☐ masuk cakupan, rumus dan acuan disediakan nakes | ________________ |
| 4 | Jangkauan usia pengukuran | `kunjungan.usia_bulan` dibatasi **0–84 bulan** oleh skema basis data | ☐ setujui 0–84 bulan &nbsp; ☐ ubah menjadi: ______ | ________________ |
| 5 | Jangkauan usia acuan BB/U | Tabel `acuan_berat_umur` mengizinkan 0–84 bulan, tetapi baris yang terisi saat ini hanya **0–60 bulan** (`ACUAN_MAKS_BULAN = 60`) | ☐ isi acuan 61–84 bulan dulu &nbsp; ☐ batasi penilaian sampai 60 bulan &nbsp; ☐ lain: ______ | ________________ |
| 6 | Rentang nilai wajar | Batas basis data saat ini: berat **1–40 kg**, panjang/tinggi **30–130 cm**, lingkar kepala **25–60 cm** | ☐ setujui batas tersebut &nbsp; ☐ ubah menjadi: ______ | ________________ |

## 2. Perilaku sementara yang perlu diketahui nakes

- Untuk usia **0–60 bulan** dengan baris acuan yang valid, status gizi dihitung
  seperti sebelumnya; tidak ada perhitungan yang diubah.
- Untuk usia **61–84 bulan**, baris acuan belum tersedia. Setelah validasi,
  `status_gizi` sengaja tetap `NULL` dan `sumber_status` diisi
  `acuan_tidak_tersedia`. Ini **bukan** status gizi, dan tidak boleh dibaca
  sebagai "gizi baik" maupun "tidak ada masalah".
- Hal yang sama berlaku bila baris acuan untuk usia ≤60 bulan hilang atau
  mediannya tidak dapat dipakai: status tetap `NULL` dengan penanda yang sama.
- Setiap validasi tetap tercatat di `log_audit`, termasuk penanda acuan yang
  tidak tersedia, agar keputusan dapat ditelusuri.
- Penanda ini adalah solusi sementara sampai nakes memutuskan sumber acuan,
  metode penilaian, dan jangkauan usia di atas.

## 3. Pernyataan penutup

☐ Saya telah menelaah pilihan di atas dan memahami bahwa "acuan_tidak_tersedia"
bukan hasil penilaian gizi.

Nama nakes: ____________________ &nbsp;&nbsp; Jabatan: ____________________

Tanda tangan: ____________________ &nbsp;&nbsp; Tanggal: ____________________

**Status akhir: menunggu keputusan/tanda tangan nakes.**
