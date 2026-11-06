// Permintaan HTTP ke server. Satu tempat untuk alamat, kepala, dan kegagalan.
//
// Sesi memakai cookie HttpOnly yang ikut terkirim otomatis (`credentials:
// 'include'`), jadi tidak ada token yang disimpan atau dikirim dari sini.
// Setiap permintaan wajib membawa `X-Requested-With` sebagai pertahanan CSRF
// (server/src/app.js); situs lain tidak bisa menambahkan header itu.

// Alamat API.
//
// Kosong (bawaan) = SATU ASAL dengan halaman: permintaan pergi ke `/masuk`,
// `/balita`, dst. di host yang sama. Ini bentuk yang benar untuk produksi di
// balik Nginx (lihat docs/PANDUAN-PENGEMBANG.md): tablet membuka
// https://posyandu.desa.example dan API ikut di host itu, sehingga tidak ada
// CORS, cookie `SameSite=Strict` tetap terkirim, dan alamat tidak perlu
// ditanam saat bangun.
//
// Sebelumnya bawaannya `http://localhost:8000` (port lama, sudah tidak dipakai)
// dan `.env.contoh` menyetel `http://127.0.0.1:3000`. Keduanya ditanam ke
// bundel saat `npm run bangun`; di VPS hasilnya menunjuk localhost TABLET,
// sehingga aplikasi yang sudah terpasang tidak bisa menghubungi server sama
// sekali. Isi VITE_API hanya bila klien sengaja dipisah dari API.
const AKAR = (import.meta.env?.VITE_API ?? '').replace(/\/$/, '')

const KEPALA_DASAR = { 'X-Requested-With': 'smart-posyandu' }

/** Jaringan tidak terjangkau. Bukan kesalahan pengguna; antrean tetap menunggu. */
export class GagalJaringan extends Error {
  constructor() {
    super('Tidak ada koneksi ke server')
    this.name = 'GagalJaringan'
  }
}

/** Server menjawab, tetapi menolak. `status` dan `rincian` dipakai layar. */
export class KesalahanApi extends Error {
  constructor(status, rincian) {
    super(`Server menolak (${status})`)
    this.name = 'KesalahanApi'
    this.status = status
    this.rincian = rincian
  }
}

async function minta(jalur, { metode = 'GET', isi, kepala: tambahan } = {}) {
  const kepala = { ...KEPALA_DASAR, ...(tambahan ?? {}) }
  if (isi !== undefined) kepala['Content-Type'] = 'application/json'
  let jawab
  try {
    jawab = await fetch(AKAR + jalur, {
      method: metode,
      headers: kepala,
      credentials: 'include',
      body: isi === undefined ? undefined : JSON.stringify(isi),
    })
  } catch {
    throw new GagalJaringan()
  }
  if (!jawab.ok) {
    let rincian = null
    try {
      const isi = await jawab.json()
      const detail = isi.detail ?? null
      // Server mengirim `detail` berupa teks, atau objek {detail, rincian}
      // untuk kasus yang perlu kalimat penjelas. Jangan biarkan bentuk objek
      // masuk ke React.
      rincian =
        typeof detail === 'string'
          ? (isi.rincian ?? detail)
          : detail?.rincian ?? isi.rincian ?? 'kesalahan_server'
    } catch {
      // balasan bukan JSON; biarkan rincian null
    }
    throw new KesalahanApi(jawab.status, rincian)
  }
  if (jawab.status === 204) {
    // Badan balasan 204 dibaca habis meski kosong: kalau tidak, Chrome
    // mencatat "net::ERR_ABORTED" di konsol untuk permintaan yang sebenarnya
    // berhasil, dan itu menyulitkan saat menelusuri galat sungguhan.
    await jawab.text().catch(() => {})
    return null
  }
  return jawab.json()
}

export function masuk(nama_pengguna, kata_sandi, id_perangkat) {
  return minta('/masuk', {
    metode: 'POST',
    isi: { nama_pengguna, kata_sandi, id_perangkat },
  })
}

export function keluar() {
  return minta('/keluar', { metode: 'POST' })
}

