# Referensi API Smart Posyandu

Sumber kebenaran: `server/src/app.js` (middleware, `/sehat`, `/metrik`, `/waktu`) dan `server/src/routes/*.js`. Dokumen ini hanya mencatat endpoint yang benar-benar didaftarkan. Untuk keputusan klinis yang belum final, lihat `docs/VALIDASI-KLINIS.md`.

## 1. Konvensi umum

| Aspek | Nilai |
| --- | --- |
| Base URL | **Origin yang sama** dengan antarmuka (`/`). Tanpa `VITE_API`, Vite mem-proxy jalur API ke server Node saat pengembangan; di produksi Nginx yang menangani. Alamat absolut bukan bagian dari kontrak. |
| Format body | `application/json`, batas 1 MB. Pengecualian: `POST /cadangan/pulihkan-unggah` memakai body biner mentah, batas 256 MB. |
| Header penulisan | `X-Requested-With: smart-posyandu` **wajib** untuk `POST`, `PUT`, `PATCH`, `DELETE`. Berlaku global; `GET` dan `OPTIONS` dikecualikan. |
| Autentikasi petugas | Cookie sesi HttpOnly `posyandu_sesi` (token `sesi_login`, dapat dicabut). Bukan header `Authorization`, bukan JWT, dan tidak pernah dibaca JavaScript. Default `SameSite=Strict`, `Path=/`, `Max-Age` mengikuti peran (`MENIT_SESI_ADMIN` / `MENIT_SESI_TABLET`); `Secure` bila production atau `COOKIE_SECURE=true`. |
| Autentikasi wali | Cookie terpisah `posyandu_wali`, 30 menit, hanya untuk 3 endpoint `/wali/*`. Tidak memberi akses ke endpoint petugas. |
| CORS | Hanya origin dalam `ASAL_DIIZINKAN` (bawaan `http://127.0.0.1:5173,http://localhost:5173`) yang diizinkan, dengan `Access-Control-Allow-Credentials: true`. `OPTIONS` dijawab `204`. Header diizinkan: `Content-Type`, `X-Requested-With`, `X-Kata-Sandi`, `X-Nama-Berkas`, `X-Metrik-Token`. |
| Pembatas laju | Dihitung **sebelum** gerbang CSRF, per kelas jalur per IP: `POST /masuk` dan `POST /wali/cari` **60** / 60 detik, jalur lain **300** / 60 detik → `429 terlalu_banyak_permintaan` dengan `Retry-After: 60`. Karena limiter lebih dulu, `429` dapat mendahului `403`/`422`. Selain itu ada pembatas gagal khusus `/masuk`, `/wali/cari` (`Retry-After: 900`), dan konfirmasi sandi pemulihan. |
| Balasan sukses | JSON kecuali ditandai lain. Hampir semua menyertakan `waktu_server` (ISO-8601); `_pada` bertipe timestamp, `tanggal*` berbentuk `YYYY-MM-DD`. |
| Balasan galat | `{ "detail": <string|objek> }`, opsional `rincian`, `kode`, `rujukan`, `pesan`. `500` selalu `{ "detail": "kesalahan_server" }`. Rute tidak dikenal → `404 endpoint_tidak_ditemukan`. |

### Peran

| Peran | Singkatan | Catatan |
| --- | --- | --- |
| `kader` | Kader | Terikat satu `posyandu_id`. Middleware `butuhPosyandu` menolak kader tanpa Posyandu dengan `403 kader_tanpa_posyandu` pada seluruh rute `data.js` dan `sinkron.js`. |
| `nakes` | Petugas kesehatan | Boleh melihat semua Posyandu; satu-satunya peran yang boleh membuat `tindak_lanjut` dan memutuskan jadwal. |
| `admin_desa` | Admin desa | Akses penuh CRUD pengguna/Posyandu, ekspor, cadangan, pemulihan, log aktivitas. |

### Galat global (berlaku di semua endpoint)

| Status | `detail` | Sebab |
| --- | --- | --- |
| `403` | `butuh_header_permintaan` | Header `X-Requested-With` hilang/salah pada metode penulisan. |
| `429` | `terlalu_banyak_permintaan` | Lewat batas laju. |
| `401` | `butuh_masuk` | Cookie sesi tidak ada/kedaluwarsa/dicabut pada endpoint terlindungi. |
| `403` | `tidak_diizinkan` | Peran tidak termasuk. |
| `404` | `endpoint_tidak_ditemukan` | Path tidak terdaftar. |
| `500` | `kesalahan_server` | Galat tak tertangani; rincian hanya di log server. |

#### Diagnosis per-path (tanpa cookie, satu permintaan per jalur)

Gerbang CSRF dan pembatas laju bersifat **global per metode/kelas jalur**, bukan proteksi khusus satu endpoint. Yang berbeda per path justru penjaga sesi. Tabel ini membantu on-call membaca `403` dengan benar: **bukan** reputasi IP, **bukan** deteksi bot/CDP; responsnya JSON pendek dari aplikasi sendiri.

