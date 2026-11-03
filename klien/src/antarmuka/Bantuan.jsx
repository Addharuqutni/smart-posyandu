import Ikon from './Ikon.jsx'

/** Bantuan kontekstual: tombol info dengan penjelasan singkat.
 *  Teks selalu terbaca pembaca layar lewat aria-describedby; tampil
 *  saat kursor atau fokus masuk, tanpa pustaka tambahan. */
export default function Bantuan({ id, teks, label = 'Penjelasan' }) {
  return (
    <span className="bantuan">
      <button type="button" className="bantuan-tombol" aria-describedby={id} aria-label={label}>
        <Ikon nama="info" ukuran={14} />
      </button>
      <span className="bantuan-isi" id={id} role="tooltip">
        {teks}
      </span>
    </span>
  )
}
