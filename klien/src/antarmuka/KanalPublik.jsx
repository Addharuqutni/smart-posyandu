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
    deskripsi: 'Vaksinasi berkala bersama Puskesmas dan Bidan Desa pembina sesuai tahapan usia anak.',
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
    kategori: 'MPASI & Nutrisi',
    judul: 'Kebutuhan Protein Hewani Esensial pada MPASI',
    ringkasan: 'Telur, ikan, ayam, dan daging merah mengandung asam amino kunci penunjang pacu tumbuh dan otak.',
    bacaan: 'Kenalkan sumber hewani sejak balita usia 6 bulan. Hindari hanya mengandalkan karbohidrat atau sayur.',
  },
  {
    kategori: 'Deteksi Dini',
    judul: 'Disiplin Pengukuran Bulanan Deteksi Garis 2T',
    ringkasan: 'Dua kali penimbangan berturut-turut tanpa kenaikan (2T) adalah alarm rujukan segera ke nakes.',
    bacaan: 'Bawa Buku KIA setiap posyandu. Kenaikan berat yang terpantau rutin adalah pelindung stunting terkuat.',
  },
  {
    kategori: 'Sanitasi & Air',
    judul: 'Akses Air Bersih & Pencegahan Diare Berulang',
    ringkasan: 'Infeksi saluran cerna akibat air atau sanitasi kotor menghambat total penyerapan nutrisi anak.',
    bacaan: 'Masak air hingga matang sempurna dan biasakan cuci tangan pakai sabun sebelum menyuapi balita.',
  },
]

function gerakTenang() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function keBagian(id) {
  const sasaran = document.getElementById(id)
  if (!sasaran) return
  sasaran.scrollIntoView({ behavior: gerakTenang() ? 'auto' : 'smooth', block: 'start' })
}

