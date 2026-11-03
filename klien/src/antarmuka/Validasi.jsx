import { useEffect, useState } from 'react'
import { daftarValidasi, tindakLanjut, validasiKunjungan, validasiSemua } from '../jaringan/api.js'
import { PESAN_STATUS } from '../logika/rentang.js'
import Ikon from './Ikon.jsx'
import { idBaru } from '../logika/waktu.js'
export default function Validasi({ sesi }) {
  const [daftar, setDaftar] = useState([])
  const [total, setTotal] = useState(0)
  const [cari, setCari] = useState('')
  const [galat, setGalat] = useState(null)
  const [memuat, setMemuat] = useState(true)
  const [memuatLagi, setMemuatLagi] = useState(false)
  const [memvalidasikan, setMemvalidasikan] = useState(false)
  const [sedang, setSedang] = useState(null)
  const [tindak, setTindak] = useState({})
  const [pesan, setPesan] = useState(null)

  async function muat(kunci = cari) {
    setMemuat(true)
    setGalat(null)
    try {
      const balasan = await daftarValidasi({ batas: 50, offset: 0, q: kunci.trim() })
      setDaftar(balasan.validasi)
      setTotal(balasan.total ?? balasan.validasi.length)
    } catch {
      setGalat('Validasi butuh koneksi ke server. Sambungkan tablet lalu coba lagi.')
    } finally {
      setMemuat(false)
    }
  }

  async function muatLagi() {
    setMemuatLagi(true)
    setGalat(null)
    try {
      const balasan = await daftarValidasi({ batas: 50, offset: daftar.length, q: cari.trim() })
      setDaftar((lama) => [...lama, ...balasan.validasi])
      setTotal(balasan.total ?? total)
    } catch {
      setGalat('Gagal memuat halaman berikutnya.')
    } finally {
      setMemuatLagi(false)
    }
  }

  async function tanganiValidasiSemua() {
    if (total === 0) return
    const pesanKonfirm = cari.trim()
      ? `Validasi ${total} pengukuran yang cocok dengan "${cari.trim()}"?`
      : `Validasi SEMUA ${total} pengukuran yang belum divalidasi?`
    if (!window.confirm(pesanKonfirm)) return
    setMemvalidasikan(true)
    setGalat(null)
    setPesan(null)
    try {
      const balasan = await validasiSemua(cari.trim())
      setPesan(`${balasan.divalidasi} pengukuran divalidasi. Muat ulang untuk memperbarui daftar.`)
      await muat(cari)
    } catch {
      setGalat('Validasi massal gagal. Periksa koneksi lalu coba lagi.')
    } finally {
      setMemvalidasikan(false)
    }
  }

  useEffect(() => {
    muat('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const jeda = setTimeout(() => muat(cari), 300)
    return () => clearTimeout(jeda)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cari])

  async function kirimTindak(id) {
    const isi = tindak[id]
    if (!isi?.isi?.trim()) return
    setPesan(null)
    try {
      await tindakLanjut(id, {
        id: idBaru(),
        jenis: isi.jenis ?? 'edukasi',
        isi: isi.isi.trim(),
      })
      setTindak((lama) => ({ ...lama, [id]: { ...lama[id], isi: '' } }))
      setPesan('Tindak lanjut tersimpan.')
    } catch {
      setGalat('Tindak lanjut butuh koneksi ke server.')
    }
  }

  async function validasi(id) {
    setSedang(id)
    setGalat(null)
    try {
      await validasiKunjungan(id)
      setDaftar((lama) => lama.filter((k) => k.id !== id))
      setTotal((n) => Math.max(0, n - 1))
    } catch {
      setGalat('Gagal memvalidasi. Periksa koneksi lalu coba lagi.')
    } finally {
      setSedang(null)
    }
  }

  return (
    <main className="layar" id="isi-utama">
      <div className="kepala-layar">
        <div>
          <h1>Validasi pengukuran</h1>
          <p>
            {memuat
              ? 'Memuat antrean…'
              : daftar.length > 0
                ? `${daftar.length} dari ${total} pengukuran menunggu ditinjau`
                : 'Antrean validasi'}
          </p>
        </div>
        <div className="baris-rapat">
          <button type="button" className="sekunder" onClick={() => muat()} disabled={memuat}>
            <Ikon nama="sinkron" ukuran={18} />
            {memuat ? 'Memuat…' : 'Muat ulang'}
          </button>
          <button
            type="button"
            className="bahaya"
            onClick={tanganiValidasiSemua}
            disabled={memuat || memvalidasikan || total === 0}
            title="Validasi semua pengukuran yang sedang ditampilkan oleh filter"
          >
            <Ikon nama="cek" ukuran={18} />
            {memvalidasikan ? 'Memvalidasi…' : `Validasi semua (${total})`}
          </button>
        </div>
      </div>

      {galat && (
        <div className="pesan galat" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}
      {pesan && (
        <div className="pesan sukses" role="status">
          <Ikon nama="cek" ukuran={19} />
          <span>{pesan}</span>
        </div>
      )}

      {!memuat && !galat && daftar.length === 0 && (
        <div className="kosong">
          <div className="kosong-ikon">
            <Ikon nama="cek" ukuran={26} />
          </div>
          <h3>Tidak ada yang menunggu</h3>
          <p>
            Semua pengukuran yang terkirim sudah divalidasi. Muat ulang setelah kader mengirim
            data baru.
          </p>
          <button type="button" className="sekunder" onClick={() => muat()}>
            <Ikon nama="sinkron" ukuran={17} />
            Muat ulang
          </button>
        </div>
      )}

      <div className="cari">
        <label className="sr-only" htmlFor="cari-validasi">
          Cari nama balita
        </label>
        <Ikon nama="cari" ukuran={20} />
        <input
          id="cari-validasi"
          type="search"
          placeholder="Cari nama balita…"
          autoComplete="off"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>

      {daftar.map((k) => (
        <article key={k.id} className="kartu">
          <div className="kartu-judul kartu-judul-atas">
            <div>
              <h3>{k.nama_balita}</h3>
              <div className="redup">
                {k.tanggal_kunjungan} · {k.usia_bulan} bulan ·{' '}
                {k.status_kehadiran === 'tidak_hadir' ? 'Tidak hadir' : 'Hadir'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => validasi(k.id)}
              disabled={sedang === k.id}
              aria-label={`Validasi pengukuran ${k.nama_balita}`}
            >
              <Ikon nama="cek" ukuran={18} />
              {sedang === k.id ? 'Menyimpan…' : 'Validasi'}
            </button>
          </div>

          <div className="ringkasan-ukur spasi-bawah">
            <div className="stat-ukur">
              <span className="stat-label">Berat</span>
              <span className="stat-nilai">
                {k.pengukuran?.berat_kg ?? '—'}
                <span className="satuan-stat"> kg</span>
              </span>
            </div>
            <div className="stat-ukur">
              <span className="stat-label">Tinggi</span>
              <span className="stat-nilai">
                {k.pengukuran?.tinggi_cm ?? '—'}
                <span className="satuan-stat"> cm</span>
              </span>
            </div>
            <div className="stat-ukur">
              <span className="stat-label">Status gizi</span>
              <span
                className={`lencana-gizi lencana-mandiri ${k.pengukuran?.status_gizi ?? 'menunggu'}`}
              >
                {k.pengukuran?.status_gizi
                  ? PESAN_STATUS[k.pengukuran.status_gizi]
                  : 'Belum dinilai'}
              </span>
            </div>
          </div>

          {k.catatan && (
            <div className="catatan spasi-bawah">
              Catatan kader: {k.catatan}
            </div>
          )}

          <div className="bidang">
            <label htmlFor={`tl-${k.id}`}>Tindak lanjut</label>
            <textarea
              id={`tl-${k.id}`}
              rows={2}
              value={tindak[k.id]?.isi ?? ''}
              onChange={(e) =>
                setTindak((lama) => ({
                  ...lama,
                  [k.id]: { ...lama[k.id], isi: e.target.value },
                }))
              }
              placeholder="cth. Diberi edukasi gizi seimbang dan konsumsi protein hewani"
            />
          </div>
          <div className="baris-rapat">
            <select
              aria-label="Jenis tindak lanjut"
              value={tindak[k.id]?.jenis ?? 'edukasi'}
              onChange={(e) =>
                setTindak((lama) => ({
                  ...lama,
                  [k.id]: { ...lama[k.id], jenis: e.target.value },
                }))
              }
              className="pilih-rapat"
            >
              <option value="edukasi">Edukasi</option>
              <option value="pmt">PMT</option>
              <option value="rujukan">Rujukan</option>
            </select>
            <button
              type="button"
              className="sekunder"
              onClick={() => kirimTindak(k.id)}
              disabled={!tindak[k.id]?.isi?.trim()}
            >
              <Ikon nama="simpan" ukuran={17} />
              Simpan tindak lanjut
            </button>
          </div>
        </article>
      ))}

      {!memuat && daftar.length > 0 && daftar.length < total && (
        <div className="baris-rapat spasi-atas">
          <button
            type="button"
            className="sekunder"
            onClick={muatLagi}
            disabled={memuatLagi}
          >
            <Ikon nama="unduh" ukuran={18} />
            {memuatLagi
              ? 'Memuat…'
              : `Muat 50 lagi (${daftar.length} dari ${total})`}
          </button>
        </div>
      )}
    </main>
  )
}
