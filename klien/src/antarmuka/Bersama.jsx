import { useEffect, useId, useRef } from 'react'
import Ikon from './Ikon.jsx'
import Bantuan from './Bantuan.jsx'

/**
 * Potongan antarmuka yang dipakai lintas layar. Sebelumnya tiap layar
 * mengarang versinya sendiri (kotak kosong, pencarian, paginasi, dialog),
 * sehingga perilakunya menyimpang: satu pencarian punya tombol bersih,
 * yang lain tidak; satu dialog bisa ditutup Escape, yang lain tidak.
 */

/**
 * Kerangka satu layar kerja: kontainer, padding, dan `<main>`.
 *
 * Sebelumnya tiga belas layar menyalin string kontainer 200 karakter yang
 * sama persis. Akibatnya `id="isi-utama"` (target tautan "Lewati ke isi")
 * hidup di empat belas tempat, dan setiap perubahan tinggi nav bawah harus
 * disunting tiga belas kali.
 */
export function Layar({ children, kelas = '' }) {
  return (
    <main
      id="isi-utama"
      className={`masuk-pudar mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))] ${kelas}`}
    >
      {children}
    </main>
  )
}

/** Keadaan kosong: satu bentuk untuk semua layar. */
export function Kosong({ ikon = 'info', judul, teks, aksi }) {
  return (
    <div className="mb-4 rounded-sedang border border-dashed border-garis-kuat bg-kartu px-5 py-7 text-center">
      <div className="mx-auto mb-3 grid size-[52px] place-items-center rounded-sedang bg-biru-100 text-biru-700">
        <Ikon nama={ikon} ukuran={26} />
      </div>
      <h2 className="mb-1.5 text-dasar font-bold text-teks">{judul}</h2>
      {teks && <p className="mx-auto mb-4 max-w-[34ch] text-isi text-teks-redup">{teks}</p>}
      {aksi}
    </div>
  )
}


const WARNA_PETAK = {
  biru: 'bg-aksen-biru-tint text-aksen-biru-ink',
  hijau: 'bg-aksen-hijau-tint text-aksen-hijau-ink',
  teal: 'bg-aksen-teal-tint text-aksen-teal-ink',
  amber: 'bg-aksen-amber-tint text-aksen-amber-ink',
  slate: 'bg-aksen-slate-tint text-aksen-slate-ink',
  rose: 'bg-aksen-rose-tint text-aksen-rose-ink',
}

/**
 * Petak angka: ikon berwarna, angka besar, label di bawahnya.
 * `utama` membuat petak mengambil dua kolom dan dua baris, dengan angka
 * seukuran judul halaman. Satu petak utama per baris: hierarki dibaca dari
 * ukuran sebelum angkanya dibaca. `nilai` boleh simpul React (mis. lencana).
 */
export function Petak({ ikon, warna = 'biru', nilai, satuan, label, bantuan, utama = false }) {
  return (
    <div
      className={`flex flex-col rounded-sedang border border-garis bg-kartu ${utama ? 'col-span-2 row-span-2 px-4 py-3.5' : 'px-3.5 py-3'}`}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <span className={`grid shrink-0 place-items-center rounded-kecil ${utama ? 'size-9' : 'size-8'} ${WARNA_PETAK[warna] ?? WARNA_PETAK.biru}`}>
          <Ikon nama={ikon} ukuran={utama ? 18 : 16} />
        </span>
        {bantuan && <Bantuan ukuran={15} {...bantuan} />}
      </div>
      <div className="mt-auto flex flex-col-reverse">
        <div className={`mt-1 leading-tight font-semibold text-teks-redup ${utama ? 'text-padat' : 'text-padat'}`}>{label}</div>
        <div
          className={`flex items-baseline gap-0.5 leading-none font-bold tracking-[-0.02em] tabular-nums text-biru-950 ${
            utama ? 'text-[2.1rem]' : 'text-[1.6rem]'
          }`}
        >
          {nilai}
          {satuan && <span className="text-padat font-semibold tracking-normal text-teks-redup">{satuan}</span>}
        </div>
        {utama && <div className="mt-1.5 text-2xs leading-snug text-teks-samar">Angka utama bulan ini</div>}
      </div>
    </div>
  )
}

/**
 * Baris petak angka dengan satu petak utama.
 *
 * Sebelumnya semua petak sama besar, sehingga lima angka terbaca setara
 * padahal yang dibaca admin desa selalu satu: jumlah kunjungan. Petak
 * pertama kini mengambil span 2x2; sisanya mengalir di sebelahnya.
 * Kelas ditulis utuh karena Tailwind memindai teks sumber, bukan nilai
 * variabel.
 */