| Path | Metode | Status | `detail` | Arti |
| --- | --- | --- | --- | --- |
| `/sehat`, `/waktu` | GET | `200` | — | Publik, untuk health-check & selisih jam sinkron. |
| `/metrik`, `/rekap` | GET | `401` | `butuh_masuk` | Perlu sesi petugas/token. |
| `/wali/riwayat` | GET | `401` | `butuh_cari_ulang` | Cookie wali hilang/kedaluwarsa, harus `/wali/cari` lagi. |
| `/masuk`, `/wali/cari`, path apa pun | POST tanpa header | `403` | `butuh_header_permintaan` | CSRF global; **bukan** blokir IP. |
| `/masuk` | POST + `X-Requested-With` | `422` | `muatan_tidak_lengkap` | Validasi muatan jalan. |
| `/wali/cari` | POST + `X-Requested-With` | `422` | `muatan_tidak_sah` | Validasi muatan jalan. |
| path tidak dikenal | GET | `404` | `endpoint_tidak_ditemukan` | Rute tidak terdaftar. |
| jalur mana pun | berulang | `429` | `terlalu_banyak_permintaan` | Lewat pagu kelas jalur; `Retry-After: 60`. |

Bila ada `403` berupa HTML interstitial/kaptcha, itu berada **di luar aplikasi ini** (mis. proksi/WAF); jangan langsung menyimpulkan alamat IP diblokir atau mengganti-ganti proxy sebelum membaca isi badan responsnya. `X-Requested-With: smart-posyandu` adalah kontrak resmi klien, bukan bypass.

### Endpoint publik (tanpa cookie)

`GET /sehat`, `GET /waktu`, `POST /masuk`, `POST /wali/cari`, `GET /konten-publik`, `GET /posyandu/publik`.

> Rute `/sehat`, `/metrik`, dan `/waktu` didaftarkan langsung di `app.js`, bukan di `routes/*.js`. Ketiganya tetap tercantum di indeks dan di bawah.

## 2. Indeks endpoint

| Metode | Path | Autentikasi | Peran diizinkan |
| --- | --- | --- | --- |
| GET | `/sehat` | Publik | — |
| GET | `/metrik` | `X-Metrik-Token` bila diisi; jika tidak, sesi | `admin_desa` bila token kosong |
| GET | `/waktu` | Publik | — |
| POST | `/masuk` | Publik | — |
| GET | `/saya` | Sesi | semua |
| POST | `/keluar` | Sesi | semua |
| POST | `/wali/cari` | Publik | — |
| GET | `/wali/riwayat` | Cookie wali | — |
| POST | `/wali/keluar` | Cookie wali | — |
| POST | `/sinkron` | Sesi | semua (kader wajib punya Posyandu) |
| GET | `/sinkron` | Sesi | semua (kader wajib punya Posyandu) |
| GET | `/balita` | Sesi | semua |
| GET | `/posyandu` | Sesi | semua |
| GET | `/balita/:id` | Sesi | semua |
| POST | `/balita` | Sesi | `admin_desa` |
| PATCH | `/balita/:id` | Sesi | `admin_desa` |
| DELETE | `/balita/:id` | Sesi | `admin_desa` |
| GET | `/kunjungan` | Sesi | semua |
| GET | `/validasi` | Sesi | `nakes`, `admin_desa` |
| POST | `/kunjungan/:id/validasi` | Sesi | `nakes` |
| POST | `/validasi/semua` | Sesi | `nakes`, `admin_desa` |
| POST | `/kunjungan/:id/tindak_lanjut` | Sesi | `nakes` |
| GET | `/pengguna` | Sesi | `admin_desa` |
| POST | `/pengguna` | Sesi | `admin_desa` |
| PATCH | `/pengguna/:id` | Sesi | `admin_desa` |
| DELETE | `/pengguna/:id` | Sesi | `admin_desa` |
| PATCH | `/akun-saya` | Sesi | semua (admin boleh mengubah akun lain) |
| GET | `/sesi` | Sesi | `admin_desa` |
| DELETE | `/sesi/:id` | Sesi | `admin_desa` |
| GET | `/rekap` | Sesi | `nakes`, `admin_desa` |
| GET | `/ekspor.csv` | Sesi | `admin_desa` |
| GET | `/kualitas` | Sesi | `admin_desa` |
| GET | `/cadangan` | Sesi | `admin_desa` |
| POST | `/cadangan` | Sesi | `admin_desa` |
| GET | `/cadangan/:nama` | Sesi | `admin_desa` |
| GET | `/cadangan/:nama/pratinjau` | Sesi | `admin_desa` |
| POST | `/cadangan/:nama/pulihkan` | Sesi | `admin_desa` |
| POST | `/cadangan/pulihkan-unggah` | Sesi | `admin_desa` |
| GET | `/konten-publik` | Publik | — |
| GET | `/konten-publik/semua` | Sesi | `kader`, `nakes`, `admin_desa` |
| POST | `/konten-publik` | Sesi | `kader` (jadwal saja), `admin_desa` |
| POST | `/konten-publik/:id/putuskan` | Sesi | `nakes`, `admin_desa` |
| PATCH | `/konten-publik/:id` | Sesi | `kader` (milik sendiri), `admin_desa` |
| DELETE | `/konten-publik/:id` | Sesi | `kader` (milik sendiri), `admin_desa` |
| GET | `/posyandu/publik` | Publik | — |
| GET | `/posyandu/semua` | Sesi | `admin_desa` |
| GET | `/posyandu/:id` | Sesi | semua |
| POST | `/posyandu` | Sesi | `admin_desa` |
| PATCH | `/posyandu/:id` | Sesi | `admin_desa` |
| DELETE | `/posyandu/:id` | Sesi | `admin_desa` |
| GET | `/aktivitas` | Sesi | `admin_desa` |

