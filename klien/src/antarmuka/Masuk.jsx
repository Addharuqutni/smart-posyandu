import { useEffect, useState } from 'react'
import { GagalJaringan, masuk } from '../jaringan/api.js'
import { deteksiPerangkatRil } from '../penyimpanan/sesi.js'
import Ikon from './Ikon.jsx'

export default function Masuk({ saatMasuk, kePublik }) {
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
    <main className="grid min-h-dvh bg-kartu [grid-template-columns:minmax(0,1.05fr)_minmax(400px,0.95fr)] max-sempit:grid-cols-1 max-sempit:[grid-template-rows:auto_1fr]">
      <section className="editorial relative isolate flex flex-col justify-between gap-[clamp(1.5rem,4vh,3rem)] overflow-hidden bg-[image:var(--latar-kepala-masuk)] p-[clamp(2rem,5vw,4.25rem)] text-kartu max-sempit:justify-start max-sempit:gap-4 max-sempit:p-5" aria-label="Tentang aplikasi">
        <div className="relative z-[1] flex items-center gap-3 text-tombol font-bold tracking-[-0.015em] max-sempit:text-isi">
          <img className="size-12 shrink-0 object-contain [filter:drop-shadow(0_3px_10px_rgb(0_0_0/0.35))] max-sempit:size-10" src="/logo-192.png" alt="" width="44" height="44" />
          <span>Smart Posyandu</span>
        </div>

        <div className="relative z-[1] max-w-[36rem] max-sempit:max-w-none">
          <span className="mb-4 block text-2xs font-bold tracking-[0.08em] uppercase text-teal-400 max-sempit:mb-2.5">Sistem pencatatan posyandu</span>
          <h1 className="m-0 mb-4 text-panggung font-semibold tracking-[-0.015em] text-balance text-white max-sempit:mb-0 max-sempit:leading-tight">Data tumbuh kembang balita, rapi dan terpercaya.</h1>
          <p className="m-0 max-w-[45ch] text-dasar leading-relaxed text-biru-100 text-pretty max-sempit:hidden">
            Pencatatan kunjungan, pengukuran, dan pemantauan gizi balita dalam satu
            tempat yang mudah dipakai kader di lapangan.
          </p>
        </div>

        <ul className="relative z-[1] m-0 grid max-w-[48ch] list-none gap-2.5 p-0 max-sempit:hidden">
          <li className="flex items-start gap-3 px-0 py-1 text-isi leading-normal text-biru-50">
            <span className="mt-0.5 grid size-[26px] shrink-0 place-items-center rounded-mikro border border-white/15 bg-white/8 text-biru-100">
              <Ikon nama="cek" ukuran={15} />
            </span>
            Nilai ukur di luar rentang wajar ditolak saat diisi, sebelum tersimpan.
          </li>
          <li className="flex items-start gap-3 px-0 py-1 text-isi leading-normal text-biru-50">
            <span className="mt-0.5 grid size-[26px] shrink-0 place-items-center rounded-mikro border border-white/15 bg-white/8 text-biru-100">
              <Ikon nama="akun" ukuran={15} />
            </span>
            Hasil ukur divalidasi tenaga kesehatan, dan setiap perubahan data tercatat.
          </li>
        </ul>
      </section>

      <section className="relative flex items-center justify-center bg-latar p-[clamp(1.5rem,4vw,3rem)] max-sempit:items-start max-sempit:px-5 max-sempit:pt-5 max-sempit:pb-10">
        <div className="relative z-[1] w-full max-w-[430px] max-sempit:mx-auto max-sempit:max-w-[460px]">
          <h2 className="mb-3 text-center text-display font-bold tracking-[-0.03em] text-biru-950 max-sempit:text-judul">Masuk</h2>

          <form className="kartu mb-0 rounded-besar border-garis bg-kartu p-4 shadow-halus max-sempit:p-4" onSubmit={kirim} aria-busy={mengirim}>
            {luring && (
              <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-kuning-800 bg-kuning-100 text-kuning-800" role="status">
                <Ikon nama="luring" ukuran={18} />
                <span>
                  Tablet sedang luring. Masuk membutuhkan koneksi ke server.
                </span>
              </div>
            )}
            {galat && (
              <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
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
                name="username"

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
                name="kata_sandi"

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

            <button type="submit" className={`lebar besar rounded-sedang ${mengirim ? ' memuat' : ''}`} disabled={mengirim}>
              {mengirim ? 'Memeriksa…' : 'Masuk'}
            </button>
          </form>
          <div className="mt-5 border-t border-garis pt-4">
            {kePublik && (
              <button
                type="button"
                className="sekunder lebar mb-3 flex items-center justify-center gap-2 font-medium"
                onClick={kePublik}
              >
                <Ikon nama="posyandu" ukuran={17} />
                <span>Lihat Kanal Publik & Jadwal Posyandu</span>
              </button>
            )}
            <p className="flex items-start gap-2 text-padat leading-normal text-teks-samar">
              <Ikon nama="info" ukuran={16} />
              <span>Lupa kata sandi? Hubungi admin desa untuk menyetel ulang.</span>
            </p>
          </div>
          <p className="mt-4 text-center text-2xs tracking-[0.01em] text-teks-samar">© 2026 KodeNara. All rights reserved.</p>
        </div>
      </section>
    </main>
  )
}
