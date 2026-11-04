import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import './antarmuka/gaya.css'
import Ikon from './antarmuka/Ikon.jsx'
import Masuk from './antarmuka/Masuk.jsx'

// Dua layar ini dipecah dari bundel awal karena beratnya dan jarang dibuka
// lebih dulu: Riwayat membawa Chart.js (±200 KB) dan hanya perlu saat kader
// membuka satu balita; Laporan hanya dibuka admin desa. Kader yang baru masuk
// tidak perlu mengunduhnya.
const Riwayat = lazy(() => import('./antarmuka/Riwayat.jsx'))
const Laporan = lazy(() => import('./antarmuka/Laporan.jsx'))

/** Layar sementara saat bundel sebuah layar masih diunduh. */
function LayarMemuat() {
  return (
    <main className="mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
      <div className="mb-4 rounded-sedang border border-dashed border-garis-kuat bg-kartu px-5 py-8 text-center">
        <div className="mx-auto mb-3 grid size-[52px] place-items-center rounded-full bg-biru-100 text-biru-700">
          <Ikon nama="sinkron" ukuran={24} />
        </div>
        <h3 className="mb-1.5 text-dasar font-bold text-teks">Memuat layar…</h3>
        <p className="mx-auto mb-0 max-w-[34ch] text-isi text-teks-redup">Mengunduh bagian aplikasi yang dibutuhkan.</p>
      </div>
    </main>
  )
}
import Beranda from './antarmuka/Beranda.jsx'
import Catat from './antarmuka/Catat.jsx'
import BalitaBaru from './antarmuka/BalitaBaru.jsx'
import Validasi from './antarmuka/Validasi.jsx'
import Pengguna from './antarmuka/Pengguna.jsx'
import KelolaBalita from './antarmuka/KelolaBalita.jsx'
import KelolaPosyandu from './antarmuka/KelolaPosyandu.jsx'
import { keluar as cabutSesiApi, saya } from './jaringan/api.js'
import { bacaPengguna, hapusSesi, idPerangkat, simpanPengguna } from './penyimpanan/sesi.js'
import { db } from './penyimpanan/db.js'
import { jalankanSinkron, ambilPenanda } from './logika/sinkron.js'
const KUNCI_SIAP = 'sudah_disiapkan'

const IKON_NAV = {
  beranda: 'balita',
  sesi: 'perangkat',
  baru: 'tambah',
  validasi: 'cek',
  laporan: 'rekap',
  pengguna: 'akun',
  balita: 'anak',
  posyandu: 'posyandu',
}
/** Layar pembuka menurut peran. */
function layarAwal(peran) {
  return { nama: peran === 'admin_desa' ? 'laporan' : peran === 'nakes' ? 'validasi' : 'beranda' }
}

