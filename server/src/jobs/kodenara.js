// Menarik artikel dari kanal publik KodeNara ke tabel konten_publik.
//
// KodeNara tidak menyediakan API maupun feed (semua /api, /feed, /rss 404),
// jadi satu-satunya jalan adalah membaca HTML halaman kategori. Parser di
// bawah sengaja bergantung pada penanda yang semantik (`article-title-link`,
// `<h1>`), bukan pada susunan div, supaya perubahan tata letak tidak langsung
// mematahkannya.
//
// Prinsip yang dipegang: kalau struktur halaman berubah, JANGAN menebak.
// Kembalikan daftar kosong dan biarkan konten lama tetap tayang. Konten
// kesehatan yang salah lebih berbahaya daripada konten yang tidak diperbarui.

const { satu, kueri } = require('../db/pool')

const SUMBER = 'https://kodenara.id/insight/public/category/tips'
const PENANDA = 'kodenara-tips'
const JENIS = 'edukasi'
const BATAS_HALAMAN = 5
const BATAS_ARTIKEL = 40

/** Buang tag HTML dan rapikan spasi. */
function teksBersih(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Daftar artikel dari satu halaman kategori.
 *
 * Halaman ini memakai dua markup berbeda: artikel utama (hero) menaruh judul
 * di `<h2><a>` tanpa kelas `article-title-link`, sedangkan daftar di bawahnya
 * memakai kelas itu. Karena itu pencocokan dilakukan pada SEMUA anchor ke
 * /tips/, lalu anchor tanpa teks (pembungkus gambar) dibuang dan tautan yang
 * sama dideduplikasi. Cara ini bertahan terhadap perubahan kelas CSS, yang
 * paling sering berubah.
 *
 * @returns {Array<{tautan:string, judul:string}>}
 */
function parseDaftar(html) {
  const hasil = []
  const terlihat = new Set()
  const pola = /<a\s[^>]*href="(https:\/\/kodenara\.id\/insight\/public\/tips\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  for (const m of String(html ?? '').matchAll(pola)) {
    const judul = teksBersih(m[2])
    if (!judul || terlihat.has(m[1])) continue
    terlihat.add(m[1])
    hasil.push({ tautan: m[1], judul })
  }
  return hasil
}

/**
 * Isi satu artikel: judul dari <h1>, paragraf dari <p> pertama yang cukup
 * panjang. Paragraf pembuka formulir berlangganan email sengaja dibuang
 * karena panjangnya juga > 60 karakter.
 */
function parseArtikel(html) {
  const teks = String(html ?? '')
  const judul = teksBersih((teks.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) ?? [])[1])
  const tanpaSkrip = teks
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  const paragraf = [...tanpaSkrip.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => teksBersih(m[1]))
    .filter((p) => p.length > 60 && !/Daftarkan email/i.test(p))

  return { judul, isi: paragraf.join('\n\n') }
}

async function ambilHtml(url) {
  const jawab = await fetch(url, {
    headers: { 'User-Agent': 'SmartPosyandu/1.0 (+kanal desa)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!jawab.ok) throw new Error(`${url} menjawab ${jawab.status}`)
  return jawab.text()
}

/** Id tetap per tautan, supaya menjalankan ulang memperbarui baris yang sama. */
function idDari(tautan) {
  const crypto = require('node:crypto')
  const h = crypto.createHash('sha256').update(PENANDA + tautan).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/**
 * Satu putaran: ambil daftar, ambil isi tiap artikel, simpan.
 * @returns {{diperiksa:number, disimpan:number, dilewati:number}}
 */
async function sekali({ ambil = ambilHtml } = {}) {
  const daftar = await kumpulkanDengan(ambil)
  let disimpan = 0
  let dilewati = 0

  for (const [urut, a] of daftar.entries()) {
    let isi
    try {
      isi = parseArtikel(await ambil(a.tautan))
    } catch {
      dilewati += 1
      continue
    }
    const judul = isi.judul || a.judul
    if (!judul || !isi.isi) {
      dilewati += 1
      continue
    }

    // ON CONFLICT: artikel yang diperbarui di KodeNara ikut diperbarui di
    // sini, tanpa menghapus status persetujuan yang sudah diputuskan admin.
    await kueri(
      `INSERT INTO konten_publik
         (id, jenis, judul, isi, kategori, tanggal, penting, aktif, urutan,
          status_persetujuan, pengaju_id, posyandu_id, sumber_url,
          dibuat_pada, diperbarui_pada)
       VALUES ($1, $2, $3, $4, $5, NULL, FALSE, TRUE, $6, 'disetujui', NULL, NULL, $7, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         judul = EXCLUDED.judul,
         isi = EXCLUDED.isi,
         urutan = EXCLUDED.urutan,
         sumber_url = EXCLUDED.sumber_url,
         diperbarui_pada = now()
       WHERE konten_publik.dihapus_pada IS NULL`,
      [idDari(a.tautan), JENIS, judul, isi.isi, PENANDA, 1000 + urut, a.tautan],
    )
    disimpan += 1
  }

  return { diperiksa: daftar.length, disimpan, dilewati }
}

/**
 * Kumpulkan artikel dari beberapa halaman kategori, tanpa duplikat.
 * `ambil` bisa disuntik untuk pengujian; bawaannya mengambil HTML sungguhan.
 */
async function kumpulkanDengan(ambil = ambilHtml) {
  const terkumpul = new Map()
  for (let halaman = 1; halaman <= BATAS_HALAMAN; halaman += 1) {
    const url = halaman === 1 ? SUMBER : `${SUMBER}?page=${halaman}`
    let html
    try {
      html = await ambil(url)
    } catch (salah) {
      // Halaman pertama gagal = tidak ada yang bisa dipercaya; halaman
      // berikutnya gagal = cukup berhenti, yang sudah ada tetap dipakai.
      if (halaman === 1) throw salah
      break
    }
    const daftar = parseDaftar(html)
    if (!daftar.length) break
    let baru = 0
    for (const a of daftar) {
      if (terkumpul.has(a.tautan)) continue
      terkumpul.set(a.tautan, a)
      baru += 1
    }
    if (baru === 0) break
    if (terkumpul.size >= BATAS_ARTIKEL) break
  }
  return [...terkumpul.values()].slice(0, BATAS_ARTIKEL)
}

/** Buang seluruh artikel hasil tarikan. Konten buatan admin tidak tersentuh. */
async function hapusSemua() {
  const { rowCount } = await kueri(
    `DELETE FROM konten_publik WHERE kategori = $1`,
    [PENANDA],
  )
  return rowCount
}

/** Jumlah artikel tarikan yang sedang tayang. */
async function jumlahTayang() {
  const baris = await satu(
    `SELECT COUNT(*)::int AS n FROM konten_publik
     WHERE kategori = $1 AND dihapus_pada IS NULL`,
    [PENANDA],
  )
  return baris?.n ?? 0
}

module.exports = {
  SUMBER, PENANDA, parseDaftar, parseArtikel, kumpulkanDengan, idDari, sekali, hapusSemua, jumlahTayang,
}
