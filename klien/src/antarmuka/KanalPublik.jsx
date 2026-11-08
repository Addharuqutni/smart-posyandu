import { useEffect, useState } from 'react'
import { daftarKontenPublik, daftarPosyanduPublik } from '../jaringan/api.js'
import {
  blokTanggal,
  formatJadwal,
  formatRentang,
  jadwalMendatang,
  jadwalPerPosyandu,
  pecahTanggalJam,
  wilayahPosyandu,
} from '../logika/konten-skema.js'
import { tanggalHariIni } from '../logika/waktu.js'
import Ikon from './Ikon.jsx'

const LAYANAN_POSYANDU = [
  {
    ikon: 'balita',
    judul: 'Penimbangan & Pengukuran',
    deskripsi: 'Berat badan, tinggi/panjang badan, dan lingkar kepala rutin untuk deteksi dini risiko stunting.',
  },
  {
    ikon: 'anak',
    judul: 'Imunisasi Dasar Lengkap',
    deskripsi: 'Vaksinasi berkala bersama Puskesmas Baturraden dan Bidan Desa sesuai tahapan usia anak.',
  },
  {
    ikon: 'rekap',
    judul: 'Vitamin A & PMT Pangan Lokal',
    deskripsi: 'Pemberian vitamin kapsul reguler dan makanan tambahan padat protein hewani dari desa.',
  },
  {
    ikon: 'akun',
    judul: 'Konsultasi KIA & Tumbuh Kembang',
    deskripsi: 'Konseling pengasuhan, MPASI, dan pemantauan berkala grafik KMS Buku KIA bersama kader.',
  },
]

const EDUKASI_KESEHATAN = [
  {
    judul: 'Kebutuhan Protein Hewani Esensial pada MPASI',
    ringkasan: 'Telur, ikan, ayam, dan daging merah mengandung asam amino kunci penunjang pacu tumbuh dan otak.',
    bacaan: 'Kenalkan sumber hewani sejak balita usia 6 bulan. Hindari hanya mengandalkan karbohidrat atau sayur.',
  },
  {
    judul: 'Disiplin Pengukuran Bulanan Deteksi Garis 2T',
    ringkasan: 'Dua kali penimbangan berturut-turut tanpa kenaikan (2T) adalah alarm rujukan segera ke nakes.',
    bacaan: 'Bawa Buku KIA setiap posyandu. Kenaikan berat yang terpantau rutin adalah pelindung stunting terkuat.',
  },
  {
    judul: 'Akses Air Bersih & Pencegahan Diare Berulang',
    ringkasan: 'Infeksi saluran cerna akibat air atau sanitasi kotor menghambat total penyerapan nutrisi anak.',
    bacaan: 'Masak air hingga matang sempurna dan biasakan cuci tangan pakai sabun sebelum menyuapi balita.',
  },
]

function keBagian(id) {
  const sasaran = document.getElementById(id)
  if (!sasaran) return
  const tenang = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  sasaran.scrollIntoView({ behavior: tenang ? 'auto' : 'smooth', block: 'start' })
}

