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
    <main className="layar" id="isi-utama">
      {sinkron.luring && (
        <div className="pesan info" role="status">
          <Ikon nama="luring" ukuran={19} />
          <span>
            Tidak ada jaringan. Pencatatan tetap tersimpan di tablet dan akan terkirim otomatis.
          </span>
        </div>
      )}

      {sinkron.gagal > 0 && (
        <div className="pesan galat" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>
            {sinkron.gagal} perubahan ditolak server. Perubahan ini tidak dikirim ulang; hubungi
            admin bila perlu.
          </span>
        </div>
      )}

      {ditolak.length > 0 && (
        <details className="kartu kartu-lipat">
          <summary className="ringkasan-lipat">
            Rincian perubahan yang ditolak
          </summary>
          <ul className="daftar-sederhana spasi-atas-kecil">
            {ditolak.map((d) => (
              <li key={d.urut}>
                {String(d.nama_tabel).replaceAll('_', ' ')} ·{' '}
                {String(d.pesan_gagal ?? 'tidak diketahui').replaceAll('_', ' ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="kepala-layar">
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

      <div className="ringkasan" aria-label="Ringkasan bulan ini">
        <div className="stat stat--terdaftar">
          <div className="stat-atas">
            <span className="stat-ikon">
              <Ikon nama="balita" ukuran={16} />
            </span>
          </div>
          <div className="stat-bawah">
            <div className="stat-nilai">{balita.length}</div>
            <div className="stat-label">Balita aktif</div>
          </div>
        </div>

        <div className="stat stat--hadir">
          <div className="stat-atas">
            <span className="stat-ikon">
              <Ikon nama="balita-hadir" ukuran={16} />
            </span>
          </div>
          <div className="stat-bawah">
            <div className="stat-nilai">{diukurBulanIni}</div>
            <div className="stat-label">Diukur bulan ini</div>
          </div>
        </div>

        <div className="stat stat--sinkron">
          <div className="stat-atas">
            <span className="stat-ikon">
              <Ikon nama="sinkron" ukuran={16} />
            </span>
          </div>
          <div className="stat-bawah">
            <div className="stat-nilai">{sinkron.menunggu}</div>
            <div className="stat-label">Catatan tertunda</div>
          </div>
        </div>
      </div>

      <KotakCari id="cari" nilai={cari} onUbah={setCari} />

      {cari && (
        <p className="samar petunjuk-cari">
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
        <ul className="daftar-balita">
          {ditampilkan.map((b) => {
            const umur = usiaBulan(b.tanggal_lahir, hariIni)
            const status = statusTerakhir[b.id]
            const gender = b.jenis_kelamin === 'laki-laki' ? 'laki' : 'perempuan'
            return (
              <li key={b.id} className="balita-kartu">
                <span className={`avatar ${gender}`} aria-hidden="true">
                  {inisial(b.nama_lengkap)}
                </span>
                <div className="balita-info">
                  <span className="balita-nama">{b.nama_lengkap}</span>
                  <span className="balita-meta">
                    {umur >= 0 ? `${umur} bulan` : 'Tanggal lahir belum benar'}
                    <span aria-hidden="true">·</span>
                    {gender === 'laki' ? 'Laki-laki' : 'Perempuan'}
                  </span>
                  <span className="balita-meta">
                    <span>Status gizi</span>
                    <span
                      className={`lencana-gizi ${status ?? 'menunggu'}`}
                      aria-label={`Status gizi terakhir: ${status ? PESAN_STATUS[status] : 'belum diukur'}`}
                    >
                      {status ? PESAN_STATUS[status] : statusSiap ? 'Belum diukur' : 'Menghitung…'}
                    </span>
                  </span>
                </div>
                <div className="balita-aksi">
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