/** Pemakai yang sedang masuk menurut cookie. `null` bila sesinya sudah tidak sah. */
export async function saya() {
  try {
    return await minta('/saya')
  } catch (salah) {
    if (salah instanceof KesalahanApi && salah.status === 401) return null
    throw salah
  }
}

export function kirimSinkron(muatan) {
  return minta('/sinkron', { metode: 'POST', isi: muatan })
}

export function tarikSinkron(sejak) {
  // 2000 baris per halaman: separuh bolak-balik dibanding 1000, dan masih
  // dalam batas server (2000). Tarikan awal 433.000 baris jadi ~217 permintaan.
  return minta(`/sinkron?batas=2000${sejak ? `&sejak=${encodeURIComponent(sejak)}` : ''}`)
}

export function daftarValidasi({ batas = 50, offset = 0, q = '', posyandu_id = '' } = {}) {
  const param = `batas=${batas}&offset=${offset}`
  const query = q ? `&q=${encodeURIComponent(q)}` : ''
  const pos = posyandu_id ? `&posyandu_id=${encodeURIComponent(posyandu_id)}` : ''
  return minta(`/validasi?${param}${query}${pos}`)
}

/** Validasi massal: kunjungan yang cocok dengan q (atau semua). */
export function validasiSemua(q = '') {
  return minta('/validasi/semua', { metode: 'POST', isi: { q } })
}

export function validasiKunjungan(id) {
  return minta(`/kunjungan/${id}/validasi`, { metode: 'POST' })
}

export function tindakLanjut(idKunjungan, muatan) {
  return minta(`/kunjungan/${idKunjungan}/tindak_lanjut`, { metode: 'POST', isi: muatan })
}

export function rekap(bulan) {
  return minta(`/rekap?bulan=${bulan}`)
}

export function kualitas() {
  return minta('/kualitas')
}

export function daftarCadangan() {
  return minta('/cadangan')
}

export function daftarBalita({ q = '', aktif = true, batas = 200, offset = 0, posyandu_id = '' } = {}) {
  const param = new URLSearchParams({ batas, offset })
  if (q) param.set('q', q)
  if (posyandu_id) param.set('posyandu_id', posyandu_id)
  param.set('aktif', String(aktif))
  return minta(`/balita?${param}`)
}

export function daftarPosyandu() {
  return minta('/posyandu')
}

export function daftarPosyanduPublik() {
  return minta('/posyandu/publik')
}

export function daftarKontenPublik(jenis = '') {
  const q = jenis ? `?jenis=${encodeURIComponent(jenis)}` : ''
  return minta(`/konten-publik${q}`)
}

export function daftarSemuaKontenPublik(jenis = '', status = '') {
  const p = new URLSearchParams()
  if (jenis) p.set('jenis', jenis)
  if (status) p.set('status', status)
  const q = p.toString()
  return minta(`/konten-publik/semua${q ? `?${q}` : ''}`)
}

export function buatKontenPublik(muatan) {
  return minta('/konten-publik', { metode: 'POST', isi: muatan })
}

export function ubahKontenPublik(id, muatan) {
  return minta(`/konten-publik/${id}`, { metode: 'PATCH', isi: muatan })
}

export function hapusKontenPublik(id) {
  return minta(`/konten-publik/${id}`, { metode: 'DELETE' })
}

/** Nakes/admin memutuskan jadwal: keputusan = 'disetujui' | 'ditolak'. */
export function putuskanKontenPublik(id, keputusan, catatan = null) {
  return minta(`/konten-publik/${id}/putuskan`, {
    metode: 'POST',
    isi: { keputusan, catatan },
  })
}

export function detailPosyandu(id) {
  return minta(`/posyandu/${encodeURIComponent(id)}`)
}

export function daftarSemuaPosyandu() {
  return minta('/posyandu/semua')
}

export function buatPosyandu(muatan) {
  return minta('/posyandu', { metode: 'POST', isi: muatan })
}

export function ubahPosyandu(id, muatan) {
  return minta(`/posyandu/${id}`, { metode: 'PATCH', isi: muatan })
}

export function hapusPosyandu(id) {
  return minta(`/posyandu/${id}`, { metode: 'DELETE' })
}

export function buatBalita(muatan) {
  return minta('/balita', { metode: 'POST', isi: muatan })
}

