import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import './antarmuka/gaya.css'
import Ikon from './antarmuka/Ikon.jsx'
import { Modal } from './antarmuka/Bersama.jsx'
import { inisial } from './logika/nama.js'
import Masuk from './antarmuka/Masuk.jsx'
import KanalPublik from './antarmuka/KanalPublik.jsx'
import CekAnak from './antarmuka/CekAnak.jsx'

// Dua layar ini dipecah dari bundel awal karena beratnya dan jarang dibuka
// lebih dulu: Riwayat membawa Chart.js (±200 KB) dan hanya perlu saat kader
// membuka satu balita; Laporan hanya dibuka admin desa. Kader yang baru masuk
// tidak perlu mengunduhnya.
const Riwayat = lazy(() => import('./antarmuka/Riwayat.jsx'))
const Laporan = lazy(() => import('./antarmuka/Laporan.jsx'))

/** Layar sementara saat bundel sebuah layar masih diunduh. */
function LayarMemuat() {
  return (
    <main className="masuk-pudar mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-2 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-1.5 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
      <div className="mb-4 rounded-sedang border border-dashed border-garis-kuat bg-kartu px-5 py-8 text-center">
        <div className="mx-auto mb-3 grid size-[52px] place-items-center rounded-sedang bg-biru-100 text-biru-700">
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
import LogAktivitas from './antarmuka/LogAktivitas.jsx'
import KelolaBalita from './antarmuka/KelolaBalita.jsx'
import KelolaPosyandu from './antarmuka/KelolaPosyandu.jsx'
import KelolaKonten from './antarmuka/KelolaKonten.jsx'
import { keluar as cabutSesiApi, saya } from './jaringan/api.js'
import { bacaPengguna, hapusSesi, idPerangkat, simpanPengguna } from './penyimpanan/sesi.js'
import { db } from './penyimpanan/db.js'
import { jalankanSinkron, ambilPenanda } from './logika/sinkron.js'
import { jalurDari, layarDari } from './logika/rute.js'
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
  konten: 'rekap',
  log: 'waktu',
}
/** Layar pembuka menurut peran (tamu dibawa ke beranda kanal publik). */
function layarAwal(peran) {
  if (!peran) return { nama: 'publik' }
  return { nama: peran === 'admin_desa' ? 'laporan' : peran === 'nakes' ? 'validasi' : 'beranda' }
}

export default function Aplikasi() {
  // Sesi lokal hanya data tampilan; bukti masuk yang sah adalah cookie HttpOnly.
  const [sesi, setSesi] = useState(() => {
    const pengguna = bacaPengguna()
    return pengguna ? { pengguna, id_perangkat: idPerangkat() } : null
  })
  const [layar, setLayar] = useState(() => {
    const pengguna = bacaPengguna()
    const awal = layarDari(window.location.pathname + window.location.hash, pengguna?.peran, layarAwal(pengguna?.peran))
    return window.history.state?.layar ?? awal
  })
  const [sinkron, setSinkron] = useState({
    mengirim: false,
    luring: false,
    menunggu: 0,
    gagal: 0,
    terakhir: null,
  })
  const [siap, setSiap] = useState(false)
  const [keluarProses, setKeluarProses] = useState(false)
  const [konfirmasiKeluar, setKonfirmasiKeluar] = useState(false)
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

  // Satu-satunya jalan berpindah layar: History API pushState/replaceState.
  // Muatan layar (mis. objek balita) disimpan di history.state supaya selamat
  // saat reload dan Back/Forward, tanpa mengubah bentuk URL bersih.
  const pindah = useCallback(
    (l, ganti = false) => {
      const jalur = jalurDari(l)
      const salin = l.balita && (({ id, nama_lengkap, jenis_kelamin, tanggal_lahir, posyandu_id, nama_ibu_kandung, wali }) => ({ id, nama_lengkap, jenis_kelamin, tanggal_lahir, posyandu_id, nama_ibu_kandung, wali }))(l.balita)
      const state = { ...window.history.state, layar: salin ? { ...l, balita: salin } : l }
      const jalurKini = window.location.pathname
      if (jalurKini !== jalur || window.location.hash || ganti) {
        if (ganti) window.history.replaceState(state, '', jalur)
        else window.history.pushState(state, '', jalur)
      }
      setLayar(l)
    },
    [],
  )

  // Tombol Back/Forward dan edit URL manual ikut mengubah layar, baik tamu
  // maupun petugas. Menghilangkan hash warisan otomatis bila ditempel.
  useEffect(() => {
    const padaUbahRute = () => {
      const bawaan = layarAwal(sesi?.pengguna.peran)
      const lokasi = window.location.pathname + window.location.hash
      const muatan = window.history.state?.layar
      const tujuan = layarDari(lokasi, sesi?.pengguna.peran, bawaan, muatan)
      setLayar(tujuan)
      // Rapikan URL bila path tidak sah atau masih membawa tanda # warisan:
      const jalurSah = jalurDari(tujuan)
      if (window.location.pathname !== jalurSah || window.location.hash) {
        window.history.replaceState(window.history.state, '', jalurSah)
      }
    }
    window.addEventListener('popstate', padaUbahRute)
    window.addEventListener('hashchange', padaUbahRute)
    padaUbahRute()
    return () => {
      window.removeEventListener('popstate', padaUbahRute)
      window.removeEventListener('hashchange', padaUbahRute)
    }
  }, [sesi])

  function mulai(pengguna) {
    simpanPengguna(pengguna)
    setSesi({ pengguna, id_perangkat: idPerangkat() })
    pindah(layarAwal(pengguna.peran), true)
  }

  if (!sesi) {
    if (layar.nama === 'publik') {
      return (
        <KanalPublik
          keLogin={() => pindah({ nama: 'masuk' })}
          keCekAnak={() => pindah({ nama: 'cek-anak' })}
        />
      )
    }
    if (layar.nama === 'cek-anak') {
      return <CekAnak kePublik={() => pindah({ nama: 'publik' })} />
    }
    return <Masuk saatMasuk={mulai} kePublik={() => pindah({ nama: 'publik' })} />
  }

  async function keluar() {
    setKonfirmasiKeluar(false)
    // Bersihkan rute agar perangkat bersama tidak membuka layar orang sebelumnya.
    pindah({ nama: 'masuk' }, true)
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
    navigasi.push({ nama: 'konten', label: 'Jadwal' })
  }
  if (peran === 'nakes') {
    navigasi.push({ nama: 'validasi', label: 'Validasi' })
    navigasi.push({ nama: 'konten', label: 'Jadwal' })
  }
  if (peran === 'admin_desa') {
    navigasi.push({ nama: 'balita', label: 'Balita' })
    navigasi.push({ nama: 'laporan', label: 'Rekap' })
    navigasi.push({ nama: 'posyandu', label: 'Posyandu' })
    navigasi.push({ nama: 'pengguna', label: 'Akun' })
    navigasi.push({ nama: 'konten', label: 'Konten' })
    navigasi.push({ nama: 'log', label: 'Log' })
  }
  const perluSiap = kader && !siap

  let isi
  if (perluSiap) {
    isi = (
      <main className="masuk-pudar mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-2 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-1.5 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
        <div className="kartu">
          <div className="mx-auto mb-3 grid size-[52px] place-items-center rounded-sedang bg-biru-100 text-biru-700">
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
        kembali={() => pindah({ nama: 'beranda' })}
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
          versiData={versiData}
          kembali={() => pindah({ nama: 'beranda' })}
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
        kembali={() => pindah({ nama: 'beranda' })}
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
  } else if (layar.nama === 'konten') {
    isi = <KelolaKonten sesi={sesi} />
  } else if (layar.nama === 'laporan') {
    isi = (
      <Suspense fallback={<LayarMemuat />}>
        <Laporan sesi={sesi} />
      </Suspense>
    )
  } else if (layar.nama === 'pengguna') {
    isi = <Pengguna sesi={sesi} />
  } else if (layar.nama === 'log') {
    isi = <LogAktivitas sesi={sesi} />
  } else {
    isi = (
      <Beranda
        sesi={sesi}
        sinkron={sinkron}
        jalankan={jalankan}
        versiData={versiData}
        saatCatat={(balita) => pindah({ nama: 'catat', balita })}
        saatRiwayat={(balita) => pindah({ nama: 'riwayat', balita })}
      />
    )
  }

  const namaPengguna = sesi.pengguna.nama_lengkap || sesi.pengguna.nama_pengguna || ''
  const namaPosyandu = sesi.pengguna.nama_posyandu
  // Peran saja, tanpa nama Posyandu. Dulu labelnya "Kader · Posyandu Melati"
  // padahal Posyandu sudah berdiri sendiri sebagai subjudul di kiri.
  const peranLabel =
    peran === 'kader' ? 'Kader' : peran === 'nakes' ? 'Petugas kesehatan' : 'Admin desa'
  const statusKelas = sinkron.mengirim ? 'mengirim' : sinkron.luring ? 'luring' : 'daring'
  // Tiga keadaan jaringan yang benar-benar berbeda. Dulu keadaan daring
  // berlabel "Tersambung" sementara peran di sebelahnya "Admin desa";
  // dua-duanya berakhir "-desa" sehingga terbaca sebagai pengulangan.
  // Sekarang hijau cukup titik, karena diam berarti normal.
  const statusTeks = sinkron.mengirim ? 'Mengirim' : 'Luring'
  const judulStatus = sinkron.mengirim
    ? 'Sedang mengirim catatan ke server'
    : sinkron.luring
      ? 'Tidak ada jaringan. Catatan tersimpan di tablet.'
      : 'Tersambung ke server'
  const subjudulHeader = peran === 'kader' && namaPosyandu ? namaPosyandu : (peran === 'admin_desa' ? (namaPosyandu || 'Desa Ketenger') : null)
  const tampilPosyandu = Boolean(subjudulHeader)
  return (
    <>
      <button
        type="button"
        className="fixed top-2 left-2 z-100 -translate-y-[160%] rounded-kecil bg-kartu px-4 py-2.5 font-bold text-biru-900 shadow-naik focus:translate-y-0"
        onClick={() => {
          const isi = document.getElementById('isi-utama')
          isi?.setAttribute('tabindex', '-1')
          isi?.focus()
        }}
      >
        Lewati ke isi
      </button>

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[image:var(--latar-kepala)] text-kartu shadow-kontrol [padding-top:env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-lebar items-center justify-between gap-3 px-2 py-2 max-sempit:min-h-[58px] max-sempit:px-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img className="size-9 shrink-0 object-contain [filter:drop-shadow(0_2px_5px_rgb(0_0_0/0.3))]" src="/logo-192.png" alt="" width="36" height="36" />
            <span className="grid min-w-0 leading-tight">
              <span className="text-tombol font-bold tracking-[0.01em] whitespace-nowrap max-sempit:text-isi">Smart Posyandu</span>
              {tampilPosyandu && (
                <span className="overflow-hidden text-2xs text-ellipsis whitespace-nowrap text-biru-100 max-mini:max-w-[120px]" title={subjudulHeader}>
                  {subjudulHeader}
                </span>
              )}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Titik status: hijau saat tersambung (diam = normal), kuning
                berdenyut saat mengirim, amber saat luring. Teks hanya muncul
                untuk dua keadaan yang butuh tindakan. */}
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-kecil ${statusKelas === 'daring' ? '' : 'bg-white/10'}`}
              role="status"
              aria-live="polite"
              title={judulStatus}
            >
              <span className={`status-dot ${statusKelas}`} aria-hidden="true" />
              <span className="sr-only">Status jaringan: {judulStatus}. </span>
            </span>

            {statusKelas !== 'daring' && (
              <span className="inline-flex min-h-8 items-center rounded-kecil border border-white/20 bg-white/8 px-2.5 text-2xs font-semibold text-kartu max-mini:hidden">
                {statusTeks}
              </span>
            )}

            {keluarProses && (
              <span className="text-2xs font-semibold text-biru-100 max-sempit:hidden">Keluar…</span>
            )}

            <button
              type="button"
              className="group -mr-1 flex min-h-11 shrink-0 items-center gap-2.5 rounded-kecil py-1 pr-1 pl-1.5 text-left transition-colors duration-200 ease-ui hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={() => setKonfirmasiKeluar(true)}
              disabled={keluarProses}
              title={`Keluar dari akun ${namaPengguna}`}
            >
              <span
                className="grid size-8 shrink-0 place-items-center rounded-kecil bg-biru-100 text-2xs font-bold text-biru-900 ring-1 ring-white/25"
                aria-hidden="true"
              >
                {inisial(namaPengguna)}
              </span>
              <span className="hidden min-w-0 flex-col leading-tight sempit:flex">
                <span className="truncate text-padat font-semibold text-kartu">{namaPengguna}</span>
                <span className="truncate text-2xs font-medium text-biru-100">{peranLabel}</span>
              </span>
              <span className="grid size-8 shrink-0 place-items-center rounded-kecil text-biru-100 group-hover:text-kartu sempit:ml-0.5">
                <Ikon nama="keluar" ukuran={17} />
                <span className="sr-only">{keluarProses ? 'Sedang keluar' : 'Keluar'}</span>
              </span>
            </button>
          </div>
        </div>
      </header>

      {konfirmasiKeluar && (
        <Modal
          judul="Keluar dari akun?"
          subjudul={`${namaPengguna} · ${peranLabel}`}
          onTutup={() => setKonfirmasiKeluar(false)}
        >
          <div className="flex flex-col gap-4 p-4">
            {/* Hanya keadaan yang butuh perhatian yang diberi pita. Keadaan
                normal tidak diberi pesan sama sekali: memberi tahu bahwa
                "tidak ada masalah" di dialog keluar hanya menambah satu
                kotak biru yang harus dibaca sebelum menekan tombol. */}
            {sinkron.gagal > 0 ? (
              <p className="pita pita-bahaya m-0 text-isi leading-relaxed font-semibold">
                <Ikon nama="peringatan" ukuran={17} className="mr-1.5 inline align-text-bottom" />
                Ada <strong>{sinkron.gagal} catatan gagal</strong> dikirim ke server. Catatan itu
                tetap tersimpan di tablet, tetapi tidak akan terkirim sendiri. Hubungi admin desa
                sebelum keluar.
              </p>
            ) : sinkron.menunggu > 0 ? (
              <p className="pita pita-perhatian m-0 text-isi leading-relaxed font-semibold">
                Ada <strong>{sinkron.menunggu} catatan</strong> yang belum terkirim ke server.
                Catatan itu tetap tersimpan di tablet ini dan baru terkirim setelah akun ini
                masuk lagi.
              </p>
            ) : null}

            {/* Tanpa `border-t`: saat tidak ada pita, garis itu jatuh tepat di
                bawah garis kepala modal dan terbaca sebagai garis ganda. */}
            <div className="flex items-center justify-end gap-2 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setKonfirmasiKeluar(false)}>
                Batal
              </button>
              <button type="button" onClick={keluar} className={sinkron.gagal > 0 ? 'bahaya' : undefined}>
                <Ikon nama="keluar" ukuran={17} />
                Keluar sekarang
              </button>
            </div>
          </div>
        </Modal>
      )}

      {sinkron.menunggu > 0 && (
        <div className="border-b bg-kuning-100 text-kuning-800 border-kuning-100" role="status">
          <div className="mx-auto flex max-w-lebar items-center gap-2 px-2 py-2 text-padat font-semibold">
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
          <div className="mx-auto flex max-w-lebar items-center gap-2 px-2 py-2 text-padat font-semibold">
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
          <div className="mx-auto flex max-w-lebar justify-center gap-2 px-2 py-1.5">
            {navigasi.map((n) => (
              <button
                key={n.nama}
                type="button"
                className={`nav-tombol ${layar.nama === n.nama ? 'aktif' : ''}`}
                aria-current={layar.nama === n.nama ? 'page' : undefined}
                onClick={() => pindah({ nama: n.nama })}
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