export function BarisPetak({ jumlah, children, label }) {
  const kolom = jumlah === 2 ? 'grid-cols-2' : jumlah === 3 ? 'grid-cols-3' : 'grid-cols-4'
  return (
    <dl className={`mb-4 grid auto-rows-min grid-flow-row-dense gap-2.5 ${kolom} max-sempit:grid-cols-2`} aria-label={label}>
      {children}
    </dl>
  )
}

/** Kotak pencarian dengan tombol bersih; label selalu terbaca pembaca layar. */
export function KotakCari({
  id,
  nilai,
  onUbah,
  label = 'Cari nama balita',
  placeholder = 'Cari nama balita…',
   labelTampil = false,
  className = 'mb-4',
 }) {
   return (
    <div className={`relative ${className}`}>
      <label className={labelTampil ? 'mb-1.5 text-padat font-semibold text-teks-redup' : 'sr-only'} htmlFor={id}>
        {label}
      </label>
      <Ikon nama="cari" ukuran={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-teks-samar" />
      <input
        id={id}
        type="search"
        value={nilai}
        onChange={(e) => onUbah(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-12 rounded-kecil border-garis-kuat bg-kartu pr-12 pl-[2.65rem] shadow-kontrol"
      />
      {nilai && (
        <button
          type="button"
          className="absolute top-1/2 right-2 size-12 -translate-y-1/2 rounded-kecil bg-transparent p-0 text-teks-samar hover:bg-latar"
          onClick={() => onUbah('')}
          aria-label="Hapus pencarian"
        >
          <Ikon nama="tutup" ukuran={18} />
        </button>
      )}
    </div>
  )
}

/** Ukuran halaman daftar yang dimuat dari server. Satu angka untuk semua layar. */
export const UKURAN_HALAMAN = 50

/** Kendali halaman ‹ › yang sama di Beranda, Kelola Balita, dan Perangkat. */
export function KendaliHalaman({ halaman, total, ukuran = UKURAN_HALAMAN, onPilih, nonaktif, keterangan }) {
  const jumlahHalaman = Math.max(1, Math.ceil(total / ukuran))
  if (jumlahHalaman <= 1) return null
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-padat text-teks-samar">{keterangan ?? `Halaman ${halaman + 1} dari ${jumlahHalaman}`}</span>
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="sekunder"
          onClick={() => onPilih(halaman - 1)}
          disabled={nonaktif || halaman === 0}
        >
          ‹ Sebelumnya
        </button>
        <button
          type="button"
          className="sekunder"
          onClick={() => onPilih(halaman + 1)}
          disabled={nonaktif || halaman + 1 >= jumlahHalaman}
        >
          Berikutnya ›
        </button>
      </span>
    </div>
  )
}

const TERFOKUS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Dialog modal: fokus awal masuk, Tab berputar di dalam, Escape menutup,
 * fokus kembali ke tombol pemicu. Tanpa ini `aria-modal` hanya menipu
 * pembaca layar, sedangkan sisanya dinyatakan inert padahal Tab tetap menembus.
 */
export function Modal({ judul, subjudul, onTutup, children }) {
  const idJudul = useId()
  const wadah = useRef(null)
  const pemicu = useRef(null)
  const tutupRef = useRef(onTutup)
  tutupRef.current = onTutup

  useEffect(() => {
    pemicu.current = document.activeElement
    const el = wadah.current
    el?.querySelector(TERFOKUS)?.focus()

    function tekan(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        tutupRef.current()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const bisa = [...el.querySelectorAll(TERFOKUS)]
      if (bisa.length === 0) return
      const pertama = bisa[0]
      const terakhir = bisa[bisa.length - 1]
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault()
        terakhir.focus()
      } else if (!e.shiftKey && document.activeElement === terakhir) {
        e.preventDefault()
        pertama.focus()
      }
    }

    const overflowLama = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', tekan)
    return () => {
      document.removeEventListener('keydown', tekan)
      document.body.style.overflow = overflowLama
      pemicu.current?.focus?.()
    }
  }, [])

  return (
    <div
      className="animate-pudar fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-biru-950/55 p-5 backdrop-blur-[4px] max-dialog:p-2.5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) tutupRef.current()
      }}
    >
      <div className="animate-panel flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-besar border border-garis bg-kartu shadow-timbul max-dialog:max-h-[94vh]" role="dialog" aria-modal="true" aria-labelledby={idJudul} ref={wadah}>
        <div className="flex items-center justify-between gap-4 border-b border-garis bg-biru-50 p-4">
          <div>
            <h2 id={idJudul} className="m-0 text-subjudul font-bold tracking-[-0.015em] text-biru-950">{judul}</h2>
            {subjudul && <span className="text-padat font-medium text-teks-samar">{subjudul}</span>}
          </div>
          <button
            type="button"
            className="tombol-ikon sekunder"
            onClick={() => tutupRef.current()}
            aria-label="Tutup dialog"
          >
            <Ikon nama="tutup" ukuran={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