## 3. Detail endpoint

### 3.1 `app.js` — kesehatan, metrik, waktu

#### `GET /sehat`

Publik. Pemeriksaan koneksi basis data.

- Sukses `200`: `{ status: 'sehat', db: 'ok' }`.
- Galat: `503 { status: 'sakit', db: 'gagal' }`.

#### `GET /metrik`

Dilindungi oleh `METRIK_TOKEN` bila diisi; bila kosong, cukup sesi `admin_desa`.

| Header | Wajib | Keterangan |
| --- | --- | --- |
| `X-Metrik-Token` | Bila `METRIK_TOKEN` diisi | Harus persis sama dengan nilai `METRIK_TOKEN`. Bila variabel kosong, header ini diabaikan dan berlaku sesi `admin_desa`. |

- Sukses `200`: `{ lingkup, uptime_detik, rss_mb, permintaan: { jumlah, '2xx', '4xx', '403', '422', '429', '5xx', rataRataMs }, koneksi: { totalCount, idleCount, waitingCount }, uji_cadangan_terakhir, uji_cadangan_usia_jam, pg_stat_activity }`.
  - `lingkup: "proses_ini"`: `permintaan`, `koneksi`, dan pembatas laju dihitung **hanya pada proses Node yang menjawab**. Angka reset saat restart dan tidak sah untuk agregasi multi-instance/PM2 cluster; `koneksi` dan `pg_stat_activity` juga per proses / pool itu.
  - `uji_cadangan_usia_jam`: umur `uji_cadangan_terakhir.diperiksa_pada` dalam jam (2 desimal); `null` bila belum ada verifikasi atau cap waktu tidak valid. Pakai ini untuk mengingat drill bulanan, bukan sebagai bukti drill berhasil.
  - `'403'`, `'422'`, `'429'` adalah subset `'4xx'`, jangan dijumlahkan lagi. Pakai untuk membedakan CSRF/validasi muatan/kena pagu: `403` tinggi = permintaan tanpa header resmi, `422` tinggi = klien salah muatan, `429` tinggi = ada yang menabrak batas.
- Galat: `401 metrik_tidak_diizinkan`; `401 butuh_masuk` / `403 tidak_diizinkan` bila memakai jalur sesi.

#### `GET /waktu`

Publik. Sukses `200`: `{ waktu_server }`.

### 3.2 `routes/masuk.js` — masuk dan identitas

#### `POST /masuk`

Publik. Membuat baris `sesi_login` dan mengirim cookie `posyandu_sesi`.

| Body | Tipe | Wajib | Batasan |
| --- | --- | --- | --- |
| `nama_pengguna` | string | ya | ≤ 50 karakter |
| `kata_sandi` | string | ya | ≤ 128 karakter |
| `id_perangkat` | string | ya | ≤ 80 karakter |

- Sukses `200`: `{ pengguna: { id, nama_pengguna, nama_lengkap, peran, posyandu_id, nama_posyandu }, waktu_server }`; token **hanya** di `Set-Cookie`.
- Galat: `422 muatan_tidak_lengkap` (field hilang/melebihi batas); `401 nama_pengguna_atau_kata_sandi_salah`; `429 { rincian: 'terkunci_sementara', menit: 15 }` + `Retry-After: 900` setelah 5 gagal per (nama, IP) dalam 15 menit.

#### `GET /saya`

Sesi. Sukses `200`: `{ pengguna, waktu_server }`. Galat: `401 butuh_masuk`.

#### `POST /keluar`

Sesi. Mencabut sesi aktif dan menghapus cookie. Sukses `204` tanpa body (idempoten).

### 3.3 `routes/wali.js` — Cek Perkembangan Anak

#### `POST /wali/cari`

Publik. Verifikasi dua faktor (nama/NIK + tanggal lahir), lalu cookie `posyandu_wali` 30 menit.

| Body | Tipe | Wajib | Batasan |
| --- | --- | --- | --- |
| `kunci` | string | ya | Nama balita atau NIK 16 digit; ≤ 120 karakter |
| `tanggal_lahir` | string | ya | `YYYY-MM-DD`, tanggal harus benar-benar ada |

- Sukses `200`: `{ status: 'cocok', waktu_server }` + `Set-Cookie: posyandu_wali`.
- Galat: `422 muatan_tidak_sah`; `401 nama_atau_nik_tidak_cocok`; `429 nama_atau_nik_tidak_cocok` + `Retry-After: 900` setelah 5 gagal per IP. Audit `cari_wali` / `gagal_cari_wali` tidak menyimpan NIK, nama, atau balita_id yang dicari.

