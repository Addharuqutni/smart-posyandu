# Arsitektur Aplikasi — Smart Posyandu (MVP)

**Versi:** 1.0 — disusun untuk tenggat 30 November 2026
**Acuan:** `PRD.md` (lingkup), `AGENTS.md` (aturan), `database/schema.sql` (data)

Dokumen ini menjelaskan **bagaimana** sistem dibangun: susunan komponen, aliran data,
dan bentuk antarmuka antar komponen. Untuk penjelasan **mengapa** tiap keputusan diambil,
lihat `dokumen/Desain Sistem Inti ... .docx` Bagian 3 dan 4.

---

## 1. Gambaran

Dua bagian yang berjalan terpisah dan jarang saling bicara:

```
┌──────────────────── TABLET (PWA) ────────────────────┐
│                                                       │
│  Antarmuka  ←  Logika tampilan  ←  Penyimpanan lokal  │
│                                      (IndexedDB)      │
│                          ↑                            │
│                     Mesin sinkron                     │
│                          ↓                            │
│                   Layanan jaringan                    │
└───────────────────────────┬───────────────────────────┘
                            │  HTTP + JSON, hanya saat ada koneksi
                            ▼
┌──────────────────── SERVER (VPS Jakarta) ─────────────┐
│  API  →  Logika (status gizi, validasi)  →  PostgreSQL │
│  Pekerja harian: pencadangan 02.00 WIB + verifikasi    │
└───────────────────────────────────────────────────────┘
```

Bagian tablet **tidak pernah menunggu** bagian server untuk menyimpan atau menampilkan
data. Ini inti dari desain offline-first.

## 2. Susunan direktori

```
server/
  src/
    routes/         -- endpoint HTTP
    domain/         -- aturan usaha + repositori (log audit otomatis)
      status_gizi.js
      sinkron.js
      repositori.js
    db/             -- pool, migrasi, data demo
    domain/         -- cookie sesi, sandi pemulihan, enkripsi
    middleware/     -- cookie sesi dan peran
    jobs/           -- pencadangan harian, jadwal 02.00 WIB, verifikasi, retensi
  tests/            -- node --test
klien/
  src/
    antarmuka/      -- halaman dan komponen
    logika/         -- mesin sinkron, draf formulir
    penyimpanan/    -- IndexedDB (Dexie), antrean sinkron
    jaringan/       -- permintaan HTTP, cookie sesi, ulang coba
database/
  schema.sql
  migrasi/
```

Satu aturan: `routes/` tidak boleh menyentuh SQL, dan `klien/` tidak boleh
menyentuh HTTP dari dalam `logika/`. Ini bukan soal kemurnian — ini supaya aturan
usaha bisa diuji tanpa menjalankan server.

## 3. Tablet

### 3.1 Penyimpanan lokal sebagai sumber kebenaran

IndexedDB menyimpan salinan **seluruh** data yang boleh dilihat kader: balita, kunjungan,
pengukuran, tindak lanjut. Bukan cache — ini yang ditampilkan ke layar.

Konsekuensinya: tidak ada "memuat dari server" di jalur utama. Layar daftar balita membaca
IndexedDB, bukan jaringan.

### 3.2 Antrean sinkron

Setiap perubahan ditulis ke IndexedDB **dan** ke `antrean_sinkron` dalam satu transaksi.
Bila salah satu gagal, keduanya batal.

Struktur antrean:

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID | Kunci antrean |
| `nama_tabel` | TEXT | Tabel tujuan |
| `id_baris` | UUID | Baris yang diubah |
| `aksi` | TEXT | `buat`, `ubah`, `hapus` |
| `muatan` | JSONB | Isi perubahan |
| `versi` | INTEGER | Menaik pada setiap suntingan |
| `status` | TEXT | `menunggu`, `terkirim`, `gagal` |
| `jumlah_coba` | INTEGER | Berapa kali dicoba |
| `pesan_gagal` | TEXT | Keterangan gagal terakhir |
| `dibuat_pada` | TIMESTAMPTZ | Waktu masuk antrean |

