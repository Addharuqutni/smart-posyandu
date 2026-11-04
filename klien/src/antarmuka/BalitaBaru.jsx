import { useEffect, useState } from 'react'
import { simpanBalita } from '../penyimpanan/balita.js'
import { batasTanggalLahir, tanggalHariIni } from '../logika/waktu.js'
import { daftarPosyandu } from '../jaringan/api.js'
import Ikon from './Ikon.jsx'

const AWAL = {
  nama_lengkap: '',
  jenis_kelamin: 'perempuan',
  posyandu_id: '',
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
  const [posyandu, setPosyandu] = useState([])

  useEffect(() => {
    daftarPosyandu()
      .then((b) => {
        const daftar = b.posyandu ?? []
        setPosyandu(daftar)
        if (daftar.length === 1) ubah('posyandu_id', daftar[0].id)
      })
      .catch(() => setPosyandu([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function ubah(kolom, nilai) {
    setIsi((lama) => ({ ...lama, [kolom]: nilai }))
  }

  async function simpan(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setSukses(false)
    if (!isi.posyandu_id) {
      setGalat('Pilih Posyandu lebih dulu.')
      return
    }
    setMengirim(true)
    try {
      await simpanBalita({
        idPerangkat: sesi.id_perangkat,
        pemilik_id: sesi.pengguna.id,
        posyandu_id: isi.posyandu_id,
        nama_lengkap: isi.nama_lengkap,
        jenis_kelamin: isi.jenis_kelamin,
        tanggal_lahir: isi.tanggal_lahir,
        nik: isi.nik.trim() || null,
        wali: {
          posyandu_id: isi.posyandu_id,
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
    <main className="mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Balita baru</h1>
        </div>
        <button type="button" className="sekunder" onClick={kembali}>
          <Ikon nama="kembali" ukuran={18} />
          Kembali
        </button>
      </div>

      {sukses && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-hijau-100 bg-hijau-100 text-hijau-800" role="status">
          <Ikon nama="cek" ukuran={19} />
          <span>Balita tersimpan di tablet dan akan terkirim otomatis.</span>
        </div>
      )}
      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}

      <form className="kartu p-5 max-sempit:p-4" onSubmit={simpan}>
        <div className="kepala-akun mb-5 flex items-start gap-3 max-sempit:mb-4">
          <span className="grid size-[42px] shrink-0 place-items-center rounded-sedang border border-biru-100 bg-biru-50 text-biru-700 max-sempit:size-[38px]">
            <Ikon nama="anak" ukuran={22} />
          </span>
          <div>
            <h2>Pendaftaran Balita Baru</h2>
            <p className="mt-1 mb-0 text-isi text-teks-redup">Data identitas balita dan kontak wali untuk pencatatan Posyandu.</p>
          </div>
        </div>

        <div className="grid gap-4 [grid-template-columns:repeat(2,minmax(0,1fr))] max-sempit:grid-cols-1 max-sempit:gap-3">
          <div className="col-span-2 flex items-center gap-2 border-b border-garis pb-1.5 text-2xs font-bold uppercase tracking-[0.05em] text-aksen-biru-ink max-sempit:col-span-1">
            <Ikon nama="anak" ukuran={15} />
            Identitas Balita
          </div>
          <div className="bidang">
            <label htmlFor="posyandu">
              <span>Posyandu</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <select
              id="posyandu"
              value={isi.posyandu_id}
              onChange={(e) => ubah('posyandu_id', e.target.value)}
              required
            >
              <option value="">— pilih posyandu —</option>
              {posyandu.map((p) => (
                <option key={p.id} value={p.id}>{p.nama}</option>
              ))}
            </select>
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
            <p className="mt-1.5 mb-0 text-padat text-teks-samar">Usia balita maksimal 7 tahun (84 bulan).</p>
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
              <span className="text-padat text-teks-samar">(opsional)</span>
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
          </div>

          <div className="col-span-2 flex items-center gap-2 border-b border-garis pb-1.5 text-2xs font-bold uppercase tracking-[0.05em] text-aksen-biru-ink max-sempit:col-span-1">
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


        <div className="mt-4 flex justify-end border-t border-garis pt-4 max-sempit:[&>button]:w-full">
          <button type="submit" disabled={mengirim}>
            <Ikon nama="simpan" ukuran={18} />
            {mengirim ? 'Menyimpan…' : 'Simpan Balita'}
          </button>
        </div>
      </form>
    </main>
  )
}
