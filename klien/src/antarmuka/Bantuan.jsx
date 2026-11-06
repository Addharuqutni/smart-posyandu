import { useId } from 'react'
import Ikon from './Ikon.jsx'

/**
 * Bantuan kontekstual dalam bentuk <details>: diketuk untuk buka, diketuk lagi
 * untuk tutup. Versi sebelumnya memakai :hover/:focus-within, yang tidak ada
 * di tablet, satu-satunya kanal penjelasan istilah klinis tidak bisa dipakai
 * di perangkat target. Tanpa JavaScript, tanpa pustaka.
 */
export default function Bantuan({ id, teks, label = 'Penjelasan', ukuran = 16 }) {
  const jatuh = useId()
  return (
    <details className="relative inline-flex items-center leading-none [&[open]>summary]:bg-biru-100 [&[open]>summary]:text-biru-700 max-sempit:[&[open]>summary]:bg-transparent" id={id}>
      <summary className="relative -my-1.5 -mr-1.5 ml-0 inline-flex size-8 min-h-8 shrink-0 list-none items-center justify-center rounded-kecil border-0 bg-transparent p-0 text-teks-samar after:absolute after:-inset-1.5 after:content-[''] hover:bg-biru-50 hover:text-biru-700 active:bg-biru-100 [&::-webkit-details-marker]:hidden" aria-label={label} title={label}>
        <Ikon nama="info" ukuran={ukuran} />
      </summary>
      <span className="animate-pudar absolute top-[calc(100%_+_0.35rem)] right-0 z-50 w-max max-w-[min(260px,calc(100vw_-_2rem))] rounded-kecil bg-biru-950 px-3 py-2 text-2xs leading-snug font-medium text-biru-50 shadow-timbul max-sempit:fixed max-sempit:inset-x-4 max-sempit:top-1/2 max-sempit:w-auto max-sempit:max-w-none max-sempit:-translate-y-1/2 max-sempit:px-4 max-sempit:py-3 max-sempit:text-padat" id={jatuh}>
        {teks}
      </span>
    </details>
  )
}
