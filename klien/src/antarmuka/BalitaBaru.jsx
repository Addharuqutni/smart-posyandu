import { useState } from 'react'
import { simpanBalita } from '../penyimpanan/balita.js'
import { batasTanggalLahir, tanggalHariIni } from '../logika/waktu.js'
import Ikon from './Ikon.jsx'

const AWAL = {
  nama_lengkap: '',
  jenis_kelamin: 'perempuan',
  tanggal_lahir: '',
  nik: '',
  wali_nama: '',
  hubungan: 'ibu_kandung',
  nomor_kontak: '',
  alamat: '',
}

export default function BalitaBaru({ sesi, setelahSimpan, kembali }) {
  const [isi, setIsi] = useState(AWAL)
  const [galat, setGalat] = useState(null)
  const [sukses, setSukses] = useState(false)
  const [mengirim, setMengirim] = useState(false)

  function ubah(kolom, nilai) {
    setIsi((lama) => ({ ...lama, [kolom]: nilai }))
  }

  async function simpan(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setSukses(false)
    setMengirim(true)
    try {
      await simpanBalita({
        idPerangkat: sesi.id_perangkat,
        pemilik_id: sesi.pengguna.id,
        nama_lengkap: isi.nama_lengkap,
        jenis_kelamin: isi.jenis_kelamin,
        tanggal_lahir: isi.tanggal_lahir,
        nik: isi.nik.trim() || null,
        wali: {
          posyandu_id: sesi.pengguna.posyandu_id,
          nama_lengkap: isi.wali_nama,
          hubungan: isi.hubungan,
          nomor_kontak: isi.nomor_kontak,
          alamat: isi.alamat,
          nik: null,
        },
      })
      setSukses(true)
      setIsi(AWAL)
      setelahSimpan?.()
    } catch (salah) {
      setGalat(salah.message)
    } finally {
      setMengirim(false)
    }
  }

  return (
    <main className="layar" id="isi-utama">
      <div className="kepala-layar">
        <div>
          <h1>Balita baru</h1>
          <p>Daftarkan balita dan wali. Tersimpan di tablet, terkirim saat ada jaringan.</p>
        </div>
        <button type="button" className="sekunder" onClick={kembali}>
          <Ikon nama="kembali" ukuran={18} />
          Kembali
        </button>
      </div>

      {sukses && (
        <div className="pesan sukses" role="status">
          <Ikon nama="cek" ukuran={19} />
          <span>Balita tersimpan di tablet dan akan terkirim otomatis.</span>
        </div>
      )}
      {galat && (
        <div className="pesan galat" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}

      <form className="kartu kartu-akun" onSubmit={simpan}>
        <div className="kepala-akun">
          <span className="kepala-akun-ikon">
            <Ikon nama="anak" ukuran={22} />
          </span>
          <div>
            <h3>Pendaftaran Balita Baru</h3>
            <p>Data identitas balita dan kontak wali untuk pencatatan Posyandu.</p>
          </div>
        </div>

        <div className="grid2 grid-akun">
          <div className="seksi-form-judul">
            <Ikon nama="anak" ukuran={15} />
            Identitas Balita
          </div>

          <div className="bidang">
            <label htmlFor="nama">
              <span>Nama lengkap balita</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="nama"
              autoComplete="off"
              placeholder="cth. Muhammad Rizki"
              value={isi.nama_lengkap}
              onChange={(e) => ubah('nama_lengkap', e.target.value)}
              required
            />
          </div>

          <div className="bidang">
            <label htmlFor="lahir">
              <span>Tanggal lahir</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="lahir"
              type="date"
              max={tanggalHariIni()}
              min={batasTanggalLahir()}
              value={isi.tanggal_lahir}
              onChange={(e) => ubah('tanggal_lahir', e.target.value)}
              required
            />
            <p className="petunjuk">Usia balita maksimal 7 tahun (84 bulan).</p>
          </div>

          <div className="bidang">
            <label htmlFor="jenis_kelamin">
              <span>Jenis kelamin</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <select
              id="jenis_kelamin"
              value={isi.jenis_kelamin}
              onChange={(e) => ubah('jenis_kelamin', e.target.value)}
              required
            >
              <option value="perempuan">Perempuan</option>
              <option value="laki-laki">Laki-laki</option>
            </select>
          </div>

          <div className="bidang">
            <label htmlFor="nik">
              <span>NIK balita</span>
              <span className="samar">(opsional)</span>
            </label>
            <input
              id="nik"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={16}
              autoComplete="off"
              placeholder="16 digit angka"
              value={isi.nik}
              onChange={(e) => ubah('nik', e.target.value)}
              aria-describedby="bantuan-nik"
            />
            <p className="petunjuk" id="bantuan-nik">
              Hanya dikirim ke server; tidak disimpan di tablet ini.
            </p>
          </div>

          <div className="seksi-form-judul">
            <Ikon nama="balita" ukuran={15} />
            Data Orang Tua / Wali
          </div>

          <div className="bidang">
            <label htmlFor="wali">
              <span>Nama wali</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="wali"
              autoComplete="off"
              placeholder="cth. Maryani"
              value={isi.wali_nama}
              onChange={(e) => ubah('wali_nama', e.target.value)}
              required
            />
          </div>

          <div className="bidang">
            <label htmlFor="hubungan">
              <span>Hubungan dengan balita</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <select
              id="hubungan"
              value={isi.hubungan}
              onChange={(e) => ubah('hubungan', e.target.value)}
            >
              <option value="ibu_kandung">Ibu kandung</option>
              <option value="ayah_kandung">Ayah kandung</option>
              <option value="wali">Wali</option>
            </select>
          </div>

          <div className="bidang">
            <label htmlFor="kontak">
              <span>Nomor kontak (HP/WA)</span>
            </label>
            <input
              id="kontak"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="cth. 08123456789"
              value={isi.nomor_kontak}
              onChange={(e) => ubah('nomor_kontak', e.target.value)}
            />
            <p className="petunjuk">Dipakai kader untuk menghubungi wali bila perlu.</p>
          </div>

          <div className="bidang">
            <label htmlFor="alamat">
              <span>Alamat domisili</span>
            </label>
            <input
              id="alamat"
              autoComplete="street-address"
              placeholder="cth. RT 02 / RW 01, Dusun Melati"
              value={isi.alamat}
              onChange={(e) => ubah('alamat', e.target.value)}
            />
          </div>
        </div>

        <div className="catatan">
          Data balita adalah data pribadi anak yang dilindungi. NIK tersimpan terenkripsi.
        </div>

        <div className="aksi-akun">
          <button type="submit" disabled={mengirim}>
            <Ikon nama="simpan" ukuran={18} />
            {mengirim ? 'Menyimpan…' : 'Simpan Balita'}
          </button>
        </div>
      </form>
    </main>
  )
}
