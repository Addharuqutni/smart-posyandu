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
    <main className="layar" id="isi-utama">
      <div className="kepala-layar">
        <div>
          <h1>Rekap bulanan</h1>
          <p>Ringkasan kunjungan, status gizi, dan mutu data.</p>
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
        <div className="pesan galat" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}
      {pesan && (
        <div className="pesan sukses" role="status">
          <Ikon nama="cek" ukuran={19} />
          <span>{pesan}</span>
        </div>
      )}

      <div className="kartu kartu-filter">
        <div className="baris-filter">
          <div className="bidang bidang-filter">
            <span className="label-segmen" id="label-bulan">Bulan rekap</span>
            <div className="pilih-bulan" role="group" aria-labelledby="label-bulan">
              <button
                type="button"
                className="tombol-geser"
                onClick={() => gantiBulan(-1)}
                disabled={memuat || bulan <= `${TAHUN_AWAL}-01`}
                aria-label="Bulan sebelumnya"
              >
                ‹
              </button>
              <select
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
                className="pilih-tahun"
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
                className="tombol-geser"
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
          <div className="kepala-layar kepala-seksi">
            <div>
              <h2>{judulBulan(isi.bulan)}</h2>
              <p>{isi.posyandu.nama ?? 'Semua Posyandu'}</p>
            </div>
          </div>

          <div className="ringkasan ringkasan-rekap">
            <div className="stat stat--kunjungan">
              <div className="stat-atas">
                <span className="stat-ikon">
                  <Ikon nama="kunjungan" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-jumlah-kunjungan"
                  label="Penjelasan jumlah kunjungan"
                  teks="Total kedatangan balita bulan ini. Satu balita bisa dihitung lebih dari satu kali bila datang beberapa kali."
                />
              </div>
              <div className="stat-bawah">
                <div className="stat-nilai">{isi.jumlah_kunjungan}</div>
                <div className="stat-label">Jumlah kunjungan</div>
              </div>
            </div>

            <div className="stat stat--hadir">
              <div className="stat-atas">
                <span className="stat-ikon">
                  <Ikon nama="balita-hadir" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-balita-datang"
                  label="Penjelasan balita yang datang"
                  teks="Jumlah balita berbeda yang datang bulan ini. Bukan total kunjungan, dan bukan semua balita terdaftar."
                />
              </div>
              <div className="stat-bawah">
                <div className="stat-nilai">{isi.jumlah_balita_tercatat}</div>
                <div className="stat-label">Balita yang datang</div>
              </div>
            </div>

            <div className="stat stat--terdaftar">
              <div className="stat-atas">
                <span className="stat-ikon">
                  <Ikon nama="balita" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-terdaftar"
                  label="Penjelasan balita terdaftar"
                  teks="Semua balita aktif di Posyandu ini, datang atau tidak bulan ini."
                />
              </div>
              <div className="stat-bawah">
                <div className="stat-nilai">{isi.balita_terdaftar ?? '—'}</div>
                <div className="stat-label">Balita terdaftar</div>
              </div>
            </div>

            <div className="stat stat--tidak-datang">
              <div className="stat-atas">
                <span className="stat-ikon">
                  <Ikon nama="balita-absen" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-tidak-datang"
                  label="Penjelasan balita tidak datang"
                  teks="Balita aktif yang sama sekali tidak datang bulan ini. Perlu ditindaklanjuti kader."
                />
              </div>
              <div className="stat-bawah">
                <div className="stat-nilai">{isi.balita_tidak_berkunjung ?? '—'}</div>
                <div className="stat-label">Balita tidak datang</div>
              </div>
            </div>

            <div className="stat stat--median">
              <div className="stat-atas">
                <span className="stat-ikon">
                  <Ikon nama="grafik" ukuran={16} />
                </span>
                <Bantuan
                  id="bantuan-median"
                  label="Penjelasan persen median"
                  teks="Berat balita dibanding berat rata-rata anak seusianya. 100% = sama dengan rata-rata. Di bawah 80% perlu perhatian."
                />
              </div>
              <div className="stat-bawah">
                <div className="stat-nilai">
                  {isi.rata_persen_median ?? '—'}
                  {isi.rata_persen_median != null && (
                    <span className="satuan-stat">%</span>
                  )}
                </div>
                <div className="stat-label">Rata-rata persen median</div>
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
              <span className="samar">Pengukuran bulan ini</span>
            </div>
            {Object.keys(sebaran).length === 0 ? (
              <p className="redup">
                Belum ada pengukuran pada bulan ini.
              </p>
            ) : (
              <div className="tabel-bungkus">
                <table className="tabel tabel-lebar-min">
                  <tbody>
                    {Object.entries(sebaran).map(([kode, cacah]) => (
                      <tr key={kode}>
                        <td>
                          <span className={`lencana-gizi ${kode}`}>
                            {PESAN_STATUS[kode] ?? 'Belum dinilai'}
                          </span>
                        </td>
                        <td className="angka tebal">
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
              className="sekunder tombol-spasi-atas"
              onClick={ekspor}
            >
              <Ikon nama="unduh" ukuran={18} />
              Unduh CSV {judulBulan(bulan)}
            </button>
            <p className="samar teks-bawah">
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
            <div className="tabel-bungkus tabel-spasi-bawah">
              <table className="tabel tabel-lebar-min">
                <tbody>
                  <tr>
                    <td>Pengukuran belum divalidasi</td>
                    <td className="angka">{mutu.belum_divalidasi}</td>
                  </tr>
                  {(mutu.kunjungan_tanpa_ukur ?? 0) > 0 && (
                    <tr>
                      <td>
                        Kunjungan tidak hadir
                        <div className="samar">
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
          <div className="baris baris-subjudul">
            <strong>Berkas cadangan</strong>
            <button type="button" className="sekunder" onClick={cadangkan} disabled={mencadangkan}>
              <Ikon nama="unduh" ukuran={17} />
              {mencadangkan ? 'Mencadangkan…' : 'Cadangkan sekarang'}
            </button>
          </div>
          <ul className="daftar-sederhana">
            {cadangan.map((c) => (
              <li key={c.nama} className="baris">
                <span>
                  <span className="kode">{c.nama}</span> · {Math.round(c.ukuran_byte / 1024)} KB ·{' '}
                  {waktuPendek(c.dibuat_pada)}
                </span>
                <span className="baris-rapat">
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
            <div className="catatan spasi-atas">
              <strong>
                <Ikon nama="peringatan" ukuran={16} /> Periksa sebelum memulihkan
              </strong>
              <p className="petunjuk-atas">
                Berkas <span className="kode">{konfirmPulih.nama}</span> dibuat{' '}
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
                <p className="teks-peringatan">
                  <Ikon nama="peringatan" ukuran={16} />
                  Berkas ini tidak memuat baris apa pun. Jangan dipulihkan.
                </p>
              )}
              <p className="petunjuk-atas">
                Pemulihan menimpa baris dengan id yang sama dan menambah baris yang belum ada.
                Tidak ada baris yang dihapus. Cadangan pengaman dibuat otomatis sebelum menulis.
              </p>
              <p className="petunjuk-atas">
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
              <div className="baris-rapat">
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

          <p className="samar teks-bawah">
            Pencadangan harian berjalan otomatis di server. Berkas dienkripsi; kunci disimpan
            terpisah dari berkasnya. Unduh berkas lalu simpan di SSD kantor desa.
          </p>

          <div className="baris baris-subjudul spasi-atas">
            <strong>Pulihkan dari berkas di perangkat</strong>
          </div>
          <label className={`berkas-pilih${memulihkanUnggah ? ' tak-aktif' : ''}`}>
            <span className="berkas-pilih-tombol">
              <Ikon nama="unduh" ukuran={16} />
              Pilih berkas
            </span>
            <span className="berkas-nama">
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
            <div className="catatan spasi-atas">
              <strong>
                <Ikon nama="peringatan" ukuran={16} /> Pulihkan dari berkas ini?
              </strong>
              <p className="petunjuk-atas">
                <span className="kode">{berkasPulih.name}</span> ·{' '}
                {Math.round(berkasPulih.size / 1024)} KB
              </p>
              <p className="petunjuk-atas">
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
              <div className="baris-rapat">
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

      <p className="hak-cipta">© 2026 KodeNara. All rights reserved.</p>

    </main>
  )
}
