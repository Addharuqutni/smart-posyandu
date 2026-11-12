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
import { BarisPetak, Kosong, Petak, Layar } from './Bersama.jsx'
import { tanggalHariIni, waktuPendek } from '../logika/waktu.js'

function bulanIni() {
  return tanggalHariIni().slice(0, 7)
}

function judulBulan(nilai) {
  const [tahun, bulan] = nilai.split('-')
  const tanggal = new Date(Number(tahun), Number(bulan) - 1, 1)
  return tanggal.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
}

const WARNA_SEBARAN = {
  gizi_baik: 'bg-hijau-700',
  gizi_kurang: 'bg-kuning-800',
  gizi_buruk: 'bg-merah-700',
  gizi_buruk_berat: 'bg-merah-800',
  belum_dinilai: 'bg-garis-kuat',
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

/** Tombol bulan langsung memuat, karena niatnya sudah jelas. */
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
  const totalUkur = Object.values(sebaran).reduce((jumlah, n) => jumlah + n, 0)

  return (
    <Layar>
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Rekap bulanan</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">Ringkasan kunjungan, status gizi, dan mutu data.</p>
        </div>
        <button
          type="button"
          className="sekunder shrink-0 whitespace-nowrap"
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

      {memuat && !isi && (
        <Kosong
          ikon="sinkron"
          judul="Memuat rekap…"
          teks="Mengambil angka dari server."
        />
      )}

      {isi && (
        <>
          <section className="mb-4" aria-labelledby="judul-rekap">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="judul-rekap" className="m-0 text-subjudul leading-tight font-bold text-biru-950">
                  {judulBulan(isi.bulan)}
                </h2>
                <p className="mt-0.5 mb-0 text-isi text-teks-redup">
                  {isi.posyandu.nama ?? 'Semua Posyandu'}
                </p>
              </div>

              <div className="flex items-center gap-1" role="group" aria-label="Bulan rekap">
                <button
                  type="button"
                  className="inline-flex size-11 items-center justify-center rounded-kecil border border-garis bg-kartu p-0 text-tombol leading-none font-bold text-biru-800 shadow-none hover:border-garis-kuat hover:bg-biru-50 hover:text-biru-950 disabled:border-garis disabled:text-garis-kuat"
                  onClick={() => gantiBulan(-1)}
                  disabled={memuat || bulan <= `${TAHUN_AWAL}-01`}
                  aria-label="Bulan sebelumnya"
                >
                  <Ikon nama="panah-kiri" ukuran={20} />
                </button>
                <select
                  className="w-auto min-w-[7.75rem] flex-none py-2 pr-7 pl-2.5 text-isi font-semibold text-biru-950"
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
                  className="w-auto min-w-[5.25rem] flex-none py-2 pr-7 pl-2.5 text-isi font-semibold text-biru-950"
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
                  className="inline-flex size-11 items-center justify-center rounded-kecil border border-garis bg-kartu p-0 text-tombol leading-none font-bold text-biru-800 shadow-none hover:border-garis-kuat hover:bg-biru-50 hover:text-biru-950 disabled:border-garis disabled:text-garis-kuat"
                  onClick={() => gantiBulan(1)}
                  disabled={memuat || bulan >= bulanIni()}
                  aria-label="Bulan berikutnya"
                >
                  <Ikon nama="panah-kanan" ukuran={20} />
                </button>
              </div>
            </div>

            <BarisPetak jumlah={5} label="Ringkasan bulan ini">
              <Petak
                utama
                ikon="kunjungan"
                warna="biru"
                nilai={isi.jumlah_kunjungan}
                label="Jumlah kunjungan"
                bantuan={{
                  id: 'bantuan-jumlah-kunjungan',
                  label: 'Penjelasan jumlah kunjungan',
                  teks: 'Total kedatangan balita bulan ini. Satu balita bisa dihitung lebih dari satu kali bila datang beberapa kali.',
                }}
              />
              <Petak
                ikon="balita-hadir"
                warna="hijau"
                nilai={isi.jumlah_balita_tercatat}
                label="Balita yang datang"
                bantuan={{
                  id: 'bantuan-balita-datang',
                  label: 'Penjelasan balita yang datang',
                  teks: 'Jumlah balita berbeda yang datang bulan ini. Bukan total kunjungan, dan bukan semua balita terdaftar.',
                }}
              />
              <Petak
                ikon="balita"
                warna="slate"
                nilai={isi.balita_terdaftar ?? '-'}
                label="Balita terdaftar"
                bantuan={{
                  id: 'bantuan-terdaftar',
                  label: 'Penjelasan balita terdaftar',
                  teks: 'Semua balita aktif di Posyandu ini, datang atau tidak bulan ini.',
                }}
              />
              <Petak
                ikon="balita-absen"
                warna="amber"
                nilai={isi.balita_tidak_berkunjung ?? '-'}
                label="Balita tidak datang"
                bantuan={{
                  id: 'bantuan-tidak-datang',
                  label: 'Penjelasan balita tidak datang',
                  teks: 'Balita aktif yang sama sekali tidak datang bulan ini. Perlu ditindaklanjuti kader.',
                }}
              />
              <Petak
                ikon="grafik"
                warna="teal"
                nilai={isi.rata_persen_median ?? '-'}
                satuan={isi.rata_persen_median != null ? '%' : undefined}
                label="Rata-rata persen median"
                bantuan={{
                  id: 'bantuan-median',
                  label: 'Penjelasan persen median',
                  teks: 'Berat balita dibanding berat rata-rata anak seusianya. 100% = sama dengan rata-rata. Di bawah 80% perlu perhatian.',
                }}
              />
            </BarisPetak>
          </section>

          <div className="kartu">
            <div className="kartu-judul">
              <h3>
                Sebaran status gizi
                <Bantuan
                  id="bantuan-sebaran"
                  label="Penjelasan sebaran status gizi"
                  teks="Status gizi dihitung server dari berat dan tinggi menurut umur. Jumlah di sini hanya kunjungan bulan ini."
                  ukuran={15}
                />
              </h3>
              <span className="text-padat text-teks-samar tabular-nums">
                {totalUkur > 0 ? `${totalUkur} pengukuran` : 'Belum ada'}
              </span>
            </div>

            {totalUkur === 0 ? (
              <p className="mb-0 text-isi text-teks-redup">
                Belum ada pengukuran pada bulan ini. Angka muncul setelah kunjungan terkirim dan divalidasi.
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-2.5 p-0">
                {Object.entries(sebaran).map(([kode, cacah]) => (
                  <li key={kode} className="grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 max-mini:grid-cols-[7rem_minmax(0,1fr)_2.25rem] max-mini:gap-2">
                    <span className={`lencana-gizi ${kode} w-fit`}>
                      {PESAN_STATUS[kode] ?? 'Belum dinilai'}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-latar" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${WARNA_SEBARAN[kode] ?? 'bg-garis-kuat'}`}
                        style={{ width: `${Math.round((cacah / totalUkur) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right text-isi font-bold tabular-nums text-biru-950">{cacah}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-garis pt-3">
              <p className="m-0 max-w-[42ch] text-padat text-teks-samar">
                Ekspor dibubuhi cap waktu dan nama pemakai, serta dicatat di log audit.
              </p>
              <button type="button" className="sekunder" onClick={ekspor}>
                <Ikon nama="unduh" ukuran={18} />
                Unduh CSV {judulBulan(bulan)}
              </button>
            </div>
          </div>
        </>
      )}

      {(mutu || cadangan.length > 0) && (
        <div className="kartu">
          <div className="kartu-judul">
            <h3>Kualitas data dan cadangan</h3>
          </div>

          {mutu && (
            <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-kecil border border-garis bg-garis mini:grid-cols-4">
              <div className="bg-kartu px-3 py-2.5">
                <dt className="text-2xs leading-tight font-medium text-teks-samar">Belum divalidasi</dt>
                <dd className="m-0 mt-0.5 text-subjudul leading-none font-bold tabular-nums text-biru-950">
                  {mutu.belum_divalidasi}
                </dd>
              </div>
              <div className="bg-kartu px-3 py-2.5">
                <dt className="text-2xs leading-tight font-medium text-teks-samar">Tanpa pengukuran</dt>
                <dd className="m-0 mt-0.5 text-subjudul leading-none font-bold tabular-nums text-biru-950">
                  {mutu.kunjungan_tanpa_ukur ?? 0}
                </dd>
              </div>
              <div className="bg-kartu px-3 py-2.5">
                <dt className="text-2xs leading-tight font-medium text-teks-samar">Perlu tinjauan jam</dt>
                <dd className="m-0 mt-0.5 text-subjudul leading-none font-bold tabular-nums text-biru-950">
                  {mutu.perlu_tinjauan.length}
                </dd>
              </div>
              <div className="bg-kartu px-3 py-2.5">
                <dt className="text-2xs leading-tight font-medium text-teks-samar">Sinkron terakhir</dt>
                <dd className="m-0 mt-0.5 text-padat font-semibold tabular-nums text-biru-950">
                  {waktuPendek(mutu.sinkron_terakhir)}
                </dd>
              </div>
            </dl>
          )}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 [&_strong]:text-isi">
            <strong>Berkas cadangan</strong>
            <button type="button" className="sekunder" onClick={cadangkan} disabled={mencadangkan}>
              <Ikon nama="unduh" ukuran={17} />
              {mencadangkan ? 'Mencadangkan…' : 'Cadangkan sekarang'}
            </button>
          </div>
          <ul className="m-0 -mb-3 list-none divide-y divide-garis p-0">
            {cadangan.map((c) => (
              <li key={c.nama} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
                <span className="min-w-0 text-padat text-teks-redup">
                  <span className="block truncate font-mono text-isi text-teks" title={c.nama}>{c.nama}</span>
                  <span className="tabular-nums">
                    {Math.round(c.ukuran_byte / 1024)} KB · {waktuPendek(c.dibuat_pada)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
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
            {cadangan.length === 0 && (
              <li className="py-2.5 text-isi text-teks-redup">Belum ada berkas cadangan.</li>
            )}
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
                name="kata_sandi_pemulihan"

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
          <label className={`relative flex min-h-12 cursor-pointer items-center gap-3 rounded-kecil border border-garis bg-kartu px-4 py-2.5 transition-[border-color,box-shadow] duration-200 ease-ui hover:border-biru-800 hover:shadow-[0_0_0_3px_var(--color-biru-100)] ${memulihkanUnggah ? 'pointer-events-none opacity-60' : ''}`}>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-kecil bg-biru-800 px-3 py-2 text-isi font-semibold whitespace-nowrap text-kartu">
              <Ikon nama="unduh" ukuran={16} />
              Pilih berkas
            </span>
            <span className="min-w-0 flex-1 text-isi text-teks-redup [overflow-wrap:anywhere]">
              {berkasPulih
                ? `${berkasPulih.name} · ${Math.round(berkasPulih.size / 1024)} KB`
                : 'Belum ada berkas dipilih'}
            </span>
            {/* Input asli disembunyikan: kontrol bawaan browser tidak bisa
                digayakan dan memecah baris label. Label tetap jadi pemicunya. */}
            <input
              id="berkas-cadangan"
                name="berkas_cadangan"

              type="file"
              className="sr-only"
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
                name="kata_sandi_pemulihan"

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

    </Layar>
  )
}
