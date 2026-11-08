import { useEffect, useState } from 'react'
import {
  buatPosyandu,
  daftarSemuaPosyandu,
  hapusPosyandu,
  ubahPosyandu,
} from '../jaringan/api.js'
import Ikon from './Ikon.jsx'
import { Modal, Layar } from './Bersama.jsx'

const KOSONG = {
  nama: '',
  dusun: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  aktif: true,
}

const PESAN_GALAT = {
  posyandu_masih_terpakai:
    'Posyandu masih dipakai data lain. Hapus atau pindahkan data itu dulu, atau nonaktifkan Posyandu.',
  nama_pengguna_sudah_dipakai: 'Username sudah dipakai akun lain.',
  muatan_tidak_sah: 'Data yang diisi belum lengkap atau tidak sah.',
  posyandu_tidak_ditemukan: 'Posyandu tidak ditemukan.',
}

function pesanGalat(salah) {
  // Server kini mengirim kalimat spesifik ("... 1 kunjungan dan 2 akun
  // pengguna"); pakai itu apa adanya. Peta lokal hanya cadangan untuk
  // kode galat lama tanpa kalimat.
  const teks = String(salah.rincian ?? '')
  if (teks && !PESAN_GALAT[teks] && / /.test(teks)) return teks
  return PESAN_GALAT[teks] ?? teks ?? 'Gagal menyimpan. Coba lagi.'
}

