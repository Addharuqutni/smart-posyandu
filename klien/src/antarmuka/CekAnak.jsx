import { useEffect, useState } from 'react'
import { cariBalitaWali, keluarWali, riwayatWali } from '../jaringan/api.js'
import { PESAN_STATUS } from '../logika/rentang.js'
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
          fill="none" stroke="#12538a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        />
        {koordinat.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#12538a" />)}
      </svg>
      <div className="flex justify-between text-2xs text-teks-samar">
        <span>{tanggal(titik[0].tanggal_kunjungan)}</span>
        <span>{tanggal(titik.at(-1).tanggal_kunjungan)}</span>
      </div>
    </div>
  )
}

export default function CekAnak({ kePublik }) {
  const [kunci, setKunci] = useState('')
  const [data, setData] = useState(null)
  const [galat, setGalat] = useState(null)
  const [memuat, setMemuat] = useState(true)
  const [mencari, setMencari] = useState(false)

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
    setMencari(true)
    try {
      await cariBalitaWali(kunci)
      setData(await riwayatWali())
      setKunci('')
    } catch (salah) {
      setData(null)
      setGalat(salah.status === 429
        ? 'Terlalu banyak percobaan. Coba lagi 15 menit.'
        : 'Nama atau NIK belum cocok. Bila nama sama, masukkan 16 digit NIK.')
    } finally {
      setMencari(false)
    }
  }

  async function keluar() {
    try { await keluarWali() } catch { /* cookie kedaluwarsa sendiri */ }
    setData(null)
    setGalat(null)
    setKunci('')
  }

  return (
    <Layar>
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Cek Perkembangan Anak</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">Riwayat kunjungan dan statistik tumbuh kembang balita.</p>
        </div>
        <button type="button" className="sekunder inline-flex items-center gap-1.5" onClick={kePublik}>
          <Ikon nama="kembali" ukuran={18} />
          <span>Beranda</span>
        </button>
      </div>

      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border border-merah-100 bg-merah-100 px-3 py-3 text-isi font-semibold text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}

      {!data && !memuat && (
        <form className="kartu" onSubmit={cari}>
          <h2 className="mb-1 text-dasar font-bold text-teks">Cari data balita</h2>
          <p className="mt-0 mb-4 text-padat text-teks-redup">Masukkan nama lengkap atau 16 digit NIK balita.</p>
          <div className="bidang flex flex-col">
            <label htmlFor="wali-kunci"><span>Nama / NIK balita</span><span className="wajib" aria-hidden="true">*</span></label>
            <input id="wali-kunci" name="kunci" autoComplete="off" required maxLength={120}
              placeholder="cth. Budi Santoso atau 3301010101010009" value={kunci}
              onChange={(e) => setKunci(e.target.value)} />
          </div>
          <button type="submit" className="mt-4 besar" disabled={mencari}>
            <Ikon nama="cari" ukuran={18} />
            {mencari ? 'Mencari…' : 'Lihat perkembangan'}
          </button>
        </form>
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
            <Petak ikon="centang" warna="hijau" nilai={PESAN_STATUS[data.ringkasan.status_gizi_terakhir] ?? 'Belum ada'} label="Status gizi terakhir" />
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
                        <td data-label="Status gizi">{PESAN_STATUS[k.status_gizi] ?? (k.status_gizi ? k.status_gizi : '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Layar>
  )
}
