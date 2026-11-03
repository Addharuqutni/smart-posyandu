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
    <main className="layar" id="isi-utama">
      <div className="kosong">
        <div className="kosong-ikon">
          <Ikon nama="sinkron" ukuran={24} />
        </div>
        <h3>Memuat layar…</h3>
        <p>Mengunduh bagian aplikasi yang dibutuhkan.</p>
      </div>
    </main>
  )
}
import Beranda from './antarmuka/Beranda.jsx'
import Catat from './antarmuka/Catat.jsx'
import BalitaBaru from './antarmuka/BalitaBaru.jsx'
import Validasi from './antarmuka/Validasi.jsx'
import Pengguna from './antarmuka/Pengguna.jsx'
import RiwayatMasuk from './antarmuka/RiwayatMasuk.jsx'
import KelolaBalita from './antarmuka/KelolaBalita.jsx'
import { bacaPengguna, hapusSesi, idPerangkat, simpanPengguna } from './penyimpanan/sesi.js'
import { db } from './penyimpanan/db.js'
import { keluar as cabutSesiApi, saya } from './jaringan/api.js'
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
      // Cookie akan kedaluwarsa sendiri; sesi server bisa dicabut admin dari layar Akun.
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
  if (kader || peran === 'nakes') navigasi.push({ nama: 'sesi', label: 'Perangkat' })
  if (peran === 'admin_desa') {
    navigasi.push({ nama: 'balita', label: 'Balita' })
    navigasi.push({ nama: 'laporan', label: 'Rekap' })
    navigasi.push({ nama: 'pengguna', label: 'Akun' })
  }
  const perluSiap = kader && !siap

  let isi
  if (perluSiap) {
    isi = (
      <main className="layar" id="isi-utama">
        <div className="kartu">
          <div className="kosong-ikon">
            <Ikon nama="unduh" ukuran={24} />
          </div>
          <h2 style={{ marginTop: 0 }}>Penyiapan awal</h2>
          <p>
            Unduh salinan daftar balita sebelum mulai mencatat. Ini mencegah balita tercatat dua
            kali.
          </p>
          <button className="besar" onClick={jalankan} disabled={sinkron.mengirim}>
            <Ikon nama="unduh" ukuran={19} />
            {sinkron.mengirim ? 'Mengunduh…' : 'Unduh sekarang'}
          </button>
          {sinkron.luring && (
            <p className="redup" style={{ marginBottom: 0 }}>
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
  } else if (layar.nama === 'laporan') {
    isi = (
      <Suspense fallback={<LayarMemuat />}>
        <Laporan sesi={sesi} />
      </Suspense>
    )
  } else if (layar.nama === 'pengguna') {
    isi = <Pengguna sesi={sesi} />
  } else if (layar.nama === 'sesi') {
    isi = <RiwayatMasuk sesi={sesi} />
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

  return (
    <>
      <a className="lewati" href="#isi-utama">
        Lewati ke isi
      </a>

      <header className="bilah-atas">
        <div className="bilah-isi">
          <div className="merek">
            <span className="merek-ikon">
              <Ikon nama="posyandu" ukuran={22} />
            </span>
            <span className="merek-teks">
              <span className="merek-nama">Smart Posyandu</span>
              <span className="merek-sub" title={namaPosyandu}>
                {namaPosyandu}
              </span>
            </span>
          </div>
          <div className="status-wadah">
            <span
              className={`status ${statusKelas}`}
              role="status"
              aria-live="polite"
              title={statusTeks}
            >
              <span className="status-dot" />
              <span>{peranLabel} · {namaPengguna}</span>
            </span>
            <button
              type="button"
              className="tombol-keluar"
              onClick={keluar}
              disabled={keluarProses}
              title="Keluar dari akun"
            >
              <Ikon nama="keluar" ukuran={17} />
              <span>{keluarProses ? 'Keluar…' : 'Keluar'}</span>
            </button>
          </div>
        </div>
      </header>

      {sinkron.menunggu > 0 && (
        <div className="strip-antrean" role="status">
          <div>
            <Ikon nama="sinkron" ukuran={16} />
            <span>
              {sinkron.menunggu} catatan menunggu dikirim ke server
            </span>
            <button type="button" onClick={jalankan} disabled={sinkron.mengirim}>
              {sinkron.mengirim ? 'Mengirim…' : 'Kirim sekarang'}
            </button>
          </div>
        </div>
      )}

      {sinkron.gagal > 0 && (
        <div className="strip-antrean gagal" role="alert">
          <div>
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
          <div className="nav-isi">
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
