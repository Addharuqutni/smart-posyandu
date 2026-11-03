#!/usr/bin/env node
// alat.js -- semua skrip bantu Smart Posyandu, dalam satu berkas di root.
//
// Pakai:
//   node alat.js dev                                  API + klien bersama
//   node alat.js periksa-bangun                       periksa hasil bangun
//   node alat.js siap-vps [--periksa]                 siapkan pemasangan VPS
//   node alat.js pasang-https --ip IP --jaringan CIDR [--uji]
//   node alat.js konfig <internal|izin|https|publik>  cetak konfigurasi Nginx

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execSync } = require('node:child_process')

const AKAR = __dirname

const lapor = {
  ok: (t) => console.log(`  \x1b[32mok\x1b[0m    ${t}`),
  gagal: (t) => console.log(`  \x1b[31mGAGAL\x1b[0m ${t}`),
  saran: (t) => console.log(`  \x1b[33msaran\x1b[0m ${t}`),
  info: (t) => console.log(`        ${t}`),
  judul: (t) => console.log(`\n\x1b[1m${t}\x1b[0m`),
}

// --- Konfigurasi Nginx (cetak lewat `konfig`) ----------------------------
// Konfigurasi ikut tersemat di sini agar pemasangan cukup membawa satu berkas.
// Penanda <IP-PUBLIK> dan <JARINGAN-DESA> diganti oleh `pasang-https`, atau
// dengan sed sendiri bila menyalin manual.

