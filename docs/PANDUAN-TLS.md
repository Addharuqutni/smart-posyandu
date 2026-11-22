# Panduan HTTPS (TLS) untuk Pemasangan Produksi

Panduan ini untuk VPS yang menjalankan **Nginx + Node**. Tujuannya: tablet
membuka `https://posyandu.desa.example`, halaman dan API berada di **satu asal**,
dan port API `3000` tidak pernah bisa diakses langsung dari internet.

Ganti `posyandu.desa.example` dengan domain desa Anda. Jalankan semua perintah
dengan akun yang punya hak `sudo`.

---

## 1. Sebelum memasang sertifikat

Pastikan DNS A/AAAA domain sudah mengarah ke VPS dan port `80` serta `443`
terbuka. Lalu di root proyek:

```bash
cp .env.contoh .env
# Isi DATABASE_URL, KUNCI_RAHASIA, KUNCI_CADANGAN.
# Biarkan VITE_API KOSONG: alamat API ditentukan oleh Nginx, bukan oleh bundel.
npm run siapkan
npm run migrasi
npm run bangun
npm run periksa:produksi
```

`npm run periksa:produksi` memeriksa `NODE_ENV`, `COOKIE_SECURE`,
`KUNCI_RAHASIA`, kombinasi `HOST`/`TRUST_PROXY`, `KUNCI_CADANGAN`, hak tulis
folder cadangan, dan sisa alamat API lokal di `klien/dist`. Perbaiki semua
pesan `GAGAL` sebelum melanjutkan. Skrip itu **hanya membaca** berkas: tidak
pernah menulis atau mengubah `.env`.

Nilai yang benar untuk produksi:

| Variabel | Nilai |
|----------|-------|
| `NODE_ENV` | `production` |
| `VITE_API` | kosong |
| `HOST` | `127.0.0.1` |
| `TRUST_PROXY` | `loopback` (bawaan; jangan `true`) |
| `COOKIE_SECURE` | kosong atau `true` (jangan `false`) |

---

## 2. Blok Nginx: redirect HTTP ke HTTPS

Simpan sebagai `/etc/nginx/sites-available/posyandu`, lalu tautkan ke
`/etc/nginx/sites-enabled/posyandu`.

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name posyandu.desa.example;

    # Semua halaman dan API dipaksa lewat TLS.
    return 301 https://$host$request_uri;
}
```

---

## 3. Blok Nginx: HTTPS + proksi API

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    # Untuk Nginx < 1.25.1, hapus baris di bawah dan pakai: listen 443 ssl http2;
    http2 on;
    server_name posyandu.desa.example;

    ssl_certificate     /etc/letsencrypt/live/posyandu.desa.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/posyandu.desa.example/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS: browser mengingat HTTPS selama 1 tahun. Aktifkan setelah
    # https://domain berhasil dibuka; includeSubDomains hanya bila semua
    # subdomain juga HTTPS.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    root /var/www/posyandu/klien/dist;
    index index.html;

    # Daftar path API harus sama dengan JALUR_API di klien/vite.config.js.
    # Tambahkan rute baru ke sini bila Express mendapat rute baru.
    location ~ ^/(masuk|keluar|saya|akun-saya|sinkron|balita|kunjungan|validasi|pengguna|sesi|rekap|ekspor\.csv|kualitas|cadangan|posyandu|konten-publik|aktivitas|wali|sehat|metrik|waktu)(/|$|\?) {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Sisanya adalah aplikasi React (SPA).
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Uji konfigurasi sebelum memuat ulang:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`X-Forwarded-For` dan `X-Forwarded-Proto` wajib: server memakai IP asli untuk
batas percobaan masuk/pencarian wali, dan memakai skema asli untuk cookie
`Secure`. Karena proksinya berada di mesin yang sama, biarkan `TRUST_PROXY`
pada `loopback` — jangan set `true`, karena itu membuat header bisa dipalsukan
oleh siapa pun yang menyambung langsung ke port `3000`.

Monitoring `/metrik` tidak boleh di-cache atau jatuh ke fallback SPA. Bila
`METRIK_TOKEN` dipakai, kirim header `X-Metrik-Token` dari sistem monitoring;
header ini sudah termasuk daftar CORS yang diizinkan server.

---

## 4. Certbot dan perpanjangan otomatis

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certonly --nginx -d posyandu.desa.example
sudo nginx -t && sudo systemctl reload nginx

# Simulasi perpanjangan: pastikan tidak ada error sebelum mengandalkan cron.
sudo certbot renew --dry-run
systemctl status certbot.timer
```

`certbot --nginx` akan mengubah blok server Anda otomatis. Karena panduan ini
memakai blok Nginx manual, perintah di atas memakai `certonly --nginx`: Certbot
hanya menempatkan sertifikat, konfigurasi TLS tetap seperti ditulis di atas.
Paket `python3-certbot-nginx` mendaftarkan `certbot.timer` yang memperbarui
sertifikat dua kali sehari; plugin Nginx akan memuat ulang Nginx setelah
perpanjangan. Bila timer tidak aktif:

```bash
sudo systemctl enable --now certbot.timer
```

Periksa masa berlaku dengan `sudo certbot certificates`.

---

## 5. Port 3000 tetap internal

Node Mendengar di `127.0.0.1:3000` (bawaan `env.js`). **Jangan** set
`HOST=0.0.0.0` hanya untuk "mempermudah" — itu membuka bypass langsung ke API,
melewati Nginx, HSTS, dan batas laju berbasis IP.

Verifikasi setelah server jalan:

```bash
ss -lntp | grep ':3000'
# Yang diharapkan: 127.0.0.1:3000, BUKAN 0.0.0.0:3000.
```

Tutup juga di firewall:

```bash
sudo ufw deny 3000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

---

## 6. Pemeriksaan akhir

```bash
curl -I http://posyandu.desa.example          # 301 ke https://
curl -I https://posyandu.desa.example         # 200 + Strict-Transport-Security
cd server && npm run periksa:produksi
```

Lalu buka domain di tablet dan coba masuk. Periksa header `Set-Cookie` harus
memuat `HttpOnly`, `SameSite=Strict`, dan `Secure`. Bila login berhasil lalu
langsung kembali ke halaman masuk, hampir pasti halaman dibuka lewat `http`
atau `COOKIE_SECURE` dinonaktifkan.