export default function KanalPublik({ keLogin }) {
  const [daftarPos, setDaftarPos] = useState([])
  const [daftarKonten, setDaftarKonten] = useState([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState(null)
  const [percobaan, setPercobaan] = useState(0)

  useEffect(() => {
    let hidup = true
    setMemuat(true)
    setGalat(null)
    Promise.all([daftarPosyanduPublik(), daftarKontenPublik()])
      .then(([resPos, resKonten]) => {
        if (!hidup) return
        setDaftarPos(resPos.posyandu ?? [])
        setDaftarKonten(resKonten.konten ?? [])
      })
      .catch(() => {
        // Jangan diam-diam menampilkan contoh: warga akan membaca jadwal
        // karangan sebagai jadwal sungguhan.
        if (!hidup) return
        setGalat('Jadwal dan pengumuman belum bisa dimuat. Periksa koneksi internet lalu coba lagi.')
      })
      .finally(() => {
        if (hidup) setMemuat(false)
      })
    return () => {
      hidup = false
    }
  }, [percobaan])

  const adaKonten = (jenis) => daftarKonten.some((k) => k.jenis === jenis)
  // Pengumuman hanya dari server: pemberitahuan desa tidak boleh dikarang.
  const pengumuman = daftarKonten.filter((k) => k.jenis === 'pengumuman')
  // Layanan dan edukasi punya teks bawaan karena isinya paket layanan standar
  // posyandu dan panduan umum; konten dari admin desa menimpa versi bawaan.
  const layanan = adaKonten('layanan')
    ? daftarKonten.filter((k) => k.jenis === 'layanan').map((k) => ({ ikon: 'cek', judul: k.judul, deskripsi: k.isi }))
    : LAYANAN_POSYANDU
  const edukasi = adaKonten('edukasi')
    ? daftarKonten.filter((k) => k.jenis === 'edukasi').map((k) => ({
        judul: k.judul,
        // Artikel tarikan bisa ribuan karakter; kartu hanya menampilkan
        // cuplikan, sisanya lewat tautan ke sumber aslinya.
        ringkasan: k.sumber_url ? `${k.isi.slice(0, 240).trimEnd()}…` : k.isi,
        tautan: k.sumber_url || null,
        bacaan: !k.sumber_url && k.tanggal
          ? `Catatan: ${formatRentang(k.tanggal)}`
          : k.sumber_url ? null : 'Konsultasikan lebih lanjut dengan Bidan Desa atau kader posyandu.',
      }))
    : EDUKASI_KESEHATAN
  // Tiga jadwal terdekat yang sudah disetujui nakes; jadwal lampau dibuang.
  const hariIni = tanggalHariIni()
  const jadwalTerdekat = jadwalMendatang(daftarKonten, hariIni).slice(0, 3)
  // Jadwal terdekat per Posyandu, untuk kartu lokasi.
  const jadwalPerPos = jadwalPerPosyandu(daftarKonten, hariIni)
  // Judul bagian memakai desa yang benar-benar terdata, bukan nama karangan.
  const namaDesa = daftarPos.find((p) => p.desa)?.desa ?? null

  return (
    <div className="editorial min-h-dvh bg-latar text-teks font-sans antialiased selection:bg-biru-100 selection:text-biru-950">
      {/* 1. Header Bar: Identik dengan bilah atas aplikasi admin & kader */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[image:var(--latar-kepala)] text-kartu shadow-kontrol [padding-top:env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-lebar items-center justify-between gap-4 px-4 py-2 max-sempit:min-h-[58px] max-sempit:px-3">
          <a
            href="/"
            className="group flex min-h-11 items-center gap-3 rounded-kecil text-inherit no-underline focus-visible:outline-none"
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-kecil bg-white/12 p-1 ring-1 ring-white/20 transition-colors duration-200 ease-ui group-hover:bg-white/20">
              <img className="size-full object-contain [filter:drop-shadow(0_2px_4px_rgb(0_0_0/0.3))]" src="/logo-192.png" alt="Logo Smart Posyandu" width="36" height="36" />
            </div>
            <div className="min-w-0 leading-tight">
              <span className="block truncate text-tombol font-bold tracking-[0.01em] text-white whitespace-nowrap">
                Smart Posyandu
              </span>
              <span className="block truncate text-2xs font-medium text-biru-100/90">
                {namaDesa ? `Kanal Warga Desa ${namaDesa}` : 'Kanal Warga'}
              </span>
            </div>
          </a>

          {/* Tombol Masuk Petugas: Tampil di header desktop/tablet, disembunyikan di HP */}
          <button
            type="button"
            onClick={keLogin}
            className="group hidden min-h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-kecil border border-white/20 bg-white/10 px-3.5 py-1.5 text-padat font-semibold text-white shadow-halus backdrop-blur-xs transition-colors duration-200 ease-ui hover:border-white/35 hover:bg-white/15 hover:shadow-kontrol active:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sempit:inline-flex"
          >
            <span className="grid size-5 place-items-center rounded-mikro bg-white/15 text-white transition-colors duration-200 ease-ui group-hover:bg-white/25">
              <Ikon nama="masuk" ukuran={13} />
            </span>
            <span className="tracking-[0.01em] whitespace-nowrap">Masuk Petugas</span>
          </button>
        </div>
      </header>

      <main id="isi-utama">
        {/* 2. Hero: asimetris, teks di kiri, papan jadwal di kanan. */}
        <section className="border-b border-garis bg-biru-50/70">
          <div className="mx-auto grid max-w-lebar gap-10 px-4 pt-12 pb-14 max-sempit:px-3 max-sempit:pt-8 max-sempit:pb-10 lg:grid-cols-12 lg:items-center lg:gap-12 lg:pt-20 lg:pb-24">
            <div className="lg:col-span-7">
              <div className="masuk inline-flex items-center gap-2 rounded-kecil border border-biru-200 bg-kartu px-3 py-1 text-2xs font-bold tracking-[0.08em] text-biru-800 uppercase shadow-halus">
                <span className="size-2 rounded-full bg-biru-700" aria-hidden="true" />
                <span>Pelayanan Kesehatan Balita Terpadu</span>
              </div>

              <h1 className="masuk masuk-1 m-0 mt-5 text-panggung font-semibold tracking-[-0.02em] text-balance text-biru-950">
                {namaDesa
                  ? `Posyandu Desa ${namaDesa}: jadwal, layanan balita, dan edukasi gizi.`
                  : 'Data tumbuh kembang rapi, balita sehat bebas stunting.'}
              </h1>

              <p className="masuk masuk-2 m-0 mt-5 max-w-[54ch] text-dasar leading-relaxed text-pretty text-teks-redup">
                {namaDesa
                  ? `Akses resmi warga Desa ${namaDesa} untuk jadwal penimbangan tiap dusun, imunisasi dasar, vitamin, serta konsultasi gizi langsung dengan Bidan Desa dan kader.`
                  : 'Akses resmi warga untuk jadwal penimbangan tiap dusun, imunisasi dasar, vitamin, serta konsultasi gizi langsung dengan Bidan Desa dan kader.'}
              </p>

              <div className="masuk masuk-3 mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => keBagian('jadwal')}
                  className="min-h-12 rounded-kecil bg-biru-800 px-6 font-bold text-kartu shadow-kontrol transition-[transform,opacity] duration-150 ease-ui hover:opacity-95 active:scale-[0.98]"
                >
                  <Ikon nama="posyandu" ukuran={17} />
                  <span className="whitespace-nowrap">Lihat Jadwal Posyandu</span>
                </button>
                <button
                  type="button"
                  onClick={() => keBagian('edukasi')}
                  className="min-h-12 rounded-kecil border border-garis bg-kartu px-6 font-semibold text-biru-950 shadow-kontrol transition-[transform,opacity,border-color] duration-150 ease-ui hover:border-biru-600 hover:bg-biru-50 active:scale-[0.98]"
                >
                  <Ikon nama="anak" ukuran={17} />
                  <span className="whitespace-nowrap">Panduan Gizi Balita</span>
                </button>
              </div>

              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-garis pt-6 text-padat text-teks-redup">
                <div className="flex items-center gap-2 font-semibold text-teks">
                  <Ikon nama="posyandu" ukuran={16} className="text-biru-700" />
                  <span>
                    {memuat
                      ? 'Memuat data posyandu…'
                      : daftarPos.length > 0
                        ? `${daftarPos.length} Posyandu Dusun Aktif`
                        : 'Posyandu Terdata Desa'}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-semibold text-teks">
                  <Ikon nama="unduh" ukuran={16} className="text-biru-700" />
                  <span>Bawa Buku KIA &amp; Fotokopi KK</span>
                </div>
                <div className="flex items-center gap-2 font-semibold text-hijau-700">
                  <Ikon nama="centang" ukuran={16} />
                  <span>100% Bebas Biaya</span>
                </div>
              </div>
            </div>

            {/* Papan jadwal terdekat: diambil dari jadwal yang sudah disetujui
                nakes. Tidak ada tanggal karangan di sini. */}
            <div className="masuk masuk-2 lg:col-span-5">
              <article
                className="relative overflow-hidden rounded-besar border border-garis bg-kartu shadow-naik"
                aria-labelledby="judul-jadwal-terdekat"
                aria-busy={memuat}
              >
                <div className="flex items-center justify-between gap-3 bg-biru-950 px-5 py-3 text-kartu">
                  <div className="flex items-center gap-2">
                    <Ikon nama="waktu" ukuran={15} className="text-biru-300" />
                    {/* Warna ditulis eksplisit: aturan dasar `h2` di gaya.css
                        mengunci color ke biru-950, dan `text-kartu` pada induk
                        tidak menimpanya karena kalah spesifisitas. */}
                    <h2
                      id="judul-jadwal-terdekat"
                      className="m-0 text-2xs font-bold tracking-[0.1em] text-kartu uppercase"
                    >
                      Jadwal Terdekat
                    </h2>
                  </div>
                  <span className="text-2xs font-semibold text-biru-200">
                    {jadwalTerdekat.length > 0 ? `${jadwalTerdekat.length} kegiatan` : ''}
                  </span>
                </div>

                {jadwalTerdekat.length > 0 ? (
                  <ol className="m-0 list-none divide-y divide-garis p-0">
                    {jadwalTerdekat.map((j, i) => {
                      const t = pecahTanggalJam(j.tanggal)
                      const blok = blokTanggal(t.tanggal)
                      return (
                        <li
                          key={j.id}
                          className={`flex items-center gap-4 px-5 py-3.5 ${
                            i === 0 ? 'bg-biru-50/60' : ''
                          }`}
                        >
                          {/* Blok tanggal: angka besar + bulan. Membaca "9 Nov"
                              jauh lebih cepat daripada "9 November 2026 · 08.00". */}
                          <div
                            className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-kecil border tabular-nums ${
                              i === 0
                                ? 'border-biru-800 bg-biru-800 text-kartu'
                                : 'border-garis bg-kartu text-biru-800'
                            }`}
                          >
                            <span className="text-subjudul leading-none font-bold">
                              {blok?.hari ?? '—'}
                            </span>
                            <span className="mt-0.5 text-2xs leading-none font-semibold uppercase opacity-80">
                              {blok?.bulan ?? ''}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-padat leading-snug font-bold text-biru-950">
                              {j.judul}
                            </p>
                            <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-1.5 text-2xs text-teks-samar">
                              <span className="font-semibold tabular-nums text-biru-700">
                                {t.jam ? `${t.jam.replace(':', '.')} WIB` : 'Waktu menyusul'}
                              </span>
                              {j.kategori && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{j.kategori}</span>
                                </>
                              )}
                            </p>
                          </div>

                          {i === 0 && (
                            <span className="shrink-0 rounded-mikro bg-hijau-100 px-1.5 py-0.5 text-2xs font-bold text-hijau-800">
                              Terdekat
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <p className="m-0 px-6 py-6 text-isi leading-relaxed text-teks-redup">
                    {memuat
                      ? 'Memuat jadwal terdekat…'
                      : galat
                        ? 'Jadwal belum bisa dimuat. Lihat papan pengumuman dusun atau tanya kader.'
                        : 'Belum ada jadwal yang tayang. Jadwal baru muncul setelah disetujui petugas kesehatan.'}
                  </p>
                )}

                <p className="m-0 border-t border-garis bg-biru-50 px-6 py-3.5 text-padat leading-relaxed text-teks-redup">
                  Bawa Buku KIA dan fotokopi KK. Waktu dan lokasi tiap dusun tertera pada jadwal di atas.
                </p>
              </article>
            </div>
          </div>
        </section>
        {/* Bagian A: Pengumuman & Agenda Desa (Latar Putih Kartu Bersih) */}
        <section id="pengumuman" aria-labelledby="judul-pengumuman" className="scroll-mt-24 border-b border-garis bg-kartu py-14 max-sempit:py-10">
          <div className="mx-auto max-w-lebar px-4 max-sempit:px-3">

              <div className="mb-5 flex items-end justify-between border-b border-garis pb-3">
                <div>
                  <p className="m-0 text-2xs font-bold tracking-[0.12em] text-biru-700 uppercase">
                    Pemberitahuan Warga
                  </p>
                  <h2 id="judul-pengumuman" className="rubrik">
                    Pengumuman Desa
                  </h2>
                </div>
              </div>

              {galat && (
                <div className="mb-4 rounded-sedang border border-merah-100 bg-merah-100 px-4 py-3.5" role="alert">
                  <p className="m-0 flex items-start gap-2 text-isi font-semibold leading-snug text-merah-800">
                    <Ikon nama="peringatan" ukuran={19} />
                    <span>{galat}</span>
                  </p>
                  <button
                    type="button"
                    className="sekunder mt-3"
                    onClick={() => setPercobaan((n) => n + 1)}
                    disabled={memuat}
                  >
                    {memuat ? 'Mencoba…' : 'Coba lagi'}
                  </button>
                </div>
              )}

              {memuat ? (
                <div className="rounded-sedang border border-dashed border-garis-kuat bg-kartu px-5 py-8 text-center" role="status">
                  <div className="mx-auto mb-2 size-6 animate-spin rounded-full border-2 border-biru-700 border-t-transparent" />
                  <p className="m-0 text-padat text-teks-samar">Memuat pengumuman desa…</p>
                </div>
              ) : pengumuman.length === 0 ? (
                <div className="rounded-sedang border border-dashed border-garis-kuat bg-kartu px-5 py-8 text-center">
                  <h3 className="m-0 text-dasar font-bold text-teks">Belum ada pengumuman</h3>
                  <p className="mx-auto mt-1 mb-0 max-w-[40ch] text-padat text-teks-samar">
                    Pemberitahuan resmi desa akan muncul di sini. Sementara itu, tanyakan langsung ke kader dusun.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-sedang border border-garis bg-kartu shadow-halus">
                  <ul className="masuk-baris m-0 list-none divide-y divide-garis p-0">
                    {pengumuman.map((p) => (
                      <li
                        key={p.id}
                        className={`grid gap-2 p-5 max-sempit:p-4 sempit:grid-cols-[10rem_1fr] sempit:gap-6 ${
                          p.penting ? 'bg-aksen-amber-tint/70 border-l-4 border-l-kuning-800' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 sempit:flex-col sempit:items-start sempit:gap-1.5">
                          <span className="text-2xs font-bold tracking-[0.06em] text-teks-samar uppercase">
                            {formatRentang(p.tanggal) ?? 'Informasi'}
                          </span>
                          {p.penting && (
                            <span className="inline-flex items-center gap-1 rounded-mikro bg-kuning-100 px-2 py-0.5 text-2xs font-bold text-kuning-800 ring-1 ring-kuning-800/20">
                              <Ikon nama="peringatan" ukuran={12} />
                              Wajib Hadir
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="m-0 text-dasar font-bold text-biru-950">{p.judul}</h3>
                          <p className="m-0 mt-1.5 max-w-[72ch] text-padat leading-relaxed text-teks-redup">{p.isi}</p>
                          {p.kategori && (
                            <span className="mt-2.5 inline-block text-2xs font-semibold tracking-wider text-biru-700 uppercase">
                              Kategori: {p.kategori}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        </section>

        {/* Bagian B: Jadwal & Lokasi Tiap Dusun.
            Satu-satunya bidang gelap penuh di halaman. Sebelumnya semua
            section memakai latar terang dengan selisih luminansi 1.02-1.09,
            jadi enam section terbaca sebagai satu bidang abu-abu. Bidang
            gelap di tengah memberi jeda yang terbaca dari jauh. */}
        <section id="jadwal" aria-labelledby="judul-jadwal" className="scroll-mt-24 border-b border-biru-950 bg-biru-950 py-14 text-kartu max-sempit:py-10">
          <div className="mx-auto max-w-lebar px-4 max-sempit:px-3">
            <div className="mb-6">
                <p className="m-0 mb-2 text-2xs font-bold tracking-[0.12em] text-biru-300 uppercase">
                  Lokasi Pelayanan
                </p>
                <h2 id="judul-jadwal" className="rubrik rubrik-terang">
                  {namaDesa ? `Posyandu Dusun Desa ${namaDesa}` : 'Posyandu Dusun'}
                </h2>
              </div>

              {memuat ? (
                <div className="rounded-sedang border border-white/15 bg-white/5 p-4 text-center text-padat text-biru-100" role="status">
                  <div className="mx-auto mb-2 size-6 animate-spin rounded-full border-2 border-biru-300 border-t-transparent" />
                  Memuat daftar posyandu desa…
                </div>
              ) : daftarPos.length === 0 ? (
                <div className="rounded-sedang border border-white/15 bg-white/5 p-4 text-center">
                  <h3 className="m-0 text-dasar font-bold text-kartu">Belum ada Posyandu terdata</h3>
                  <p className="m-0 mt-1 text-padat text-biru-100">
                    {galat
                      ? 'Daftar Posyandu belum bisa dimuat. Periksa koneksi internet lalu coba lagi.'
                      : 'Data Posyandu dusun akan tampil di sini setelah didaftarkan pusat.'}
                  </p>
                  {galat && (
                    <button
                      type="button"
                      className="mt-4 min-h-11 rounded-kecil border border-white/25 bg-white/10 px-4 text-padat font-semibold text-kartu shadow-none hover:bg-white/15"
                      onClick={() => setPercobaan((n) => n + 1)}
                      disabled={memuat}
                    >
                      {memuat ? 'Mencoba…' : 'Coba lagi'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sempit:grid-cols-2">
                  {daftarPos.map((pos) => {
                    const jadwal = jadwalPerPos.get(pos.id)
                    return (
                    <article
                      key={pos.id}
                      className="masuk-baris flex flex-col justify-between rounded-sedang border border-white/15 bg-white/5 p-4 transition-colors duration-200 ease-ui hover:border-white/30 hover:bg-white/10"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="m-0 text-dasar font-bold tracking-tight text-kartu">
                            {pos.nama}
                          </h3>
                          {jadwal && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-mikro bg-hijau-100 px-2 py-0.5 text-2xs font-bold text-hijau-800">
                              <Ikon nama="centang" ukuran={11} />
                              Terjadwal
                            </span>
                          )}
                        </div>
                        <p className="m-0 mt-1 text-padat text-biru-100">{wilayahPosyandu(pos)}</p>
                      </div>

                      <div className="mt-4 flex items-start gap-2 border-t border-white/10 pt-3">
                        <Ikon nama="waktu" ukuran={15} className="mt-0.5 shrink-0 text-biru-300" />
                        {jadwal ? (
                          <div className="min-w-0">
                            <p className="m-0 text-padat leading-snug font-semibold text-kartu">
                              {jadwal.judul}
                            </p>
                            <p className="m-0 mt-0.5 text-padat tabular-nums text-biru-100">
                              {formatJadwal(jadwal.tanggal)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-padat font-semibold text-biru-100">Jadwal menyusul</span>
                        )}
                      </div>
                    </article>
                    )
                  })}
                </div>
              )}
          </div>
        </section>

        {/* Bagian C: Layanan Rutin Balita (Latar Biru Lembut Seragam Dashboard) */}
        <section id="layanan" aria-labelledby="judul-layanan" className="scroll-mt-24 border-b border-garis bg-biru-50 py-14 max-sempit:py-10">
          <div className="mx-auto max-w-lebar px-4 max-sempit:px-3">
            <div className="mb-5 border-b border-garis pb-3">
              <h2 id="judul-layanan" className="rubrik">
                Layanan Rutin di Posyandu
              </h2>
            </div>

            <ol className="m-0 grid list-none gap-3 p-0 mini:grid-cols-2">
              {layanan.map((lay) => (
                <li
                  key={lay.id ?? lay.judul}
                  className="masuk-baris flex items-start gap-4 rounded-sedang border border-garis bg-kartu p-4 transition-colors duration-200 ease-ui hover:border-biru-600"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-kecil bg-biru-100 text-biru-800" aria-hidden="true">
                    <Ikon nama={lay.ikon} ukuran={20} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="m-0 text-dasar font-bold leading-snug text-biru-950">{lay.judul}</h3>
                    <p className="m-0 mt-1.5 text-padat leading-relaxed text-teks-redup">{lay.deskripsi}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Bagian D: Edukasi & Pencegahan (Latar Putih Bersih) */}
        <section id="edukasi" aria-labelledby="judul-edukasi" className="scroll-mt-24 border-b border-garis bg-kartu py-14 max-sempit:py-10">
          <div className="mx-auto max-w-lebar px-4 max-sempit:px-3">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-garis pb-3">
              <div>
                <h2 id="judul-edukasi" className="rubrik">
                  Edukasi & Pencegahan
                </h2>
              </div>
              <span className="text-2xs font-semibold text-teks-samar">
                {edukasi.length} Modul Rujukan Warga
              </span>
            </div>

            {edukasi.length === 0 ? (
              <p className="m-0 rounded-sedang border border-dashed border-garis-kuat bg-kartu px-5 py-8 text-center text-padat text-teks-samar">
                Belum ada modul edukasi yang tayang.
              </p>
            ) : (
              <div className="grid gap-4 sempit:grid-cols-3">
                {edukasi.map((edu, idx) => (
                  <article
                    key={edu.id ?? edu.judul}
                    className={`masuk-baris flex flex-col rounded-sedang border border-garis bg-kartu p-4 ${
                      idx === 0 ? 'sempit:row-span-2 sempit:bg-biru-50' : ''
                    }`}
                  >
                    <h3
                      className={`m-0 font-bold leading-snug tracking-tight text-biru-950 ${
                        idx === 0 ? 'text-subjudul' : 'mt-0 text-dasar'
                      }`}
                    >
                      {edu.judul}
                    </h3>
                    <p className="m-0 mt-2 line-clamp-4 text-padat leading-relaxed text-teks-redup">
                      {edu.ringkasan}
                    </p>
                    {edu.tautan ? (
                      <a
                        href={edu.tautan}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-auto inline-flex items-center gap-1 border-t border-garis pt-3 text-2xs font-semibold text-biru-700 hover:text-biru-900"
                      >
                        Baca selengkapnya
                        <span aria-hidden="true">↗</span>
                      </a>
                    ) : edu.bacaan ? (
                      <p className="m-0 mt-auto border-t border-garis pt-3 text-2xs leading-snug text-teks-samar">
                        {edu.bacaan}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Bagian E: Kontak & jam layanan. Tidak ada ajakan kedua: jalan
            mendaftar sudah ada di bagian Jadwal, satu tujuan satu tombol. */}
        <section aria-labelledby="judul-kontak" className="border-t border-garis bg-latar py-14 max-sempit:py-10">
          <div className="mx-auto max-w-lebar px-4 max-sempit:px-3">
            <div className="relative overflow-hidden rounded-sedang border border-white/10 bg-[image:var(--latar-kepala-teduh)] p-4 text-kartu shadow-naik max-sempit:p-4 sm:p-9">
              <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-[58ch]">
                  <p className="m-0 flex items-center gap-2 text-2xs font-bold tracking-[0.1em] text-hijau-300 uppercase">
                    <span className="size-1.5 rounded-full bg-hijau-300" aria-hidden="true" />
                    Datang langsung, tanpa daftar daring
                  </p>
                  <h2 id="judul-kontak" className="m-0 mt-3 text-panggung-kecil font-bold tracking-[-0.03em] text-balance text-white">
                    Belum pernah terdata? Cukup bawa Buku KIA dan fotokopi KK.
                  </h2>
                  <p className="m-0 mt-2.5 text-padat leading-relaxed text-pretty text-biru-100/90 sm:text-isi">
                    Pembukaan data balita baru 100% bebas biaya dan dilayani langsung di balai dusun
                    saat hari pelayanan. Tidak perlu mengisi formulir apa pun di situs ini.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs font-medium text-biru-100">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Ikon nama="balita" ukuran={14} className="text-biru-300" />
                      Usia 0-59 Bulan
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Ikon nama="posyandu" ukuran={14} className="text-biru-300" />
                      Tersedia di Seluruh Dusun
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2 text-padat lg:items-end">
                  <span className="text-2xs font-bold tracking-[0.08em] text-biru-200 uppercase">
                    Layanan berikutnya
                  </span>
                  <span className="tabular-nums">
                    {formatJadwal(jadwalTerdekat[0]?.tanggal) ?? 'Lihat papan pengumuman dusun'}
                  </span>
                  <span className="text-biru-100/90">
                    {jadwalTerdekat[0]?.kategori ?? 'Balai dusun masing-masing'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      {/* 4. Footer */}
      <footer className="border-t border-garis bg-kartu">
        {/* Footer selebar halaman, bukan dibatasi 1040px seperti isi:
            pada layar lebar, kontainer sempit membuat teks tengah tampak
            melenceng karena sisa ruang jatuh seluruhnya di kanan. */}
        <div className="mx-auto w-full px-4 py-3 max-sempit:px-3">
          {/* Khusus tampilan HP: Tombol Masuk Petugas ditempatkan di bawah agar lega & nyaman disentuh */}
          <div className="mb-3 flex flex-col gap-2 rounded-sedang border border-garis bg-latar p-4 text-center sempit:hidden">
            <p className="m-0 text-2xs font-semibold text-teks-samar">
              Akses khusus kader posyandu, bidan desa, dan pengurus:
            </p>
            <button
              type="button"
              onClick={keLogin}
              className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-kecil bg-biru-800 px-4 py-2.5 text-padat font-bold text-kartu shadow-kontrol transition-colors hover:bg-biru-900"
            >
              <Ikon nama="masuk" ukuran={16} />
              <span className="whitespace-nowrap">Masuk Petugas / Kader</span>
            </button>
          </div>

          {/* max-w-none wajib: aturan global `p { max-width: 70ch }` di
              gaya.css membatasi lebar kotak paragraf, sehingga teks yang
              rata tengah tetap menempel kiri pada layar lebar. */}
          <p className="m-0 max-w-none text-center text-2xs tracking-[0.01em] text-teks-samar">
            &copy; 2026 KodeNara. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