### 3.3 Mesin sinkron

Berjalan otomatis, bukan menunggu kader menekan tombol:

1. Saat aplikasi dibuka.
2. Saat perangkat mendeteksi koneksi kembali.
3. Setiap beberapa menit selama aplikasi terbuka.
4. Setelah setiap penyimpanan.

Urutan pengiriman:

```
1. Kirim antrean ke server (POST /sinkron)
2. Terima balasan: id yang berhasil, id yang ditolak, versi terbaru
3. Tandai antrean terkirim; buang dari antrean
4. Tarik pembaruan server (GET /sinkron?sejak=<waktu>)
5. Terapkan pembaruan ke IndexedDB
```

Kegagalan karena tidak ada koneksi **tidak** menaikkan `jumlah_coba` — tidak ada gunanya
menghitung kegagalan yang wajar. Kegagalan karena server menolak yang dihitung.

### 3.4 Penyiapan awal

Tablet baru belum punya salinan balita. Bila langsung dipakai, kader akan membuat balita
kembar dengan yang sudah ada.

Karena itu: aplikasi menyimpan penanda `sudah_disiapkan`. Bila belum, layar menampilkan
"Perangkat perlu disiapkan di kantor desa" dan **menolak membuka halaman pencatatan**.
Penyiapan = masuk + unduh salinan balita aktif Posyandu.

## 4. Server

### 4.1 Lapisan

| Lapisan | Tanggung jawab | Boleh melakukan |
|---------|----------------|-----------------|
| `routes/` | Terima permintaan, periksa token dan peran | Panggil `domain/` dan `db/` |
| `domain/` | Aturan usaha: status gizi, validasi, sinkronisasi, enkripsi | Panggil `db/` |
| `db/` | Pool PostgreSQL, migrasi, data demo; `repositori.js` mencatat log audit otomatis | SQL |
| `middleware/` | Baca token dari cookie `posyandu_sesi` (HttpOnly), pasang `minta.pengguna` | Baca `sesi_login` |
| `jobs/` | Pencadangan 02.00 WIB, verifikasi hasil, retensi, drill pemulihan | `db/`, `domain/rahasia` |

Log audit ditulis di `domain/repositori.js`, bukan di tiap endpoint. Kalau ditulis di
endpoint, satu endpoint yang lupa mencatat akan membuat lubang pada audit.

### 4.2 Antarmuka sinkronisasi

**Kirim — `POST /sinkron`**

```json
{
  "id_perangkat": "tablet-01",
  "perubahan": [
    {
      "nama_tabel": "pengukuran",
      "id_baris": "8f2c...",
      "aksi": "buat",
      "versi": 1,
      "terjadi_pada": "2026-11-20T03:12:00Z",
      "muatan": { "kunjungan_id": "a91b...", "berat_kg": 9.4, "tinggi_cm": 72.5 }
    }
  ]
}
```

Balasan:

```json
{
  "diterima": ["8f2c..."],
  "ditolak": [
    { "id_baris": "c30d...", "alasan": "waktu_lewat_masa_depan" }
  ],
  "waktu_server": "2026-11-20T03:14:22Z"
}
```

`waktu_server` dikembalikan agar tablet bisa menghitung selisih jamnya — ini penanganan
jam tablet yang melenceng (lihat Bagian 6.2).

**Tarik — `GET /sinkron?sejak=<kursor>&batas=500`**

Mengembalikan perubahan sejak kursor itu, dibatasi per halaman.

Kursor berbentuk `"<iso>|<nama_tabel>|<id>"`, bukan waktu saja. Alasannya: satu
transaksi bisa menyisipkan beberapa baris dengan `diperbarui_pada` identik, dan
kursor berbasis waktu (`> waktu`) akan melewati baris sisanya. Urutan halaman
global: `diperbarui_pada`, lalu `nama_tabel`, lalu `id`.

