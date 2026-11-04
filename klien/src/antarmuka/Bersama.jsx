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
    <div className="kosong">
      <div className="kosong-ikon">
        <Ikon nama={ikon} ukuran={26} />
      </div>
      <h3>{judul}</h3>
      {teks && <p>{teks}</p>}
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
    <div className="cari">
      <label className={labelTampil ? 'label-cari' : 'sr-only'} htmlFor={id}>
        {label}
      </label>
      <Ikon nama="cari" ukuran={20} />
      <input
        id={id}
        type="search"
        value={nilai}
        onChange={(e) => onUbah(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {nilai && (
        <button
          type="button"
          className="cari-bersih"
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
    <div className="kendali-halaman">
      <span className="samar">{keterangan ?? `Halaman ${halaman + 1} dari ${jumlahHalaman}`}</span>
      <span className="baris-rapat">
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
      className="modal-latar"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) tutupRef.current()
      }}
    >
      <div className="modal-wadah" role="dialog" aria-modal="true" aria-labelledby={idJudul} ref={wadah}>
        <div className="modal-kepala">
          <div>
            <h2 id={idJudul}>{judul}</h2>
            {subjudul && <span className="modal-subjudul">{subjudul}</span>}
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
