// Uji klik sungguhan di Chrome lewat DevTools Protocol (CDP), tanpa dependency.
// Node 24 punya WebSocket bawaan, jadi cukup HTTP + WS.
//
// Peringatan: skrip ini menulis data nyata lewat UI (balita/posyandu/akun uji)
// lalu membersihkannya sendiri dengan DELETE by id dari database.
// Tidak ada TRUNCATE/DROP.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { Client } = require('../server/node_modules/pg')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9333
const APP = 'http://127.0.0.1:5173'
// Akun admin uji dari environment, jangan pernah ditulis ke repositori.
const ADMIN_NAMA = process.env.UJI_ADMIN_NAMA
const ADMIN_SANDI = process.env.UJI_ADMIN_SANDI
const stempel = Date.now().toString(36)
if (!ADMIN_NAMA || !ADMIN_SANDI) {
  throw new Error('Setel UJI_ADMIN_NAMA dan UJI_ADMIN_SANDI sebelum menjalankan uji klik.')
}

const langkah = []
function catat(nama, ok, rincian = '') {
  langkah.push({ nama, ok })
  console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${rincian ? ' | ' + rincian : ''}`)
}

// --- CDP minimum -----------------------------------------------------------
class Sesi {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.tertunda = new Map()
    this.pendengar = []
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && this.tertunda.has(m.id)) {
        const { resolve, reject } = this.tertunda.get(m.id)
        this.tertunda.delete(m.id)
        m.error ? reject(new Error(m.error.message)) : resolve(m.result)
      } else if (m.method) {
        for (const f of this.pendengar) f(m)
      }
    })
  }
  kirim(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.tertunda.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.tertunda.delete(id)) reject(new Error(`timeout ${method}`))
      }, 20000)
    })
  }
  async eval(ekspresi) {
    const r = await this.kirim('Runtime.evaluate', {
      expression: ekspresi,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? 'eval gagal')
    }
    return r.result.value
  }
  tunggu(fn, pesan, batas = 12000) {
    return new Promise((resolve, reject) => {
      const mulai = Date.now()
      const cek = async () => {
        try {
          const v = await fn()
          if (v) return resolve(v)
        } catch { /* elemen belum ada */ }
        if (Date.now() - mulai > batas) return reject(new Error(`timeout: ${pesan}`))
        setTimeout(cek, 120)
      }
      cek()
    })
  }
}

// Klik elemen seperti pengguna: cari lewat teks/atribut, lalu dispatch klik
// di koordinat tengahnya (bukan .click() sintetis), lalu cek efeknya.
const BANTU = `
window.__uji = {
  semua: (sel) => [...document.querySelectorAll(sel)],
  teks: (sel) => [...document.querySelectorAll(sel)].map(e => (e.innerText||'').trim()),
  cari: (teks, sel='button,a,label') => [...document.querySelectorAll(sel)]
    .find(e => (e.innerText||'').trim().toLowerCase().includes(String(teks).toLowerCase())),
  isi: (sel, nilai) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('tidak ada ' + sel);
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === 'SELECT' ? HTMLSelectElement.prototype :
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value').set;
    setter.call(el, nilai);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  },
  ada: (teks) => document.body.innerText.toLowerCase().includes(String(teks).toLowerCase()),
};`

async function main() {
  const profil = mkdtempSync(path.join(tmpdir(), 'uji-chrome-'))
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profil}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    'about:blank',
  ], { stdio: 'ignore' })

  let sesi
  let db
  const dibuat = { balita: [], posyandu: [], pengguna: [] }
  let auditSebelum = new Set()
  const jumlahAwal = {}
  let sudahBersih = false

  /** Hapus hanya baris yang dibuat uji ini. Aman dipanggil dua kali. */
  async function bersihkan() {
    if (sudahBersih || !db) return
    sudahBersih = true
    const auditBaru = (await db.query('SELECT id FROM log_audit')).rows
      .map((r) => r.id).filter((i) => !auditSebelum.has(i))
    if (auditBaru.length) {
      await db.query('DELETE FROM log_audit WHERE id = ANY($1::uuid[])', [auditBaru])
    }
    // Urutan mengikuti kunci asing: anak dulu, induk terakhir.
    // Balita yang dibuat lewat UI juga meninggalkan orang_tua + kunjungan +
    // pengukuran, jadi dibersihkan lewat balita_id, bukan hanya by id.
    const idBalita = dibuat.balita
    if (idBalita.length) {
      await db.query(
        `DELETE FROM pengukuran WHERE kunjungan_id IN
           (SELECT id FROM kunjungan WHERE balita_id = ANY($1::uuid[]))`, [idBalita])
      await db.query('DELETE FROM tindak_lanjut WHERE kunjungan_id IN (SELECT id FROM kunjungan WHERE balita_id = ANY($1::uuid[]))', [idBalita])
      await db.query('DELETE FROM kunjungan WHERE balita_id = ANY($1::uuid[])', [idBalita])
      const idWali = (await db.query(
        'SELECT orang_tua_id FROM balita_orang_tua WHERE balita_id = ANY($1::uuid[])', [idBalita],
      )).rows.map((r) => r.orang_tua_id)
      await db.query('DELETE FROM balita_orang_tua WHERE balita_id = ANY($1::uuid[])', [idBalita])
      await db.query('DELETE FROM balita WHERE id = ANY($1::uuid[])', [idBalita])
      if (idWali.length) await db.query('DELETE FROM orang_tua WHERE id = ANY($1::uuid[])', [idWali])
    }
    if (dibuat.posyandu.length) {
      await db.query('DELETE FROM posyandu WHERE id = ANY($1::uuid[])', [dibuat.posyandu])
    }
    if (dibuat.pengguna.length) {
      await db.query('DELETE FROM sesi_login WHERE pengguna_id = ANY($1::uuid[])', [dibuat.pengguna])
      await db.query('DELETE FROM pengguna WHERE id = ANY($1::uuid[])', [dibuat.pengguna])
    }
    await db.query("DELETE FROM sesi_login WHERE id_perangkat LIKE 'uji-klik%'")
    const sisa = {}
    for (const t of Object.keys(jumlahAwal)) {
      sisa[t] = (await db.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n - jumlahAwal[t]
    }
    const bocor = Object.entries(sisa).filter(([, n]) => n !== 0)
    catat('cleanup: tidak ada sisa baris uji', bocor.length === 0, JSON.stringify(sisa))
  }

  try {
    // Tunggu CDP siap.
    let target
    for (let i = 0; i < 60; i++) {
      try {
        const daftar = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
        target = daftar.find((t) => t.type === 'page')
        if (target) break
      } catch { /* chrome belum siap */ }
      await new Promise((r) => setTimeout(r, 250))
    }
    assert.ok(target?.webSocketDebuggerUrl, 'Chrome tidak membuka CDP')

    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', rej, { once: true })
    })
    sesi = new Sesi(ws)
    await sesi.kirim('Page.enable')
    await sesi.kirim('Runtime.enable')

    const galatKonsol = []
    sesi.pendengar.push((m) => {
      if (m.method === 'Runtime.exceptionThrown') {
        galatKonsol.push(m.params.exceptionDetails?.exception?.description ?? 'exception')
      }
    })

    const env = require('../server/src/env').muat()
    db = new Client({ connectionString: env.databaseUrl })
    await db.connect()
    auditSebelum = new Set((await db.query('SELECT id FROM log_audit')).rows.map((r) => r.id))
    for (const t of ['balita', 'posyandu', 'pengguna', 'log_audit']) {
      jumlahAwal[t] = (await db.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n
    }

    async function buka(jalur) {
      await sesi.kirim('Page.navigate', { url: APP + jalur })
      await sesi.tunggu(() => sesi.eval('document.readyState === "complete"'), 'muat halaman')
      await sesi.eval(BANTU)
      await new Promise((r) => setTimeout(r, 450))
    }
    async function klik(teks, sel) {
      const kotak = await sesi.eval(`(() => {
        const el = window.__uji.cari(${JSON.stringify(teks)}${sel ? `, ${JSON.stringify(sel)}` : ''});
        if (!el) return null;
        el.scrollIntoView({block:'center'});
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
      })()`)
      if (!kotak) throw new Error(`tombol/tautan "${teks}" tidak ditemukan`)
      for (const type of ['mousePressed', 'mouseReleased']) {
        await sesi.kirim('Input.dispatchMouseEvent', {
          type, x: kotak.x, y: kotak.y, button: 'left', clickCount: 1,
        })
      }
      await new Promise((r) => setTimeout(r, 350))
    }

    // === 1. Kanal publik tanpa login ===
    await buka('/')
    const publik = await sesi.eval('document.body.innerText.slice(0,400)')
    catat('kanal publik terbuka tanpa login', /posyandu|jadwal|edukasi/i.test(publik))

    // === 2. Login lewat form ===
    await buka('/app/login')
    await sesi.eval(`window.__uji.isi("#nama", ${JSON.stringify(ADMIN_NAMA)})`)
    await sesi.eval(`window.__uji.isi("#sandi", ${JSON.stringify(ADMIN_SANDI)})`)
    await klik('Masuk', 'button')
    await sesi.tunggu(() => sesi.eval('location.pathname.startsWith("/app/") && !location.pathname.includes("login")'), 'masuk')
    catat('login lewat form berhasil', true, await sesi.eval('location.pathname'))

    // Cookie sesi admin diambil dari browser, untuk membuat akun kader uji
    // lewat API tanpa menebak sandi akun kader yang ada. Cookie HttpOnly
    // tidak terbaca lewat document.cookie, jadi dibaca dari CDP.
    await sesi.kirim('Network.enable')
    const semuaCookie = await sesi.kirim('Network.getAllCookies')
    const cookieAdmin = (semuaCookie.cookies ?? [])
      .filter((c) => c.domain.includes('127.0.0.1'))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')
    const posyanduAktif = (await db.query(
      'SELECT id FROM posyandu WHERE dihapus_pada IS NULL ORDER BY dibuat_pada LIMIT 1',
    )).rows[0]?.id
    catat('ada Posyandu aktif untuk uji kader', Boolean(posyanduAktif))

    // === 3. Kelola Posyandu: tambah lewat modal ===
    await buka('/app/posyandu')
    await sesi.tunggu(() => sesi.eval('window.__uji.ada("posyandu")'), 'layar posyandu')
    const namaPos = `Posyandu UjiKlik ${stempel}`
    let posOk = false
    try {
      const bukaForm = await sesi.eval(`(() => {
        const b = [...document.querySelectorAll('button')].find(e => /tambah posyandu/i.test(e.innerText));
        if (!b) return false; b.click(); return true;
      })()`)
      if (bukaForm) {
        await new Promise((r) => setTimeout(r, 400))
        await sesi.eval(`window.__uji.isi("#ps-nama", ${JSON.stringify(namaPos)})`)
        await sesi.eval('window.__uji.isi("#ps-desa", "Desa UjiKlik")')
        await klik('Tambah Posyandu', 'button')
        await new Promise((r) => setTimeout(r, 700))
        posOk = await sesi.eval(`window.__uji.ada(${JSON.stringify(namaPos)})`)
      }
    } catch (e) { catat('buka form Posyandu', false, e.message) }
    const posDb = posOk
      ? (await db.query('SELECT id FROM posyandu WHERE nama = $1', [namaPos])).rows[0]
      : null
    if (posDb) dibuat.posyandu.push(posDb.id)
    catat('tambah Posyandu lewat klik', Boolean(posDb), posOk ? 'terlihat di tabel' : 'tidak tersimpan')

    // === 4. Hapus Posyandu lewat modal konfirmasi ===
    if (posDb) {
      const hapus = await sesi.eval(`(() => {
        const baris = [...document.querySelectorAll('tr')].find(t => t.innerText.includes(${JSON.stringify(namaPos)}));
        if (!baris) return false;
        const b = [...baris.querySelectorAll('button')].find(x => /hapus/i.test(x.innerText));
        if (!b) return false; b.click(); return true;
      })()`)
      if (hapus) {
        await new Promise((r) => setTimeout(r, 400))
        const adaModal = await sesi.eval('window.__uji.ada("Hapus Posyandu?")')
        catat('modal konfirmasi hapus muncul', adaModal)
        const ditekan = await sesi.eval(`(() => {
          const d = document.querySelector('[role="dialog"]');
          if (!d) return { ok: false, tombol: [], teks: document.body.innerText.slice(0,300) };
          const tombol = [...d.querySelectorAll('button')].map(e => e.innerText.trim());
          const b = [...d.querySelectorAll('button')].find(e => /ya,?\\s*hapus/i.test(e.innerText));
          if (!b) return { ok: false, tombol };
          b.click(); return { ok: true, tombol };
        })()`)
        assert.ok(ditekan.ok, `tombol hapus tidak ada; tombol tersedia: ${JSON.stringify(ditekan.tombol)} ${ditekan.teks ?? ''}`)
        await new Promise((r) => setTimeout(r, 900))
      }
      const masih = (await db.query('SELECT dihapus_pada FROM posyandu WHERE id = $1', [posDb.id])).rows[0]
      catat('hapus Posyandu tersimpan sebagai soft delete', Boolean(masih?.dihapus_pada))
    }

    // === 5. Log Aktivitas menampilkan aksi CRUD tadi ===
    await buka('/app/log')
    await sesi.tunggu(() => sesi.eval('window.__uji.ada("log aktivitas") || window.__uji.ada("aktivitas")'), 'layar log')
    const teksLog = await sesi.eval('document.body.innerText')
    catat('Log Aktivitas memuat entri baru', /posyandu/i.test(teksLog))
    const baru = (await db.query('SELECT id FROM log_audit')).rows.map((r) => r.id).filter((i) => !auditSebelum.has(i))
    const aksiPos = (await db.query(
      `SELECT aksi FROM log_audit WHERE id = ANY($1::uuid[]) AND nama_tabel = 'posyandu' ORDER BY aksi`,
      [baru],
    )).rows.map((r) => r.aksi)
    catat('audit posyandu dari klik UI', aksiPos.includes('buat') && aksiPos.includes('hapus'), aksiPos.join(','))

    // === 6. Navigasi & gating peran ===
    // Admin tidak punya layar validasi (itu milik nakes); URL harus dialihkan.
    await buka('/app/validasi')
    const jalurValidasi = await sesi.eval('location.pathname')
    catat('admin dialihkan dari layar nakes', jalurValidasi !== '/app/validasi', jalurValidasi)
    // Layar milik admin harus terbuka normal.
    await buka('/app/pengguna')
    const jalurPengguna = await sesi.eval('location.pathname')
    catat('admin bisa membuka layar Pengguna', jalurPengguna === '/app/pengguna', jalurPengguna)

    // Akun kader sementara dibuat SEBELUM logout: setelah keluar, cookie
    // admin sudah dicabut dan permintaan /pengguna akan ditolak butuh_masuk.
    // Sandi akun kader yang sudah ada tidak diketahui dan tidak ditimpa.
    const namaKader = `uji_klik_${stempel}`
    const sandiKader = 'UjiKlikKader2026!'
    let idKunjunganUji = null
    const rKader = await fetch('http://127.0.0.1:3000/pengguna', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'smart-posyandu',
        Cookie: cookieAdmin,
      },
      body: JSON.stringify({
        nama_pengguna: namaKader, nama_lengkap: `Kader UjiKlik ${stempel}`,
        kata_sandi: sandiKader, peran: 'kader', posyandu_id: posyanduAktif,
      }),
    })
    const akunKader = await rKader.json()
    if (akunKader?.id) dibuat.pengguna.push(akunKader.id)
    catat('buat akun kader sementara', rKader.status === 201, akunKader?.detail ?? '')

    const namaNakes = `uji_klik_nakes_${stempel}`
    const sandiNakes = 'UjiKlikNakes2026!'
    const rNakes = await fetch('http://127.0.0.1:3000/pengguna', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'smart-posyandu',
        Cookie: cookieAdmin,
      },
      body: JSON.stringify({
        nama_pengguna: namaNakes, nama_lengkap: `Nakes UjiKlik ${stempel}`,
        kata_sandi: sandiNakes, peran: 'nakes', posyandu_id: null,
      }),
    })
    const akunNakes = await rNakes.json()
    if (akunNakes?.id) dibuat.pengguna.push(akunNakes.id)
    catat('buat akun nakes sementara', rNakes.status === 201, akunNakes?.detail ?? '')

    // === 7. Logout lewat dialog konfirmasi ===
    let keluar = false
    try {
      const tombolKeluar = await sesi.eval(`(() => {
        const b = [...document.querySelectorAll('button,a')]
          .find(e => /keluar/i.test(e.innerText || e.getAttribute('title') || ''));
        if (!b) return false; b.click(); return true;
      })()`)
      if (tombolKeluar) {
        await new Promise((r) => setTimeout(r, 500))
        const modal = await sesi.eval('window.__uji.ada("Keluar dari akun?")')
        const konfirm = await sesi.eval(`(() => {
          const d = document.querySelector('[role="dialog"]');
          if (!d) return false;
          const b = [...d.querySelectorAll('button')].find(e => /keluar sekarang/i.test(e.innerText));
          if (!b) return false; b.click(); return true;
        })()`)
        await new Promise((r) => setTimeout(r, 900))
        keluar = await sesi.eval('location.pathname.includes("login")') || (await sesi.eval('window.__uji.ada("kata sandi")'))
        catat('dialog keluar muncul', modal)
        catat('logout mendarat di layar masuk', Boolean(konfirm) && Boolean(keluar))
      }
    } catch (e) { catat('logout', false, e.message) }

    // === 8. Alur kader: daftar balita lewat form, lalu catat pengukuran ===
    await buka('/app/login')
    await sesi.eval(`window.__uji.isi("#nama", ${JSON.stringify(namaKader)})`)
    await sesi.eval(`window.__uji.isi("#sandi", ${JSON.stringify(sandiKader)})`)
    await klik('Masuk', 'button')
    await new Promise((r) => setTimeout(r, 1200))
    const jalurKader = await sesi.eval('location.pathname')
    const masukKader = !jalurKader.includes('login')
    catat('login kader berhasil', masukKader, jalurKader)

    if (masukKader) {
      const namaBalita = `Balita UjiKlik ${stempel}`
      await buka('/app/baru')
      await sesi.tunggu(() => sesi.eval('window.__uji.ada("balita baru")'), 'form balita baru')
      await sesi.eval(`window.__uji.isi("#nama", ${JSON.stringify(namaBalita)})`)
      await sesi.eval('window.__uji.isi("#lahir", "2025-01-06")')
      await sesi.eval('window.__uji.isi("#wali", "Wali UjiKlik")')
      await klik('Simpan Balita', 'button')
      await new Promise((r) => setTimeout(r, 1200))

      // Balita disimpan di IndexedDB tablet; tarik lewat UI Beranda agar
      // benar-benar terkirim ke server seperti pemakaian nyata.
      await buka('/app/beranda')
      const tombolSinkron = await sesi.eval(`(() => {
        const b = [...document.querySelectorAll('button')].find(e => /sinkron/i.test(e.innerText));
        if (!b) return false; b.click(); return true;
      })()`)
      if (tombolSinkron) {
        for (let i = 0; i < 40; i++) {
          const ada = (await db.query('SELECT id FROM balita WHERE nama_lengkap = $1', [namaBalita])).rows[0]
          if (ada) break
          await new Promise((r) => setTimeout(r, 300))
        }
      }
      const balitaDb = (await db.query('SELECT id, nama_lengkap FROM balita WHERE nama_lengkap = $1', [namaBalita])).rows[0]
      if (balitaDb) dibuat.balita.push(balitaDb.id)
      catat('daftar balita lewat klik + tombol Sinkronkan', Boolean(balitaDb),
        balitaDb ? 'tersimpan di server' : `belum terkirim (tombol sinkron: ${tombolSinkron})`)

      // Catat kunjungan + pengukuran untuk balita itu.
      await buka('/app/catat')
      await sesi.tunggu(() => sesi.eval('window.__uji.ada("catat") || window.__uji.ada("berat")'), 'layar catat')
      await sesi.eval(`window.__uji.isi("#balita", ${JSON.stringify(balitaDb?.id ?? '')})`)
      await sesi.eval('window.__uji.isi("#berat", "9.4")')
      await sesi.eval('window.__uji.isi("#tinggi", "75")')
      await klik('Simpan kunjungan', 'button')
      await new Promise((r) => setTimeout(r, 1500))
      const sukses = await sesi.eval('window.__uji.ada("tersimpan") || window.__uji.ada("berhasil") || window.__uji.ada("menunggu")')
      catat('catat kunjungan lewat klik', Boolean(sukses), 'tersimpan di tablet (lokal)')

      // Buktikan kunjungan benar-benar sampai ke server, bukan cuma lokal.
      // Ini yang sebelumnya hanya diasumsikan.
      await buka('/app/beranda')
      const sinkronKedua = await sesi.eval(`(() => {
        const b = [...document.querySelectorAll('button')].find(e => /sinkron/i.test(e.innerText));
        if (!b) return false; b.click(); return true;
      })()`)
      let kunjunganDb = null
      if (sinkronKedua) {
        for (let i = 0; i < 40; i++) {
          kunjunganDb = (await db.query(
            'SELECT id FROM kunjungan WHERE balita_id = $1 AND dihapus_pada IS NULL',
            [balitaDb?.id],
          )).rows[0]
          if (kunjunganDb) break
          await new Promise((r) => setTimeout(r, 300))
        }
      }
      catat('kunjungan sampai ke server lewat Sinkronkan', Boolean(kunjunganDb),
        kunjunganDb ? `kunjungan ${kunjunganDb.id.slice(0, 8)}` : `belum terkirim (tombol: ${sinkronKedua})`)

      // Antrean tablet harus kosong setelah sinkron sukses.
      const antrean = await sesi.eval(`(async () => {
        const req = indexedDB.open('posyandu');
        const dbh = await new Promise((r) => { req.onsuccess = () => r(req.result); req.onerror = () => r(null) });
        if (!dbh) return -1;
        const baca = (nama) => new Promise((r) => {
          if (!dbh.objectStoreNames.contains(nama)) return r([]);
          const s = dbh.transaction(nama).objectStore(nama).getAll();
          s.onsuccess = () => r(s.result); s.onerror = () => r([]);
        });
        const semua = await baca('antrean_sinkron');
        dbh.close();
        return semua.filter(a => a.status === 'menunggu').length;
      })()`)
      catat('antrean tablet kosong setelah sinkron', antrean === 0, `menunggu=${antrean}`)

      // Status gizi harus tetap NULL sebelum nakes memvalidasi.
      if (kunjunganDb) {
        const ukur = (await db.query(
          'SELECT p.id, p.status_gizi FROM pengukuran p WHERE p.kunjungan_id = $1',
          [kunjunganDb.id],
        )).rows[0]
        catat('status_gizi NULL sebelum validasi nakes', ukur?.status_gizi === null,
          String(ukur?.status_gizi))
        idKunjunganUji = kunjunganDb.id
      }

      // === 9. Nakes memvalidasi lewat layar Validasi ===
      // Sesi kader masih hidup; keluar dulu supaya form login benar-benar tampil.
      await sesi.eval(`(() => {
        const b = [...document.querySelectorAll('button,a')]
          .find(e => /keluar/i.test(e.innerText || e.getAttribute('title') || ''));
        if (!b) return false; b.click(); return true;
      })()`)
      await new Promise((r) => setTimeout(r, 500))
      await sesi.eval(`(() => {
        const d = document.querySelector('[role="dialog"]');
        const b = d && [...d.querySelectorAll('button')].find(e => /keluar sekarang/i.test(e.innerText));
        if (b) b.click(); return Boolean(b);
      })()`)
      await new Promise((r) => setTimeout(r, 1000))
      await buka('/app/login')
      await sesi.tunggu(() => sesi.eval('Boolean(document.querySelector("#nama"))'), 'form login nakes')
      await sesi.eval(`window.__uji.isi("#nama", ${JSON.stringify(namaNakes)})`)
      await sesi.eval(`window.__uji.isi("#sandi", ${JSON.stringify(sandiNakes)})`)
      await klik('Masuk', 'button')
      await new Promise((r) => setTimeout(r, 1200))
      const masukNakes = !(await sesi.eval('location.pathname')).includes('login')
      catat('login nakes berhasil', masukNakes, await sesi.eval('location.pathname'))

      if (masukNakes && kunjunganDb) {
        await buka('/app/validasi')
        await sesi.tunggu(() => sesi.eval('window.__uji.ada("validasi pengukuran")'), 'layar validasi')
        // Saring ke balita uji supaya tombol Validasi menunjuk baris yang tepat.
        await sesi.eval(`window.__uji.isi("#cari-validasi", ${JSON.stringify(namaBalita)})`)
        await new Promise((r) => setTimeout(r, 900))
        const ditekan = await sesi.eval(`(() => {
          const b = [...document.querySelectorAll('button')].find(e => /^validasi$/i.test(e.innerText.trim()));
          if (!b) return { ok: false, teks: document.body.innerText.slice(0, 200) };
          b.click(); return { ok: true };
        })()`)
        assert.ok(ditekan.ok, `tombol Validasi tidak ada: ${ditekan.teks ?? ''}`)
        let ukur = null
        for (let i = 0; i < 40; i++) {
          ukur = (await db.query(
            'SELECT status_gizi, persen_median FROM pengukuran WHERE kunjungan_id = $1',
            [kunjunganDb.id],
          )).rows[0]
          if (ukur?.status_gizi) break
          await new Promise((r) => setTimeout(r, 300))
        }
        catat('validasi nakes mengisi status_gizi', Boolean(ukur?.status_gizi), JSON.stringify(ukur))
      }
    } else {
      catat('login kader sementara', false, 'tidak bisa masuk')
    }

    // === 10. Log Aktivitas melihat validasi dari akun admin ===
    if (idKunjunganUji) {
      const auditValidasi = (await db.query(
        `SELECT aksi, nama_tabel FROM log_audit WHERE id_baris = $1 ORDER BY nama_tabel`,
        [idKunjunganUji],
      )).rows
      const auditUkur = (await db.query(
        `SELECT count(*)::int n FROM log_audit WHERE nama_tabel = 'pengukuran' AND aksi = 'ubah'`,
      )).rows[0].n
      catat('audit validasi kunjungan tercatat',
        auditValidasi.some((a) => a.nama_tabel === 'kunjungan' && a.aksi === 'ubah'),
        JSON.stringify(auditValidasi))
      catat('audit perubahan status gizi tercatat', auditUkur > 0, `ubah pengukuran: ${auditUkur}`)
    }

    catat('tidak ada error JS di konsol', galatKonsol.length === 0, galatKonsol.slice(0, 2).join(' | '))

    // --- Cleanup by id (dijalankan juga saat uji gagal, lihat finally) ---
    await bersihkan()
  } finally {
    // Cleanup wajib di sini: percobaan pertama pernah gagal di tengah dan
    // meninggalkan satu baris Posyandu karena cleanup hanya ada di jalur sukses.
    try { await bersihkan() } catch (e) { console.error('cleanup gagal:', e.message) }
    try { sesi?.ws.close() } catch { /* sudah tutup */ }
    try { await db?.end() } catch { /* sudah tutup */ }
    chrome.kill()
    await new Promise((r) => setTimeout(r, 600))
    try { rmSync(profil, { recursive: true, force: true }) } catch { /* file terkunci */ }
  }

  const gagal = langkah.filter((l) => !l.ok)
  if (gagal.length) {
    console.log(`\nGAGAL ${gagal.length}: ${gagal.map((g) => g.nama).join(' | ')}`)
    process.exitCode = 1
  } else {
    console.log(`\nSEMUA ${langkah.length} LANGKAH KLIK LULUS`)
  }
}

main().catch((e) => {
  console.error('UJI KLIK ERROR:', e.message)
  process.exitCode = 1
})