const NGX_INTERNAL = `// Konfigurasi situs Nginx untuk Smart Posyandu.
//
// Pakai di VPS yang diakses lewat IP di jaringan internal desa (tanpa domain,
// tanpa HTTPS). Simpan sebagai:
//   /etc/nginx/sites-available/posyandu
// lalu:
//   ln -s /etc/nginx/sites-available/posyandu /etc/nginx/sites-enabled/
//   nginx -t && systemctl reload nginx
//
// Ganti 10.0.0.10 dengan IP VPS yang sebenarnya (ip addr).
//
// CATATAN KEAMANAN: tanpa HTTPS, kata sandi melintas tanpa enkripsi di
// jaringan lokal. Ini diterima untuk jaringan desa yang tertutup, TIDAK
// untuk internet publik.

server {
    listen 80;
    # Wajib: tanpa ini Nginx menerima Host apa pun (host header poisoning).
    server_name 10.0.0.10;

    # Jangan tampilkan versi Nginx.
    server_tokens off;

    # Batas ukuran unggahan (berkas cadangan yang akan dipulihkan). Server juga
    # membatasi 1 MB untuk JSON; unggahan pemulihan punya batasnya sendiri.
    client_max_body_size 512m;

    root /var/www/posyandu/klien/dist;
    index index.html;

    # --- Aset ber-hash: aman di-cache lama ---------------------------------
    # Vite memberi nama berkas dengan hash isi, jadi berkas berubah nama bila
    # isinya berubah. Manfaat besar untuk tablet dengan sinyal desa.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # --- Service worker tidak boleh di-cache -------------------------------
    # Kalau sw.js di-cache, tablet bisa memakai versi lama selamanya dan
    # perbaikan keamanan tidak pernah sampai.
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # --- API diteruskan ke Node -------------------------------------------
    location ~ ^/(masuk|keluar|saya|sinkron|balita|kunjungan|validasi|pengguna|sesi|rekap|ekspor\\.csv|kualitas|cadangan|sehat|waktu)(/|$|\\?) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        # IP asli pengunjung; tanpa ini semua orang terlihat satu IP dan batas
        # percobaan masuk saling memakan (server memakai \`trust proxy\`).
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Unggahan/pemulihan cadangan butuh waktu lebih dari bawaan 60 detik.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_request_buffering off;
    }

    # --- Halaman aplikasi --------------------------------------------------
    location / {
        try_files $uri $uri/ /index.html;
        # index.html tidak boleh di-cache: ia menunjuk berkas ber-hash terbaru.
        add_header Cache-Control "no-cache";
    }

    # --- Kompresi ----------------------------------------------------------
    # Tanpa ini aset dikirim apa adanya (bundel ~332 KB jadi ~102 KB).
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json
               image/svg+xml application/manifest+json;

    # Jangan izinkan Nginx menyajikan berkas tersembunyi.
    location ~ /\\. {
        deny all;
    }
}

# --- PENTING: port 3000 TIDAK boleh terbuka ------------------------------
# Node hanya mendengarkan di 127.0.0.1 (lihat PORT dan firewall). Periksa:
#   ss -lntp | grep 3000      -> harus 127.0.0.1:3000, bukan 0.0.0.0:3000
`
const NGX_IZIN = `# Daftar putih akses Smart Posyandu.
#
# Simpan sebagai /etc/nginx/snippets/posyandu-izin.conf
# Ganti <JARINGAN-DESA> dengan rentang jaringanmu, mis. 10.0.0.0/8 atau
# 192.168.1.0/24. Bisa lebih dari satu baris allow.
#
# Latar: HTTPS mengamankan JALUR, bukan membatasi SIAPA yang masuk. Karena VPS
# punya IP publik, tanpa blok ini siapa pun di internet bisa membuka aplikasi
# dan melihat layar masuk. Daftar putih menutupnya.
#
# Urutan penting: \`deny all\` harus PALING AKHIR.

# Kantor desa / jaringan lokal.
allow <JARINGAN-DESA>;

# Mesin ini sendiri (pemeriksaan kesehatan, certbot, cron).
allow 127.0.0.1;
allow ::1;

# Sisanya ditolak.
deny all;
`
const NGX_HTTPS = `// Konfigurasi Nginx Smart Posyandu — HTTPS lewat ALAMAT IP (tanpa domain).
//
// Sertifikat: Let's Encrypt "IP address certificate" (tersedia sejak 2026).
// Wajib profil \`shortlived\` (umur ~6 hari), jadi perpanjangan HARUS otomatis.
//
// Simpan sebagai:
//   /etc/nginx/sites-available/posyandu
// lalu:
//   ln -s /etc/nginx/sites-available/posyandu /etc/nginx/sites-enabled/
//   nginx -t && systemctl reload nginx
//
// GANTI dua nilai bertanda <...>:
//   <IP-PUBLIK>      alamat IP publik VPS (curl -4 ifconfig.me)
//   <JARINGAN-DESA>  rentang jaringan yang boleh mengakses, mis. 10.0.0.0/8
//
// PENTING: sertifikat IP diterbitkan lewat port 80, jadi port 80 harus
// terbuka saat perpanjangan. Jangan tutup sepenuhnya; cukup arahkan ke
// tantangan ACME saja (lihat blok \`location /.well-known/acme-challenge/\`).

# --- Pembatasan akses ------------------------------------------------------
# Sertifikat hanya mengamankan jalur, tidak membatasi siapa yang boleh masuk.
# Karena VPS punya IP PUBLIK, siapa pun di internet bisa membuka halaman ini
# bila tidak dibatasi. Daftar putih di bawah menutupnya untuk semua orang
# kecuali jaringan yang kamu izinkan.
#
# Isinya di-include DI DALAM blok server (allow/deny hanya sah di sana).

server {
    listen 80;
    server_name <IP-PUBLIK>;

    server_tokens off;

    # Hanya tantangan ACME yang dilayani di port 80. Sisanya dialihkan ke HTTPS.
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/posyandu/klien/dist;
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name <IP-PUBLIK>;

    server_tokens off;

    # Certbot menaruh hasilnya di direktori bernama alamat IP.
    ssl_certificate     /etc/letsencrypt/live/<IP-PUBLIK>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<IP-PUBLIK>/privkey.pem;

    # Setelan TLS yang aman dan masih kompatibel dengan Chrome Android lama.
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS: sekali tablet melihat header ini, ia menolak http untuk alamat ini.
    # Jangan pasang bila kamu masih ragu soal HTTPS; sulit dibatalkan.
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Daftar putih: hanya jaringan yang diizinkan boleh masuk.
    # Sertifikat hanya mengamankan jalur, bukan membatasi siapa yang masuk.
    include /etc/nginx/snippets/posyandu-izin.conf;

    client_max_body_size 512m;

    root /var/www/posyandu/klien/dist;
    index index.html;

    # --- Aset ber-hash: aman di-cache lama --------------------------------
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # --- Service worker tidak boleh di-cache ------------------------------
    # Bila sw.js ter-cache, tablet memakai versi lama selamanya dan perbaikan
    # keamanan tidak pernah sampai.
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # --- API diteruskan ke Node -------------------------------------------
    location ~ ^/(masuk|keluar|saya|sinkron|balita|kunjungan|validasi|pengguna|sesi|rekap|ekspor\\.csv|kualitas|cadangan|sehat|waktu)(/|$|\\?) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Skema asli (https). Dipakai server untuk \`trust proxy\`.
        proxy_set_header X-Forwarded-Proto $scheme;

        # Unggahan/pemulihan cadangan butuh lebih dari bawaan 60 detik.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_request_buffering off;
    }

    # --- Halaman aplikasi --------------------------------------------------
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # --- Kompresi ----------------------------------------------------------
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json
               image/svg+xml application/manifest+json;

    location ~ /\\. {
        deny all;
    }
}

# --- PENTING: port 3000 TIDAK boleh terbuka ------------------------------
# Node hanya mendengarkan di 127.0.0.1 (HOST di .env). Periksa:
#   ss -lntp | grep 3000      -> harus 127.0.0.1:3000, bukan 0.0.0.0:3000
`
const NGX_PUBLIK = `// Konfigurasi Nginx Smart Posyandu — PUBLIK, HTTPS lewat alamat IP.
//
// Berbeda dari nginx-posyandu-https.conf (yang memakai daftar putih jaringan),
// berkas ini TERBUKA untuk umum. Karena itu pengerasannya lebih ketat:
// batas laju di Nginx, pembatasan ukuran, dan hanya metode yang dipakai.
//
// Sertifikat: Let's Encrypt "IP address certificate" (2026), profil
// \`shortlived\` (~6 hari) -> perpanjangan otomatis WAJIB.
//
// Simpan sebagai:
//   /etc/nginx/sites-available/posyandu
// lalu:
//   ln -s /etc/nginx/sites-available/posyandu /etc/nginx/sites-enabled/
//   nginx -t && systemctl reload nginx
//
// GANTI <IP-PUBLIK> dengan alamat IP publik VPS (curl -4 ifconfig.me).

# --- Batas laju di sisi Nginx ----------------------------------------------
# Aplikasi sudah punya batas sendiri (300 permintaan/menit per IP), tetapi
# batas di Nginx menahan banjir permintaan SEBELUM menyentuh Node, sehingga
# proses Node tidak kehabisan tenaga. Dua lapis, sengaja.
#
# 10r/s per IP: halaman + aset wajar jauh di bawah ini. Burst 30 memberi
# ruang untuk pemuatan awal yang mengambil banyak berkas sekaligus.
limit_req_zone $binary_remote_addr zone=posyandu_api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=posyandu_login:10m rate=1r/s;
# Sinkronisasi menarik BANYAK halaman berturut-turut dalam satu putaran (tanpa
# batas halaman, agar tidak berhenti diam-diam dengan data separuh). Batas 10r/s
# akan memutusnya di tengah jalan, jadi sinkron diberi kuota terpisah.
limit_req_zone $binary_remote_addr zone=posyandu_sinkron:10m rate=40r/s;

# Batas koneksi bersamaan per IP: satu tablet membuka beberapa koneksi, jadi
# 20 masih longgar, tetapi menahan skrip yang membuka ratusan sekaligus.
limit_conn_zone $binary_remote_addr zone=posyandu_conn:10m;

# --- Pembatasan metode ------------------------------------------------------
# Aplikasi hanya memakai GET, POST, PATCH, DELETE, OPTIONS. Selain itu ditolak
# di Nginx supaya tidak pernah sampai ke aplikasi.
map $request_method $metode_sah {
    default 0;
    GET     1;
    POST    1;
    PATCH   1;
    DELETE  1;
    OPTIONS 1;
}

server {
    listen 80;
    server_name <IP-PUBLIK>;
    server_tokens off;

    # Hanya tantangan ACME di port 80; sisanya ke HTTPS.
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/posyandu/klien/dist;
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name <IP-PUBLIK>;

    server_tokens off;

    ssl_certificate     /etc/letsencrypt/live/<IP-PUBLIK>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<IP-PUBLIK>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    add_header Strict-Transport-Security "max-age=31536000" always;

    # Ukuran unggahan: cadangan yang dipulihkan bisa besar, tetapi batasi agar
    # tidak ada yang bisa mengirim berkas raksasa berulang kali.
    client_max_body_size 256m;
    client_body_timeout 30s;
    client_header_timeout 15s;

    limit_conn posyandu_conn 20;

    if ($metode_sah = 0) {
        return 405;
    }

    root /var/www/posyandu/klien/dist;
    index index.html;

    # --- Aset ber-hash ------------------------------------------------------
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # --- Masuk: batas paling ketat -----------------------------------------
    # Endpoint ini yang paling sering diserang (tebak sandi). Batas 1r/s per IP
    # dengan burst kecil membuat percobaan beruntun langsung ditahan.
    location = /masuk {
        limit_req zone=posyandu_login burst=5 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # --- Sinkronisasi: kuota lebih besar ------------------------------------
    # Satu tarikan bisa ratusan halaman. 40r/s dengan burst 100 cukup untuk
    # jaringan desa tanpa membuka pintu banjir permintaan.
    location = /sinkron {
        limit_req zone=posyandu_sinkron burst=100 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # --- API ----------------------------------------------------------------
    location ~ ^/(keluar|saya|balita|kunjungan|validasi|pengguna|sesi|rekap|ekspor\\.csv|kualitas|cadangan|sehat|waktu)(/|$|\\?) {
        limit_req zone=posyandu_api burst=30 nodelay;
        limit_req_status 429;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Unggahan/pemulihan cadangan butuh lebih dari bawaan 60 detik.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_request_buffering off;
    }

    # --- Halaman aplikasi ----------------------------------------------------
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json
               image/svg+xml application/manifest+json;

    location ~ /\\. {
        deny all;
    }
}

# --- PENTING -------------------------------------------------------------
# 1. Port 3000 TIDAK boleh terbuka: \`ss -lntp | grep 3000\` harus 127.0.0.1.
#    HOST=127.0.0.1 di .env menjaga itu.
# 2. TRUST_PROXY harus \`loopback\` (bawaan) supaya X-Forwarded-For hanya
#    dipercaya dari Nginx di mesin ini. Tanpa itu batas brute-force bisa
#    dilewati dengan memalsukan header.
`

