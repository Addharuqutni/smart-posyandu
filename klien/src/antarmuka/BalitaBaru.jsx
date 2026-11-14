import { useEffect, useState } from 'react'
import { simpanBalita } from '../penyimpanan/balita.js'
import { batasTanggalLahir, tanggalHariIni } from '../logika/waktu.js'
import { daftarPosyandu } from '../jaringan/api.js'
import Ikon from './Ikon.jsx'
import { Layar } from './Bersama.jsx'

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
  const posyanduKader = sesi?.pengguna?.peran === 'kader' ? (sesi.pengguna.posyandu_id ?? '') : ''
  const [isi, setIsi] = useState(() => ({
    ...AWAL,
    posyandu_id: posyanduKader,
  }))
  const [galat, setGalat] = useState(null)
  const [sukses, setSukses] = useState(false)
  const [mengirim, setMengirim] = useState(false)
  const [posyandu, setPosyandu] = useState([])

  useEffect(() => {
    daftarPosyandu()
      .then((b) => {
        const daftar = b.posyandu ?? []
        setPosyandu(daftar)
        if (posyanduKader) {
          ubah('posyandu_id', posyanduKader)
        } else if (daftar.length === 1) {
          ubah('posyandu_id', daftar[0].id)
        }
      })
      .catch(() => setPosyandu([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posyanduKader])
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
        nik: isi.nik.trim(),
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
    <Layar>
      <div className="kepala-layar mb-4 flex items-center justify-between gap-4">
        <div>
          <h1>Balita baru</h1>
        </div>
        <button type="button" className="sekunder inline-flex items-center gap-1.5" onClick={kembali}>
          <Ikon nama="kembali" ukuran={18} />
          <span>Kembali</span>
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

      <form className="kartu" onSubmit={simpan}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-garis pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-sedang border border-biru-100 bg-biru-50 text-biru-700">
              <Ikon nama="anak" ukuran={24} />
            </span>
            <div>
              <h2 className="text-dasar font-bold text-teks">Pendaftaran Balita Baru</h2>
              <p className="mt-0.5 mb-0 text-padat text-teks-redup">
                Isi identitas balita dan kontak wali untuk pencatatan Posyandu.
              </p>
            </div>
          </div>
          {posyanduKader && sesi.pengguna.nama_posyandu && (
            <div className="flex items-center gap-2 rounded-sedang border border-biru-100 bg-biru-50/70 px-3 py-1.5 text-padat font-medium text-biru-900">
              <Ikon nama="posyandu" ukuran={16} />
              <span>Posyandu: <strong>{sesi.pengguna.nama_posyandu}</strong></span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {/* Bagian Identitas Balita */}
          <section aria-labelledby="judul-identitas-balita">
            <div className="mb-3 flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.075em] text-aksen-biru-ink">
              <Ikon nama="anak" ukuran={15} />
              <span id="judul-identitas-balita">Identitas Balita</span>
            </div>

            <div className="grid grid-cols-2 items-start gap-x-4 gap-y-4 form-satu-kolom">
              {!posyanduKader && (
                <div className="bidang col-span-2 max-sempit:col-span-1">
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
                    <option value="">(Pilih Posyandu)</option>
                    {posyandu.map((p) => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bidang col-span-2 max-sempit:col-span-1">
                <label htmlFor="nama">
                  <span>Nama lengkap balita</span>
                  <span className="wajib" aria-hidden="true">*</span>
                </label>
                <input
                  id="nama"
                name="nama_lengkap"

                  autoComplete="off"
                  placeholder="cth. Muhammad Rizki"
                  value={isi.nama_lengkap}
                  onChange={(e) => ubah('nama_lengkap', e.target.value)}
                  required
                />
              </div>

              <div className="bidang flex flex-col">
                <label htmlFor="lahir">
                  <span>Tanggal lahir</span>
                  <span className="wajib" aria-hidden="true">*</span>
                </label>
                <input
                  id="lahir"
                name="tanggal_lahir"

                  type="date"
                  max={tanggalHariIni()}
                  min={batasTanggalLahir()}
                  value={isi.tanggal_lahir}
                  onChange={(e) => ubah('tanggal_lahir', e.target.value)}
                  required
                />
                <p className="petunjuk mt-1">Maksimal 7 tahun (84 bulan).</p>
              </div>

              <div className="bidang flex flex-col">
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

              <div className="bidang col-span-2 max-sempit:col-span-1">
                <label htmlFor="nik">
                  <span>NIK balita</span>
                  <span className="wajib" aria-hidden="true">*</span>
                </label>
                <input
                  id="nik"
                name="nik"

                  inputMode="numeric"
                  pattern="\d{16}"
                  maxLength={16}
                  autoComplete="off"
                  placeholder="16 digit angka sesuai KK/KIA"
                  value={isi.nik}
                  onChange={(e) => ubah('nik', e.target.value.replace(/\D/g, ''))}
                  aria-describedby="bantuan-nik"
                  required
                />
                <p id="bantuan-nik" className="petunjuk mt-1">Wajib untuk membedakan nama balita kembar.</p>
              </div>
            </div>
          </section>

          {/* Bagian Orang Tua / Wali */}
          <section aria-labelledby="judul-wali" className="border-t border-garis pt-5">
            <div className="mb-3 flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.075em] text-aksen-biru-ink">
              <Ikon nama="balita" ukuran={15} />
              <span id="judul-wali">Data Orang Tua / Wali</span>
            </div>

            <div className="grid grid-cols-2 items-start gap-x-4 gap-y-4 form-satu-kolom">
              <div className="bidang flex flex-col">
                <label htmlFor="wali">
                  <span>Nama wali</span>
                  <span className="wajib" aria-hidden="true">*</span>
                </label>
                <input
                  id="wali"
                name="nama_wali"

                  autoComplete="off"
                  placeholder="cth. Maryani"
                  value={isi.wali_nama}
                  onChange={(e) => ubah('wali_nama', e.target.value)}
                  required
                />
              </div>

              <div className="bidang flex flex-col">
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

              <div className="bidang col-span-2 max-sempit:col-span-1">
                <label htmlFor="kontak">
                  <span>Nomor kontak (HP/WA)</span>
                  <span className="text-padat text-teks-samar">(opsional)</span>
                </label>
                <input
                  id="kontak"
                name="kontak_wali"

                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="cth. 08123456789"
                  value={isi.nomor_kontak}
                  onChange={(e) => ubah('nomor_kontak', e.target.value)}
                />
              </div>

              <div className="bidang col-span-2 max-sempit:col-span-1">
                <label htmlFor="alamat">
                  <span>Alamat domisili</span>
                  <span className="text-padat text-teks-samar">(opsional)</span>
                </label>
                <input
                  id="alamat"
                name="alamat"

                  autoComplete="street-address"
                  placeholder="cth. RT 02 / RW 01, Dusun Melati"
                  value={isi.alamat}
                  onChange={(e) => ubah('alamat', e.target.value)}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-garis pt-4 max-sempit:[&>button]:w-full">
          <button type="submit" disabled={mengirim}>
            <Ikon nama="simpan" ukuran={18} />
            {mengirim ? 'Menyimpan…' : 'Simpan Balita'}
          </button>
        </div>
      </form>
    </Layar>
  )
}