#### `GET /wali/riwayat`

Cookie wali; balita diambil dari sesi, bukan parameter URL. Hanya kunjungan tervalidasi, maks 200 baris. Tanpa NIK, kontak, alamat, catatan internal, atau kunjungan belum divalidasi.

- Sukses `200`: `{ balita: { nama_lengkap, tanggal_lahir, jenis_kelamin, nama_ibu_kandung, nama_posyandu, wali: [{ nama_lengkap, hubungan }] }, ringkasan: { jumlah_kunjungan, berat_terakhir_kg, tinggi_terakhir_cm, status_gizi_terakhir, perubahan_berat_kg }, kunjungan: [...], waktu_server }`.
- Galat: `401 butuh_cari_ulang`.

#### `POST /wali/keluar`

Cookie wali. Mencabut akses dan menghapus cookie. Sukses `200`: `{ status: 'keluar' }`.

### 3.4 `routes/sinkron.js` — sinkronisasi tablet

Berlaku `butuhPosyandu` untuk kader.

#### `POST /sinkron`

| Body | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `perubahan` | array | tidak | Maks 500 elemen; tiap elemen `{ nama_tabel, id_baris, aksi: 'ubah'\|'hapus', muatan, ... }`. Tabel yang dikenal: `balita`, `kunjungan`, `pengukuran`, `tindak_lanjut`, `orang_tua`, `balita_orang_tua`. |
| `id_perangkat` | string | tidak | Bawaan `'server'`; dipakai untuk audit. |

- Sukses `200`: `{ diterima: [id_baris], ditolak: [{ id_baris, alasan, ... }], waktu_server }`. Tolakan per baris tidak menggagal seluruh permintaan. `alasan` antara lain `tabel_tidak_dikenal`, `muatan_tidak_sah`, `tidak_diizinkan`, `usia_di_luar_rentang`, `nik_wajib_16_digit`, `posyandu_tidak_ditemukan`, `sudah_divalidasi`, `di_luar_rentang` (+ `kolom`), `waktu_lewat_masa_depan`, `kalah_versi` (+ `terjadi_pada_tersimpan`).
- Galat: `413 { detail: 'terlalu_banyak_perubahan', batas: 500 }`; selain itu galat global.

#### `GET /sinkron`

| Query | Tipe | Bawaan | Keterangan |
| --- | --- | --- | --- |
| `sejak` | string | awal | Kursor `waktu|tabel|id` dari `berikutnya` sebelumnya. |
| `batas` | number | `500` | Dibatasi 1–2000. |

- Sukses `200`: `{ perubahan: [{ nama_tabel, id_baris, aksi, versi, terjadi_pada, dihapus_pada, muatan }], berikutnya, jumlah, waktu_server }`. `muatan.nik` selalu `null`. Kader hanya menerima baris Posyandunya. `jumlah` hanya diisi pada halaman terakhir ( `{ balita: n }` ); `berikutnya: null` menandakan selesai.

### 3.5 `routes/data.js` — balita, kunjungan, validasi

Semua endpoint di grup ini menjalankan `butuhPosyandu` (kader tanpa Posyandu → `403 kader_tanpa_posyandu`).

#### `GET /balita`

| Query | Tipe | Bawaan | Keterangan |
| --- | --- | --- | --- |
| `q` | string | `''` | Pencarian nama, maks 80 karakter. |
| `aktif` | string | `'true'` | `'true'` menyaring balita aktif. |
| `posyandu_id` | UUID | — | Filter tambahan; kader tetap dibatasi Posyandunya. |
| `batas` | number | `200` | Dibatasi 1–500. |
| `offset` | number | `0` | ≥ 0. |

- Sukses `200`: `{ balita: [{ ...baris, nik, nik_ada, wali: [...] }], total, berikutnya, waktu_server }`. `nik` asli hanya untuk `admin_desa`; kader menerima `nik: null` + `nik_ada`. `berikutnya` = offset berikutnya atau `null`.
- Galat: `422 posyandu_tidak_sah` (format UUID salah).

#### `GET /posyandu`

Sesi. Sukses `200`: `{ posyandu: [...] }` (hanya aktif; kader hanya Posyandunya). Berbeda dengan `/posyandu/publik` dan `/posyandu/semua`.

#### `GET /balita/:id`

Sesi. Sukses `200`: baris balita dengan `nik`, `nik_ada`, dan `wali: [...]`. Galat: `404 balita_tidak_ditemukan` (termasuk bila di luar Posyandu kader).

#### `POST /balita`

`admin_desa`. Membuat balita + wali utama + audit dalam satu transaksi.