function gulirKeAtas() {
  window.scrollTo({ top: 0, behavior: gerakTenang() ? 'auto' : 'smooth' })
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
  const pengumuman = daftarKonten.filter((k) => k.jenis === 'pengumuman')
  const layanan = adaKonten('layanan')
    ? daftarKonten.filter((k) => k.jenis === 'layanan').map((k) => ({
        ikon: 'cek',
        judul: k.judul,
        deskripsi: k.isi,
      }))
    : LAYANAN_POSYANDU
  const edukasi = adaKonten('edukasi')
    ? daftarKonten.filter((k) => k.jenis === 'edukasi').map((k) => ({
        kategori: k.kategori || 'Kesehatan',
        judul: k.judul,
        ringkasan: k.sumber_url ? `${k.isi.slice(0, 240).trimEnd()}…` : k.isi,
        tautan: k.sumber_url || null,
        bacaan: !k.sumber_url && k.tanggal
          ? `Catatan: ${formatRentang(k.tanggal)}`
          : k.sumber_url ? null : 'Konsultasikan lebih lanjut dengan Bidan Desa atau kader posyandu.',
      }))
    : EDUKASI_KESEHATAN

  const hariIni = tanggalHariIni()
  const jadwalTerdekat = jadwalMendatang(daftarKonten, hariIni).slice(0, 3)
  const jadwalPerPos = jadwalPerPosyandu(daftarKonten, hariIni)
  const namaDesa = daftarPos.find((p) => p.desa)?.desa ?? null

  return (
    <div className="editorial min-h-dvh bg-latar text-teks font-sans antialiased selection:bg-biru-100 selection:text-biru-950">
      {/* 1. Bilah Kepala Publik */}
      <header className="sticky top-0 z-30 border-b border-white/15 bg-[linear-gradient(100deg,rgb(13_40_71_/_0.88)_0%,rgb(15_61_104_/_0.85)_62%,rgb(11_79_70_/_0.88)_100%)] text-kartu shadow-kontrol backdrop-blur-md [padding-top:env(safe-area-inset-top)]">
        <a
          href="#judul-utama"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-kecil focus:bg-kartu focus:px-4 focus:py-2.5 focus:text-padat focus:font-bold focus:text-biru-950 focus:shadow-timbul"
        >
          Langsung ke isi utama
        </a>
        <div className="mx-auto flex min-h-16 max-w-lebar items-center justify-between gap-4 px-2 py-2 max-sempit:min-h-[58px] max-sempit:px-1.5">
          <a
            href="/"
            className="group flex min-h-11 items-center gap-3 rounded-kecil text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={(e) => {
              e.preventDefault()
              gulirKeAtas()
            }}
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-kecil bg-white/12 p-1 ring-1 ring-white/20 transition-colors duration-200 ease-ui group-hover:bg-white/20">
              <img
                className="size-full object-contain [filter:drop-shadow(0_2px_4px_rgb(0_0_0/0.3))]"
                src="/logo-192.png"
                alt="Logo Smart Posyandu"
                width="36"
                height="36"
                fetchPriority="high"
                decoding="async"
              />
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

          {/* Tombol Masuk Petugas: Desktop & Tablet */}
          <button
            type="button"
            onClick={keLogin}
            className="group hidden min-h-[40px] shrink-0 cursor-pointer items-center gap-2 rounded-kecil border border-white/25 bg-white/12 px-3.5 py-1.5 text-padat font-semibold text-white shadow-halus backdrop-blur-sm transition-colors duration-200 ease-ui hover:border-white/40 hover:bg-white/20 active:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sempit:inline-flex"
          >
            <span className="grid size-5 place-items-center rounded-mikro bg-white/15 text-white transition-colors duration-200 ease-ui group-hover:bg-white/25">
              <Ikon nama="masuk" ukuran={13} />
            </span>
            <span className="tracking-[0.01em] whitespace-nowrap">Masuk Petugas</span>
          </button>
        </div>
      </header>

      <main id="isi-utama">
        {/* 2. Hero: Asimetris, teks di kiri, papan jadwal terdekat di kanan */}
        <section className="relative overflow-hidden border-b border-garis bg-biru-50 bg-[radial-gradient(circle_at_84%_22%,rgb(45_212_191_/_0.22),transparent_48%),radial-gradient(circle_at_12%_86%,rgb(26_109_168_/_0.16),transparent_46%)]">
          <div className="relative mx-auto grid max-w-lebar gap-10 px-2 pt-10 pb-12 max-sempit:px-1.5 max-sempit:pt-7 max-sempit:pb-10 lg:grid-cols-12 lg:items-center lg:gap-12 lg:pt-16 lg:pb-20">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-kecil border border-white/80 bg-white/70 px-3 py-1 text-2xs font-bold tracking-[0.08em] text-biru-800 uppercase backdrop-blur-md">
                <span className="size-2 rounded-full bg-teal-600" aria-hidden="true" />
                <span>Pelayanan Kesehatan Balita Terpadu</span>
              </div>

              <h1
                id="judul-utama"
                tabIndex={-1}
                className="m-0 mt-4 text-panggung font-semibold tracking-[-0.02em] text-balance text-biru-950 focus:outline-none"
              >
                {namaDesa
                  ? `Posyandu Desa ${namaDesa}: jadwal, layanan balita, dan edukasi gizi.`
                  : 'Data tumbuh kembang rapi, balita sehat bebas stunting.'}
              </h1>

              <p className="m-0 mt-4 max-w-[54ch] text-dasar leading-relaxed text-pretty text-teks-redup">
                {namaDesa
                  ? `Akses resmi warga Desa ${namaDesa} untuk jadwal penimbangan tiap dusun, imunisasi dasar, vitamin, serta konsultasi gizi langsung dengan Bidan Desa dan kader.`
                  : 'Akses resmi warga untuk jadwal penimbangan tiap dusun, imunisasi dasar, vitamin, serta konsultasi gizi langsung dengan Bidan Desa dan kader.'}
              </p>

              <div className="mt-7 flex flex-col gap-3 mini:flex-row mini:items-center">
                <button
                  type="button"
                  onClick={() => keBagian('jadwal')}
                  className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2.5 rounded-kecil bg-biru-800 px-6 font-bold text-white shadow-kontrol-naik transition-colors duration-150 ease-ui hover:bg-biru-900 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-biru-800"
                >
                  <Ikon nama="posyandu" ukuran={18} />
                  <span>Lihat Jadwal Posyandu</span>
                </button>
                <button
                  type="button"
                  onClick={() => keBagian('edukasi')}
                  className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2.5 rounded-kecil border border-white/80 bg-white/70 px-6 font-semibold text-biru-950 backdrop-blur-md transition-colors duration-150 ease-ui hover:border-biru-600 hover:bg-white/90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-biru-800"
                >
                  <Ikon nama="anak" ukuran={18} />
                  <span>Panduan Gizi Balita</span>
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

            {/* Papan Jadwal Terdekat */}
            <div className="lg:col-span-5">
              <article
                className="relative overflow-hidden rounded-besar border border-white/80 bg-white/72 shadow-naik backdrop-blur-lg"
                aria-labelledby="judul-jadwal-terdekat"
                aria-busy={memuat}
              >
                <header className="flex items-center justify-between gap-3 border-b border-white/15 bg-biru-950/92 px-5 py-3.5 text-white backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <Ikon nama="waktu" ukuran={16} className="text-biru-300" />
                    <h2
                      id="judul-jadwal-terdekat"
                      className="m-0 text-2xs font-bold tracking-[0.1em] text-white uppercase"
                    >
                      Jadwal Terdekat
                    </h2>
                  </div>
                  <span className="rounded-mikro bg-white/10 px-2 py-0.5 text-2xs font-semibold text-biru-100">
                    {jadwalTerdekat.length > 0 ? `${jadwalTerdekat.length} kegiatan` : 'Kalender Desa'}
                  </span>
                </header>

                {jadwalTerdekat.length > 0 ? (
                  <ol role="list" className="m-0 list-none divide-y divide-garis p-0">
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
                          <div
                            className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-kecil border tabular-nums ${
                              i === 0
                                ? 'border-biru-800 bg-biru-800 text-white'
                                : 'border-garis bg-kartu text-biru-800'
                            }`}
                          >
                            <span className="text-subjudul leading-none font-bold">
                              {blok?.hari ?? '-'}
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
                                  <span>{j.kategori}</span>
                                </>
                              )}
                            </p>
                          </div>

                          {i === 0 && (
                            <span className="shrink-0 rounded-mikro bg-hijau-100 px-2 py-0.5 text-2xs font-bold text-hijau-800">
                              Terdekat
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <div className="p-6 text-center">
                    <span className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-biru-50 text-biru-700" aria-hidden="true">
                      <Ikon nama="waktu" ukuran={20} />
                    </span>
                    <p className="m-0 text-padat leading-relaxed text-teks-redup">
                      {memuat
                        ? 'Memuat jadwal terdekat…'
                        : galat
                          ? 'Jadwal belum bisa dimuat. Lihat papan pengumuman dusun atau tanya kader.'
                          : 'Belum ada jadwal yang tayang. Jadwal baru muncul setelah disetujui petugas kesehatan.'}
                    </p>
                  </div>
                )}

                <footer className="flex items-center gap-2 border-t border-white/60 bg-white/45 px-5 py-3 text-2xs leading-relaxed text-teks-redup backdrop-blur-sm">
                  <Ikon nama="info" ukuran={14} className="shrink-0 text-biru-700" />
                  <span>Bawa Buku KIA dan fotokopi KK saat datang ke lokasi pelayanan.</span>
                </footer>
              </article>
            </div>
          </div>
        </section>

        {/* Bagian A: Pengumuman & Agenda Desa */}
        <section
          id="pengumuman"
          aria-labelledby="judul-pengumuman"
          aria-busy={memuat}
          className="scroll-mt-20 border-b border-garis bg-kartu bg-[radial-gradient(circle_at_90%_14%,rgb(226_238_248_/_0.8),transparent_48%)] py-14 max-sempit:py-10"
        >
          <div className="mx-auto max-w-lebar px-2 max-sempit:px-1.5">
            <div className="mb-6 flex items-end justify-between border-b border-garis pb-3">
              <h2 id="judul-pengumuman" className="rubrik m-0">
                Pengumuman Desa
              </h2>
              {!memuat && !galat && pengumuman.length > 0 && (
                <span className="text-2xs font-semibold text-teks-samar">
                  {pengumuman.length} Pemberitahuan
                </span>
              )}
            </div>

            {galat ? (
              <div className="rounded-sedang border border-merah-200/80 bg-merah-50/75 p-5 backdrop-blur-md" role="alert">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-merah-100 text-merah-700" aria-hidden="true">
                    <Ikon nama="peringatan" ukuran={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-dasar font-bold text-merah-900">Kendala Memuat Pengumuman</h3>
                    <p className="m-0 mt-1 text-padat leading-relaxed text-merah-800">{galat}</p>
                    <button
                      type="button"
                      className="mt-3.5 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-kecil border border-merah-300 bg-kartu px-4 py-1.5 text-padat font-bold text-merah-800 transition-colors hover:bg-merah-50 active:bg-merah-100"
                      onClick={() => setPercobaan((n) => n + 1)}
                      disabled={memuat}
                    >
                      <Ikon nama="sinkron" ukuran={14} />
                      <span>{memuat ? 'Mencoba…' : 'Coba Muat Ulang'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : memuat ? (
              <div className="rounded-sedang border border-dashed border-garis-kuat bg-latar/75 px-5 py-10 text-center backdrop-blur-sm" role="progressbar" aria-label="Memuat pengumuman desa">
                <div className="mx-auto mb-3 size-7 rounded-full border-2 border-biru-700 border-t-transparent motion-safe:animate-spin" aria-hidden="true" />
                <p className="m-0 text-padat font-medium text-teks-samar">Memuat pengumuman desa…</p>
              </div>
            ) : pengumuman.length === 0 ? (
              <div className="rounded-sedang border border-dashed border-garis-kuat bg-latar/75 px-6 py-10 text-center backdrop-blur-sm">
                <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-biru-100/70 text-biru-800" aria-hidden="true">
                  <Ikon nama="info" ukuran={22} />
                </span>
                <h3 className="m-0 text-dasar font-bold text-biru-950">Tidak Ada Pengumuman Khusus</h3>
                <p className="mx-auto mt-1.5 mb-0 max-w-[48ch] text-padat leading-relaxed text-teks-redup">
                  Pelayanan posyandu berlangsung rutin sesuai jadwal bulanan. Apabila ada perubahan waktu atau tempat, pemberitahuan resmi desa akan terbit di sini.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-sedang border border-biru-200/70 bg-white/75 backdrop-blur-md">
                <ul role="list" className="m-0 list-none divide-y divide-garis p-0">
                  {pengumuman.map((p) => (
                    <li
                      key={p.id}
                      className={`grid gap-2 p-5 max-sempit:p-4 sempit:grid-cols-[11rem_1fr] sempit:gap-6 ${
                        p.penting ? 'bg-aksen-amber-tint/70' : 'hover:bg-latar/50 transition-colors duration-150 ease-ui'
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

        {/* Bagian B: Jadwal & Lokasi Tiap Dusun (Bidang Gelap) */}
        <section
          id="jadwal"
          aria-labelledby="judul-jadwal"
          aria-busy={memuat}
          className="scroll-mt-20 border-b border-biru-950 bg-biru-950 bg-[radial-gradient(circle_at_16%_20%,rgb(45_212_191_/_0.18),transparent_46%),radial-gradient(circle_at_86%_82%,rgb(26_109_168_/_0.26),transparent_50%)] py-14 text-white max-sempit:py-10"
        >
          <div className="mx-auto max-w-lebar px-2 max-sempit:px-1.5">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
              <h2 id="judul-jadwal" className="rubrik rubrik-terang m-0 text-white">
                {namaDesa ? `Posyandu Dusun Desa ${namaDesa}` : 'Posyandu Dusun'}
              </h2>
              <p className="m-0 text-2xs text-biru-200">
                Jadwal resmi terverifikasi petugas kesehatan desa
              </p>
            </div>

            {memuat ? (
              <div className="rounded-sedang border border-white/20 bg-white/8 p-8 text-center text-padat text-biru-100 backdrop-blur-md" role="progressbar" aria-label="Memuat daftar posyandu desa">
                <div className="mx-auto mb-3 size-7 rounded-full border-2 border-biru-300 border-t-transparent motion-safe:animate-spin" aria-hidden="true" />
                Memuat daftar posyandu desa…
              </div>
            ) : galat ? (
              <div className="rounded-sedang border border-white/20 bg-white/8 p-6 text-center backdrop-blur-md" role="alert">
                <h3 className="m-0 text-dasar font-bold text-white">Jadwal Belum Dapat Dimuat</h3>
                <p className="mx-auto mt-2 mb-0 max-w-[46ch] text-padat text-biru-100">
                  Sambungan ke pangkalan data terputus. Silakan coba kembali atau hubungi kader posyandu dusun setempat.
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-kecil border border-white/30 bg-white/10 px-5 text-padat font-semibold text-white shadow-none transition-colors hover:bg-white/20 active:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
                  onClick={() => setPercobaan((n) => n + 1)}
                  disabled={memuat}
                >
                  <Ikon nama="sinkron" ukuran={14} />
                  <span>{memuat ? 'Mencoba…' : 'Coba Lagi'}</span>
                </button>
              </div>
            ) : daftarPos.length === 0 ? (
              <div className="rounded-sedang border border-white/20 bg-white/8 p-6 text-center backdrop-blur-md">
                <h3 className="m-0 text-dasar font-bold text-white">Belum Ada Posyandu Terdata</h3>
                <p className="mx-auto mt-2 mb-0 max-w-[46ch] text-padat text-biru-100">
                  Data posyandu dusun akan tampil di sini setelah didaftarkan oleh admin desa.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {daftarPos.map((pos) => {
                  const jadwal = jadwalPerPos.get(pos.id)
                  return (
                    <article
                      key={pos.id}
                      className="flex flex-col justify-between rounded-sedang border border-white/20 bg-white/8 p-5 backdrop-blur-md transition-colors duration-200 ease-ui hover:border-white/35 hover:bg-white/14"
                    >
                      <header>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="m-0 text-dasar font-bold tracking-tight text-white">
                            {pos.nama}
                          </h3>
                          {jadwal ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-mikro bg-hijau-100 px-2 py-0.5 text-2xs font-bold text-hijau-800">
                              <Ikon nama="centang" ukuran={11} />
                              Terjadwal
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center rounded-mikro bg-white/10 px-2 py-0.5 text-2xs font-medium text-biru-200">
                              Menyusul
                            </span>
                          )}
                        </div>
                        <p className="m-0 mt-1 text-padat text-biru-200">{wilayahPosyandu(pos)}</p>
                      </header>

                      <div className="mt-4 flex items-start gap-2.5 border-t border-white/10 pt-3.5">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-mikro bg-white/10 text-biru-300" aria-hidden="true">
                          <Ikon nama="waktu" ukuran={14} />
                        </span>
                        {jadwal ? (
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-padat leading-snug font-semibold text-white">
                              {jadwal.judul}
                            </p>
                            <p className="m-0 mt-0.5 text-padat tabular-nums text-biru-100">
                              {formatJadwal(jadwal.tanggal)}
                            </p>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-padat font-medium text-biru-200">Jadwal bulan ini belum diumumkan</p>
                            <p className="m-0 text-2xs text-biru-300/80">Konfirmasi langsung ke kader RW setempat</p>
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* Bagian C: Layanan Rutin Balita */}
        <section
          id="layanan"
          aria-labelledby="judul-layanan"
          className="scroll-mt-20 border-b border-garis bg-biru-50 bg-[radial-gradient(circle_at_82%_18%,rgb(45_212_191_/_0.15),transparent_46%),radial-gradient(circle_at_14%_82%,rgb(26_109_168_/_0.12),transparent_46%)] py-14 max-sempit:py-10"
        >
          <div className="mx-auto max-w-lebar px-2 max-sempit:px-1.5">
            <div className="mb-6 border-b border-garis pb-3">
              <h2 id="judul-layanan" className="rubrik m-0">
                Layanan Rutin di Posyandu
              </h2>
              <p className="m-0 mt-2 max-w-[62ch] text-padat leading-relaxed text-teks-redup">
                Seluruh balita usia 0-59 bulan berhak mendapatkan paket lengkap pemantauan pertumbuhan dan perlindungan kesehatan secara berkala tanpa dipungut biaya.
              </p>
            </div>

            <ol role="list" className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {layanan.map((lay) => (
                <li
                  key={lay.id ?? lay.judul}
                  className="flex flex-col justify-between rounded-sedang border border-white/80 bg-white/70 p-5 backdrop-blur-md transition-colors duration-180 ease-ui hover:border-biru-300 hover:bg-white/90"
                >
                  <div>
                    <span className="mb-3 grid size-11 place-items-center rounded-kecil border border-biru-200/70 bg-biru-100/80 text-biru-800 backdrop-blur-sm" aria-hidden="true">
                      <Ikon nama={lay.ikon} ukuran={20} />
                    </span>
                    <h3 className="m-0 text-dasar font-bold leading-snug text-biru-950">{lay.judul}</h3>
                    <p className="m-0 mt-2 text-padat leading-relaxed text-teks-redup">{lay.deskripsi}</p>
                  </div>
                  <div className="mt-4 border-t border-garis pt-3">
                    <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-biru-700">
                      <Ikon nama="centang" ukuran={13} className="text-hijau-700" />
                      <span>Standar Kemenkes</span>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Bagian D: Edukasi & Pencegahan */}
        <section
          id="edukasi"
          aria-labelledby="judul-edukasi"
          className="scroll-mt-20 border-b border-garis bg-kartu bg-[radial-gradient(circle_at_12%_28%,rgb(226_238_248_/_0.75),transparent_48%),radial-gradient(circle_at_88%_76%,rgb(230_246_243_/_0.75),transparent_48%)] py-14 max-sempit:py-10"
        >
          <div className="mx-auto max-w-lebar px-2 max-sempit:px-1.5">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-garis pb-3">
              <h2 id="judul-edukasi" className="rubrik m-0">
                Edukasi &amp; Pencegahan
              </h2>
              <span className="rounded-mikro border border-biru-200 bg-biru-50 px-2.5 py-1 text-2xs font-bold text-biru-800">
                {edukasi.length} Modul Rujukan Warga
              </span>
            </div>

            {edukasi.length === 0 ? (
              <div className="rounded-sedang border border-dashed border-garis-kuat bg-latar px-5 py-8 text-center text-padat text-teks-samar">
                Belum ada modul edukasi yang tayang.
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-3">
                {edukasi.map((edu) => (
                  <article
                    key={edu.id ?? edu.judul}
                    className="flex flex-col justify-between rounded-sedang border border-biru-200/60 bg-white/72 p-5 backdrop-blur-md transition-colors duration-180 ease-ui hover:border-biru-500/60 hover:bg-white/90"
                  >
                    <header>
                      {edu.kategori && (
                        <span className="mb-2.5 inline-block rounded-mikro bg-aksen-biru-tint px-2 py-0.5 text-2xs font-bold tracking-wide text-aksen-biru-ink uppercase">
                          {edu.kategori}
                        </span>
                      )}
                      <h3 className="m-0 text-dasar font-bold leading-snug tracking-tight text-biru-950">
                        {edu.judul}
                      </h3>
                    </header>
                    <p className="m-0 mt-2.5 flex-1 text-padat leading-relaxed text-teks-redup">
                      {edu.ringkasan}
                    </p>
                    {edu.tautan ? (
                      <footer className="mt-4 border-t border-garis pt-3">
                        <a
                          href={edu.tautan}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-2xs font-bold text-biru-700 no-underline hover:text-biru-900"
                        >
                          <span>
                            Baca selengkapnya di sumber resmi
                            <span className="sr-only"> tentang {edu.judul} (buka di tab baru)</span>
                          </span>
                          <span aria-hidden="true">↗</span>
                        </a>
                      </footer>
                    ) : edu.bacaan ? (
                      <footer className="mt-4 border-t border-garis pt-3">
                        <p className="m-0 text-2xs leading-snug text-teks-samar">
                          {edu.bacaan}
                        </p>
                      </footer>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Bagian E: Alur Warga & Panduan Buku KIA */}
        <section
          id="alur"
          aria-labelledby="judul-kontak"
          className="scroll-mt-20 border-b border-garis bg-latar py-14 max-sempit:py-10"
        >
          <div className="mx-auto max-w-lebar px-2 max-sempit:px-1.5">
            <div className="relative overflow-hidden rounded-besar border border-white/15 bg-[image:var(--latar-kepala-teduh)] p-6 text-white shadow-naik sm:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_16%,rgb(45_212_191_/_0.24),transparent_48%)]" aria-hidden="true" />
              <div className="relative z-10 grid gap-8 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-7">
                  <h2 id="judul-kontak" className="m-0 text-panggung-kecil font-bold tracking-[-0.03em] text-balance text-white">
                    Belum pernah terdata? Cukup bawa Buku KIA dan fotokopi KK.
                  </h2>
                  <p className="m-0 mt-3.5 max-w-[52ch] text-padat leading-relaxed text-pretty text-biru-100/90 sm:text-isi">
                    Pembukaan data balita baru 100% bebas biaya dan dilayani langsung di balai dusun
                    saat hari pelayanan. Tidak perlu mendaftar daring atau mengisi formulir awal.
                  </p>

                  <ol role="list" className="m-0 mt-7 flex list-none flex-wrap items-center gap-x-7 gap-y-3 border-t border-white/15 p-0 pt-5 text-padat text-biru-100">
                    <li className="flex items-center gap-2.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-white/25 bg-white/12 text-2xs font-bold text-white" aria-hidden="true">1</span>
                      <span className="font-medium text-white">Cek jadwal dusun</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-white/25 bg-white/12 text-2xs font-bold text-white" aria-hidden="true">2</span>
                      <span className="font-medium text-white">Bawa Buku KIA &amp; KK</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-hijau-300/40 bg-hijau-300/20 text-2xs font-bold text-hijau-300" aria-hidden="true">3</span>
                      <span className="font-medium text-white">Datang tanpa biaya</span>
                    </li>
                  </ol>
                </div>

                <div className="lg:col-span-4 lg:col-start-9">
                  <div className="rounded-sedang border border-white/25 bg-white/12 p-6 backdrop-blur-lg">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-hijau-300" aria-hidden="true" />
                      <span className="text-2xs font-bold tracking-[0.08em] text-biru-200 uppercase">
                        Kegiatan Terdekat
                      </span>
                    </div>
                    <p className="m-0 mt-3 text-subjudul font-bold leading-snug text-white tabular-nums">
                      {formatJadwal(jadwalTerdekat[0]?.tanggal) ?? 'Lihat papan pengumuman dusun'}
                    </p>
                    <p className="m-0 mt-1 text-padat text-biru-100">
                      {jadwalTerdekat[0]?.kategori ?? 'Balai dusun masing-masing'}
                    </p>
                    <button
                      type="button"
                      onClick={() => keBagian('jadwal')}
                      className="mt-5 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-kecil bg-white px-4 py-2 text-padat font-bold text-biru-950 transition-colors hover:bg-biru-50"
                    >
                      <Ikon nama="posyandu" ukuran={16} />
                      <span>Buka Daftar Posyandu</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 4. Kaki Halaman (Footer) */}
      <footer className="border-t border-garis bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-lebar px-2 py-10 max-sempit:px-1.5 max-sempit:py-8">
          {/* Akses Petugas Khusus Tampilan Ponsel */}
          <div className="mb-8 flex flex-col gap-2 rounded-sedang border border-biru-200/70 bg-biru-50/60 p-4 text-center backdrop-blur-sm sempit:hidden">
            <p className="m-0 text-2xs font-semibold text-teks-samar">
              Akses khusus kader posyandu, bidan desa, dan pengurus:
            </p>
            <button
              type="button"
              onClick={keLogin}
              className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-kecil bg-biru-800 px-4 py-2.5 text-padat font-bold text-white shadow-kontrol transition-colors hover:bg-biru-900"
            >
              <Ikon nama="masuk" ukuran={16} />
              <span className="whitespace-nowrap">Masuk Petugas / Kader</span>
            </button>
          </div>

          {/* Baris Informasi Portal Footer */}
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="flex items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-kecil bg-biru-800 p-1 text-white" aria-hidden="true">
                  <img
                    className="size-full object-contain"
                    src="/logo-192.png"
                    alt=""
                    width="36"
                    height="36"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div>
                  <span className="block text-tombol font-bold text-biru-950">
                    Smart Posyandu
                  </span>
                  <span className="block text-2xs font-medium text-teks-samar">
                    {namaDesa ? `Pemerintah Desa ${namaDesa}` : 'Kanal Informasi Warga'}
                  </span>
                </div>
              </div>
              <p className="m-0 mt-3 max-w-[42ch] text-padat leading-relaxed text-teks-redup">
                Sistem pemantauan status gizi balita, jadwal pelayanan terpadu tiap dusun, dan pencegahan stunting berbasis komunitas desa.
              </p>
            </div>

            <div className="lg:col-span-4">
              <span className="text-2xs font-bold tracking-[0.08em] text-teks-samar uppercase">
                Navigasi Cepat
              </span>
              <ul role="list" className="m-0 mt-3 list-none space-y-2 p-0 text-padat">
                <li>
                  <a
                    href="#jadwal"
                    onClick={(e) => {
                      e.preventDefault()
                      keBagian('jadwal')
                    }}
                    className="block cursor-pointer text-teks-redup no-underline transition-colors hover:text-biru-800"
                  >
                    Jadwal &amp; Lokasi Dusun
                  </a>
                </li>
                <li>
                  <a
                    href="#pengumuman"
                    onClick={(e) => {
                      e.preventDefault()
                      keBagian('pengumuman')
                    }}
                    className="block cursor-pointer text-teks-redup no-underline transition-colors hover:text-biru-800"
                  >
                    Pengumuman Desa
                  </a>
                </li>
                <li>
                  <a
                    href="#layanan"
                    onClick={(e) => {
                      e.preventDefault()
                      keBagian('layanan')
                    }}
                    className="block cursor-pointer text-teks-redup no-underline transition-colors hover:text-biru-800"
                  >
                    Paket Layanan Rutin
                  </a>
                </li>
                <li>
                  <a
                    href="#edukasi"
                    onClick={(e) => {
                      e.preventDefault()
                      keBagian('edukasi')
                    }}
                    className="block cursor-pointer text-teks-redup no-underline transition-colors hover:text-biru-800"
                  >
                    Panduan Gizi Balita
                  </a>
                </li>
                <li>
                  <a
                    href="#alur"
                    onClick={(e) => {
                      e.preventDefault()
                      keBagian('alur')
                    }}
                    className="block cursor-pointer text-teks-redup no-underline transition-colors hover:text-biru-800"
                  >
                    Alur Datang ke Posyandu
                  </a>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-3">
              <span className="text-2xs font-bold tracking-[0.08em] text-teks-samar uppercase">
                Akses Petugas
              </span>
              <p className="m-0 mt-3 text-padat leading-relaxed text-teks-redup">
                Khusus kader pencatat, bidan desa, dan tenaga medis puskesmas.
              </p>
              <button
                type="button"
                onClick={keLogin}
                className="mt-3.5 inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-kecil border border-garis bg-kartu px-4 py-2 text-padat font-semibold text-biru-950 shadow-kontrol transition-colors hover:border-biru-600 hover:bg-biru-50"
              >
                <Ikon nama="masuk" ukuran={14} className="text-biru-700" />
                <span>Buka Pintu Masuk</span>
              </button>
            </div>
          </div>

          {/* Garis Hak Cipta */}
          <div className="mt-8 border-t border-garis pt-6 text-center text-2xs text-teks-samar">
            <p className="m-0 max-w-none">
              &copy; 2026 KodeNara. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
