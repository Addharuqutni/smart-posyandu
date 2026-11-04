import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../penyimpanan/db.js'
import { PESAN_STATUS } from '../logika/rentang.js'
import { usiaBulan, tanggalHariIni } from '../logika/waktu.js'
import { inisial } from '../logika/nama.js'
import { kunjunganTerbaruPerBalita, idDiukurBulanIni, rentangBulan } from '../logika/terakhir.js'
import Ikon from './Ikon.jsx'
import { Kosong, KotakCari, KendaliHalaman, UKURAN_HALAMAN } from './Bersama.jsx'

export default function Beranda({
  sesi,
  sinkron,
  jalankan,
  saatCatat,
  saatRiwayat,
  versiData,
}) {
  const [balita, setBalita] = useState([])
  const [cari, setCari] = useState('')
  const [statusTerakhir, setStatusTerakhir] = useState({})
  const [statusSiap, setStatusSiap] = useState(false)
  const [diukurBulanIni, setDiukurBulanIni] = useState(0)
  const [ditolak, setDitolak] = useState([])
  const [memuat, setMemuat] = useState(true)
  const [halaman, setHalaman] = useState(0)
  // Hasil per halaman disimpan supaya kembali ke halaman sebelumnya instan.
  const cacheStatus = useRef(new Map())

  useEffect(() => {
    let hidup = true
    async function muat() {
      setMemuat(true)
      const semua = await db.balita.filter((b) => !b.dihapus_pada && b.aktif !== false).toArray()
      if (!hidup) return
      semua.sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap))
      setBalita(semua)

      // Yang dibaca hanya daftar balita (3.001 baris) dan satu bulan kunjungan.
      // Versi sebelumnya membaca SELURUH riwayat kunjungan (209.495) dan
      // pengukuran (192.543) ke memori setiap kali layar dibuka, dan itu
      // lambat di tablet kelas menengah. Status gizi per balita sekarang
      // dihitung hanya untuk 50 baris yang sedang tampil (lihat efek di bawah).
      const bulanIni = tanggalHariIni().slice(0, 7)
      const { awal, akhir } = rentangBulan(bulanIni)
      const kunjunganBulan = await db.kunjungan
        .where('tanggal_kunjungan')
        .between(awal, akhir, true, false)
        .toArray()
      if (!hidup) return
      cacheStatus.current.clear()
      setDiukurBulanIni(idDiukurBulanIni(kunjunganBulan, bulanIni).size)
      setMemuat(false)
    }
    muat()
    db.antrean_sinkron
      .where('status')
      .equals('gagal')
      .filter((a) => a.pemilik_id === sesi.pengguna.id)
      .toArray()
      .then((baris) => {
        if (hidup) setDitolak(baris)
      })
    return () => {
      hidup = false
    }
  }, [versiData])

  useEffect(() => {
    setHalaman(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balita, cari])

  const tersaring = useMemo(() => {
    const kunci = cari.trim().toLowerCase()
    if (!kunci) return balita
    return balita.filter((b) => b.nama_lengkap.toLowerCase().includes(kunci))
  }, [balita, cari])

  const ditampilkan = useMemo(
    () => tersaring.slice(halaman * UKURAN_HALAMAN, (halaman + 1) * UKURAN_HALAMAN),
    [tersaring, halaman],
  )

  const kunciHalaman = useMemo(() => ditampilkan.map((b) => b.id).join(','), [ditampilkan])

  // Status gizi untuk halaman yang tampil saja. Indeks `balita_id` sudah ada
  // di store kunjungan, jadi ini dua kueri pendek per halaman, bukan dua
  // pembacaan seluruh tabel.
  useEffect(() => {
    if (!kunciHalaman) {
      setStatusTerakhir({})
      setStatusSiap(true)
      return
    }
    const tersimpan = cacheStatus.current.get(kunciHalaman)
    if (tersimpan) {
      setStatusTerakhir(tersimpan)
      setStatusSiap(true)
      return
    }
    let hidup = true
    setStatusSiap(false)
    async function hitung() {
      const ids = kunciHalaman.split(',')
      const kunjungan = await db.kunjungan.where('balita_id').anyOf(ids).toArray()
      const terakhir = kunjunganTerbaruPerBalita(kunjungan)
      const idKunjungan = [...terakhir.values()].map((k) => k.id)
      const ukur = idKunjungan.length
        ? await db.pengukuran.where('kunjungan_id').anyOf(idKunjungan).toArray()
        : []
      const ukurPerKunjungan = new Map(ukur.map((u) => [u.kunjungan_id, u]))
      const peta = {}
      for (const [idBalita, k] of terakhir) {
        const u = ukurPerKunjungan.get(k.id)
        if (u?.status_gizi) peta[idBalita] = u.status_gizi
      }
      if (!hidup) return
      cacheStatus.current.set(kunciHalaman, peta)
      setStatusTerakhir(peta)
      setStatusSiap(true)
    }
    hitung()
    return () => {
      hidup = false
    }
  }, [kunciHalaman, versiData])

  const hariIni = tanggalHariIni()
  const namaPosyandu = sesi.pengguna.nama_posyandu || 'Posyandu'

  return (
    <main className="mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
      {sinkron.luring && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-garis bg-biru-100 text-biru-800" role="status">
          <Ikon nama="luring" ukuran={19} />
          <span>
            Tidak ada jaringan. Pencatatan tetap tersimpan di tablet dan akan terkirim otomatis.
          </span>
        </div>
      )}

      {sinkron.gagal > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>
            {sinkron.gagal} perubahan ditolak server. Perubahan ini tidak dikirim ulang; hubungi
            admin bila perlu.
          </span>
        </div>
      )}

      {ditolak.length > 0 && (
        <details className="kartu">
          <summary className="cursor-pointer font-semibold">
            Rincian perubahan yang ditolak
          </summary>
          <ul className="mt-2 grid list-disc gap-1.5 pl-4 text-isi text-teks-redup">
            {ditolak.map((d) => (
              <li key={d.urut}>
                {String(d.nama_tabel).replaceAll('_', ' ')} ·{' '}
                {String(d.pesan_gagal ?? 'tidak diketahui').replaceAll('_', ' ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Balita</h1>
        </div>
        <button
          type="button"
          className="sekunder"
          onClick={() => jalankan?.()}
          disabled={sinkron.mengirim}
        >
          <Ikon nama="sinkron" ukuran={18} />
          {sinkron.mengirim ? 'Menyinkron…' : 'Sinkronkan'}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2.5 max-sempit:gap-2" aria-label="Ringkasan bulan ini">
        <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-slate-tint text-aksen-slate-ink">
              <Ikon nama="balita" ukuran={16} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">{balita.length}</div>
            <div className="text-2xs leading-tight font-medium text-teks-redup">Balita aktif</div>
          </div>
        </div>

        <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-hijau-tint text-aksen-hijau-ink">
              <Ikon nama="balita-hadir" ukuran={16} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">{diukurBulanIni}</div>
            <div className="text-2xs leading-tight font-medium text-teks-redup">Diukur bulan ini</div>
          </div>
        </div>

        <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-biru-tint text-aksen-biru-ink">
              <Ikon nama="sinkron" ukuran={16} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">{sinkron.menunggu}</div>
            <div className="text-2xs leading-tight font-medium text-teks-redup">Catatan tertunda</div>
          </div>
        </div>
      </div>

      <KotakCari id="cari" nilai={cari} onUbah={setCari} />

      {cari && (
        <p className="-mt-1 mb-3 ml-1.5 text-padat text-teks-samar">
          {tersaring.length} nama cocok dengan “{cari.trim()}”
        </p>
      )}

      {memuat && balita.length === 0 && (
        <Kosong
          ikon="sinkron"
          judul="Memuat daftar balita…"
          teks="Membaca data yang tersimpan di tablet."
        />
      )}

      {!memuat && balita.length === 0 && (
        <Kosong
          ikon="balita"
          judul="Belum ada data balita"
          teks="Sambungkan tablet ke jaringan lalu sinkronkan. Data balita diunduh dari server dan tetap tersimpan untuk pemakaian luring."
          aksi={
            <button type="button" onClick={() => jalankan?.()} disabled={sinkron.mengirim}>
              <Ikon nama="unduh" ukuran={18} />
              {sinkron.mengirim ? 'Mengunduh…' : 'Sinkronkan sekarang'}
            </button>
          }
        />
      )}

      {!memuat && balita.length > 0 && tersaring.length === 0 && (
        <Kosong
          ikon="cari"
          judul="Tidak ada nama yang cocok"
          teks="Periksa ejaan atau hapus kata pencarian."
          aksi={
            <button type="button" className="sekunder" onClick={() => setCari('')}>
              Hapus pencarian
            </button>
          }
        />
      )}

      {tersaring.length > 0 && (
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {ditampilkan.map((b) => {
            const umur = usiaBulan(b.tanggal_lahir, hariIni)
            const status = statusTerakhir[b.id]
            const gender = b.jenis_kelamin === 'laki-laki' ? 'laki' : 'perempuan'
            return (
              <li key={b.id} className="flex items-center gap-3 rounded-sedang border border-garis bg-kartu px-5 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:flex-wrap max-sempit:p-3">
                <span className={`grid size-11 shrink-0 place-items-center rounded-kecil border text-base font-bold ${gender === 'laki' ? 'border-biru-100 bg-aksen-biru-tint text-aksen-biru-ink' : 'border-merah-100 bg-aksen-rose-tint text-aksen-rose-ink'}`} aria-hidden="true">
                  {inisial(b.nama_lengkap)}
                </span>
                <div className="grid min-w-0 flex-1 gap-1 max-sempit:basis-[calc(100%_-_60px)]">
                  <span className="text-base leading-tight font-bold text-teks">{b.nama_lengkap}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-padat text-teks-redup">
                    {umur >= 0 ? `${umur} bulan` : 'Tanggal lahir belum benar'}
                    <span aria-hidden="true">·</span>
                    {gender === 'laki' ? 'Laki-laki' : 'Perempuan'}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-padat text-teks-redup">
                    <span>Status gizi</span>
                    <span
                      className={`lencana-gizi ${status ?? 'menunggu'}`}
                      aria-label={`Status gizi terakhir: ${status ? PESAN_STATUS[status] : 'belum diukur'}`}
                    >
                      {status ? PESAN_STATUS[status] : statusSiap ? 'Belum diukur' : 'Menghitung…'}
                    </span>
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 max-sempit:w-full max-sempit:pt-0.5 max-sempit:[&>button]:flex-1">
                  <button type="button" className="sekunder" onClick={() => saatRiwayat(b)}>
                    <Ikon nama="riwayat" ukuran={17} />
                    Riwayat
                  </button>
                  <button type="button" onClick={() => saatCatat(b)}>
                    <Ikon nama="tambah" ukuran={17} />
                    Catat
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <KendaliHalaman
        halaman={halaman}
        total={tersaring.length}
        onPilih={setHalaman}
        keterangan={`Halaman ${halaman + 1} dari ${Math.max(1, Math.ceil(tersaring.length / UKURAN_HALAMAN))} · ${ditampilkan.length} dari ${tersaring.length} nama`}
      />
    </main>
  )
}
