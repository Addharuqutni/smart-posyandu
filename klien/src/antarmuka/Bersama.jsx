import { useEffect, useId, useRef } from 'react'
import Ikon from './Ikon.jsx'

/**
 * Potongan antarmuka yang dipakai lintas layar. Sebelumnya tiap layar
 * mengarang versinya sendiri (kotak kosong, pencarian, paginasi, dialog),
 * sehingga perilakunya menyimpang: satu pencarian punya tombol bersih,
 * yang lain tidak; satu dialog bisa ditutup Escape, yang lain tidak.
 */

/** Keadaan kosong: satu bentuk untuk semua layar. */
export function Kosong({ ikon = 'info', judul, teks, aksi }) {
  return (
    <div className="mb-4 rounded-sedang border border-dashed border-garis-kuat bg-kartu px-5 py-8 text-center">
      <div className="mx-auto mb-3 grid size-[52px] place-items-center rounded-full bg-biru-100 text-biru-700">
        <Ikon nama={ikon} ukuran={26} />
      </div>
      <h2 className="mb-1.5 text-dasar font-bold text-teks">{judul}</h2>
      {teks && <p className="mx-auto mb-4 max-w-[34ch] text-isi text-teks-redup">{teks}</p>}
      {aksi}
    </div>
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
}) {
  return (
    <div className="relative mb-4">
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
          className="absolute top-1/2 right-2 size-12 -translate-y-1/2 rounded-full bg-transparent p-0 text-teks-samar hover:bg-latar"
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
 * pembaca layar — sisanya dinyatakan inert padahal Tab tetap menembus.
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-biru-950/55 p-5 backdrop-blur-[4px] max-dialog:p-2.5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) tutupRef.current()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-besar border border-garis bg-kartu shadow-timbul max-dialog:max-h-[94vh]" role="dialog" aria-modal="true" aria-labelledby={idJudul} ref={wadah}>
        <div className="flex items-center justify-between gap-4 border-b border-garis bg-biru-50 px-5 py-5">
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