Selesai ditandai `berikutnya: null` pada halaman kosong; setiap halaman berisi
data menyertakan kursor, termasuk halaman terakhir. Ini mencegah halaman terakhir
diunduh ulang pada setiap sinkronisasi. Logika kursor ada di
`server/src/domain/kursor.js` dan diuji di `server/tests/kursor.test.js`.

### 4.3 Penyelesaian benturan

Aturan: **perubahan terakhir menang**, berdasar `terjadi_pada`.

```
server terima perubahan dengan versi V
  jika tidak ada baris → terima
  jika ada:
      jika terjadi_pada masuk > terjadi_pada tersimpan → terima, simpan nilai lama ke audit
      selain itu → tolak, kembalikan versi tersimpan
```

Log audit menyimpan `nilai_lama`, jadi keputusan otomatis ini bisa ditelusuri dan dibalik.

### 4.4 Status gizi

Dihitung di server saat pengukuran diterima, lalu dikirim balik ke tablet.

Alasan: rumus dan acuan bisa berubah. Bila rumus ada di tablet, perubahan mengharuskan
pembaruan aplikasi. Dengan menghitung di server, mengganti acuan tidak menyentuh klien.

MVP memakai **persen median BB/U** (PRD Bagian 7.1). Kolom z-skor tetap ada di skema,
dibiarkan kosong. Bentuknya:

```
persen_median = berat_kg / median_berat_umur(usia_bulan, jenis_kelamin) × 100
```

Acuan yang dipakai dicatat pada kolom `sumber_status`, agar bila acuan berubah,
riwayat lama tetap bisa dijelaskan.

Klasifikasi mengikuti KMS kertas yang sudah kader kenal:

| Persen median | Status |
|---------------|--------|
| ≥ 80% | Gizi baik |
| 70–80% | Gizi kurang |
| 60–70% | Gizi buruk |
| < 60% | Gizi buruk (berat) |

Nilai batas dan acuan disimpan di tabel `acuan_berat_umur`, **bukan** ditulis di kode.
Bila ada koreksi, cukup ubah data.

### 4.5 Indeks untuk sinkronisasi

`GET /sinkron` membaca per halaman dengan `WHERE diperbarui_pada >= $1 ORDER BY
diperbarui_pada, id LIMIT n` pada keenam tabel sinkron. Indeks `(diperbarui_pada,
id)` dibuat oleh `database/migrasi/002_indeks_sinkron.sql`.

Tanpa indeks itu PostgreSQL memindai tabel penuh lalu menyortir setiap halaman.
Terukur pada 87.000 kunjungan: 173 ms per halaman menjadi 0,16 ms. Pada data
pilot (puluhan balita) bedanya tidak terasa; pada data uji 3000 balita, tarikan
awal turun dari sekitar 2 menit menjadi sekitar 20 detik.

## 5. Keamanan

| Aspek | Cara |
|-------|------|
| Kata sandi | Argon2id; tidak pernah dikirim ke tablet |
| Sesi | Token di server; dikirim lewat cookie `HttpOnly` + header `X-Requested-With` (CSRF); bisa dicabut admin |
| Kata sandi lupa | Tidak ada pemulihan mandiri; admin desa yang menyetel ulang |
| Percobaan masuk | 5 kali gagal → kunci 15 menit + catat audit |
| NIK | Dienkripsi; tidak ikut ekspor |
| Transport | TLS (HTTPS) wajib |
| Cadangan | Berkas terenkripsi; kunci terpisah dari berkas |
| Audit | Setiap perubahan tercatat, tidak bisa diubah |

Kredensial (`hash_kata_sandi`, token, `log_audit`) **tidak ikut tersinkron** ke tablet. Token pun tidak pernah ada di penyimpanan web klien: yang disimpan hanya data tampilan pemakai, dan bukti masuk adalah cookie `HttpOnly`.
Konsekuensinya: kader lupa kata sandi tidak bisa memulihkan dari tablet.

## 6. Keadaan sulit yang harus ditangani

### 6.1 Koneksi hilang di tengah pencatatan

