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
    <main className="grid min-h-dvh bg-kartu [grid-template-columns:minmax(0,1.05fr)_minmax(400px,0.95fr)] max-sempit:grid-cols-1 max-sempit:[grid-template-rows:auto_1fr]">
      <section className="relative isolate flex flex-col justify-between gap-[clamp(1.5rem,4vh,3rem)] overflow-hidden bg-[radial-gradient(circle_at_12%_8%,rgb(45_212_191/0.28),transparent_42%),radial-gradient(circle_at_92%_88%,rgb(26_109_168/0.4),transparent_46%),linear-gradient(155deg,var(--color-biru-700)_0%,var(--color-biru-900)_52%,var(--color-biru-950)_100%)] p-[clamp(2rem,5vw,4.25rem)] text-kartu before:pointer-events-none before:absolute before:[inset:auto_-12%_-28%_38%] before:size-[34rem] before:rounded-full before:border before:border-white/[0.09] before:shadow-[0_0_0_4rem_rgb(255_255_255/0.025),0_0_0_9rem_rgb(255_255_255/0.018)] after:pointer-events-none after:absolute after:-top-[30%] after:right-[14%] after:h-[160%] after:w-px after:rotate-[24deg] after:bg-[linear-gradient(transparent,rgb(45_212_191/0.45),transparent)] max-sempit:justify-start max-sempit:gap-4 max-sempit:p-5 max-sempit:before:right-[-8rem] max-sempit:before:bottom-[-12rem] max-sempit:before:left-[40%] max-sempit:before:size-[20rem] max-sempit:after:right-[18%] max-sempit:after:opacity-50" aria-label="Tentang aplikasi">
        <div className="relative z-[1] flex items-center gap-3 text-tombol font-bold tracking-[-0.015em] max-sempit:text-lega">
          <img className="size-12 shrink-0 object-contain [filter:drop-shadow(0_3px_10px_rgb(0_0_0/0.35))] max-sempit:size-10" src="/logo-192.png" alt="" width="44" height="44" />
          <span>Smart Posyandu</span>
        </div>

        <div className="relative z-[1] max-w-[36rem] max-sempit:max-w-none">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-400/35 bg-teal-500/12 px-3 py-1.5 text-2xs font-bold tracking-[0.09em] uppercase text-teal-400 before:size-1.5 before:rounded-full before:bg-teal-400 before:shadow-[0_0_0_3px_var(--color-aksen-teal-tint)] max-sempit:mb-2.5 max-sempit:text-mikro">Sistem pencatatan posyandu</span>
          <h1 className="m-0 mb-4 text-[clamp(2.15rem,3.4vw,3.1rem)] leading-[1.12] tracking-[-0.035em] text-balance max-sempit:mb-0 max-sempit:text-[clamp(1.4rem,6vw,1.75rem)] max-sempit:leading-tight">Data tumbuh kembang balita, rapi dan terpercaya.</h1>
          <p className="m-0 max-w-[45ch] text-base leading-[1.65] text-biru-100 text-pretty max-sempit:hidden">
            Pencatatan kunjungan, pengukuran, dan pemantauan gizi balita dalam satu
            tempat yang mudah dipakai kader di lapangan.
          </p>
        </div>

        <ul className="relative z-[1] m-0 grid max-w-[48ch] list-none gap-3 p-0 max-sempit:hidden">
          <li className="flex items-start gap-3 rounded-sedang border border-white/[0.09] bg-white/[0.055] px-3 py-2 text-isi leading-normal text-biru-50 backdrop-blur-[6px]">
            <span className="grid size-[30px] shrink-0 place-items-center rounded-kecil border border-teal-400/28 bg-teal-400/16 text-teal-400">
              <Ikon nama="cek" ukuran={16} />
            </span>
            Nilai ukur di luar rentang wajar ditolak saat diisi, sebelum tersimpan.
          </li>
          <li className="flex items-start gap-3 rounded-sedang border border-white/[0.09] bg-white/[0.055] px-3 py-2 text-isi leading-normal text-biru-50 backdrop-blur-[6px]">
            <span className="grid size-[30px] shrink-0 place-items-center rounded-kecil border border-teal-400/28 bg-teal-400/16 text-teal-400">
              <Ikon nama="akun" ukuran={16} />
            </span>
            Hasil ukur divalidasi tenaga kesehatan, dan setiap perubahan data tercatat.
          </li>
        </ul>
      </section>

      <section className="relative flex items-center justify-center bg-[radial-gradient(circle_at_85%_8%,rgb(20_184_166/0.09),transparent_38%),var(--color-latar)] p-[clamp(1.5rem,4vw,3rem)] max-sempit:items-start max-sempit:px-5 max-sempit:pt-5 max-sempit:pb-10">
        <div className="relative z-[1] w-full max-w-[430px] max-sempit:mx-auto max-sempit:max-w-[460px]">
          <h2 className="mb-3 text-center text-display font-bold tracking-[-0.03em] text-biru-950 max-sempit:text-judul">Masuk</h2>

          <form className="kartu mb-0 rounded-besar border-garis/90 bg-white/94 p-7 shadow-timbul max-sempit:p-5" onSubmit={kirim} aria-busy={mengirim}>
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
              className={`lebar besar rounded-sedang bg-[linear-gradient(135deg,#0b7285_0%,var(--color-biru-800)_100%)] shadow-timbul hover:bg-[linear-gradient(135deg,#09596b_0%,var(--color-biru-900)_100%)] ${mengirim ? ' memuat' : ''}`}
              disabled={mengirim}
            >
              {mengirim ? 'Memeriksa…' : 'Masuk'}
            </button>
          </form>

          <p className="mt-5 flex items-start gap-2 border-t border-garis pt-4 text-padat leading-normal text-teks-samar max-sempit:mt-3.5">
            <Ikon nama="info" ukuran={16} />
            <span>Lupa kata sandi? Hubungi admin desa untuk menyetel ulang.</span>
          </p>

          <p className="mt-4 text-center text-2xs tracking-[0.01em] text-teks-samar">© 2026 KodeNara. All rights reserved.</p>
        </div>
      </section>
    </main>
  )
}