| Body | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `nama_lengkap` | string | ya | 1–120 karakter |
| `tanggal_lahir` | string | ya | `YYYY-MM-DD`, usia 0 hari–7 tahun |
| `jenis_kelamin` | string | ya | `laki-laki` / `perempuan` |
| `nik` | string | ya | Tepat 16 digit, disimpan terenkripsi |
| `posyandu_id` | UUID | ya | Harus ada |
| `wali` | objek | ya | `{ nama_lengkap, hubungan: 'ibu_kandung'\|'ayah_kandung'\|'wali', nomor_kontak?, alamat? }` |
| `berat_lahir_kg`, `panjang_lahir_cm` | number | tidak | > 0, maks masing-masing 40 dan 70 |
| `nama_ibu_kandung` | string | tidak | — |
| `aktif` | boolean | tidak | Bawaan `true` |

- Sukses `201`: baris balita baru (`nik: null`).
- Galat: `422 nik_wajib_16_digit`, `422 posyandu_tidak_ditemukan`, `422 muatan_tidak_sah`, `422 usia_di_luar_rentang`.

#### `PATCH /balita/:id`

`admin_desa`. Field sama seperti `POST /balita` (semua opsional) plus `wali`. Sukses `200`: baris terbaru dengan `nik: null`.

- Galat: `422 muatan_tidak_sah` / `nik_wajib_16_digit` / `usia_di_luar_rentang` / `tidak_ada_yang_diubah`; `404 balita_tidak_ditemukan`.

#### `DELETE /balita/:id`

`admin_desa`. Hapus lunak balita beserta turunannya. Sukses `204`. Galat: `404 balita_tidak_ditemukan`.

#### `GET /kunjungan`

Sesi.

| Query | Tipe | Bawaan | Keterangan |
| --- | --- | --- | --- |
| `batas` | number | `200` | Dibatasi 1–500. |

- Sukses `200`: `{ kunjungan: [{ ...baris, pengukuran }], waktu_server }`; kader hanya Posyandunya. `pengukuran` = `null` bila tidak ada.

#### `GET /validasi`

`nakes` atau `admin_desa`. Antrean kunjungan tervalidasi = belum, punya pengukuran.

| Query | Tipe | Bawaan | Keterangan |
| --- | --- | --- | --- |
| `batas` | number | `50` | Maks 500. |
| `offset` | number | `0` | ≥ 0. |
| `q` | string | `''` | Cari nama balita. |
| `posyandu_id` | string | `''` | Filter Posyandu. |

- Sukses `200`: `{ validasi: [{ ...kunjungan, nama_balita, jenis_kelamin, tanggal_lahir, pengukuran }], total, berikutnya, waktu_server }`.

#### `POST /kunjungan/:id/validasi`

`nakes`. Menandai satu kunjungan tervalidasi dan menghitung status gizi bila belum ada, dalam satu transaksi. Bila acuan BB/U tidak tersedia untuk usia tersebut, `status_gizi` tetap `null` dan `sumber_status` berisi `acuan_tidak_tersedia` (bukan penilaian gizi; lihat `docs/VALIDASI-KLINIS.md`). Sukses `200`: baris kunjungan terbaru. Galat: `404 kunjungan_tidak_ditemukan`.

#### `POST /validasi/semua`

`nakes` atau `admin_desa`. Validasi massal mengikuti filter yang sedang dipakai.

| Body | Tipe | Keterangan |
| --- | --- | --- |
| `q` | string | Filter nama balita; kosong = semua. |
| `posyandu_id` | string | Filter Posyandu; kosong = semua. |

- Sukses `200`: `{ divalidasi: n, waktu_server }`.

#### `POST /kunjungan/:id/tindak_lanjut`

`nakes`.

| Body | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `jenis` | string | ya | — |
| `isi` | string | ya | — |
| `tanggal_tindak_lanjut` | string | tidak | Bawaan `null`. |

- Sukses `201`: baris `tindak_lanjut` baru (`selesai: false`). Galat: `422 muatan_tidak_lengkap`.

### 3.6 `routes/pengguna.js` — akun

#### `GET /pengguna`

`admin_desa`. Sukses `200`: `{ pengguna: [{ id, nama_pengguna, nama_lengkap, peran, posyandu_id, aktif, dibuat_pada }] }`.

#### `POST /pengguna`

`admin_desa`.

| Body | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `nama_pengguna` | string | ya | Unik |
| `nama_lengkap` | string | ya | — |
| `kata_sandi` | string | ya | Minimal 8 karakter |
| `peran` | string | tidak | `kader` (bawaan), `nakes`, `admin_desa` |
| `posyandu_id` | UUID | bersyarat | Wajib untuk `kader`, opsional untuk `nakes`, selalu `null` untuk `admin_desa` |

- Sukses `201`: `{ id, nama_pengguna, nama_lengkap, peran, posyandu_id, aktif }`.
- Galat: `422 muatan_tidak_lengkap` / `kata_sandi_terlalu_pendek` / `peran_tidak_dikenal` / `posyandu_wajib_diisi` (+ `rincian`) / `posyandu_tidak_ditemukan`; `409 nama_pengguna_sudah_dipakai`.

#### `PATCH /pengguna/:id`

`admin_desa`.

| Body | Tipe | Keterangan |
| --- | --- | --- |
| `aktif` | boolean | `false` pada `admin_desa` ditolak |
| `posyandu_id` | UUID/`null` | Kader wajib mengisi; `null`/`''` menghapus ikatan untuk peran lain |
| `kata_sandi_baru` | string | Minimal 8 karakter; memutus semua sesi akun ini |

