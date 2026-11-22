import { useEffect, useState } from 'react'
import { cariBalitaWali, keluarWali, riwayatWali } from '../jaringan/api.js'
import { labelStatus } from '../logika/rentang.js'
import { usiaRingkas } from '../logika/waktu.js'
import { BarisPetak, Layar, Petak } from './Bersama.jsx'
import Ikon from './Ikon.jsx'

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function tanggal(iso) {
  const [t, b, h] = String(iso ?? '').split('-')
  return `${Number(h)} ${BULAN[Number(b) - 1] ?? b} ${t}`
}

function angka(nilai) {
  return nilai == null ? '-' : String(nilai)
}

/** Nama wali terdaftar; mundur ke nama ibu kandung bila relasi belum ada. */
function waliTeks(balita) {
  const daftar = Array.isArray(balita.wali) ? balita.wali : []
  const nama = daftar.map((w) => `${w.nama_lengkap} (${String(w.hubungan).replaceAll('_', ' ')})`)
  if (!nama.length && balita.nama_ibu_kandung) nama.push(`${balita.nama_ibu_kandung} (ibu kandung)`)
  return nama.length ? nama.join(', ') : null
}

/** Grafik berat inline: SVG polos, tanpa Chart.js atau data di URL. */
function GrafikBerat({ kunjungan }) {
  const titik = kunjungan.filter((k) => k.berat_kg != null)
  if (titik.length < 2) return null
  const nilai = titik.map((k) => Number(k.berat_kg))
  const min = Math.min(...nilai) - 0.5
  const maks = Math.max(...nilai) + 0.5
  const koordinat = nilai.map((n, i) => [
    8 + (i * 284) / (nilai.length - 1),
    92 - ((n - min) / (maks - min)) * 84,
  ])
  return (
    <div className="kartu mb-4">
      <h2 className="mb-1 text-dasar font-bold text-teks">Grafik berat badan</h2>
      <p className="mt-0 mb-3 text-padat text-teks-redup">Dari kunjungan yang sudah diperiksa petugas.</p>
      <svg viewBox="0 0 300 100" className="w-full" role="img" aria-label={`Grafik berat badan dari ${angka(nilai[0])} kg sampai ${angka(nilai.at(-1))} kg`}>
        <polyline
          points={koordinat.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none" stroke="#096b68" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        />
        {koordinat.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#064d4b" />)}
      </svg>
      <div className="flex justify-between text-2xs text-teks-samar">
        <span>{tanggal(titik[0].tanggal_kunjungan)}</span>
        <span>{tanggal(titik.at(-1).tanggal_kunjungan)}</span>
      </div>
    </div>
  )
}

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export default function CekAnak({ kePublik }) {
  const [kunci, setKunci] = useState('')
  const [hari, setHari] = useState('')
  const [bulan, setBulan] = useState('')
  const [tahun, setTahun] = useState('')
  const [data, setData] = useState(null)
  const [galat, setGalat] = useState(null)
  const [memuat, setMemuat] = useState(true)
  const [mencari, setMencari] = useState(false)

  // Rentang umur balita (0-6 tahun): dari tahun berjalan mundur 6 tahun
  const tahunSekarang = new Date().getFullYear()
  const daftarTahun = Array.from({ length: 7 }, (_, i) => tahunSekarang - i)
  const daftarHari = Array.from({ length: 31 }, (_, i) => i + 1)

  useEffect(() => {
    let hidup = true
    riwayatWali()
      .then((hasil) => { if (hidup) setData(hasil) })
      .catch(() => { if (hidup) setData(null) })
      .finally(() => { if (hidup) setMemuat(false) })
    return () => { hidup = false }
  }, [])

  async function cari(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)

    if (!hari || !bulan || !tahun) {
      setGalat('Silakan pilih tanggal, bulan, dan tahun lahir balita secara lengkap.')
      return
    }

    const h = String(hari).padStart(2, '0')
    const b = String(bulan).padStart(2, '0')
    const tanggalLahir = `${tahun}-${b}-${h}`

    setMencari(true)
    try {
      await cariBalitaWali(kunci, tanggalLahir)
      setData(await riwayatWali())
      setKunci('')
      setHari('')
      setBulan('')
      setTahun('')
    } catch (salah) {
      setData(null)
      setGalat(salah.status === 429
        ? 'Terlalu banyak percobaan. Coba lagi 15 menit.'
        : 'Nama/NIK dan tanggal lahir belum cocok. Periksa lagi ya.')
    } finally {
      setMencari(false)
    }
  }

  async function keluar() {
    try { await keluarWali() } catch { /* cookie kedaluwarsa sendiri */ }
    setData(null)
    setGalat(null)
    setKunci('')
    setHari('')
    setBulan('')
    setTahun('')
  }
  return (
    <div className="editorial kanal-publik min-h-dvh bg-latar text-teks font-sans antialiased selection:bg-emas/30 selection:text-hijau-tua">
      {/* Header Resmi Desa Model 2-Tingkat */}
      <header className="sticky top-0 z-30 shadow-sm [padding-top:env(safe-area-inset-top)]">
        <div className="border-b border-emas/40 bg-[image:var(--latar-topbar-desa)] text-white">
          <div className="mx-auto flex min-h-11 max-w-lebar items-center justify-between gap-3 px-3 py-1.5 text-2xs max-sempit:px-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid size-7 shrink-0 place-items-center rounded-mikro bg-white/15 p-1 ring-1 ring-white/30">
                <img
                  className="size-full object-contain [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.4))]"
                  src="/logo-192.png"
                  alt="Logo Smart Posyandu"
                  width="28"
                  height="28"
                  decoding="async"
                />
              </div>
              <div className="min-w-0 leading-tight">
                <span className="block truncate font-bold tracking-[0.02em] text-white">
                  Smart Posyandu
                </span>
                <span className="block truncate text-3xs font-medium text-emas-muda">
                  Kanal Warga Desa Ketenger
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={kePublik}
              className="inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-full border border-emas/40 bg-white/10 px-3 py-1 text-2xs font-semibold text-white shadow-none transition-colors hover:border-emas hover:bg-white/20"
            >
              <Ikon nama="kembali" ukuran={14} />
              <span>Kembali ke Beranda</span>
            </button>
          </div>
        </div>
      </header>

      <main id="isi-utama" className="mx-auto max-w-lebar px-3 pt-6 pb-14 max-sempit:px-2 max-sempit:pt-4">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-garis pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-hijau-desa px-3 py-0.5 text-3xs font-bold text-white uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-emas" aria-hidden="true" />
              <span>Layanan Mandiri Warga</span>
            </div>
            <h1 className="m-0 mt-2 text-panggung-kecil font-extrabold tracking-[-0.03em] text-teks">
              Cek Perkembangan Anak
            </h1>
            <p className="mt-1 mb-0 text-padat text-teks-redup">
              Riwayat penimbangan rutin, imunisasi, dan status gizi balita dari posyandu dusun.
            </p>
          </div>
        </div>

        {galat && (
          <div className="mb-4 flex items-start gap-2.5 rounded-sedang border border-merah-200 bg-merah-50 p-4 text-padat font-semibold text-merah-800" role="alert">
            <span className="mt-0.5 shrink-0 text-merah-700">
              <Ikon nama="peringatan" ukuran={18} />
            </span>
            <span>{galat}</span>
          </div>
        )}

        {!data && !memuat && (
          <div className="mx-auto max-w-xl">
            <form className="rounded-sedang border border-garis bg-white p-6 shadow-sm sm:p-8" onSubmit={cari}>
              <div className="mb-5 border-b border-garis pb-3">
                <h2 className="m-0 text-dasar font-bold text-teks">Pencarian Data Balita</h2>
                <p className="mt-1 mb-0 text-padat text-teks-redup">
                  Masukkan nama lengkap atau 16 digit NIK balita beserta tanggal lahir sesuai Kartu Keluarga (KK).
                </p>
              </div>

              <div className="bidang flex flex-col">
                <label htmlFor="wali-kunci" className="font-semibold text-teks text-padat">
                  <span>Nama lengkap atau 16 digit NIK balita</span>
                  <span className="text-merah-700 ml-1" aria-hidden="true">*</span>
                </label>
                <input
                  id="wali-kunci"
                  name="kunci"
                  autoComplete="off"
                  required
                  maxLength={120}
                  className="mt-1.5 min-h-[46px] rounded-kecil border border-garis px-3.5 text-isi text-teks focus:border-hijau-desa focus:ring-1 focus:ring-hijau-desa focus:outline-none"
                  placeholder="Contoh: Budi Santoso atau 330201..."
                  value={kunci}
                  onChange={(e) => setKunci(e.target.value)}
                />
              </div>

              <fieldset className="bidang mt-4 border-0 p-0 m-0">
                <legend className="font-semibold text-teks text-padat mb-1.5">
                  <span>Tanggal lahir balita (sesuai Buku KIA / KK)</span>
                  <span className="text-merah-700 ml-1" aria-hidden="true">*</span>
                </legend>
                <div className="grid grid-cols-12 gap-2">
                  {/* Pilih Tanggal (Hari) */}
                  <div className="col-span-4 sm:col-span-3">
                    <label htmlFor="wali-hari" className="sr-only">Tanggal (Hari)</label>
                    <select
                      id="wali-hari"
                      required
                      value={hari}
                      onChange={(e) => setHari(e.target.value)}
                      className="w-full min-h-[46px] rounded-kecil border border-garis bg-white px-2.5 text-isi text-teks font-medium focus:border-hijau-desa focus:ring-1 focus:ring-hijau-desa focus:outline-none"
                    >
                      <option value="">Hari</option>
                      {daftarHari.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Pilih Bulan */}
                  <div className="col-span-8 sm:col-span-5">
                    <label htmlFor="wali-bulan" className="sr-only">Bulan</label>
                    <select
                      id="wali-bulan"
                      required
                      value={bulan}
                      onChange={(e) => setBulan(e.target.value)}
                      className="w-full min-h-[46px] rounded-kecil border border-garis bg-white px-2.5 text-isi text-teks font-medium focus:border-hijau-desa focus:ring-1 focus:ring-hijau-desa focus:outline-none"
                    >
                      <option value="">Bulan lahir</option>
                      {NAMA_BULAN.map((nama, idx) => (
                        <option key={idx + 1} value={idx + 1}>{nama}</option>
                      ))}
                    </select>
                  </div>

                  {/* Pilih Tahun */}
                  <div className="col-span-12 sm:col-span-4">
                    <label htmlFor="wali-tahun" className="sr-only">Tahun</label>
                    <select
                      id="wali-tahun"
                      required
                      value={tahun}
                      onChange={(e) => setTahun(e.target.value)}
                      className="w-full min-h-[46px] rounded-kecil border border-garis bg-white px-2.5 text-isi text-teks font-medium focus:border-hijau-desa focus:ring-1 focus:ring-hijau-desa focus:outline-none"
                    >
                      <option value="">Tahun lahir</option>
                      {daftarTahun.map((th) => (
                        <option key={th} value={th}>{th}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-1.5 mb-0 text-2xs text-teks-samar">
                  Pilih tanggal, bulan, dan tahun kelahiran balita tanpa perlu mengetik format tanggal manual.
                </p>
              </fieldset>

              <button
                type="submit"
                className="mt-6 inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-hijau-desa px-6 text-padat font-bold text-white shadow-kontrol transition-all duration-150 ease-ui hover:bg-hijau-tua active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hijau-desa"
                disabled={mencari}
              >
                <Ikon nama="cari" ukuran={18} />
                <span>{mencari ? 'Mencari data balita…' : 'Lihat Perkembangan Balita'}</span>
              </button>
            </form>
          </div>
        )}

      {data && (
        <>
          <div className="kartu mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-dasar font-bold text-teks">{data.balita.nama_lengkap}</h2>
              <p className="mt-1 mb-0 text-padat text-teks-redup">
                {usiaRingkas(data.balita.tanggal_lahir) ?? '-'} · {data.balita.nama_posyandu ?? 'Posyandu Desa'}
              </p>
              {waliTeks(data.balita) && (
                <p className="mt-0.5 mb-0 inline-flex items-center gap-1.5 text-padat text-teks-redup [&_svg]:shrink-0 [&_svg]:text-teks-samar">
                  <Ikon nama="balita" ukuran={14} />
                  <span>{waliTeks(data.balita)}</span>
                </p>
              )}
            </div>
            <button type="button" className="sekunder" onClick={keluar}>Cari anak lain</button>
          </div>

          <BarisPetak jumlah={4} label="Statistik perkembangan balita">
            <Petak ikon="kunjungan" nilai={data.ringkasan.jumlah_kunjungan} label="Kunjungan tercatat" />
            <Petak ikon="grafik" nilai={angka(data.ringkasan.berat_terakhir_kg)} satuan="kg" label="Berat terakhir" />
            <Petak ikon="anak" nilai={angka(data.ringkasan.tinggi_terakhir_cm)} satuan="cm" label="Tinggi terakhir" />
            <Petak ikon="info" warna="slate" nilai={labelStatus(data.ringkasan.status_gizi_terakhir, data.ringkasan.sumber_status_terakhir) ?? 'Belum ada'} label="Keterangan gizi terakhir" />
          </BarisPetak>

          {data.ringkasan.perubahan_berat_kg != null && (
            <p className="mb-4 text-padat text-teks-redup">
              Perubahan berat sejak kunjungan sebelumnya: <strong>{data.ringkasan.perubahan_berat_kg > 0 ? '+' : ''}{data.ringkasan.perubahan_berat_kg} kg</strong>.
            </p>
          )}

          <GrafikBerat kunjungan={data.kunjungan} />

          <div className="kartu">
            <h2 className="mb-3 text-dasar font-bold text-teks">Riwayat kunjungan</h2>
            {data.kunjungan.length === 0 ? (
              <p className="m-0 text-isi text-teks-redup">Belum ada kunjungan yang sudah divalidasi petugas.</p>
            ) : (
              <div className="tabel-bungkus">
                <table className="tabel tabel-lentur text-padat">
                  <thead><tr><th>Tanggal</th><th>Usia</th><th>Berat</th><th>Tinggi</th><th>Lingkar kepala</th><th>Status gizi</th></tr></thead>
                  <tbody>
                    {data.kunjungan.map((k, i) => (
                      <tr key={`${k.tanggal_kunjungan}-${i}`}>
                        <td data-label="Tanggal">{tanggal(k.tanggal_kunjungan)}</td>
                        <td data-label="Usia">{k.usia_bulan} bulan</td>
                        <td data-label="Berat">{angka(k.berat_kg)} kg</td>
                        <td data-label="Tinggi">{angka(k.tinggi_cm)} cm</td>
                        <td data-label="Lingkar kepala">{angka(k.lingkar_kepala_cm)} cm</td>
                        <td data-label="Status gizi">{labelStatus(k.status_gizi, k.sumber_status) ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      </main>
    </div>
  )
}