export default function Aplikasi() {
  // Sesi lokal hanya data tampilan; bukti masuk yang sah adalah cookie HttpOnly.
  const [sesi, setSesi] = useState(() => {
    const pengguna = bacaPengguna()
    return pengguna ? { pengguna, id_perangkat: idPerangkat() } : null
  })
  const [layar, setLayar] = useState(() => layarAwal(bacaPengguna()?.peran))
  const [sinkron, setSinkron] = useState({
    mengirim: false,
    luring: false,
    menunggu: 0,
    gagal: 0,
    terakhir: null,
  })
  const [siap, setSiap] = useState(false)
  const [keluarProses, setKeluarProses] = useState(false)
  const [versiData, setVersiData] = useState(0)
  const sedangSinkron = useRef(false)

  const perbaruiAntrean = useCallback(async (pemilikId) => {
    const semua = await db.antrean_sinkron.toArray()
    const milik = semua.filter((a) => pemilikId == null || a.pemilik_id === pemilikId)
    const menunggu = milik.filter((a) => a.status === 'menunggu').length
    const gagal = milik.filter((a) => a.status === 'gagal').length
    const penanda = await ambilPenanda()
    setSinkron((lama) => ({ ...lama, menunggu, gagal, terakhir: penanda.terakhir }))
  }, [])

  const jalankan = useCallback(async () => {
    if (!sesi || sedangSinkron.current) return null
    sedangSinkron.current = true
    setSinkron((lama) => ({ ...lama, mengirim: true }))
    let hasil = null
    try {
      hasil = await jalankanSinkron(sesi.id_perangkat, sesi.pengguna.id)
      if (!hasil.luring) {
        await db.penyiapan.put({ kunci: KUNCI_SIAP, nilai: true })
        setSiap(true)
        setVersiData((n) => n + 1)
      }
      setSinkron((lama) => ({ ...lama, luring: hasil.luring }))
    } catch (salah) {
      if (salah?.status === 401) {
        hapusSesi()
        setSesi(null)
      } else {
        setSinkron((lama) => ({ ...lama, luring: true }))
      }
    } finally {
      sedangSinkron.current = false
      setSinkron((lama) => ({ ...lama, mengirim: false }))
      await perbaruiAntrean(sesi.pengguna.id)
    }
    return hasil
  }, [sesi, perbaruiAntrean])

  useEffect(() => {
    let hidup = true
    db.penyiapan.get(KUNCI_SIAP).then((baris) => {
      if (hidup) setSiap(Boolean(baris?.nilai))
    })
    return () => {
      hidup = false
    }
  }, [])

  // Cookie adalah bukti masuk yang sah. Periksa sekali saat dibuka dan setiap
  // kali jaringan kembali: bila server bilang tidak sah (kedaluwarsa, dicabut,
  // atau habis dipulihkan), sesi lokal dibuang. Saat luring, sesi lokal
  // dipercaya supaya kader tetap bisa mencatat.
  useEffect(() => {
    let hidup = true
    async function periksa() {
      try {
        const jawab = await saya()
        if (!hidup) return
        if (!jawab) {
          hapusSesi()
          setSesi(null)
          return
        }
        simpanPengguna(jawab.pengguna)
        setSesi((lama) => ({
          pengguna: jawab.pengguna,
          id_perangkat: lama?.id_perangkat ?? idPerangkat(),
        }))
      } catch {
        // Luring: jangan tendang kader keluar.
      }
    }
    periksa()
    const daring = () => periksa()
    window.addEventListener('online', daring)
    return () => {
      hidup = false
      window.removeEventListener('online', daring)
    }
  }, [])

  useEffect(() => {
    if (!sesi) return
    let hidup = true
    let berjalan = false
    let timer
    let jeda = 60_000

    async function putaran() {
      if (berjalan) return
      berjalan = true
      const hasil = await jalankan()
      berjalan = false
      if (!hidup) return
      // Luring: jarak ulang makin panjang sampai 10 menit; daring: kembali 1 menit.
      jeda = hasil?.luring ? Math.min(jeda * 2, 10 * 60_000) : 60_000
      timer = setTimeout(putaran, jeda)
    }

    putaran()
    perbaruiAntrean(sesi.pengguna.id)
    const daring = () => {
      jeda = 60_000
      clearTimeout(timer)
      putaran()
    }
    window.addEventListener('online', daring)
    return () => {
      hidup = false
      clearTimeout(timer)
      window.removeEventListener('online', daring)
    }
  }, [sesi, jalankan, perbaruiAntrean])

  function mulai(pengguna) {
    simpanPengguna(pengguna)
    setSesi({ pengguna, id_perangkat: idPerangkat() })
    setLayar(layarAwal(pengguna.peran))
  }

  if (!sesi) {
    return <Masuk saatMasuk={mulai} />
  }

  async function keluar() {
    setKeluarProses(true)
    // Tunggu server benar-benar mencabut sesi SEBELUM antarmuka dibongkar.
    // Sebelumnya permintaan ini "tembak lalu lupa", dan permintaannya dibatalkan
    // saat pohon komponen dibongkar, sehingga sesi di server tetap hidup
    // (terbukti: sesi admin1 masih "aktif" di basis data setelah tombol Keluar).
    // Di tablet bersama itu berarti sesi yang katanya berakhir masih bisa dipakai.
    try {
      await cabutSesiApi()
    } catch {
      // Luring atau server tidak terjangkau: tetap keluar di sisi perangkat.
      // Cookie akan kedaluwarsa sendiri; sesi server bisa dicabut admin dari layar Kelola Akun.
    }
    hapusSesi()
    setKeluarProses(false)
    setSesi(null)
  }

  const peran = sesi.pengguna.peran
  const kader = peran === 'kader'
  const navigasi = []
  if (kader) {
    navigasi.push({ nama: 'beranda', label: 'Balita' })
    navigasi.push({ nama: 'baru', label: 'Tambah' })
  }
  if (peran === 'nakes') navigasi.push({ nama: 'validasi', label: 'Validasi' })
  if (peran === 'admin_desa') {
    navigasi.push({ nama: 'balita', label: 'Balita' })
    navigasi.push({ nama: 'laporan', label: 'Rekap' })
    navigasi.push({ nama: 'posyandu', label: 'Posyandu' })
    navigasi.push({ nama: 'pengguna', label: 'Kelola Akun' })
  }
  const perluSiap = kader && !siap

  let isi
  if (perluSiap) {
    isi = (
      <main className="mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
        <div className="kartu">
          <div className="mx-auto mb-3 grid size-[52px] place-items-center rounded-full bg-biru-100 text-biru-700">
            <Ikon nama="unduh" ukuran={24} />
          </div>
          <h2 className="mb-1.5 text-dasar font-bold text-teks">Penyiapan awal</h2>
          <p className="mx-auto mb-4 max-w-[34ch] text-isi text-teks-redup">
            Unduh salinan daftar balita sebelum mulai mencatat. Ini mencegah balita tercatat dua
            kali.
          </p>
          <button className="besar" onClick={jalankan} disabled={sinkron.mengirim}>
            <Ikon nama="unduh" ukuran={19} />
            {sinkron.mengirim ? 'Mengunduh…' : 'Unduh sekarang'}
          </button>
          {sinkron.luring && (
            <p className="text-isi text-teks-redup" style={{ marginBottom: 0 }}>
              Tidak ada jaringan. Sambungkan tablet ke internet untuk penyiapan awal.
            </p>
          )}
        </div>
      </main>
    )
  } else if (layar.nama === 'catat') {
    isi = (
      <Catat
        sesi={sesi}
        balitaAwal={layar.balita}
        kembali={() => setLayar({ nama: 'beranda' })}
        setelahSimpan={async () => {
          await perbaruiAntrean(sesi.pengguna.id)
          jalankan()
        }}
      />
    )
  } else if (layar.nama === 'riwayat') {
    isi = (
      <Suspense fallback={<LayarMemuat />}>
        <Riwayat
          sesi={sesi}
          balita={layar.balita}
          kembali={() => setLayar({ nama: 'beranda' })}
          setelahUbah={async () => {
            await perbaruiAntrean(sesi.pengguna.id)
            jalankan()
          }}
        />
      </Suspense>
    )
  } else if (layar.nama === 'baru') {
    isi = (
      <BalitaBaru
        sesi={sesi}
        kembali={() => setLayar({ nama: 'beranda' })}
        setelahSimpan={async () => {
          await perbaruiAntrean(sesi.pengguna.id)
          jalankan()
        }}
      />
    )
  } else if (layar.nama === 'validasi') {
    isi = <Validasi sesi={sesi} />
  } else if (layar.nama === 'balita') {
    isi = <KelolaBalita sesi={sesi} />
  } else if (layar.nama === 'posyandu') {
    isi = <KelolaPosyandu />
  } else if (layar.nama === 'laporan') {
    isi = (
      <Suspense fallback={<LayarMemuat />}>
        <Laporan sesi={sesi} />
      </Suspense>
    )
  } else if (layar.nama === 'pengguna') {
    isi = <Pengguna sesi={sesi} />
  } else {
    isi = (
      <Beranda
        sesi={sesi}
        sinkron={sinkron}
        jalankan={jalankan}
        versiData={versiData}
        saatCatat={(balita) => setLayar({ nama: 'catat', balita })}
        saatRiwayat={(balita) => setLayar({ nama: 'riwayat', balita })}
      />
    )
  }

  const peranLabel =
    peran === 'kader' ? 'Kader' : peran === 'nakes' ? 'Petugas kesehatan' : 'Admin desa'
  const namaPengguna = sesi.pengguna.nama_lengkap || sesi.pengguna.nama_pengguna || ''
  const statusKelas = sinkron.mengirim ? 'mengirim' : sinkron.luring ? 'luring' : 'daring'
  const statusTeks = sinkron.mengirim ? 'Menyinkron…' : sinkron.luring ? 'Luring' : 'Tersambung'
  const namaPosyandu = sesi.pengguna.nama_posyandu || 'Desa Ketenger'
  const tampilPosyandu = peran === 'admin_desa'

  return (
    <>
      <a className="fixed top-2 left-2 z-100 -translate-y-[160%] rounded-kecil bg-kartu px-4 py-2.5 font-bold text-biru-900 no-underline shadow-naik focus:translate-y-0" href="#isi-utama">
        Lewati ke isi
      </a>

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[linear-gradient(100deg,var(--color-biru-900)_0%,var(--color-biru-800)_62%,var(--color-aksen-teal-ink)_100%)] text-kartu shadow-kontrol [padding-top:env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-lebar items-center justify-between gap-3 px-4 py-2 max-sempit:min-h-[58px] max-sempit:px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <img className="size-9 shrink-0 object-contain [filter:drop-shadow(0_2px_5px_rgb(0_0_0/0.3))]" src="/logo-192.png" alt="" width="36" height="36" />
            <span className="grid min-w-0 leading-tight">
              <span className="text-tombol font-bold tracking-[0.01em] whitespace-nowrap max-sempit:text-lega">Smart Posyandu</span>
              {tampilPosyandu && (
                <span className="overflow-hidden text-xs text-ellipsis whitespace-nowrap text-biru-100 max-mini:max-w-[120px]" title={namaPosyandu}>
                  {namaPosyandu}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status max-sempit:min-h-8 max-sempit:px-2 max-sempit:text-xs ${statusKelas}`} role="status" aria-live="polite">
              <span className="status-dot" aria-hidden="true" />
              <span className="sr-only">{statusTeks}. </span>
              <span aria-hidden="true" className="max-mini:max-w-[88px] max-mini:overflow-hidden max-mini:text-ellipsis max-mini:whitespace-nowrap">{peranLabel} · {namaPengguna}</span>
            </span>
            <button
              type="button"
              className="min-h-[44px] rounded-full border border-white/22 bg-transparent px-3 py-1.5 text-padat text-kartu shadow-none hover:bg-white/12 max-sempit:size-[44px] max-sempit:min-w-[44px] max-sempit:p-0"
              onClick={keluar}
              disabled={keluarProses}
              title="Keluar dari akun"
            >
              <Ikon nama="keluar" ukuran={17} />
              <span className="max-sempit:hidden">{keluarProses ? 'Keluar…' : 'Keluar'}</span>
            </button>
          </div>
        </div>
      </header>

      {sinkron.menunggu > 0 && (
        <div className="border-b bg-kuning-100 text-kuning-800 border-kuning-100" role="status">
          <div className="mx-auto flex max-w-lebar items-center gap-2 px-4 py-2 text-padat font-semibold max-sempit:text-xs">
            <Ikon nama="sinkron" ukuran={16} />
            <span>
              {sinkron.menunggu} catatan menunggu dikirim ke server
            </span>
            <button
              type="button"
              className="ml-auto min-h-9 rounded-kecil border border-kuning-800 bg-kartu px-3 py-1 text-padat text-kuning-800 shadow-none max-sempit:min-h-12"
              onClick={jalankan}
              disabled={sinkron.mengirim}
            >
              {sinkron.mengirim ? 'Mengirim…' : 'Kirim sekarang'}
            </button>
          </div>
        </div>
      )}

      {sinkron.gagal > 0 && (
        <div className="border-b bg-merah-100 text-merah-800 border-merah-100" role="alert">
          <div className="mx-auto flex max-w-lebar items-center gap-2 px-4 py-2 text-padat font-semibold max-sempit:text-xs">
            <Ikon nama="peringatan" ukuran={16} />
            <span>
              {sinkron.gagal} catatan gagal dikirim. Hubungi admin desa.
            </span>
          </div>
        </div>
      )}

      {isi}

      {navigasi.length > 0 && !perluSiap && (
        <nav className="nav-bawah" aria-label="Navigasi utama">
          <div className="mx-auto flex max-w-lebar justify-center gap-2 px-4 py-1.5">
            {navigasi.map((n) => (
              <button
                key={n.nama}
                type="button"
                className={`nav-tombol ${layar.nama === n.nama ? 'aktif' : ''}`}
                aria-current={layar.nama === n.nama ? 'page' : undefined}
                onClick={() => setLayar({ nama: n.nama })}
              >
                <Ikon nama={IKON_NAV[n.nama]} ukuran={22} />
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </>
  )
}