- Sukses `200`: baris akun terbaru.
- Galat: `422 posyandu_wajib_diisi` (+ `rincian`) / `posyandu_tidak_ditemukan` / `kata_sandi_terlalu_pendek` / `tidak_ada_yang_diubah`; `403 admin_tidak_bisa_dinonaktifkan`; `404 pengguna_tidak_ditemukan`.

#### `DELETE /pengguna/:id`

`admin_desa`. Hapus lunak + hapus sesi + audit. Sukses `204`.

- Galat: `422 id_tidak_sah`; `404 pengguna_tidak_ditemukan`; `403 tidak_bisa_hapus_diri`; `403 admin_terakhir`.

#### `PATCH /akun-saya`

Sesi. Pemakai biasa hanya akunnya sendiri; `admin_desa` boleh mengubah akun lain lewat field `id`.

| Body | Tipe | Keterangan |
| --- | --- | --- |
| `id` | UUID | Opsional, hanya dipakai `admin_desa` |
| `nama_lengkap` | string | 1–120 karakter |
| `nama_pengguna` | string | `^[a-z0-9_.-]{3,50}$` |

- Peran, status aktif, dan kata sandi **tidak** lewat endpoint ini.
- Sukses `200`: baris akun terbaru.
- Galat: `403 tidak_diizinkan`; `422 id_tidak_sah` / `nama_tidak_sah` / `nama_pengguna_tidak_sah` / `tidak_ada_yang_diubah`; `404 pengguna_tidak_ditemukan`; `409 nama_pengguna_sudah_dipakai`.

### 3.7 `routes/sesi.js` — sesi aktif

#### `GET /sesi`

`admin_desa`. Sukses `200`: `{ sesi: [{ id, pengguna_id, id_perangkat, dibuat_pada, kadaluarsa_pada, nama_pengguna, nama_lengkap, peran }], waktu_server }`.

#### `DELETE /sesi/:id`

`admin_desa`. Mencabut satu sesi; mengulang permintaan tetap `204`. Sukses `204`. Galat: `404 sesi_tidak_ditemukan`.

### 3.8 `routes/laporan.js` — rekap dan ekspor

#### `GET /rekap`

`nakes` atau `admin_desa`.

| Query | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `bulan` | string | ya | `YYYY-MM` |

- Sukses `200`: `{ bulan, posyandu: { id, nama }, jumlah_kunjungan, jumlah_balita_tercatat, balita_terdaftar, balita_tidak_berkunjung, sebaran_status_gizi: { gizi_baik, gizi_kurang, gizi_buruk, gizi_buruk_berat, belum_dinilai }, jumlah_acuan_tidak_tersedia, rata_persen_median }`. Bila pemakai terikat Posyandu, angkanya dibatasi ke Posyandu itu.
  - `sebaran_status_gizi` sengaja tetap 5 kunci: `belum_dinilai` adalah **semua** baris tanpa `status_gizi`, termasuk yang punya alasan. `jumlah_acuan_tidak_tersedia` adalah subset dari `belum_dinilai` (baris dengan `sumber_status = 'acuan_tidak_tersedia'`), **bukan status gizi** dan tidak boleh dijumlahkan lagi ke total. Klien lama yang jumlah `Object.values(sebaran_status_gizi)` tetap mendapat angka yang sama.
- Galat: `422 format_bulan_salah`.

#### `GET /ekspor.csv`

`admin_desa`.

| Query | Tipe | Wajib |
| --- | --- | --- |
| `bulan` | string | ya, `YYYY-MM` |

- Sukses `200`: `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="posyandu-<bulan>-<tanggal>.csv"`. Kolom: `tanggal_kunjungan,nama_balita,jenis_kelamin,tanggal_lahir,usia_bulan,berat_kg,tinggi_cm,lingkar_kepala_cm,status_gizi,persen_median,divalidasi`; diawali baris komentar yang menyebut admin dan waktu ekspor. Setiap ekspor tercatat di `log_audit`.
- Galat: `422 format_bulan_salah`.

#### `GET /kualitas`

`admin_desa`. Sukses `200`: `{ sinkron_terakhir, perangkat: [{ id_perangkat, sinkron_terakhir }], belum_divalidasi, kunjungan_tanpa_ukur, belum_terkirim_perkiraan: 0, perlu_tinjauan: [{ id_baris, nama_tabel, alasan: 'waktu_lewat_masa_depan', diterima_pada }] }`.

### 3.9 `routes/cadangan.js` — cadangan dan pemulihan

Seluruh endpoint `admin_desa`.

#### `GET /cadangan`

Sukses `200`: `{ cadangan: [{ nama, ukuran_byte, dibuat_pada }], verifikasi }`. `verifikasi` = `null` bila tabel uji belum ada.

#### `POST /cadangan`

Membuat cadangan terenkripsi sekarang. Berkas memuat `_meta.sha256` untuk deteksi kerusakan; cadangan lama tanpa `_meta` tetap dapat dipulihkan. Sukses `201`: `{ nama, ukuran_byte }`. Galat: `500 pencadangan_gagal`.

