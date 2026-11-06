import { useEffect, useState } from 'react'
import { daftarPosyandu, daftarValidasi, tindakLanjut, validasiKunjungan, validasiSemua } from '../jaringan/api.js'
import { PESAN_STATUS } from '../logika/rentang.js'
import Ikon from './Ikon.jsx'
import { Kosong, KotakCari, Modal, Layar } from './Bersama.jsx'
import { idBaru } from '../logika/waktu.js'
export default function Validasi({ sesi }) {
  const [daftar, setDaftar] = useState([])
  const [total, setTotal] = useState(0)
  const [cari, setCari] = useState('')
  const [posyanduList, setPosyanduList] = useState([])
  const [posyanduId, setPosyanduId] = useState(sesi.pengguna.posyandu_id ?? '')
  const [galat, setGalat] = useState(null)
  const [memuat, setMemuat] = useState(true)
  const [memuatLagi, setMemuatLagi] = useState(false)
  const [memvalidasikan, setMemvalidasikan] = useState(false)
  const [sedang, setSedang] = useState(null)
  const [tindak, setTindak] = useState({})
  const [pesan, setPesan] = useState(null)
  const [konfirmMassal, setKonfirmMassal] = useState(false)

  useEffect(() => {
    daftarPosyandu()
      .then((b) => setPosyanduList(b.posyandu ?? []))
      .catch(() => setPosyanduList([]))
  }, [])

  async function muat(kunci = cari, posId = posyanduId) {
    setMemuat(true)
    setGalat(null)
    try {
      const balasan = await daftarValidasi({ batas: 50, offset: 0, q: kunci.trim(), posyandu_id: posId })
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
      const balasan = await daftarValidasi({ batas: 50, offset: daftar.length, q: cari.trim(), posyandu_id: posyanduId })
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
    setMemvalidasikan(true)
    setGalat(null)
    setPesan(null)
    try {
      const balasan = await validasiSemua(cari.trim())
      setPesan(`${balasan.divalidasi} pengukuran divalidasi.`)
      setKonfirmMassal(false)
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
    <Layar>
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Validasi pengukuran</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">
            {memuat
              ? 'Memuat antrean…'
              : daftar.length > 0
                ? `${daftar.length} dari ${total} pengukuran menunggu ditinjau`
                : 'Antrean validasi'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="sekunder" onClick={() => muat()} disabled={memuat}>
            <Ikon nama="sinkron" ukuran={18} />
            {memuat ? 'Memuat…' : 'Muat ulang'}
          </button>
          <button
            type="button"
            className="sekunder"
            onClick={() => setKonfirmMassal(true)}
            disabled={memuat || memvalidasikan || total === 0}
            title="Validasi semua pengukuran yang sedang ditampilkan oleh filter"
          >
            <Ikon nama="cek" ukuran={18} />
            {memvalidasikan ? 'Memvalidasi…' : `Validasi semua (${total})`}
          </button>
        </div>
      </div>

      {konfirmMassal && (
        <Modal judul="Validasi semua pengukuran?" onTutup={() => setKonfirmMassal(false)}>
          <div className="flex flex-col gap-5 overflow-y-auto p-4">
            <p className="m-0">
              {cari.trim()
                ? `${total} pengukuran yang cocok dengan “${cari.trim()}” akan ditandai tervalidasi.`
                : `${total} pengukuran yang belum divalidasi akan ditandai tervalidasi.`}
            </p>
            <p className="m-0 text-padat text-teks-samar">
              Setelah divalidasi, pengukuran tidak bisa diubah lagi oleh kader.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
            <button type="button" className="sekunder" onClick={() => setKonfirmMassal(false)}>
              Batal
            </button>
            <button type="button" onClick={tanganiValidasiSemua} disabled={memvalidasikan}>
              <Ikon nama="cek" ukuran={18} />
              {memvalidasikan ? 'Memvalidasi…' : `Ya, validasi ${total}`}
            </button>
          </div>
        </Modal>
      )}

      <div className="kartu">
        <div className="grid grid-cols-2 items-start gap-x-4 gap-y-4 max-sempit:grid-cols-1">
          <div className="flex min-w-0 flex-col">
            <label htmlFor="filter-posyandu">
              <span>Posyandu</span>
            </label>
            <select
              id="filter-posyandu"
              value={posyanduId}
              onChange={(e) => {
                const id = e.target.value
                setPosyanduId(id)
                muat(cari, id)
              }}
            >
              <option value="">Semua Posyandu</option>
              {posyanduList.map((p) => (
                <option key={p.id} value={p.id}>{p.nama}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="label-segmen" id="label-cari-validasi">
              Cari nama balita
            </span>
            <div role="search" aria-labelledby="label-cari-validasi">
              <KotakCari
                id="cari-validasi"
                nilai={cari}
                onUbah={setCari}
                label="Cari nama balita"
                placeholder="Cari balita…"
                className="mb-0"
              />
            </div>
          </div>
        </div>
      </div>

      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}
      {pesan && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-hijau-100 bg-hijau-100 text-hijau-800" role="status">
          <Ikon nama="cek" ukuran={19} />
          <span>{pesan}</span>
        </div>
      )}

      {!memuat && !galat && daftar.length === 0 && (
        <Kosong
          ikon="cek"
          judul="Tidak ada yang menunggu"
          teks="Semua pengukuran yang terkirim sudah divalidasi. Muat ulang setelah kader mengirim data baru."
          aksi={
            <button type="button" className="sekunder" onClick={() => muat()}>
              <Ikon nama="sinkron" ukuran={17} />
              Muat ulang
            </button>
          }
        />
      )}

      {daftar.map((k) => (
        <article key={k.id} className="kartu">
          <div className="kartu-judul items-start [&_h2]:text-tombol">
            <div>
              <h2>{k.nama_balita}</h2>
              <div className="text-isi text-teks-redup">
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

          <dl className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-kecil border border-garis bg-garis">
            <div className="bg-kartu px-2.5 py-2">
              <dt className="text-2xs font-semibold uppercase tracking-[0.075em] text-teks-samar">Berat</dt>
              <dd className="m-0 mt-0.5 flex items-baseline gap-0.5 text-subjudul leading-none font-bold tabular-nums text-biru-950">
                {k.pengukuran?.berat_kg ?? '-'}
                <span className="text-padat font-semibold text-teks-redup">kg</span>
              </dd>
            </div>
            <div className="bg-kartu px-2.5 py-2">
              <dt className="text-2xs font-semibold uppercase tracking-[0.075em] text-teks-samar">Tinggi</dt>
              <dd className="m-0 mt-0.5 flex items-baseline gap-0.5 text-subjudul leading-none font-bold tabular-nums text-biru-950">
                {k.pengukuran?.tinggi_cm ?? '-'}
                <span className="text-padat font-semibold text-teks-redup">cm</span>
              </dd>
            </div>
            <div className="bg-kartu px-2.5 py-2">
              <dt className="text-2xs font-semibold uppercase tracking-[0.075em] text-teks-samar">Status gizi</dt>
              <dd className="m-0 mt-1">
                <span className={`lencana-gizi w-fit ${k.pengukuran?.status_gizi ?? 'menunggu'}`}>
                  {k.pengukuran?.status_gizi
                    ? PESAN_STATUS[k.pengukuran.status_gizi]
                    : 'Belum dinilai'}
                </span>
              </dd>
            </div>
          </dl>

          {k.catatan && (
            <div className="mb-3 rounded-kecil bg-biru-50 px-3 py-2.5 text-padat text-teks-redup">
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
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Jenis tindak lanjut"
              value={tindak[k.id]?.jenis ?? 'edukasi'}
              onChange={(e) =>
                setTindak((lama) => ({
                  ...lama,
                  [k.id]: { ...lama[k.id], jenis: e.target.value },
                }))
              }
              className="w-auto min-w-[150px]"
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
    </Layar>
  )
}