/** Kelola Posyandu: tambah, sunting, hapus (khusus admin desa). */
export default function KelolaPosyandu() {
  const [daftar, setDaftar] = useState(null)
  const [isi, setIsi] = useState(KOSONG)
  const [sunting, setSunting] = useState(null)
  const [konfirm, setKonfirm] = useState(null)
  const [galat, setGalat] = useState(null)
  const [pesan, setPesan] = useState(null)
  const [menyimpan, setMenyimpan] = useState(false)

  async function muat() {
    try {
      setDaftar((await daftarSemuaPosyandu()).posyandu)
    } catch {
      setGalat('Daftar Posyandu butuh koneksi ke server.')
    }
  }

  useEffect(() => {
    muat()
  }, [])

  function muatanDariForm() {
    const keluar = {}
    for (const k of ['nama', 'dusun', 'desa', 'kecamatan', 'kabupaten']) {
      keluar[k] = isi[k].trim() || null
    }
    keluar.aktif = isi.aktif
    return keluar
  }

  async function simpan(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setPesan(null)
    if (!isi.nama.trim() || !isi.desa.trim()) {
      setGalat('Nama Posyandu dan desa wajib diisi.')
      return
    }
    setMenyimpan(true)
    try {
      await buatPosyandu(muatanDariForm())
      setPesan('Posyandu berhasil ditambahkan.')
      setIsi(KOSONG)
      await muat()
    } catch (salah) {
      setGalat(pesanGalat(salah))
    } finally {
      setMenyimpan(false)
    }
  }

  async function hapus(posyandu) {
    setGalat(null)
    setPesan(null)
    try {
      await hapusPosyandu(posyandu.id)
      setPesan(`${posyandu.nama} dihapus.`)
      setKonfirm(null)
      if (sunting?.id === posyandu.id) {
        setSunting(null)
        setIsi(KOSONG)
      }
      await muat()
    } catch (salah) {
      setGalat(pesanGalat(salah))
      setKonfirm(null)
    }
  }

  function mulaiSunting(posyandu) {
    setSunting({
      id: posyandu.id,
      nama: posyandu.nama ?? '',
      dusun: posyandu.dusun ?? '',
      desa: posyandu.desa ?? '',
      kecamatan: posyandu.kecamatan ?? '',
      kabupaten: posyandu.kabupaten ?? '',
      aktif: posyandu.aktif !== false,
    })
    setGalat(null)
    setPesan(null)
  }

  async function simpanSunting(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setPesan(null)
    if (!sunting.nama.trim() || !sunting.desa.trim()) {
      setGalat('Nama Posyandu dan desa wajib diisi.')
      return
    }
    setMenyimpan(true)
    try {
      await ubahPosyandu(sunting.id, {
        nama: sunting.nama.trim(),
        dusun: sunting.dusun?.trim() || null,
        desa: sunting.desa.trim(),
        kecamatan: sunting.kecamatan?.trim() || null,
        kabupaten: sunting.kabupaten?.trim() || null,
        aktif: sunting.aktif,
      })
      setPesan(`Data Posyandu ${sunting.nama.trim()} diperbarui.`)
      setSunting(null)
      await muat()
    } catch (salah) {
      setGalat(pesanGalat(salah))
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <Layar>
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Kelola Posyandu</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">Tambah, sunting, dan hapus data Posyandu di desa.</p>
        </div>
        <button type="button" className="sekunder" onClick={muat}>
          <Ikon nama="sinkron" ukuran={18} />
          Muat ulang
        </button>
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

      <form className="kartu" onSubmit={simpan}>
        <div className="kepala-akun mb-5 flex items-center gap-3 max-sempit:mb-4">
          <span className="grid size-[42px] shrink-0 place-items-center rounded-kecil border border-biru-100 bg-biru-50 text-biru-700 max-sempit:size-[38px]">
            <Ikon nama="posyandu" ukuran={20} />
          </span>
          <div>
            <h2 className="m-0 leading-tight">Posyandu baru</h2>
            <p className="mt-1 mb-0 text-padat text-teks-redup">
              Nama dan wilayah dipakai di pilihan kader serta kanal publik.
            </p>
          </div>
        </div>

        <div className="grid items-start gap-x-4 gap-y-4 [grid-template-columns:repeat(2,minmax(0,1fr))] max-sempit:grid-cols-1">
          <div className="bidang">
            <label htmlFor="ps-nama">
              <span>Nama Posyandu</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="ps-nama"
                name="nama"

              maxLength={120}
              placeholder="cth. Posyandu Melati"
              value={isi.nama}
              onChange={(e) => setIsi({ ...isi, nama: e.target.value })}
              required
            />
          </div>
          <div className="bidang">
            <label htmlFor="ps-dusun">Dusun / RT-RW</label>
            <input
              id="ps-dusun"
                name="dusun"

              maxLength={120}
              placeholder="cth. Dusun Melati"
              value={isi.dusun}
              onChange={(e) => setIsi({ ...isi, dusun: e.target.value })}
            />
          </div>
          <div className="bidang">
            <label htmlFor="ps-desa">
              <span>Desa</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="ps-desa"
                name="desa"

              maxLength={120}
              placeholder="cth. Ketenger"
              value={isi.desa}
              onChange={(e) => setIsi({ ...isi, desa: e.target.value })}
              required
            />
          </div>
          <div className="bidang">
            <label htmlFor="ps-kecamatan">Kecamatan</label>
            <input
              id="ps-kecamatan"
                name="kecamatan"

              maxLength={120}
              placeholder="cth. Baturraden"
              value={isi.kecamatan}
              onChange={(e) => setIsi({ ...isi, kecamatan: e.target.value })}
            />
          </div>
          <div className="bidang">
            <label htmlFor="ps-kabupaten">Kabupaten</label>
            <input
              id="ps-kabupaten"
                name="kabupaten"

              maxLength={120}
              placeholder="cth. Banyumas"
              value={isi.kabupaten}
              onChange={(e) => setIsi({ ...isi, kabupaten: e.target.value })}
            />
          </div>
          <div className="bidang">
            <label htmlFor="ps-status">Status</label>
            <select
              id="ps-status"
              value={isi.aktif ? 'aktif' : 'nonaktif'}
              onChange={(e) => setIsi({ ...isi, aktif: e.target.value === 'aktif' })}
            >
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </div>
        </div>

        <p className="mt-3 mb-0 text-padat text-teks-samar">
          Posyandu nonaktif tidak muncul di pilihan kader.
        </p>

        <div className="mt-4 flex justify-end gap-2 border-t border-garis pt-4 max-sempit:[&>button]:w-full">
          <button type="submit" disabled={menyimpan}>
            <Ikon nama="tambah" ukuran={18} />
            {menyimpan ? 'Menyimpan…' : 'Tambah Posyandu'}
          </button>
        </div>
      </form>

      {sunting && (
        <Modal
          judul="Sunting Data Posyandu"
          subjudul={sunting.nama}
          onTutup={() => setSunting(null)}
        >
          <form onSubmit={simpanSunting} className="flex flex-col gap-5 overflow-y-auto p-4">
            <div className="flex flex-col gap-3">
              <div className="border-b border-garis pb-1.5 text-2xs font-bold uppercase tracking-[0.075em] text-aksen-biru-ink">Identitas & Wilayah</div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                <div className="bidang">
                  <label htmlFor="modal-ps-nama">
                    <span>Nama Posyandu</span>
                    <span className="wajib" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="modal-ps-nama"
                name="nama"

                    maxLength={120}
                    value={sunting.nama}
                    onChange={(e) => setSunting({ ...sunting, nama: e.target.value })}
                    required
                  />
                </div>
                <div className="bidang">
                  <label htmlFor="modal-ps-dusun">Dusun / RT-RW</label>
                  <input
                    id="modal-ps-dusun"
                name="dusun"

                    maxLength={120}
                    value={sunting.dusun}
                    onChange={(e) => setSunting({ ...sunting, dusun: e.target.value })}
                  />
                </div>
                <div className="bidang">
                  <label htmlFor="modal-ps-desa">
                    <span>Desa</span>
                    <span className="wajib" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="modal-ps-desa"
                name="desa"

                    maxLength={120}
                    value={sunting.desa}
                    onChange={(e) => setSunting({ ...sunting, desa: e.target.value })}
                    required
                  />
                </div>
                <div className="bidang">
                  <label htmlFor="modal-ps-kecamatan">Kecamatan</label>
                  <input
                    id="modal-ps-kecamatan"
                name="kecamatan"

                    maxLength={120}
                    value={sunting.kecamatan}
                    onChange={(e) => setSunting({ ...sunting, kecamatan: e.target.value })}
                  />
                </div>
                <div className="bidang">
                  <label htmlFor="modal-ps-kabupaten">Kabupaten</label>
                  <input
                    id="modal-ps-kabupaten"
                name="kabupaten"

                    maxLength={120}
                    value={sunting.kabupaten}
                    onChange={(e) => setSunting({ ...sunting, kabupaten: e.target.value })}
                  />
                </div>
                <div className="bidang">
                  <label htmlFor="modal-ps-status">Status operasional</label>
                  <select
                    id="modal-ps-status"
                    value={sunting.aktif ? 'aktif' : 'nonaktif'}
                    onChange={(e) => setSunting({ ...sunting, aktif: e.target.value === 'aktif' })}
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setSunting(null)}>
                Batal
              </button>
              <button type="submit" disabled={menyimpan}>
                <Ikon nama="simpan" ukuran={18} />
                <span>{menyimpan ? 'Menyimpan…' : 'Simpan perubahan'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Konfirmasi hapus. Sebelumnya disisipkan di dalam sel tabel, sehingga
          baris membengkak dan kolom aksi melebar; modal ini menyamakan pola
          dengan layar Kelola Konten, Kelola Balita, dan Pengguna. */}
      {konfirm && (
        <Modal judul="Hapus Posyandu?" subjudul={konfirm.nama} onTutup={() => setKonfirm(null)}>
          <div className="flex flex-col gap-4 p-4">
            <p className="m-0 text-isi leading-relaxed text-teks-redup">
              <strong>{konfirm.nama}</strong> tidak akan tampil lagi di kanal publik maupun daftar
              Posyandu. Data tetap tersimpan sebagai arsip di server.
            </p>
            <p className="m-0 text-padat leading-relaxed text-teks-samar">
              Posyandu yang masih memiliki balita, kunjungan, kader, atau akun tidak bisa dihapus.
              Bila sudah tidak dipakai, gunakan status nonaktif.
            </p>
            <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setKonfirm(null)}>
                Batal
              </button>
              <button type="button" className="bahaya" onClick={() => hapus(konfirm)}>
                Ya, hapus
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="kartu">
        <div className="kartu-judul">
          <h2>Daftar Posyandu</h2>
          <span className="text-padat text-teks-samar">{daftar ? `${daftar.length} Posyandu` : 'Memuat…'}</span>
        </div>
        <div className="tabel-bungkus">
          <table className="tabel tabel-kartu tabel-aksi">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Wilayah</th>
                <th>Status</th>
                <th aria-label="Tindakan" />
              </tr>
            </thead>
            <tbody>
              {(daftar ?? []).map((p) => (
                <tr key={p.id}>
                  <td data-label="Nama"><strong>{p.nama}</strong></td>
                  <td className="text-padat text-teks-samar" data-label="Wilayah">
                    {[p.dusun, p.desa, p.kecamatan, p.kabupaten].filter(Boolean).join(', ') || '-'}
                  </td>
                  <td data-label="Status">
                    <span className={`lencana ${p.aktif ? 'aktif' : 'nonaktif'}`}>
                      {p.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="sel-aksi">
                    <button type="button" className="sekunder" onClick={() => mulaiSunting(p)}>
                      Sunting
                    </button>
                    <button
                      type="button"
                      className="bahaya ml-1.5"
                      onClick={() => setKonfirm(p)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {daftar?.length === 0 && (
                <tr><td colSpan={4}>Belum ada Posyandu.</td></tr>
              )}
              {daftar === null && !galat && (
                <tr><td colSpan={4}>Memuat daftar Posyandu…</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mb-0 text-padat text-teks-samar">
          Posyandu yang masih memiliki data balita, kunjungan, kader, atau akun tidak bisa dihapus.
          Gunakan status nonaktif bila sudah tidak dipakai.
        </p>
      </div>
    </Layar>
  )
}