const NGX = {
  internal: NGX_INTERNAL,
  izin: NGX_IZIN,
  https: NGX_HTTPS,
  publik: NGX_PUBLIK,
}

// --- dev -----------------------------------------------------------------
// Tiga hal terukur yang membentuk fungsi ini:
//
// 1. Server dijalankan lewat `node src/server.js`, bukan `npm run dev` milik
//    server. Yang itu memakai --watch, yang menahan sinyal sehingga prosesnya
//    tidak pernah benar-benar keluar, lalu janji "satu mati, semua berhenti"
//    tidak terpenuhi.
// 2. Klien dijalankan lewat `npx vite` langsung. Bila memakai `npm run dev`,
//    proses yang dipantau adalah shell cmd; taskkill /T darinya ternyata tidak
//    menjangkau Vite yang memegang port 5173 (klien tetap menyala setelah
//    server dihentikan).
// 3. Penghentian memakai execSync('taskkill /T /F'), bukan child.kill():
//    child.kill() pada proses shell npm tidak menghentikan anaknya. Bila
//    taskkill gagal, child.kill() dicoba sebagai cadangan.
function dev() {
  const WIN = process.platform === 'win32'
  const daftar = []

  function jalankan(nama, folder, perintah) {
    // Perintahnya tetap, tanpa masukan pengguna, jadi aman memakai shell
    // (diperlukan di Windows karena npm/npx berupa .cmd).
    const anak = spawn(perintah, {
      cwd: path.join(AKAR, folder),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
    const tandai = (data) => {
      for (const baris of String(data).split('\n')) {
        if (baris.trim()) console.log(`[${nama}] ${baris}`)
      }
    }
    anak.stdout.on('data', tandai)
    anak.stderr.on('data', tandai)
    anak.on('exit', (kode, sinyal) => {
      console.log(`[${nama}] berhenti (kode ${kode}${sinyal ? ', sinyal ' + sinyal : ''})`)
      if (kode === 1) {
        console.error(
          `[alat] ${nama} keluar dengan kode 1. Paling sering portnya sudah dipakai\n` +
            '       proses lama. Periksa lalu hentikan:\n' +
            (WIN
              ? `         netstat -ano | findstr :${nama === 'server' ? 3000 : 5173}` +
                '   -> taskkill /PID <pid> /T /F\n'
              : `         ss -lntp | grep ${nama === 'server' ? 3000 : 5173}` +
                '             -> kill <pid>\n'),
        )
      }
      berhentiSemua(kode ?? 1)
    })
    return anak
  }

  function bunuhPohon(anak) {
    if (!anak || anak.killed) return
    try {
      if (WIN) {
        // /T = bunuh seluruh pohon proses; /F = paksa.
        execSync(`taskkill /pid ${anak.pid} /T /F`, { stdio: 'ignore' })
        return
      }
      process.kill(-anak.pid, 'SIGTERM')
    } catch {
      try {
        anak.kill()
      } catch {}
    }
  }

  function berhentiSemua(kode) {
    for (const a of daftar) bunuhPohon(a)
    process.exit(kode)
  }

  daftar.push(jalankan('server', 'server', 'node src/server.js'))
  daftar.push(jalankan('klien', 'klien', 'npx vite'))

  process.on('SIGINT', () => berhentiSemua(0))
  process.on('SIGTERM', () => berhentiSemua(0))
}

// --- periksa-bangun ------------------------------------------------------
// Dijalankan otomatis oleh `npm run bangun`, jadi kesalahan alamat API ketahuan
// saat bangun, bukan setelah tablet kader di lapangan gagal tersambung.
//
// Latar: VITE_API ditanam ke bundel saat bangun. Bila berisi
// http://127.0.0.1:3000, tablet akan memanggil dirinya sendiri.
function periksaBangun() {
  const DIST = path.join(AKAR, 'klien/dist')
  const GAWAT = /https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/g

  if (!fs.existsSync(DIST)) {
    console.error('  gagal: klien/dist belum ada. Jalankan `npm run bangun` dulu.')
    return 1
  }

  const berkas = []
  const telusuri = (folder) => {
    for (const isi of fs.readdirSync(folder, { withFileTypes: true })) {
      const penuh = path.join(folder, isi.name)
      if (isi.isDirectory()) telusuri(penuh)
      else if (/\.(js|html|webmanifest)$/.test(isi.name)) berkas.push(penuh)
    }
  }
  telusuri(DIST)

  const temuan = []
  for (const b of berkas) {
    for (const cocok of fs.readFileSync(b, 'utf8').match(GAWAT) ?? []) {
      temuan.push({ berkas: path.relative(DIST, b), alamat: cocok })
    }
  }

  if (temuan.length === 0) {
    console.log('  ok  alamat API siap dipasang (tidak ada localhost tertanam)')
    return 0
  }

  // Hanya peringatan, bukan gagal: ada pemakaian sah (mis. source map
  // pengembangan atau teks bantuan). Yang penting terlihat sebelum dipasang.
  console.warn('')
  console.warn('  PERINGATAN: hasil bangun memuat alamat localhost:')
  for (const t of temuan.slice(0, 10)) console.warn(`    ${t.berkas} -> ${t.alamat}`)
  if (temuan.length > 10) console.warn(`    ... dan ${temuan.length - 10} lainnya`)
  console.warn('')
  console.warn('  Bila ini alamat API, tablet di lapangan TIDAK akan tersambung.')
  console.warn('  Kosongkan VITE_API di .env lalu bangun ulang agar memakai satu asal.')
  return 0
}

// --- siap-vps ------------------------------------------------------------
// TIDAK mengubah berkas yang sudah ada tanpa diminta, tidak pernah menimpa
// `.env`, dan tidak pernah mencetak kunci rahasia ke layar.
function siapVps(args) {
  const HANYA_PERIKSA = args.includes('--periksa')
  const masalah = []
  const keluhan = (nama) => masalah.push(nama)

  const nodeCukup = () => {
    const [utama, kecil] = process.versions.node.split('.').map(Number)
    return utama > 20 || (utama === 20 && kecil >= 0)
  }

  // --- 1. Prasyarat ---
  lapor.judul('1. Prasyarat')

  if (nodeCukup()) lapor.ok(`Node.js ${process.versions.node}`)
  else {
    lapor.gagal(`Node.js ${process.versions.node} -- butuh >= 20`)
    keluhan('node')
  }

  for (const [nama, berkas] of [
    ['klien/node_modules', 'klien/node_modules'],
    ['server/node_modules', 'server/node_modules'],
  ]) {
    if (fs.existsSync(path.join(AKAR, berkas))) lapor.ok(`dependensi ${nama}`)
    else {
      lapor.gagal(`dependensi ${nama} belum dipasang`)
      lapor.info('jalankan: npm run siapkan')
      keluhan('deps')
    }
  }

  // --- 2. Konfigurasi .env ---
  lapor.judul('2. Konfigurasi .env')

  const envPath = path.join(AKAR, '.env')
  let envTeks = ''

  if (!fs.existsSync(envPath)) {
    if (HANYA_PERIKSA) {
      lapor.gagal('.env belum ada')
      lapor.info('jalankan tanpa --periksa untuk dibuatkan')
      keluhan('env')
    } else {
      const contoh = fs.readFileSync(path.join(AKAR, '.env.contoh'), 'utf8')
      const rahasia = crypto.randomBytes(48).toString('base64url')
      const isi = contoh
        .replace(/^KUNCI_RAHASIA=.*$/m, `KUNCI_RAHASIA=${rahasia}`)
        // Akses lewat IP berarti http: cookie TIDAK boleh Secure, kalau tidak
        // browser membuangnya dan login tampak gagal tanpa penjelasan.
        .replace(/^#?\s*COOKIE_SECURE=.*$/m, 'COOKIE_SECURE=false')
      fs.writeFileSync(envPath, isi, { mode: 0o600 })
      lapor.ok('.env dibuat (izin 600)')
      lapor.info('KUNCI_RAHASIA dibuat acak; tidak ditampilkan di layar')
      lapor.saran('isi DATABASE_URL sesuai PostgreSQL di VPS ini')
      envTeks = isi
    }
  } else {
    envTeks = fs.readFileSync(envPath, 'utf8')
    lapor.ok('.env sudah ada (tidak diubah)')
  }

  const ambil = (nama) => {
    const m = envTeks.match(new RegExp(`^${nama}=(.*)$`, 'm'))
    return m ? m[1].trim() : null
  }

  const kunci = ambil('KUNCI_RAHASIA')
  if (!kunci) {
    lapor.gagal('KUNCI_RAHASIA kosong')
    keluhan('kunci')
  } else if (kunci === 'ganti-ini-di-produksi' || /ganti|contoh|example/i.test(kunci)) {
    lapor.gagal('KUNCI_RAHASIA masih nilai contoh')
    lapor.info('buat baru: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"')
    keluhan('kunci')
  } else if (kunci.length < 32) {
    lapor.gagal(`KUNCI_RAHASIA terlalu pendek (${kunci.length} karakter, butuh >= 32)`)
    keluhan('kunci')
  } else {
    lapor.ok(`KUNCI_RAHASIA terisi (${kunci.length} karakter, tidak ditampilkan)`)
  }

  const dbUrl = ambil('DATABASE_URL')
  if (!dbUrl) {
    lapor.gagal('DATABASE_URL kosong')
    keluhan('db')
  } else if (!/^postgres(ql)?:\/\//.test(dbUrl)) {
    lapor.gagal('DATABASE_URL bukan alamat PostgreSQL')
    keluhan('db')
  } else {
    lapor.ok(`DATABASE_URL terisi (${dbUrl.replace(/:[^:@/]+@/, ':***@')})`)
  }

  const cookieSecure = (ambil('COOKIE_SECURE') || '').toLowerCase()
  if (cookieSecure === 'false') {
    lapor.ok('COOKIE_SECURE=false (benar untuk akses lewat IP/http)')
    lapor.info('kata sandi melintas TANPA enkripsi: pakai hanya di jaringan internal desa')
  } else if (cookieSecure === 'true') {
    lapor.gagal('COOKIE_SECURE=true padahal akses lewat http://IP')
    lapor.info('browser akan membuang cookie sesi -> login selalu gagal. Setel COOKIE_SECURE=false')
    keluhan('cookie')
  } else {
    lapor.saran('COOKIE_SECURE belum disetel; bawaan mengikuti NODE_ENV')
    lapor.info('untuk akses lewat http://IP, setel COOKIE_SECURE=false')
  }

  const viteApi = ambil('VITE_API')
  if (viteApi) {
    lapor.gagal(`VITE_API terisi (${viteApi})`)
    lapor.info('kosongkan: tablet akan memanggil alamat itu, bukan VPS')
    keluhan('vite')
  } else {
    lapor.ok('VITE_API kosong (satu asal, benar untuk Nginx)')
  }

  // --- 3. Hasil bangun klien ---
  lapor.judul('3. Hasil bangun klien')

  const dist = path.join(AKAR, 'klien/dist')
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    lapor.gagal('klien/dist belum ada')
    lapor.info('jalankan: npm run siap:produksi')
    keluhan('dist')
  } else {
    lapor.ok('klien/dist ada')
    let adaLocalhost = null
    const telusuri = (folder) => {
      for (const isi of fs.readdirSync(folder, { withFileTypes: true })) {
        const penuh = path.join(folder, isi.name)
        if (isi.isDirectory()) telusuri(penuh)
        else if (/\.js$/.test(isi.name)) {
          const m = fs.readFileSync(penuh, 'utf8').match(/https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/)
          if (m && !adaLocalhost) adaLocalhost = m[0]
        }
      }
    }
    telusuri(dist)
    if (adaLocalhost) {
      lapor.gagal(`hasil bangun memuat ${adaLocalhost}`)
      lapor.info('bangun ulang setelah VITE_API dikosongkan')
      keluhan('dist-api')
    } else {
      lapor.ok('tidak ada alamat localhost tertanam')
    }
  }

  // --- 4. Basis data ---
  lapor.judul('4. Basis data')

  const jalankan = (perintah) =>
    execSync(perintah, { cwd: path.join(AKAR, 'server'), stdio: 'pipe', encoding: 'utf8' })

  try {
    const hasil = jalankan(
      `node -e "require('./src/db/pool').satu('SELECT count(*)::int n FROM pengguna')` +
        `.then(r=>{console.log('JUMLAH='+r.n);process.exit(0)})` +
        `.catch(e=>{console.log('SALAH='+e.message);process.exit(0)})"`,
    )
    const keluaran = hasil.trim().split('\n')
    const barisJumlah = keluaran.find((b) => b.startsWith('JUMLAH='))
    const barisSalah = keluaran.find((b) => b.startsWith('SALAH='))
    const jumlah = barisJumlah ? Number(barisJumlah.split('=')[1]) : NaN

    if (Number.isInteger(jumlah) && jumlah >= 0) {
      lapor.ok(`terhubung; ${jumlah} akun pengguna`)
      if (jumlah === 0) {
        lapor.saran('belum ada akun. Buat admin pertama:')
        lapor.info('npm run buat-admin -- admin_desa "Nama Kamu"')
      }
    } else if (/does not exist|tidak ada/i.test(barisSalah || '')) {
      lapor.gagal('tersambung, tetapi tabel belum ada')
      lapor.info('jalankan migrasi: npm run migrasi')
      keluhan('db-migrasi')
    } else {
      lapor.gagal('tidak bisa terhubung ke basis data')
      if (barisSalah) lapor.info(barisSalah.slice('SALAH='.length))
      lapor.info('periksa: PostgreSQL hidup? DATABASE_URL benar? sandi cocok?')
      keluhan('db-konek')
    }
  } catch (salah) {
    lapor.gagal('gagal menjalankan pemeriksaan basis data')
    lapor.info(String(salah.message).split('\n')[0])
    keluhan('db-konek')
  }

  // --- Ringkasan ---
  lapor.judul('Ringkasan')
  if (masalah.length === 0) {
    console.log('  \x1b[32mSiap.\x1b[0m Lanjutkan dengan konfigurasi Nginx (node alat.js konfig internal).')
    return 0
  }
  console.log(`  ${masalah.length} hal perlu diperbaiki (lihat di atas).`)
  return 1
}

// --- pasang-https --------------------------------------------------------
// Minta sertifikat HTTPS untuk ALAMAT IP (tanpa domain) dari Let's Encrypt.
//
// Let's Encrypt mulai menerbitkan sertifikat alamat IP pada 2026. Sertifikat IP
// WAJIB memakai profil shortlived (umur ~6 hari), jadi perpanjangan otomatis
// bukan pilihan -- kalau timer mati, semua tablet menolak koneksi.
//
// Skrip ini TIDAK menjalankan certbot sendiri kalau belum siap: ia memeriksa
// prasyarat, menuliskan konfigurasi yang sudah diisi, lalu mencetak perintah
// yang tinggal dijalankan.
//
// --uji = pakai server staging Let's Encrypt (sertifikat TIDAK dipercaya
// browser, hanya untuk memastikan alurnya benar sebelum minta yang asli).
function pasangHttps(args) {
  const arg = (nama) => {
    const i = args.indexOf(`--${nama}`)
    return i >= 0 ? args[i + 1] : null
  }

  const IP = arg('ip')
  const JARINGAN = arg('jaringan')
  const UJI = args.includes('--uji')

  let masalah = 0
  const masalahkan = (t) => {
    masalah += 1
    lapor.gagal(t)
  }

  lapor.judul('1. Argumen')

  if (!IP) {
    lapor.gagal('--ip belum diisi')
    lapor.info('contoh: sudo node alat.js pasang-https --ip 203.0.113.10 --jaringan 10.0.0.0/8')
    return 2
  }
  // Setiap oktet harus 0-255: regex bentuk saja akan meloloskan 999.1.1.1.
  const oktet = IP.split('.')
  const ipSah =
    oktet.length === 4 &&
    oktet.every((o) => /^\d{1,3}$/.test(o) && Number(o) >= 0 && Number(o) <= 255)
  if (!ipSah) {
    lapor.gagal(`--ip bukan alamat IPv4: ${IP}`)
    lapor.info('sertifikat IP Let\'s Encrypt mendukung IPv4 dan IPv6, tetapi skrip ini hanya IPv4')
    return 2
  }
  lapor.ok(`IP: ${IP}`)

  if (!JARINGAN) {
    lapor.gagal('--jaringan belum diisi')
    lapor.info('rentang yang boleh mengakses, mis. 10.0.0.0/8 atau 192.168.1.0/24')
    masalahkan('jaringan')
  } else if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(JARINGAN)) {
    lapor.gagal(`--jaringan bukan CIDR: ${JARINGAN}`)
    masalahkan('jaringan')
  } else {
    lapor.ok(`Jaringan diizinkan: ${JARINGAN}`)
  }

  if (UJI) lapor.ok('Mode uji (staging): sertifikat tidak dipercaya browser')
  else lapor.ok('Mode asli: sertifikat dipercaya browser')

  lapor.judul('2. Prasyarat sistem')

  if (process.platform !== 'linux') {
    lapor.gagal('skrip ini untuk Linux (VPS). Jalankan di VPS, bukan di mesin pengembangan.')
    return 2
  }

  const coba = (perintah) => {
    try {
      return { ok: true, keluaran: execSync(perintah, { encoding: 'utf8', stdio: 'pipe' }).trim() }
    } catch (salah) {
      return { ok: false, keluaran: String(salah.stderr || salah.message).trim() }
    }
  }

  const ngx = coba('nginx -v')
  if (ngx.ok || /nginx version/i.test(ngx.keluaran)) lapor.ok(`nginx terpasang (${ngx.keluaran})`)
  else masalahkan('nginx belum terpasang: sudo apt install -y nginx')

  const cb = coba('certbot --version')
  const versi = cb.ok ? (cb.keluaran.match(/(\d+)\.(\d+)/) || []).slice(1).map(Number) : null
  if (cb.ok) {
    if (versi && (versi[0] > 5 || (versi[0] === 5 && versi[1] >= 4))) {
      lapor.ok(`certbot ${versi.join('.')} (butuh >= 5.4 untuk --ip-address)`)
    } else {
      lapor.gagal(`certbot ${versi ? versi.join('.') : '?'} terlalu tua; butuh >= 5.4`)
      lapor.info('perbarui: sudo snap install --classic certbot  (atau apt dari repo terbaru)')
      masalahkan('certbot')
    }
  } else {
    lapor.gagal('certbot belum terpasang')
    lapor.info('sudo apt install -y certbot  - pastikan versi >= 5.4')
    masalahkan('certbot')
  }

  lapor.judul('3. Berkas situs')

  const dist = path.join(AKAR, 'klien/dist')
  if (fs.existsSync(path.join(dist, 'index.html'))) lapor.ok('klien/dist ada')
  else masalahkan('klien/dist belum ada: jalankan npm run siap:produksi')

  // Konfigurasi diisi di sini (dulu lewat sed) lalu ditulis ke folder sementara
  // agar perintah di bawah tinggal disalin tanpa menyunting apa pun.
  const isi = (nama) => {
    const teks = NGX[nama]
      .replaceAll('<IP-PUBLIK>', IP)
      .replaceAll('<JARINGAN-DESA>', JARINGAN || '<JARINGAN-DESA>')
    const tujuan = path.join(os.tmpdir(), `posyandu-${nama}-${IP}.conf`)
    fs.writeFileSync(tujuan, teks)
    lapor.ok(`konfigurasi ${nama} ditulis ke ${tujuan}`)
    return tujuan
  }
  const konfIzin = isi('izin')
  const konfHttps = isi('https')

  lapor.judul('4. Perintah yang akan dijalankan')
  console.log('')
  console.log('  # 1) daftar putih akses')
  console.log('  sudo mkdir -p /etc/nginx/snippets')
  console.log(`  sudo cp ${konfIzin} /etc/nginx/snippets/posyandu-izin.conf`)
  console.log('')
  console.log('  # 2) situs (IP dan jaringan sudah terisi)')
  console.log(`  sudo cp ${konfHttps} /etc/nginx/sites-available/posyandu`)
  console.log('')
  console.log('  # 3) Nginx sementara tanpa TLS agar tantangan ACME bisa dilayani')
  console.log('  #    (certbot butuh port 80 hidup; konfigurasi TLS baru dipasang setelah sertifikat ada)')
  console.log('')
  console.log('  # 4) minta sertifikat')
  console.log(`  sudo certbot certonly ${UJI ? '--staging ' : ''}--preferred-profile shortlived \\`)
  console.log(`    --webroot --webroot-path ${dist} \\`)
  console.log(`    --ip-address ${IP} \\`)
  console.log(`    --deploy-hook "systemctl reload nginx"`)
  console.log('')

  lapor.judul('5. Setelah sertifikat terbit')
  console.log('')
  console.log('  Aktifkan TLS:')
  console.log('    sudo ln -sf /etc/nginx/sites-available/posyandu /etc/nginx/sites-enabled/posyandu')
  console.log('    sudo rm -f /etc/nginx/sites-enabled/default')
  console.log('    sudo nginx -t && sudo systemctl reload nginx')
  console.log('')
  console.log('  Di .env, cookie sekarang boleh (dan harus) Secure:')
  console.log('    COOKIE_SECURE=true')
  console.log('    sudo systemctl restart posyandu')
  console.log('')
  console.log('  Perpanjangan otomatis WAJIB (sertifikat hanya ~6 hari):')
  console.log('    systemctl list-timers | grep certbot')
  console.log('    sudo certbot renew --dry-run')
  console.log('')

  lapor.judul('Ringkasan')
  if (masalah) {
    console.log(`  ${masalah} prasyarat belum siap (lihat di atas).`)
    return 1
  }
  console.log('  Prasyarat siap. Jalankan perintah di bagian 4, lalu bagian 5.')
  return 0
}

// --- konfig --------------------------------------------------------------
function konfig(args) {
  const nama = args[0]
  if (!Object.hasOwn(NGX, nama)) {
    lapor.gagal(`nama konfigurasi tidak dikenal: ${nama || '(kosong)'}`)
    lapor.info('pilihan: internal (http, jaringan desa), izin, https, publik')
    return 2
  }
  // NGX sudah berakhir dengan baris baru; console.log akan menambah satu lagi.
  process.stdout.write(NGX[nama])
  return 0
}

// --- utama ---------------------------------------------------------------
const PERINTAH = {
  dev,
  'periksa-bangun': periksaBangun,
  'siap-vps': siapVps,
  'pasang-https': pasangHttps,
  konfig,
}

const [perintah, ...sisa] = process.argv.slice(2)
const jalankan = Object.hasOwn(PERINTAH, perintah) ? PERINTAH[perintah] : null

if (!jalankan) {
  console.log('Pakai: node alat.js <perintah>')
  console.log('')
  console.log('  dev                jalankan API dan klien bersama')
  console.log('  periksa-bangun     periksa hasil bangun klien sebelum dipasang')
  console.log('  siap-vps           periksa & siapkan pemasangan di VPS')
  console.log('  pasang-https       minta sertifikat HTTPS untuk alamat IP')
  console.log('  konfig             cetak konfigurasi Nginx (internal|izin|https|publik)')
  process.exit(perintah ? 2 : 0)
}

// `dev` tidak pernah kembali: ia hidup sampai dihentikan. Perintah lain
// mengembalikan kode keluar; undefined berarti "biarkan berjalan".
const kode = jalankan(sisa)
if (kode !== undefined) process.exit(kode)