Tidak masalah. Penyimpanan lokal tidak bergantung jaringan. Antrean menunggu.

### 6.2 Jam tablet melenceng

Aturan benturan bergantung jam perangkat. Penanganannya:

- Tablet simpan selisih jamnya terhadap server dari balasan `waktu_server`.
- Server tolak perubahan ber-`terjadi_pada` lebih dari 1 hari di masa depan, dan
  **tandai untuk ditinjau**, jangan ditolak diam-diam.
- Penanda kualitas menampilkan peringatan bila selisih besar.

### 6.3 Tablet hilang atau rusak sebelum sinkron

Data yang hanya ada di tablet itu hilang. Dua pengurang risiko:

- Tanda jumlah tertunda ditampilkan mencolok di beranda.
- Sinkronisasi otomatis, bukan hanya saat aplikasi dibuka.

Risiko ini tidak bisa dihilangkan tanpa perangkat tambahan. Bila pada pemakaian nyata
sering terjadi, tambahkan jadwal sinkronisasi wajib di akhir hari layanan.

### 6.4 Dua tablet ubah balita yang sama

Aturan perubahan terakhir menang. Jarang terjadi pada praktiknya; bila terjadi, log audit
menyimpan nilai lama sehingga bisa ditelusuri.

## 7. Data

Skema ada di `database/schema.sql`. Ringkas:

| Kelompok | Tabel |
|----------|-------|
| Identitas | `posyandu`, `kader`, `orang_tua`, `balita`, `balita_orang_tua` |
| Layanan | `kunjungan`, `pengukuran`, `tindak_lanjut` |
| Sistem (server saja) | `pengguna`, `sesi_login`, `log_audit`, `uji_cadangan` |
| Acuan | `acuan_berat_umur` (median BB/U menurut usia dan jenis kelamin) |
| Khusus tablet | `antrean_sinkron` (IndexedDB, bukan PostgreSQL) |

Konvensi yang mengikat: `id` UUID dibuat di klien; baris tidak dihapus fisik;
setiap tabel punya `dibuat_pada`, `diperbarui_pada`, `dihapus_pada`, `id_perangkat`.

## 8. Uji

Lima uji ini wajib ada dan wajib lolos. Rinciannya di `AGENTS.md` Bagian 5.3.

1. Uji luring
2. Uji benturan
3. Uji hapus
4. Uji rentang nilai
5. Uji audit

Uji dijalankan tanpa menjalankan server untuk bagian `domain/` (aturan murni), dan
dengan basis data ujian untuk bagian `db/`.

## 9. Yang belum diputuskan

| Hal | Keputusan dari | Batas |
|-----|----------------|-------|
| Pustaka grafik untuk KMS | Tim pengembang | Minggu 3 |
| Penyedia hosting dan domain | Tim dan desa | Sebelum minggu 3 |

## 10. Kerangka yang dipakai

| Lapisan | Pilihan |
|---------|---------|
| Basis data | PostgreSQL 14+ |
| API | Express 5 + `pg` (SQL tulis tangan), `helmet`, `@node-rs/argon2` |
| Klien | React 18 + Vite + Tailwind CSS v4 |
| Penyimpanan lokal | Dexie.js (IndexedDB) |
| Grafik KMS | Chart.js |
| Enkripsi | AES-256-GCM (`node:crypto`) untuk NIK dan berkas cadangan |
| Uji | `node --test` (server), Vitest (klien) |

Backend Python (FastAPI) sudah dipensiunkan seluruhnya; tidak ada kode Python
di jalur jalan. `npm run dev` memakai `alat.js` di root, yang juga berisi
pemeriksa hasil bangun dan konfigurasi Nginx. Berkas pembangkit dokumen
`.docx`/`.xlsx` tidak ada di repositori.

Klien dan server terpisah: `klien/` tidak mengimpor apa pun dari `server/`, dan
sebaliknya. Keduanya hanya sepakat pada bentuk JSON yang dijelaskan di Bagian 4.2.
