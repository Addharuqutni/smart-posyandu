import { useEffect, useState } from 'react'
import { GagalJaringan, masuk } from '../jaringan/api.js'
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
      } else if (salah instanceof GagalJaringan) {
        setGalat('Tidak bisa menghubungi server. Sambungkan tablet ke jaringan.')
      } else {
        // Galat selain jaringan (mis. kode klien gagal) jangan dilaporkan
        // sebagai masalah jaringan: itu menyesatkan pencarian penyebab.
        setGalat('Gagal masuk. Muat ulang halaman, lalu coba lagi.')
      }
    } finally {
      setMengirim(false)
    }
  }

  return (
    <main className="masuk">
      <section className="masuk-brand" aria-label="Tentang aplikasi">
        <div className="masuk-merek">
          <img className="masuk-logo" src="/logo-192.png" alt="" width="44" height="44" />
          <span>Smart Posyandu</span>
        </div>

        <div className="masuk-judul">
          <span className="masuk-eyebrow">Sistem pencatatan posyandu</span>
          <h1>Data tumbuh kembang balita, rapi dan terpercaya.</h1>
          <p>
            Pencatatan kunjungan, pengukuran, dan pemantauan gizi balita dalam satu
            tempat yang mudah dipakai kader di lapangan.
          </p>
        </div>

        <ul className="fitur">
          <li>
            <span className="fitur-ikon">
              <Ikon nama="cek" ukuran={16} />
            </span>
            Fitur pemeriksaan rentang nilai secara otomatis mencegah tersimpannya kesalahan hasil pengukuran tanpa terdeteksi.
          </li>
          <li>
            <span className="fitur-ikon">
              <Ikon nama="akun" ukuran={16} />
            </span>
            Proses validasi dilakukan oleh tenaga kesehatan dan setiap riwayat perubahan data tercatat secara sistematis.
          </li>
        </ul>

        <div className="masuk-sorotan" aria-hidden="true">
          <span className="masuk-sorotan-angka">0–7</span>
          <span className="masuk-sorotan-teks">tahun<br />pemantauan balita</span>
        </div>
      </section>

      <section className="masuk-isi">
        <div className="masuk-kartu">
          <h2>Masuk</h2>
          <p>Silakan masukan sesuai dengan akun yang diberikan oleh admin desa</p>

          <form className="kartu" onSubmit={kirim} aria-busy={mengirim}>
            {luring && (
              <div className="pesan peringatan" role="status">
                <Ikon nama="luring" ukuran={18} />
                <span>
                  Tablet sedang luring. Masuk membutuhkan koneksi ke server.
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
