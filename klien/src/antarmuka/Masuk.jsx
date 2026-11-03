import { useEffect, useState } from 'react'
import { masuk } from '../jaringan/api.js'
import { deteksiPerangkatRil } from '../penyimpanan/sesi.js'
import Ikon from './Ikon.jsx'

export default function Masuk({ saatMasuk }) {
  const [nama, setNama] = useState('')
  const [sandi, setSandi] = useState('')
  const [tampilSandi, setTampilSandi] = useState(false)
  const [luring, setLuring] = useState(() => !navigator.onLine)
  const [galat, setGalat] = useState(null)
  const [mengirim, setMengirim] = useState(false)

  useEffect(() => {
    const perbarui = () => setLuring(!navigator.onLine)
    window.addEventListener('online', perbarui)
    window.addEventListener('offline', perbarui)
    return () => {
      window.removeEventListener('online', perbarui)
      window.removeEventListener('offline', perbarui)
    }
  }, [])

  async function kirim(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setMengirim(true)
    try {
      const idPerangkatDipakai = await deteksiPerangkatRil()
      // Token sesi datang sebagai cookie HttpOnly; badan balasan hanya berisi
      // data pemakai yang boleh dibaca JavaScript.
      const balasan = await masuk(nama.trim(), sandi, idPerangkatDipakai)
      saatMasuk(balasan.pengguna)
    } catch (salah) {
      if (salah.status === 429) {
        setGalat('Terlalu banyak percobaan. Coba lagi 15 menit lagi.')
      } else if (salah.status === 401) {
        setGalat('Username atau kata sandi salah.')
      } else {
        setGalat('Tidak bisa menghubungi server. Sambungkan tablet ke jaringan.')
      }
    } finally {
      setMengirim(false)
    }
  }

  return (
    <main className="masuk">
      <section className="masuk-brand" aria-label="Tentang aplikasi">
        <div className="masuk-merek">
          <span className="merek-ikon">
            <Ikon nama="posyandu" ukuran={24} />
          </span>
          <span>Smart Posyandu</span>
        </div>

        <div className="masuk-judul">
          <h1>Catatan tumbuh balita, tetap utuh tanpa sinyal.</h1>
          <p>
            Pencatatan kunjungan Posyandu Desa Ketenger. Data tersimpan di tablet lebih dulu,
            lalu terkirim sendiri saat jaringan tersedia.
          </p>
        </div>

        <ul className="fitur">
          <li>
            <span className="fitur-ikon">
              <Ikon nama="luring" ukuran={16} />
            </span>
            Tetap bisa mencatat saat 4G hilang di lereng Slamet.
          </li>
          <li>
            <span className="fitur-ikon">
              <Ikon nama="cek" ukuran={16} />
            </span>
            Pemeriksaan rentang nilai mencegah salah ukur tersimpan diam-diam.
          </li>
          <li>
            <span className="fitur-ikon">
              <Ikon nama="akun" ukuran={16} />
            </span>
            Petugas kesehatan memvalidasi; setiap perubahan tercatat.
          </li>
        </ul>

        <p className="samar pilot-catatan">
          Pilot 1 Posyandu · Kec. Baturraden, Kab. Banyumas
        </p>
      </section>

      <section className="masuk-isi">
        <div className="masuk-kartu">
          <h2>Masuk ke tablet</h2>
          <p>Gunakan akun yang diberikan admin desa.</p>

          <form className="kartu" onSubmit={kirim} aria-busy={mengirim}>
            {luring && (
              <div className="pesan peringatan" role="status">
                <Ikon nama="luring" ukuran={18} />
                <span>
                  Tablet sedang luring. Masuk butuh koneksi; pencatatan setelah masuk tetap bisa
                  luring.
                </span>
              </div>
            )}
            {galat && (
              <div className="pesan galat" role="alert">
                <Ikon nama="peringatan" ukuran={18} />
                <span>{galat}</span>
              </div>
            )}

            <div className="bidang">
              <label htmlFor="nama">
                <span>Username</span>
                <span className="wajib" aria-hidden="true">*</span>
              </label>
              <input
                id="nama"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Masukkan username"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
              />
            </div>

            <div className="bidang bidang-sandi">
              <label htmlFor="sandi">
                <span>Kata sandi</span>
                <span className="wajib" aria-hidden="true">*</span>
              </label>
              <input
                id="sandi"
                type={tampilSandi ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Masukkan kata sandi"
                value={sandi}
                onChange={(e) => setSandi(e.target.value)}
                required
              />
              <button
                type="button"
                className="tombol-sandi"
                onClick={() => setTampilSandi((lama) => !lama)}
                aria-label={tampilSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                aria-pressed={tampilSandi}
              >
                <Ikon nama={tampilSandi ? 'mata-tutup' : 'mata'} ukuran={20} />
              </button>
            </div>


            <button
              type="submit"
              className={`lebar besar${mengirim ? ' memuat' : ''}`}
              disabled={mengirim}
            >
              {mengirim ? 'Memeriksa…' : 'Masuk'}
            </button>
          </form>

          <p className="masuk-kaki">
            <Ikon nama="info" ukuran={16} />
            <span>Lupa kata sandi? Hubungi admin desa untuk menyetel ulang.</span>
          </p>
        </div>
      </section>
    </main>
  )
}