export function ubahBalita(id, muatan) {
  return minta(`/balita/${id}`, { metode: 'PATCH', isi: muatan })
}

export function hapusBalita(id) {
  return minta(`/balita/${id}`, { metode: 'DELETE' })
}

export function jalankanCadangan() {
  return minta('/cadangan', { metode: 'POST' })
}

/** Unduh satu berkas cadangan (sudah terenkripsi di server). */
export async function unduhCadangan(nama) {
  let jawab
  try {
    jawab = await fetch(`${AKAR}/cadangan/${encodeURIComponent(nama)}`, {
      headers: KEPALA_DASAR,
      credentials: 'include',
    })
  } catch {
    throw new GagalJaringan()
  }
  if (!jawab.ok) throw new KesalahanApi(jawab.status, null)
  return jawab.blob()
}

/** Jumlah baris per tabel di dalam berkas cadangan; tidak menulis apa pun. */
export function pratinjauCadangan(nama) {
  return minta(`/cadangan/${encodeURIComponent(nama)}/pratinjau`)
}

/** Pulihkan isi berkas cadangan ke basis data server. */
export function pulihkanCadangan(nama, kataSandi) {
  return minta(`/cadangan/${encodeURIComponent(nama)}/pulihkan`, {
    metode: 'POST',
    isi: { konfirmasi: nama, kata_sandi: kataSandi },
  })
}

/** Pulihkan dari berkas yang dipilih dari perangkat (SSD/HDD kantor desa). */
export async function pulihkanDariBerkas(berkas, kataSandi) {
  let jawab
  try {
    jawab = await fetch(`${AKAR}/cadangan/pulihkan-unggah?nama=${encodeURIComponent(berkas.name)}`, {
      method: 'POST',
      headers: {
        ...KEPALA_DASAR,
        'Content-Type': 'application/octet-stream',
        'X-Kata-Sandi': kataSandi ?? '',
      },
      credentials: 'include',
      body: berkas,
    })
  } catch {
    throw new GagalJaringan()
  }
  if (!jawab.ok) {
    let rincian = null
    try {
      const d = await jawab.json()
      rincian = typeof d.detail === 'string' ? d.detail : d.detail?.rincian ?? null
    } catch {}
    throw new KesalahanApi(jawab.status, rincian)
  }
  return jawab.json()
}

export function daftarPengguna() {
  return minta('/pengguna')
}

export function buatPengguna(muatan) {
  return minta('/pengguna', { metode: 'POST', isi: muatan })
}

export function ubahPengguna(id, muatan) {
  return minta(`/pengguna/${id}`, { metode: 'PATCH', isi: muatan })
}

/** Sesi tablet yang masih hidup. Hanya admin desa. */
/** Log aktivitas (admin desa): perubahan data, ekspor, masuk/keluar. */
export function daftarAktivitas({
  batas = 50,
  offset = 0,
  aksi = '',
  tabel = '',
  pengguna_id = '',
  dari = '',
  sampai = '',
} = {}) {
  const param = new URLSearchParams({ batas: String(batas), offset: String(offset) })
  for (const [kunci, nilai] of Object.entries({ aksi, tabel, pengguna_id, dari, sampai })) {
    if (nilai) param.set(kunci, nilai)
  }
  return minta(`/aktivitas?${param}`)
}

export function daftarSesi() {
  return minta('/sesi')
}

/** Cabut satu sesi; tablet itu harus masuk ulang. */
export function cabutSesi(id) {
  return minta(`/sesi/${id}`, { metode: 'DELETE' })
}

export async function unduhEkspor(bulan) {
  let jawab
  try {
    jawab = await fetch(`${AKAR}/ekspor.csv?bulan=${bulan}`, {
      headers: KEPALA_DASAR,
      credentials: 'include',
    })
  } catch {
    throw new GagalJaringan()
  }
  if (!jawab.ok) throw new KesalahanApi(jawab.status, null)
  return jawab.blob()
}

/** Perbarui data akun sendiri; admin desa boleh menyertakan id akun lain. */
export function perbaruiAkun(muatan) {
  return minta('/akun-saya', { metode: 'PATCH', isi: muatan })
}
