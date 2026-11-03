import { useEffect, useState } from 'react'
import {
  buatPosyandu,
  daftarSemuaPosyandu,
  hapusPosyandu,
  ubahPosyandu,
} from '../jaringan/api.js'
import Ikon from './Ikon.jsx'

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
    'Posyandu masih dipakai data balita, kunjungan, kader, atau akun. Nonaktifkan saja bila sudah tidak dipakai.',
  nama_pengguna_sudah_dipakai: 'Username sudah dipakai akun lain.',
  muatan_tidak_sah: 'Data yang diisi belum lengkap atau tidak sah.',
  posyandu_tidak_ditemukan: 'Posyandu tidak ditemukan.',
}

function pesanGalat(salah) {
  return PESAN_GALAT[salah.rincian] ?? salah.rincian ?? 'Gagal menyimpan. Coba lagi.'
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
      if (sunting) {
        await ubahPosyandu(sunting.id, muatanDariForm())
        setPesan(`Data ${isi.nama.trim()} diperbarui.`)
      } else {
        await buatPosyandu(muatanDariForm())
        setPesan('Posyandu berhasil ditambahkan.')
      }
      setIsi(KOSONG)
      setSunting(null)
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
    setSunting(posyandu)
    setIsi({
      nama: posyandu.nama ?? '',
      dusun: posyandu.dusun ?? '',
      desa: posyandu.desa ?? '',
      kecamatan: posyandu.kecamatan ?? '',
      kabupaten: posyandu.kabupaten ?? '',
      aktif: posyandu.aktif !== false,
    })
    setGalat(null)
    setPesan(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function batalSunting() {
    setSunting(null)
    setIsi(KOSONG)
    setGalat(null)
  }

  return (
    <main className="layar" id="isi-utama">
      <div className="kepala-layar">
        <div>
          <h1>Kelola Posyandu</h1>
          <p>Tambah, sunting, dan hapus data Posyandu di desa.</p>
        </div>
        <button type="button" className="sekunder" onClick={muat}>
          <Ikon nama="sinkron" ukuran={18} />
          Muat ulang
        </button>
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

      <form className="kartu kartu-akun" onSubmit={simpan}>
        <div className="kartu-judul">
          <h3>{sunting ? 'Sunting Posyandu' : 'Posyandu baru'}</h3>
          {sunting && (
            <button type="button" className="tombol-ikon sekunder" onClick={batalSunting} aria-label="Batalkan sunting">
              <Ikon nama="tutup" ukuran={18} />
            </button>
          )}
        </div>
        <div className="grid2 grid-akun">
          <div className="bidang">
            <label htmlFor="ps-nama">
              <span>Nama Posyandu</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="ps-nama"
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
              maxLength={120}
              placeholder="cth. Banyumas"
              value={isi.kabupaten}
              onChange={(e) => setIsi({ ...isi, kabupaten: e.target.value })}
            />
          </div>
          <div className="bidang">
            <label className="baris-rapat" htmlFor="ps-aktif">
              <input
                id="ps-aktif"
                type="checkbox"
                checked={isi.aktif}
                onChange={(e) => setIsi({ ...isi, aktif: e.target.checked })}
                style={{ width: '20px', height: '20px', minHeight: 0 }}
              />
              <span>Aktif</span>
            </label>
            <p className="petunjuk">Posyandu nonaktif tidak muncul di pilihan kader.</p>
          </div>
        </div>
        <div className="aksi-akun">
          <button type="submit" disabled={menyimpan}>
            <Ikon nama="simpan" ukuran={18} />
            {menyimpan ? 'Menyimpan…' : sunting ? 'Simpan perubahan' : 'Tambah Posyandu'}
          </button>
          {sunting && (
            <button type="button" className="sekunder" onClick={batalSunting}>
              Batal
            </button>
          )}
        </div>
      </form>

      <div className="kartu">
        <div className="kartu-judul">
          <h3>Daftar Posyandu</h3>
          <span className="samar">{daftar ? `${daftar.length} Posyandu` : 'Memuat…'}</span>
        </div>
        <div className="tabel-bungkus">
          <table className="tabel">
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
                  <td><strong>{p.nama}</strong></td>
                  <td className="samar">
                    {[p.dusun, p.desa, p.kecamatan, p.kabupaten].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td>
                    <span className={`lencana ${p.aktif ? 'aktif' : 'nonaktif'}`}>
                      {p.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="sel-aksi">
                    <button type="button" className="sekunder" onClick={() => mulaiSunting(p)}>
                      Sunting
                    </button>
                    {konfirm === p.id ? (
                      <span className="baris-rapat spasi-kiri-kecil">
                        <button type="button" className="bahaya" onClick={() => hapus(p)}>
                          Ya, hapus
                        </button>
                        <button type="button" className="tautan" onClick={() => setKonfirm(null)}>
                          Batal
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="bahaya spasi-kiri-kecil"
                        onClick={() => setKonfirm(p.id)}
                      >
                        Hapus
                      </button>
                    )}
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
        <p className="samar teks-bawah">
          Posyandu yang masih memiliki data balita, kunjungan, kader, atau akun tidak bisa dihapus.
          Gunakan status nonaktif bila sudah tidak dipakai.
        </p>
      </div>
    </main>
  )
}
