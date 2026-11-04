import { useId } from 'react'
import Ikon from './Ikon.jsx'

/**
 * Bantuan kontekstual dalam bentuk <details>: diketuk untuk buka, diketuk lagi
 * untuk tutup. Versi sebelumnya memakai :hover/:focus-within, yang tidak ada
 * di tablet — satu-satunya kanal penjelasan istilah klinis tidak bisa dipakai
 * di perangkat target. Tanpa JavaScript, tanpa pustaka.
 */
export default function Bantuan({ id, teks, label = 'Penjelasan' }) {
  const jatuh = useId()
  return (
    <details className="bantuan" id={id}>
      <summary className="bantuan-tombol" aria-label={label} title={label}>
        <Ikon nama="info" ukuran={16} />
      </summary>
      <span className="bantuan-isi" id={jatuh}>
        {teks}
      </span>
    </details>
  )
}
