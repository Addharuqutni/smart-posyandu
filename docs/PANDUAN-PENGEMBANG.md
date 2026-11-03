# Panduan Pengembang — Smart Posyandu

Dokumen ini untuk **pengembang**. Untuk pemakai (kader/admin desa), tulis di
`PANDUAN-PEMAKAI.md`.

**Tenggat: 30 November 2026.** Bila ragu antara "lengkap" dan "selesai", pilih
selesai. Fitur yang ditunda ke fase berikutnya: z-skor WHO lanjutan, dasbor wilayah,
ekspor PDF, modul imunisasi, dan ibu hamil.

---

## 1. Gambaran singkat

| Bagian | Teknologi |
|--------|-----------|
| Server | Node + Express 5 + `pg` (SQL tulis tangan; tanpa ORM). |
| Klien | React + Vite (PWA, IndexedDB lewat Dexie.js. |
| Basis data | PostgreSQL 14+; `database/schema.sql` sumber kebenaran. |
| Uji | Server: `node --test`. Klien: Vitest. |

**Kondisi lapangan yang menentukan segalanya:** koneksi tidak selalu tersedia.
Setiap fungsi kader harus berjalan tanpa server: bukan pesan error ramah, melainkan
benar-benar menyimpan data. |

---

## 2. Menjalankan dari awal

```bash
createdb posyandu                 # basis data kosong
cp .env.contoh .env               # lalu isi DATABASE_URL, KUNCI_RAHASIA, VITE_API
npm run siapkan                   # pasang dependensi klien + server
npm run migrasi                   # terapkan skema ke PostgreSQL
npm run buat-admin -- admin_desa "Nama Kamu"   # akun admin pertama (sandi ditanyakan)
npm run dev                       # API :3000 dan klien :5173 sekaligus
npm run uji                       # uji klien lalu server
```

**Jangan** jalankan `npm run demo` di basis data produksi: ia mengisi 3.000 balita
contoh. Hapus dengan `npm run demo:hapus`.

### Skrip yang tersedia

| Skrip | Kegunaan |
|-------|----------|
| `npm run dev` | Menjalankan API & klien bersama (`alat.js dev`). |
| `npm run dev:server` / `dev:klien` | Menjalankan salah satu. |
| `npm run bangun` | Bangun klien produksi → `klien/dist`. |
| `npm run pratinjau` | Sajikan `dist` (mode produksi). **Tanpa proksi API** → panggilan API gagal di mesin lokal. |
| `npm run uji` | Uji klien + server. |
| `npm run migrasi` | Terapkan skema. |
| `npm run buat-admin -- <username> "<Nama>"` | Buat akun admin desa pertama; kata sandi ditanyakan, tidak disimpan di kode. |
| `npm run cadangan` | Cadangkan sekarang (verifikasi & pangkas). |
| `npm run pulih -- <berkas> [--ke <DATABASE_URL>]` | Uji pemulihan (drill). |

### Uji cepat satu berkas

```bash
cd server && npx cross-env NODE_ENV=test node --test tests/halaman-sinkron.test.js
cd klien  && npx vitest run src/logika/terakhir.test.js
```

---

## 3. Konfigurasi (satu berkas di root)

`.env` di root dipakai **klien dan server**. Salin dari `.env.contoh`. |

| Variabel | Dipakai | Catatan |
|----------|---------|---------|
| `DATABASE_URL` | server | Wajib. |
| `KUNCI_RAHASIA` | server | Wajib. Enkripsi NIK & cadangan (kalau kunci lain kosong. |
| `KUNCI_ENKRIPSI` | server | Kosong → ikut `KUNCI_RAHASIA`. |

| `KUNCI_CADANGAN` | server | Simpan **terpisah** dari berkas cadangannya. |
| `PORT` | server | Dibaca dari `.env`. |
| `MENIT_SESI_TABLET` / `MENIT_SESI_ADMIN` | server | 10080 (7 hari) / 480 (8 jam). |
| `TOLERANSI_JAM_KE_DEPAN` | server | 24. |
| `FOLDER_CADANGAN` | server | Relatif ke **root proyek** → `posyandu/cadangan`. |
| `CADANGAN_HARIAN` | server | `true`. |
| `ASAL_DIIZINKAN` | server | Daftar asal CORS (koma). Perlu bila klien & API beda asal. |
| `VITE_API` | klien (bangun) | Kosong → path relatif (satu asal). Untuk dev: `http://127.0.0.1:3000`. |

**Mode produksi:** kosongkan `VITE_API` di `.env` sebelum `npm run bangun`
agar bundel memanggil path relatif (`/masuk`, `/sinkron`). Vite memprioritaskan
`.env` atas `.env.[mode]`, jadi nilai di `.env` yang menang. |

**Penting:** `VITE_API` **menyatu ke bundel pada waktu bangun. Bangun ulang setelah
mengubahnya. |

---

## 4. Basis data

- `database/schema.sql` sumber kebenaran; migrasi di `database/migrasi/` berurutan &
  **idempoten** (aman dijalankan berulang. |

**Menambah tabel/kolom:** ubah `schema.sql` (untuk basis data baru) **dan** buat
berkas migrasi baru (untuk basis data yang sudah ada. |

Tabel & jumlah (keadaan bersih tanpa demo): `posyandu` 1, `pengguna` 3, `kader` 0,
balita & riwayat 0 (diisi `demo`), `acuan_berat_umur` 122 (wajib >0 untuk status
gizi. |

**Konvensi wajib:** nama Indonesia `snake_case` tunggal. UUID v4 dibuat di klien.
Penghapusan = isi `dihapus_pada` (tanpa `DELETE FROM`). Bentrok diselesaikan dengan
LWW berdasar `terjadi_pada` (waktu perangkat). Z-skor dihitung server. |

**Indeks sinkron** `(diperbarui_pada, id)` ada di 6 tabel sinkron
(`database/migrasi/002_indeks_sinkron.sql`). Tanpa itu, tarikan sinkron lambat. |

---

## 5. Sinkronisasi (bagian paling rawan)

Endpoint: `GET /sinkron?sejak=<kursor>&batas=2000`. |

**Tiga aturan yang sudah terukur — jangan dilanggar:**

1. **Satu kueri per halaman**, bukan satu per tabel. Versi lama mengambil `batas+1`
   baris per tabel lalu menyaring kursor di Node. Saat banyak baris berbagi satu cap
   waktu (hasil `demo`, dan hasil pemulihan cadangan yang menggeser
   `diperbarui_pada`), tarikan **hanya mengirim 12.006 dari 433.134 baris lalu
   berhenti tanpa galat. Kegagalan macam ini tak terlihat di layar: tarikan tampak
   selesai. |

Bentuknya: `UNION ALL` per cabang, tiap cabang dibaca berurutan lewat indeks, tiap
cabang `LIMIT batas+1`, lalu digabung & diurutkan sekali
(`server/src/domain/halaman-sinkron.js`). |

2. **Kursor menyimpan cap waktu apa adanya** (teks ISO bermikrodetik. Bila
   dibulatkan lewat `new Date().toISOString()` (milidetik), kursor berhenti bergerak
   di dalam satu milidetik → baris terkirim ulang. |

3. **`diperbarui_pada` dan `dihapus_pada` wajib tetap ikut di muatan sinkron.**
   `penyimpanan/db.js` mengindeks `diperbarui_pada`; `terapkan` membaca
   `dihapus_pada`. Membuang `diperbarui_pada` pernah membuat tarikan berhenti di
   2.001 baris. |

**Kursor:** `<iso>|<nama_tabel>|<id>`; klien hanya meneruskan apa adanya. |

**Urutan:** (cap waktu, tabel, id. |

**Uji yang wajib ada** (`server/tests/halaman-sinkron.test.js`) mengunci bentuk
kueri: tiap cabang pakai kondisi yang bisa memakai indeks: `>=` bila nama tabel
cabang lebih besar dari tabel kursor; `>` bila lebih kecil; `(ts,id) > (…)` bila
sama. |

---

## 6. Cadangan & pemulihan

| Bagian | Berkas |
|--------|--------|
| Jadwal 02.00 WIB + catch up | `server/src/jobs/jadwal.js`, `pencadangan-harian.js` |
| Buat berkas terenkripsi | `server/src/jobs/cadangan.js` |
| Verifikasi (baca ulang & bandingkan jumlah baris | `server/src/jobs/verifikasi.js` (tabel `uji_cadangan`. |
| Pemulihan (upsert, **tidak pernah menghapus baris. | `server/src/jobs/pemulihan.js` |
| Endpoint | `server/src/routes/cadangan.js` |

**Alur malam:** cadangkan → verifikasi → pangkas (retensi 7 harian / 4 mingguan / 3
bulanan; cadangan pengaman `posyandu-pengaman-` dijaga 3 terbaru. |

**Pemulihan butuh kata sandi akun** (batas 5 percobaan / 15 menit. |

**Ukuran & laju terukur:** ~39 MB untuk 433.134 baris; cadangan dari basis data
kosong hanya 8 KB. Tarikan dingin 433.134 baris ≈ 252 detik (~1.719 baris/detik).

**Drill bulanan disarankan** (SOP desain 8.4):

```bash
npm run pulih -- posyandu-2026-11-02T02-00-00-000Z.json.gz.enc --ke postgres://postgres@127.0.0.1/posyandu_drill
```

---

## 7. Keamanan

| Lapisan | Keadaan |
|---------|---------|
| Sesi | Cookie `posyandu_sesi`: `HttpOnly`, `SameSite=Strict`, `Secure` **hanya saat `NODE_ENV=production`**. Token tak bisa dibaca JS. |
| CSRF | Header `X-Requested-With: smart-posyandu` wajib pada POST/PATCH/PUT/DELETE. Tanpa itu → **403**. |
| Batas laju | 300 permintaan/menit per IP; masuk 5 gagal/15 menit; pemulihan 5 gagal/15 menit. |
| Header | `helmet` (CSP; `connect-src 'self'`) |
| Cadangan | AES-256-GCM; `KUNCI_CADANGAN` terpisah dari berkasnya. |
| NIK | AES-256-GCM; tak pernah muncul di ekspor yang diedarkan. |
| Audit | Setiap perubahan → baris `log_audit`. |

**Catatan:** `Secure` bergantung `NODE_ENV`. Bila lupa menyetelnya di produksi,
cookie tak memakai `Secure`. Periksa lewat header `Set-Cookie` pada `POST /masuk`.

---

## 8. Menjalankan di produksi

```bash
npm run siapkan                        # pasang dependensi (sekali)
cp .env.contoh .env                    # lalu isi DATABASE_URL & KUNCI_RAHASIA
npm run migrasi                        # terapkan skema
npm run buat-admin -- admin_desa "Nama Kamu"    # akun admin pertama
npm run siap:produksi                  # bangun klien + terapkan skema
cd server && NODE_ENV=production npm start
```

**Alamat API — kesalahan yang paling sering terjadi.** Klien memanggil API di
**asal yang sama** dengan halaman. Biarkan `VITE_API` **kosong** di `.env`,
lalu sajikan `klien/dist` lewat Nginx yang juga meneruskan path API ke
`127.0.0.1:3000`. Dengan begitu tablet yang membuka `https://posyandu.desa.example`
otomatis memanggil API di host itu juga: tidak ada CORS, dan cookie
`SameSite=Strict` tetap terkirim.

`VITE_API` ditanam saat **bangun**, bukan dibaca saat aplikasi dibuka. Bila
diisi `http://127.0.0.1:3000` lalu dibangun di VPS, tablet akan memanggil
alamat itu dan **gagal tersambung**. `npm run bangun` sudah memeriksa hal ini
dan memberi peringatan (`npm run periksa` untuk memeriksa ulang kapan saja).

**Yang wajib diperiksa sebelum hari H:**

1. `NODE_ENV=production` — tanpa itu cookie tak `Secure`.
2. Klien & API satu asal lewat proksi HTTPS. Bila terpaksa beda asal, isi
   `ASAL_DIIZINKAN`.
3. `PORT` dibaca dari `.env`.
4. Ganti `KUNCI_RAHASIA`; simpan `KUNCI_CADANGAN` terpisah.
5. **Tidak ada akun bawaan.** Buat admin pertama di VPS setelah migrasi:
   `npm run buat-admin -- admin_desa "Nama Lengkap" --posyandu "Posyandu Melati"`.
   Kata sandi ditanyakan saat itu (minimal 12 karakter) dan tidak pernah ada di kode.

### Contoh Nginx (topologi sudah teruji)

Sajikan `klien/dist`, teruskan path API ke `127.0.0.1:3000`:

```nginx
server {
  listen 443 ssl;
  server_name posyandu.desa.example;

  ssl_certificate     /etc/letsencrypt/live/posyandu.desa.example/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/posyandu.desa.example/privkey.pem;

  root /var/www/posyandu/klien/dist;
  index index.html;

  # Teruskan API ke server Node. |
  location ~ ^/(masuk|keluar|saya|sinkron|balita|kunjungan|validasi|pengguna|sesi|rekap|ekspor\.csv|kualitas|cadangan|sehat|waktu)(\/|$|\?) {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

**Jangan** buka port 3000 ke publik; cukup diakses Nginx secara internal.

### Menjalankan sebagai layanan (systemd contoh)

```ini
[Unit]
Description=Smart Posyandu API
After=network.target postgresql.service

[Service]
WorkingDirectory=/var/www/posyandu/server
Environment=NODE_ENV=production
EnvironmentFile=/var/www/posyandu/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

### Cadangan di VPS

Cadangan harian sudah berjalan di dalam proses server (02.00 WIB, dengan
catch-up saat server menyala lagi). Timer terpisah hanya perlu bila kamu ingin
cadangan yang tidak bergantung pada proses web.

---

## 9. Struktur kode

```
server/src/
  app.js             susunan Express (helmet, CORS, batas laju, CSRF)
  server.js          titik masuk + penjadwal cadangan
  env.js             konfigurasi (baca .env root)
  db/                pool, migrasi, demo (akun dibuat lewat bin/buat-admin.js)
  domain/            aturan murni: sinkron, kursor, halaman-sinkron, gizi, keamanan,
                     enkripsi, sesi-cookie, sandi-pemulihan
  middleware/        autentikasi (cookie)
  routes/            masuk, sinkron, data, laporan, pengguna, sesi, cadangan
  jobs/              cadangan, pencadangan-harian, verifikasi, pemulihan, jadwal
  bin/               CLI: cadangan.js, pulih.js, buat-admin.js
klien/src/
  jaringan/api.js    satu tempat untuk panggil server
  logika/            sinkron, rentang, waktu, nama, terakhir
  penyimpanan/       db.js (Dexie), balita.js, kunjungan.js, sesi.js
  antarmuka/         layar React
```

**Aturan:** klien & server terpisah; tak ada impor silang. Keduanya hanya sepakat
pada bentuk JSON.

**Uji murni tanpa basis data** (`server/tests/`) mengunci bentuk kueri & aturan.
Tambahkan berkas uji baru ke daftar tes di `server/package.json`.

---

## 10. Jebakan yang sudah pernah terjadi

1. **Membuang `diperbarui_pada` dari muatan sinkron** demi menghemat ukuran →
   tarikan berhenti di 2.001 baris. |

2. **Membulatkan kursor** lewat `new Date()` → baris terkirim ulang. |

3. **Menyaring kursor di Node** (bukan di SQL) → kehilangan 421.128 dari 433.134
   baris tanpa galat. |

4. **`npm run dev` memanggil `bash alat/dev.sh`** yang tak pernah ada → selalu
   gagal. Sekarang `alat.js dev` (Node murni, tanpa pustaka).

5. **Bundel produksi menanam `VITE_API=http://127.0.0.1:3000`** → browser
   memanggil `127.0.0.1:3000` & diblokir CSP. Kosongkan `VITE_API` di `.env`
   lalu bangun ulang. |

6. **Mengira `ps -W`** bekerja di sesi ini — tidak. |

---

## 11. Angka terukur (untuk rujukan)

| Hal | Angka |
|-----|-------|
| Uji server / klien | 66 / 30 lulus. |
| `/balita` (N+1 wali | 51 kueri 138 ms → 2 kueri 16,6 ms. |
| `/rekap` sebaran gizi | 5.331 baris → 4 baris diangkut; 309 → 200 ms. |
| Tarikan sinkron per halaman | 154 ms (admin) / 236 ms (kader); 0 duplikat. |
| Tarikan dingin penuh | 433.134 baris / 252 detik. |
| Bundel awal klien | 332 kB (gzip 101,8 kB) + 219 kB dimuat saat grafik dibuka. |
| Cadangan | ~39 MB untuk 433.134 baris. |

---

## 12. Hal yang belum diputuskan

| Hal | Keputusan dari |
|-----|----------------|
| Retensi `log_audit` | Admin desa / tim. |
| Acuan pertumbuhan: WHO 2006 vs Kemenkes | Petugas kesehatan. |
| Batas usia balita untuk status aktif | Petugas kesehatan. |
| Rentang berat & tinggi wajar | Petugas kesehatan. |
| Penyedia hosting & nama domain | Tim & desa. |

**Catatan:** `log_audit` saat ini **tidak dipangkas** — audit memang harus utuh. |

---

## 13. Catatan untuk agen AI

Pegangan aturan internal ada di `docs/AGENTS.md` — **ada di mesin, tidak ikut ke
repositori** (sudah diabaikan git). Baca sebelum menulis kode. |

---

*Dokumen ini untuk pengembang. Untuk pemakai: `PANDUAN-PEMAKAI.md`.*
