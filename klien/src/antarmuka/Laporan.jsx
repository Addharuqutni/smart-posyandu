import { useEffect, useState } from 'react'
import {
  daftarCadangan,
  jalankanCadangan,
  kualitas,
  pratinjauCadangan,
  pulihkanCadangan,
  pulihkanDariBerkas,
  rekap,
  unduhCadangan,
  unduhEkspor,
} from '../jaringan/api.js'
import { PESAN_STATUS } from '../logika/rentang.js'
import Ikon from './Ikon.jsx'
import Bantuan from './Bantuan.jsx'
import { Kosong } from './Bersama.jsx'
import { tanggalHariIni, waktuPendek } from '../logika/waktu.js'

function bulanIni() {
  return tanggalHariIni().slice(0, 7)
}

function judulBulan(nilai) {
  const [tahun, bulan] = nilai.split('-')
  const tanggal = new Date(Number(tahun), Number(bulan) - 1, 1)
  return tanggal.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

/** Tahun paling awal yang masuk akal untuk pilot; daftar tahun mengikuti ini. */
const TAHUN_AWAL = 2024

/** Geser 'YYYY-MM' sejumlah bulan (boleh negatif). */
function geserBulan(nilai, delta) {
  const [tahun, bulan] = String(nilai).split('-').map(Number)
  const tanggal = new Date(tahun, bulan - 1 + delta, 1)
  return `${tanggal.getFullYear()}-${String(tanggal.getMonth() + 1).padStart(2, '0')}`
}

export default function Laporan({ sesi }) {
  const [bulan, setBulan] = useState(bulanIni())
  const [isi, setIsi] = useState(null)
  const [galat, setGalat] = useState(null)
  const [memuat, setMemuat] = useState(false)
  const [mutu, setMutu] = useState(null)
  const [cadangan, setCadangan] = useState([])
  const [pesan, setPesan] = useState(null)
  const [mencadangkan, setMencadangkan] = useState(false)
  const [mengunduh, setMengunduh] = useState(null)
  const [konfirmPulih, setKonfirmPulih] = useState(null)
  const [memuatPratinjau, setMemuatPratinjau] = useState(null)
  const [memulihkan, setMemulihkan] = useState(false)
  const [berkasPulih, setBerkasPulih] = useState(null)
  const [memulihkanUnggah, setMemulihkanUnggah] = useState(false)
  const [sandiPulih, setSandiPulih] = useState('')

  async function muat(nilaiBulan = bulan) {
    setMemuat(true)
    setGalat(null)
    try {
      setIsi(await rekap(nilaiBulan))
    } catch {
      setGalat('Rekap butuh koneksi ke server. Sambungkan tablet lalu coba lagi.')
    } finally {
      setMemuat(false)
    }
  }

  async function muatMutu() {
    try {
      const [k, c] = await Promise.all([kualitas(), daftarCadangan()])
      setMutu(k)
      setCadangan(c.cadangan)
    } catch {
      // bagian ini hanya tampil bila server terjangkau
    }
  }

  useEffect(() => {
    muat()
    muatMutu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cadangkan() {
    setPesan(null)
    setGalat(null)
    setMencadangkan(true)
    try {
      await jalankanCadangan()
      setPesan('Pencadangan selesai. Berkas terenkripsi tersimpan di server.')
      await muatMutu()
    } catch {
      setGalat('Pencadangan gagal: server tidak terjangkau.')
    } finally {
      setMencadangkan(false)
    }
  }

  async function unduhBerkas(nama) {
    setPesan(null)
    setGalat(null)
    setMengunduh(nama)
    try {
      const blob = await unduhCadangan(nama)
      const alamat = URL.createObjectURL(blob)
      const tautan = document.createElement('a')
      tautan.href = alamat
      tautan.download = nama
      tautan.click()
      URL.revokeObjectURL(alamat)
      setPesan(`Berkas cadangan ${nama} diunduh. Simpan di tempat aman.`)
    } catch {
      setGalat('Unduh cadangan gagal: server tidak terjangkau.')
    } finally {
      setMengunduh(null)
    }
  }

  /** Buka pratinjau isi berkas sebelum ada yang dipulihkan. */
  async function bukaPratinjau(nama) {
    setPesan(null)
    setGalat(null)
    setMemuatPratinjau(nama)
    try {
      const isiBerkas = await pratinjauCadangan(nama)
      setKonfirmPulih({ nama, pratinjau: isiBerkas })
    } catch (salah) {
      setGalat(salah.rincian ?? 'Berkas cadangan tidak bisa dibaca.')
    } finally {
      setMemuatPratinjau(null)
    }
  }

  async function pulihkan(nama) {
    setPesan(null)
    setGalat(null)
    setMemulihkan(true)
    try {
      const hasil = await pulihkanCadangan(nama, sandiPulih)
      const jumlah = hasil.total_baris ?? 0
      const baru = hasil.tabel.reduce((a, t) => a + (t.disisipkan ?? 0), 0)
      const diperbarui = hasil.tabel.reduce((a, t) => a + (t.diperbarui ?? 0), 0)
      let teks =
        `Pemulihan selesai: ${jumlah} baris diproses (${baru} baru, ${diperbarui} diperbarui).`
      if (hasil.cadangan_pengaman) {
        teks += ` Cadangan pengaman: ${hasil.cadangan_pengaman}.`
      }
      setPesan(teks)
      setKonfirmPulih(null)
      setSandiPulih('')
      await muatMutu()
      await muat(bulan)
    } catch (salah) {
      setGalat(salah.rincian ?? 'Pemulihan gagal. Tidak ada data yang diubah.')
    } finally {
      setMemulihkan(false)
    }
  }

  async function pulihkanUnggah() {
    if (!berkasPulih) return
    setPesan(null)
    setGalat(null)
    setMemulihkanUnggah(true)
    try {
      const hasil = await pulihkanDariBerkas(berkasPulih, sandiPulih)
      const jumlah = hasil.total_baris ?? 0
      const baru = hasil.tabel.reduce((a, t) => a + (t.disisipkan ?? 0), 0)
      const diperbarui = hasil.tabel.reduce((a, t) => a + (t.diperbarui ?? 0), 0)
      let teks = `Pemulihan dari berkas ${hasil.berkas} selesai: ${jumlah} baris (${baru} baru, ${diperbarui} diperbarui).`
      if (hasil.cadangan_pengaman) teks += ` Cadangan pengaman: ${hasil.cadangan_pengaman}.`
      setPesan(teks)
      setBerkasPulih(null)
      setSandiPulih('')
      await muatMutu()
      await muat(bulan)
    } catch (salah) {
      setGalat(salah.rincian ?? 'Pemulihan dari berkas gagal.')
    } finally {
      setMemulihkanUnggah(false)
    }
  }

  async function ekspor() {
    setGalat(null)
    setPesan(null)
    try {
      const blob = await unduhEkspor(bulan)
      const alamat = URL.createObjectURL(blob)
      const tautan = document.createElement('a')
      tautan.href = alamat
      tautan.download = `posyandu-${bulan}.csv`
      tautan.click()
      URL.revokeObjectURL(alamat)
      setPesan(`Berkas CSV ${judulBulan(bulan)} diunduh.`)
    } catch {
      setGalat('Ekspor butuh koneksi ke server.')
    }
  }

  const [tahunTerpilih, bulanTerpilih] = bulan.split('-')
  const tahunTersedia = []
  for (let t = TAHUN_AWAL; t <= Number(bulanIni().slice(0, 4)); t += 1) tahunTersedia.push(t)

  /** Tombol ‹ / › langsung memuat, karena niatnya sudah jelas. */
  function gantiBulan(delta) {
    const berikut = geserBulan(bulan, delta)
    if (berikut < `${TAHUN_AWAL}-01` || berikut > bulanIni()) return
    setBulan(berikut)
    muat(berikut)
  }

  function pilihBagian(bagian, tahun) {
    const nilai = `${tahun}-${String(bagian).padStart(2, '0')}`
    setBulan(nilai)
    muat(nilai)
  }

  const sebaran = isi?.sebaran_status_gizi ?? {}

  return (
    <main className="mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Rekap bulanan</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">Ringkasan kunjungan, status gizi, dan mutu data.</p>
        </div>
        <button
          type="button"
          className="sekunder"
          onClick={() => muat(bulan)}
          disabled={memuat}
          aria-label="Muat ulang rekap"
        >
          <Ikon nama="sinkron" ukuran={18} />
          {memuat ? 'Memuat…' : 'Muat ulang'}
        </button>
      </div>

      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}
      {pesan && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-hijau-100 bg-hijau-100 text-hijau-800" role="status">
          <Ikon nama="cek" ukuran={19} />
          <span>{pesan}</span>
        </div>
      )}

      <div className="kartu px-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mb-0 min-w-0 flex-[1_1_190px]">
            <span className="label-segmen" id="label-bulan">Bulan rekap</span>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby="label-bulan">
              <button
                type="button"
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-kecil border border-garis bg-kartu px-2 text-tombol leading-none font-bold text-biru-800 shadow-none hover:border-garis-kuat hover:bg-biru-50 hover:text-biru-950 disabled:border-garis disabled:bg-latar disabled:text-garis-kuat"
                onClick={() => gantiBulan(-1)}
                disabled={memuat || bulan <= `${TAHUN_AWAL}-01`}
                aria-label="Bulan sebelumnya"
              >
                ‹
              </button>
              <select
                className="w-auto min-w-[8.25rem] flex-none"
                value={bulanTerpilih}
                onChange={(e) => pilihBagian(e.target.value, tahunTerpilih)}
                disabled={memuat}
                aria-label="Bulan"
              >
                {NAMA_BULAN.map((nama, i) => (
                  <option key={nama} value={String(i + 1).padStart(2, '0')}>
                    {nama}
                  </option>
                ))}
              </select>
              <select
                className="w-auto min-w-[5.5rem] flex-none"
                value={tahunTerpilih}
                onChange={(e) => pilihBagian(bulanTerpilih, e.target.value)}
                disabled={memuat}
                aria-label="Tahun"
              >
                {tahunTersedia.map((t) => (
                  <option key={t} value={String(t)}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-kecil border border-garis bg-kartu px-2 text-tombol leading-none font-bold text-biru-800 shadow-none hover:border-garis-kuat hover:bg-biru-50 hover:text-biru-950 disabled:border-garis disabled:bg-latar disabled:text-garis-kuat"
                onClick={() => gantiBulan(1)}
                disabled={memuat || bulan >= bulanIni()}
                aria-label="Bulan berikutnya"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {memuat && !isi && (
        <Kosong
          ikon="sinkron"
          judul="Memuat rekap…"
          teks="Mengambil angka dari server."
        />
      )}

      {isi && (
        <>
          <div className="mb-2.5 flex items-start justify-between gap-4 [&_h2]:m-0 [&_h2]:text-subjudul [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-isi [&_p]:text-teks-redup">
            <div>
              <h2>{judulBulan(isi.bulan)}</h2>
              <p>{isi.posyandu.nama ?? 'Semua Posyandu'}</p>
            </div>
          </div>

          <div className="mb-4 grid gap-2.5 [grid-template-columns:repeat(5,minmax(0,1fr))] max-sempit:[grid-template-columns:repeat(auto-fit,minmax(130px,1fr))] max-sempit:gap-2">
            <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-biru-tint text-aksen-biru-ink">
                  <Ikon nama="kunjungan" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-jumlah-kunjungan"
                  label="Penjelasan jumlah kunjungan"
                  teks="Total kedatangan balita bulan ini. Satu balita bisa dihitung lebih dari satu kali bila datang beberapa kali."
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">{isi.jumlah_kunjungan}</div>
                <div className="text-2xs leading-tight font-medium text-teks-redup">Jumlah kunjungan</div>
              </div>
            </div>

            <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-hijau-tint text-aksen-hijau-ink">
                  <Ikon nama="balita-hadir" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-balita-datang"
                  label="Penjelasan balita yang datang"
                  teks="Jumlah balita berbeda yang datang bulan ini. Bukan total kunjungan, dan bukan semua balita terdaftar."
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">{isi.jumlah_balita_tercatat}</div>
                <div className="text-2xs leading-tight font-medium text-teks-redup">Balita yang datang</div>
              </div>
            </div>

            <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-slate-tint text-aksen-slate-ink">
                  <Ikon nama="balita" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-terdaftar"
                  label="Penjelasan balita terdaftar"
                  teks="Semua balita aktif di Posyandu ini, datang atau tidak bulan ini."
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">{isi.balita_terdaftar ?? '—'}</div>
                <div className="text-2xs leading-tight font-medium text-teks-redup">Balita terdaftar</div>
              </div>
            </div>

            <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-amber-tint text-aksen-amber-ink">
                  <Ikon nama="balita-absen" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-tidak-datang"
                  label="Penjelasan balita tidak datang"
                  teks="Balita aktif yang sama sekali tidak datang bulan ini. Perlu ditindaklanjuti kader."
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">{isi.balita_tidak_berkunjung ?? '—'}</div>
                <div className="text-2xs leading-tight font-medium text-teks-redup">Balita tidak datang</div>
              </div>
            </div>

            <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-teal-tint text-aksen-teal-ink">
                  <Ikon nama="grafik" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-median"
                  label="Penjelasan persen median"
                  teks="Berat balita dibanding berat rata-rata anak seusianya. 100% = sama dengan rata-rata. Di bawah 80% perlu perhatian."
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">
                  {isi.rata_persen_median ?? '—'}
                  {isi.rata_persen_median != null && (
                    <span className="ml-0.5 text-padat font-semibold text-teks-redup">%</span>
                  )}
                </div>
                <div className="text-2xs leading-tight font-medium text-teks-redup">Rata-rata persen median</div>
              </div>
            </div>
          </div>

          <div className="kartu">
            <div className="kartu-judul">
              <h3>
                Sebaran status gizi
                <Bantuan
                  id="bantuan-sebaran"
                  label="Penjelasan sebaran status gizi"
                  teks="Status gizi dihitung server dari berat dan tinggi menurut umur. Jumlah di sini hanya kunjungan bulan ini."
                />
              </h3>
              <span className="text-padat text-teks-samar">Pengukuran bulan ini</span>
            </div>
            {Object.keys(sebaran).length === 0 ? (
              <p className="text-isi text-teks-redup">
                Belum ada pengukuran pada bulan ini.
              </p>
            ) : (
              <div className="tabel-bungkus">
                <table className="tabel min-w-80">
                  <tbody>
                    {Object.entries(sebaran).map(([kode, cacah]) => (
                      <tr key={kode}>
                        <td>
                          <span className={`lencana-gizi ${kode}`}>
                            {PESAN_STATUS[kode] ?? 'Belum dinilai'}
                          </span>
                        </td>
                        <td className="angka font-bold">
                          {cacah}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              className="sekunder mt-3"
              onClick={ekspor}
            >
              <Ikon nama="unduh" ukuran={18} />
              Unduh CSV {judulBulan(bulan)}
            </button>
            <p className="mb-0 text-padat text-teks-samar">
              Ekspor dibubuhi cap waktu dan nama pemakai, serta dicatat di log audit.
            </p>
          </div>
        </>
      )}

      {(mutu || cadangan.length > 0) && (
        <div className="kartu">
          <div className="kartu-judul">
            <h3>Kualitas data dan cadangan</h3>
          </div>

          {mutu && (
            <div className="tabel-bungkus mb-4">
              <table className="tabel min-w-80">
                <tbody>
                  <tr>
                    <td>Pengukuran belum divalidasi</td>
                    <td className="angka">{mutu.belum_divalidasi}</td>
                  </tr>
                  {(mutu.kunjungan_tanpa_ukur ?? 0) > 0 && (
                    <tr>
                      <td>
                        Kunjungan tidak hadir
                        <div className="text-padat text-teks-samar">
                          Tidak ada timbangan atau ukur, jadi tidak ada yang divalidasi
                        </div>
                      </td>
                      <td className="angka">{mutu.kunjungan_tanpa_ukur}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Perlu tinjauan jam perangkat</td>
                    <td className="angka">{mutu.perlu_tinjauan.length}</td>
                  </tr>
                  <tr>
                    <td>Sinkron terakhir tablet</td>
                    <td className="angka">{waktuPendek(mutu.sinkron_terakhir)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 [&_strong]:text-isi">
            <strong>Berkas cadangan</strong>
            <button type="button" className="sekunder" onClick={cadangkan} disabled={mencadangkan}>
              <Ikon nama="unduh" ukuran={17} />
              {mencadangkan ? 'Mencadangkan…' : 'Cadangkan sekarang'}
            </button>
          </div>
          <ul className="grid list-disc gap-1.5 pl-4 text-isi text-teks-redup">
            {cadangan.map((c) => (
              <li key={c.nama} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="rounded-kecil border border-garis bg-latar px-1 py-0.5 font-mono text-padat">{c.nama}</span> · {Math.round(c.ukuran_byte / 1024)} KB ·{' '}
                  {waktuPendek(c.dibuat_pada)}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="sekunder"
                    onClick={() => unduhBerkas(c.nama)}
                    disabled={mengunduh !== null || memulihkan}
                  >
                    <Ikon nama="unduh" ukuran={16} />
                    {mengunduh === c.nama ? 'Mengunduh…' : 'Unduh'}
                  </button>
                  <button
                    type="button"
                    className="sekunder"
                    onClick={() => bukaPratinjau(c.nama)}
                    disabled={memuatPratinjau !== null || memulihkan}
                  >
                    <Ikon nama="pulihkan" ukuran={16} />
                    {memuatPratinjau === c.nama ? 'Memeriksa…' : 'Pulihkan'}
                  </button>
                </span>
              </li>
            ))}
            {cadangan.length === 0 && <li>Belum ada berkas cadangan.</li>}
          </ul>

          {konfirmPulih && (
            <div className="mt-4 rounded-kecil bg-biru-50 px-3 py-2.5 text-padat text-teks-redup">
              <strong>
                <Ikon nama="peringatan" ukuran={16} /> Periksa sebelum memulihkan
              </strong>
              <p className="-mt-1.5 mb-2 text-padat text-teks-samar">
                Berkas <span className="rounded-kecil border border-garis bg-latar px-1 py-0.5 font-mono text-padat">{konfirmPulih.nama}</span> dibuat{' '}
                {waktuPendek(konfirmPulih.pratinjau.dibuat_pada)}. Isinya:
              </p>
              <div className="tabel-bungkus">
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Tabel</th>
                      <th className="angka">Baris</th>
                    </tr>
                  </thead>
                  <tbody>
                    {konfirmPulih.pratinjau.tabel.map((t) => (
                      <tr key={t.nama}>
                        <td>{t.nama}</td>
                        <td className="angka">{t.jumlah}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {konfirmPulih.pratinjau.tabel.length === 0 && (
                <p className="flex items-center gap-1.5 font-bold text-kuning-800">
                  <Ikon nama="peringatan" ukuran={16} />
                  Berkas ini tidak memuat baris apa pun. Jangan dipulihkan.
                </p>
              )}
              <p className="-mt-1.5 mb-2 text-padat text-teks-samar">
                Pemulihan menimpa baris dengan id yang sama dan menambah baris yang belum ada.
                Tidak ada baris yang dihapus. Cadangan pengaman dibuat otomatis sebelum menulis.
              </p>
              <p className="-mt-1.5 mb-2 text-padat text-teks-samar">
                Akun pengguna ikut dipulihkan: kata sandi kembali ke versi berkas ini, dan akun
                yang dibuat setelahnya tetap ada. Sesi tablet yang sedang aktif tidak terputus.
              </p>
              <div className="bidang">
                <label htmlFor="sandi-pulih">
                  Kata sandi akun kamu
                  <span className="wajib" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="sandi-pulih"
                  type="password"
                  autoComplete="current-password"
                  value={sandiPulih}
                  onChange={(e) => setSandiPulih(e.target.value)}
                  disabled={memulihkan}
                  placeholder="Masukkan kata sandi"
                />
                <p className="petunjuk">
                  Diminta karena pemulihan bisa menimpa data. Tiga kali salah, tunggu 15 menit.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="bahaya"
                  onClick={() => pulihkan(konfirmPulih.nama)}
                  disabled={
                    memulihkan ||
                    !sandiPulih ||
                    konfirmPulih.pratinjau.tabel.length === 0
                  }
                >
                  {memulihkan ? 'Memulihkan…' : 'Ya, pulihkan sekarang'}
                </button>
                <button
                  type="button"
                  className="tautan"
                  onClick={() => {
                    setKonfirmPulih(null)
                    setSandiPulih('')
                  }}
                  disabled={memulihkan}
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          <p className="mb-0 text-padat text-teks-samar">
            Pencadangan harian berjalan otomatis di server. Berkas dienkripsi; kunci disimpan
            terpisah dari berkasnya. Unduh berkas lalu simpan di SSD kantor desa.
          </p>

          <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-3 [&_strong]:text-isi">
            <strong>Pulihkan dari berkas di perangkat</strong>
          </div>
          <label className={`relative flex min-h-12 cursor-pointer items-center gap-3 rounded-kecil border border-garis bg-kartu px-4 py-2.5 transition-[border-color,box-shadow] hover:border-biru-800 hover:shadow-[0_0_0_3px_var(--color-biru-100)] ${memulihkanUnggah ? 'pointer-events-none opacity-60' : ''}`}>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-kecil bg-biru-800 px-3 py-2 text-isi font-semibold whitespace-nowrap text-kartu">
              <Ikon nama="unduh" ukuran={16} />
              Pilih berkas
            </span>
            <span className="min-w-0 flex-1 text-isi text-teks-redup [overflow-wrap:anywhere]">
              {berkasPulih
                ? `${berkasPulih.name} · ${Math.round(berkasPulih.size / 1024)} KB`
                : 'Belum ada berkas dipilih'}
            </span>
            <input
              id="berkas-cadangan"
              type="file"
              accept=".enc,application/octet-stream"
              onChange={(e) => setBerkasPulih(e.target.files?.[0] ?? null)}
              disabled={memulihkanUnggah}
              aria-label="Pilih berkas cadangan"
            />
          </label>
          {berkasPulih && (
            <div className="mt-4 rounded-kecil bg-biru-50 px-3 py-2.5 text-padat text-teks-redup">
              <strong>
                <Ikon nama="peringatan" ukuran={16} /> Pulihkan dari berkas ini?
              </strong>
              <p className="-mt-1.5 mb-2 text-padat text-teks-samar">
                <span className="rounded-kecil border border-garis bg-latar px-1 py-0.5 font-mono text-padat">{berkasPulih.name}</span> ·{' '}
                {Math.round(berkasPulih.size / 1024)} KB
              </p>
              <p className="-mt-1.5 mb-2 text-padat text-teks-samar">
                Pemulihan menimpa baris dengan id yang sama dan menambah baris yang belum ada;
                tidak ada baris yang dihapus. Cadangan pengaman dibuat otomatis sebelum menulis.
              </p>
              <div className="bidang">
                <label htmlFor="sandi-pulih-unggah">
                  Kata sandi akun kamu
                  <span className="wajib" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="sandi-pulih-unggah"
                  type="password"
                  autoComplete="current-password"
                  value={sandiPulih}
                  onChange={(e) => setSandiPulih(e.target.value)}
                  disabled={memulihkanUnggah}
                  placeholder="Masukkan kata sandi"
                />
                <p className="petunjuk">
                  Diminta karena pemulihan bisa menimpa data. Tiga kali salah, tunggu 15 menit.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="bahaya"
                  onClick={pulihkanUnggah}
                  disabled={memulihkanUnggah || !sandiPulih}
                >
                  {memulihkanUnggah ? 'Memulihkan…' : 'Ya, pulihkan dari berkas'}
                </button>
                <button
                  type="button"
                  className="tautan"
                  onClick={() => {
                    setBerkasPulih(null)
                    setSandiPulih('')
                  }}
                  disabled={memulihkanUnggah}
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-2xs tracking-[0.01em] text-teks-samar">© 2026 KodeNara. All rights reserved.</p>

    </main>
  )
}