#### `GET /cadangan/:nama`

Mengunduh berkas. Sukses `200`: `application/octet-stream` dengan `Content-Disposition: attachment`, `Cache-Control: no-store`; pengunduhan tercatat di audit. Galat: `404 berkas_tidak_ditemukan` (nama salah atau tidak ada).

#### `GET /cadangan/:nama/pratinjau`

Sukses `200`: `{ nama, ukuran_byte, dibuat_pada, tabel: [{ nama, jumlah }], total_baris, tabel_tidak_dikenal }`. Pratinjau dan pemulihan menolak berkas dengan `_meta.sha256` yang tidak cocok (`409 integritas_cadangan_tidak_cocok`).

#### `POST /cadangan/:nama/pulihkan`

| Body | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `konfirmasi` | string | ya | Harus persis sama dengan `:nama` |
| `kata_sandi` | string | ya | Kata sandi akun admin yang sedang masuk |

- Sukses `200`: ringkasan `{ berkas, ukuran_byte, dibuat_pada, cadangan_pengaman, tabel, tabel_tidak_dikenal, kolom_tidak_dikenal, kader_id_dikosongkan, total_baris }`.
- Galat: `422 konfirmasi_tidak_cocok` (`kode: konfirmasi_tidak_cocok`); `401 kata_sandi_salah` / `429 terlalu_banyak_percobaan` dari pembatas sandi; `404 berkas_tidak_ditemukan`; `409` salah satu kode `kunci_cadangan_tidak_cocok`, `berkas_cadangan_rusak`, `integritas_cadangan_tidak_cocok`, `isi_cadangan_tidak_sah`, `isi_cadangan_kosong`, `tidak_ada_tabel_dikenal`, `pemulihan_sedang_berjalan`, `pemulihan_bentrok_unik`, `pemulihan_bentrok_rujukan`; `500 pemulihan_gagal`.

#### `POST /cadangan/pulihkan-unggah`

Body biner mentah (maks 256 MB), bukan JSON.

| Header / Query | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `X-Kata-Sandi` | header | ya | Kata sandi akun admin |
| `X-Nama-Berkas` atau `?nama=` | header/query | tidak | Bawaan `posyandu-unggah-<cap>.json.gz.enc` bila tidak sah |

- Sukses `200`: ringkasan pemulihan seperti pada endpoint `POST /cadangan/:nama/pulihkan`.
- Galat: `401 kata_sandi_salah` / `429 terlalu_banyak_percobaan`; `400 berkas_kosong`; kode galat pemulihan sama seperti endpoint `pulihkan`.

### 3.10 `routes/konten.js` — konten kanal publik

Jenis sah: `jadwal`, `layanan`, `pengumuman`, `edukasi`. Status persetujuan: `menunggu`, `disetujui`, `ditolak`.

#### `GET /konten-publik`

Publik. Hanya konten aktif dan `disetujui`.

| Query | Tipe | Keterangan |
| --- | --- | --- |
| `jenis` | string | Filter; diabaikan bila tidak sah |

- Sukses `200`: `{ konten: [{ id, jenis, judul, isi, kategori, tanggal, penting, urutan, dibuat_pada, posyandu_id, sumber_url }] }`, diurutkan `urutan ASC, dibuat_pada DESC`.

#### `GET /konten-publik/semua`

Sesi. Admin melihat semua, nakes melihat semua (bisa menyaring antrean), kader hanya pengajuannya sendiri.

| Query | Tipe | Keterangan |
| --- | --- | --- |
| `jenis` | string | Filter; diabaikan bila tidak sah |
| `status` | string | `menunggu` / `disetujui` / `ditolak`; diabaikan bila tidak sah |

- Sukses `200`: `{ konten: [...] }` dengan field `status_persetujuan`, `pengaju_nama`, `posyandu_nama`, `peninjau_nama`, dan lain-lain. Galat: `403 tidak_diizinkan` untuk peran di luar daftar.

#### `POST /konten-publik`

Sesi. Admin langsung `disetujui`; kader hanya boleh `jadwal` dan statusnya `menunggu`; nakes tidak boleh membuat konten.

| Body | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `jenis` | string | ya | Salah satu jenis sah |
| `judul`, `isi` | string | ya | Tidak boleh kosong |
| `kategori`, `tanggal` | string | tidak | Bawaan `null` |
| `penting` | boolean | tidak | Bawaan `false` |
| `aktif` | boolean | tidak | Bawaan `true` |
| `urutan` | number | tidak | Bawaan `0` |
| `posyandu_id` | UUID | untuk `jadwal` | Kader memakai Posyandu akunnya; admin mengirim id |

- Sukses `201`: baris `konten_publik` baru.
- Galat: `422 jenis_tidak_sah` (+ `rincian`) / `judul_wajib_diisi` / `isi_wajib_diisi` / `posyandu_wajib_diisi` (+ `rincian`) / `posyandu_tidak_ditemukan`; `403 tidak_diizinkan` (+ `rincian`) / `kader_hanya_jadwal` (+ `rincian`).

