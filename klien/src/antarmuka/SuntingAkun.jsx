import { useEffect, useState } from 'react'
import { perbaruiAkun } from '../jaringan/api.js'
import Ikon from './Ikon.jsx'

const PESAN_GALAT = {
  nama_pengguna_sudah_dipakai: 'Username sudah dipakai akun lain.',
  nama_pengguna_tidak_sah: 'Username hanya huruf kecil, angka, titik, garis bawah, atau strip (3–50 karakter).',
  nama_tidak_sah: 'Nama lengkap wajib diisi, maksimal 120 karakter.',
  tidak_diizinkan: 'Akun ini hanya boleh mengubah datanya sendiri.',
}

/**
 * Sunting nama dan username akun. Pemakai biasa hanya akunnya sendiri; admin
 * desa mendapat `daftar` berisi seluruh akun dan boleh memilih salah satu.
 */
export default function SuntingAkun({ sesi, daftar = [], setelahSimpan, saatSelesai }) {
  const admin = sesi.pengguna.peran === 'admin_desa'
  const [idTerpilih, setIdTerpilih] = useState('')
  const [namaLengkap, setNamaLengkap] = useState(sesi.pengguna.nama_lengkap ?? '')
  const [namaPengguna, setNamaPengguna] = useState(sesi.pengguna.nama_pengguna ?? '')
  const [galat, setGalat] = useState(null)
  const [pesan, setPesan] = useState(null)
  const [menyimpan, setMenyimpan] = useState(false)

  const akun = daftar.find((a) => a.id === idTerpilih) ?? sesi.pengguna

  useEffect(() => {
    setNamaLengkap(akun.nama_lengkap ?? '')
    setNamaPengguna(akun.nama_pengguna ?? '')
  }, [idTerpilih, akun.nama_lengkap, akun.nama_pengguna])

  function pilihAkun(id) {
    setIdTerpilih(id)
    setGalat(null)
    setPesan(null)
  }

  async function simpan(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setPesan(null)
    const nama = namaLengkap.trim()
    const pengguna = namaPengguna.trim()
    if (!nama || !pengguna) {
      setGalat('Nama lengkap dan username wajib diisi.')
      return
    }
    setMenyimpan(true)
    try {
      const muatan = { nama_lengkap: nama, nama_pengguna: pengguna }
      if (idTerpilih) muatan.id = idTerpilih
      const hasil = await perbaruiAkun(muatan)
      setPesan('Data akun berhasil diperbarui.')
      if (hasil.id === sesi.pengguna.id) {
        // Akun sendiri: perbarui identitas yang tampil di bilah atas.
        setelahSimpan({
          ...sesi.pengguna,
          nama_lengkap: hasil.nama_lengkap,
          nama_pengguna: hasil.nama_pengguna,
        })
      } else {
        setelahSimpan(null)
      }
    } catch (salah) {
      setGalat(PESAN_GALAT[salah.rincian] ?? salah.rincian ?? 'Gagal menyimpan perubahan akun.')
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <form className="kartu kartu-akun" onSubmit={simpan}>
      <div className="kartu-judul">
        <h3>Perbarui data akun</h3>
        {saatSelesai && (
          <button type="button" className="tombol-ikon sekunder" onClick={saatSelesai} aria-label="Tutup formulir">
            <Ikon nama="tutup" ukuran={18} />
          </button>
        )}
      </div>
      <p className="redup petunjuk-atas">
        {admin
          ? 'Admin desa dapat memperbarui nama dan username seluruh akun.'
          : 'Anda hanya dapat memperbarui nama dan username akun sendiri.'}
      </p>

      {admin && daftar.length > 0 && (
        <div className="bidang">
          <label htmlFor="akun-pilih">Akun yang diperbarui</label>
          <select id="akun-pilih" value={idTerpilih} onChange={(e) => pilihAkun(e.target.value)}>
            <option value="">Akun saya sendiri</option>
            {daftar.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama_lengkap} ({p.nama_pengguna})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid2 grid-akun">
        <div className="bidang">
          <label htmlFor="akun-nama">
            <span>Nama lengkap</span>
            <span className="wajib" aria-hidden="true">*</span>
          </label>
          <input
            id="akun-nama"
            autoComplete="name"
            maxLength={120}
            value={namaLengkap}
            onChange={(e) => setNamaLengkap(e.target.value)}
            required
          />
        </div>
        <div className="bidang">
          <label htmlFor="akun-pengguna">
            <span>Username</span>
            <span className="wajib" aria-hidden="true">*</span>
          </label>
          <input
            id="akun-pengguna"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={50}
            value={namaPengguna}
            onChange={(e) => setNamaPengguna(e.target.value)}
            required
          />
          <p className="petunjuk">Huruf kecil, angka, titik, garis bawah, atau strip (3–50 karakter).</p>
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

      <div className="aksi-akun">
        <button type="submit" disabled={menyimpan}>
          <Ikon nama="simpan" ukuran={18} />
          {menyimpan ? 'Menyimpan…' : 'Simpan perubahan'}
        </button>
      </div>
    </form>
  )
}