#### `POST /konten-publik/:id/putuskan`

`nakes` atau `admin_desa`. Hanya untuk `jenis = 'jadwal'`.

| Body | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `keputusan` | string | ya | `disetujui` / `ditolak` |
| `catatan` | string | jika ditolak | Alasan penolakan wajib |

- Sukses `200`: baris konten dengan `status_persetujuan`, `diputuskan_oleh`, `diputuskan_pada`, `catatan_peninjau`, dan `aktif = (keputusan === 'disetujui')`.
- Galat: `422 id_tidak_sah` / `keputusan_tidak_sah` (+ `rincian`) / `alasan_wajib_diisi` (+ `rincian`); `404 jadwal_tidak_ditemukan` (+ `rincian`).

#### `PATCH /konten-publik/:id`

Sesi. Admin semua konten; kader hanya miliknya dan ajuan kembali ke `menunggu` (konten nonaktif sampai disetujui); nakes dilarang menyunting.

| Body | Tipe | Keterangan |
| --- | --- | --- |
| `jenis`, `judul`, `isi`, `kategori`, `tanggal`, `penting`, `aktif`, `urutan`, `posyandu_id` | — | Opsional; aturan sama seperti `POST`. Kader tidak boleh mengubah `posyandu_id`. |

- Sukses `200`: baris konten terbaru.
- Galat: `422 id_tidak_sah` / `jenis_tidak_sah` / `judul_wajib_diisi` / `isi_wajib_diisi` / `posyandu_tidak_sah` / `posyandu_tidak_ditemukan` / `posyandu_wajib_diisi` / `tidak_ada_yang_diubah`; `403 tidak_diizinkan` (+ `rincian`) / `kader_hanya_jadwal`; `404 konten_tidak_ditemukan`.

#### `DELETE /konten-publik/:id`

Sesi. Hapus lunak. Admin semua, kader hanya miliknya. Sukses `204`.

- Galat: `422 id_tidak_sah`; `403 tidak_diizinkan`; `404 konten_tidak_ditemukan`.

### 3.11 `routes/posyandu.js` — unit Posyandu

#### `GET /posyandu/publik`

Publik. Hanya yang aktif. Sukses `200`: `{ posyandu: [{ id, nama, dusun, desa, kecamatan, kabupaten, aktif }] }`.

#### `GET /posyandu/semua`

`admin_desa`. Sukses `200`: `{ posyandu: [...] }` (termasuk yang nonaktif, bukan yang dihapus).

#### `GET /posyandu/:id`

Sesi. Kader hanya Posyandunya sendiri. Sukses `200`: baris Posyandu.

- Galat: `422 muatan_tidak_sah` (bukan UUID); `403 tidak_diizinkan`; `404 posyandu_tidak_ditemukan`.

#### `POST /posyandu`

`admin_desa`.

| Body | Tipe | Wajib | Batasan |
| --- | --- | --- | --- |
| `nama`, `desa` | string | ya | ≤ 120 karakter, tidak kosong |
| `dusun`, `kecamatan`, `kabupaten` | string | tidak | ≤ 120 karakter |
| `aktif` | boolean | tidak | Bawaan `true` |

- Sukses `201`: baris Posyandu baru. Galat: `422 muatan_tidak_sah`.

#### `PATCH /posyandu/:id`

`admin_desa`. Field sama seperti `POST`, semua opsional. Sukses `200`: baris terbaru.

- Galat: `422 muatan_tidak_sah` (UUID salah/field tidak sah); `404 posyandu_tidak_ditemukan`.

#### `DELETE /posyandu/:id`

`admin_desa`. Hapus lunak, ditolak bila masih dirujuk. Sukses `204`.

- Galat: `422 muatan_tidak_sah`; `409 { detail: 'posyandu_masih_terpakai', rujukan: { balita, kunjungan, pengguna, kader }, pesan }`; `404 posyandu_tidak_ditemukan`.

### 3.12 `routes/aktivitas.js` — log aktivitas

#### `GET /aktivitas`

`admin_desa`. Hanya-baca.

| Query | Tipe | Bawaan | Keterangan |
| --- | --- | --- | --- |
| `batas` | number | `50` | Dibatasi 1–200 |
| `offset` | number | `0` | ≥ 0 |
| `aksi` | string | `''` | `buat`, `ubah`, `hapus`, `masuk`, `keluar`, `gagal_masuk` |
| `tabel` | string | `''` | Maks 40 karakter |
| `pengguna_id` | UUID | `''` | Diabaikan bila bukan UUID |
| `dari`, `sampai` | `YYYY-MM-DD` | `''` | Diabaikan bila format salah; `sampai` inklusif |

- Sukses `200`: `{ aktivitas: [{ id, aksi, nama_tabel, id_baris, id_perangkat, alamat_ip, terjadi_pada, diterima_pada, aktor_nama, aktor_peran, ringkasan, nilai_lama, nilai_baru }], total, aktor: [{ id, nama_lengkap, nama_pengguna }], tabel: [nama_tabel], waktu_server }`.
