import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { db } from '../penyimpanan/db.js'
import { ubahPengukuran } from '../penyimpanan/kunjungan.js'
import { PESAN_STATUS, RENTANG } from '../logika/rentang.js'
import { rapikanDesimal } from '../logika/angka.js'
import { waliBalita } from '../penyimpanan/balita.js'
import { usiaBulan, tanggalHariIni } from '../logika/waktu.js'
import { inisial } from '../logika/nama.js'
import Ikon from './Ikon.jsx'
import Bantuan from './Bantuan.jsx'
import { Kosong } from './Bersama.jsx'
import { detailPosyandu } from '../jaringan/api.js'

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

function tanggalPendek(iso) {
  if (!iso) return '—'
  const [tahun, bulan, hari] = iso.split('-')
  return `${Number(hari)}/${Number(bulan)}/${tahun}`
}

function tanggalLengkap(iso) {
  if (!iso) return '—'
  const [tahun, bulan, hari] = iso.split('-')
  const idx = Number(bulan) - 1
  return `${Number(hari)} ${NAMA_BULAN[idx] ?? bulan} ${tahun}`
}

/** Riwayat ukur + grafik berat + sunting yang belum divalidasi (F-07, F-08). */
export default function Riwayat({ sesi, balita, kembali, setelahUbah }) {
  const [baris, setBaris] = useState([])
  const [wali, setWali] = useState([])
  const [posyandu, setPosyandu] = useState(null)
  const [sunting, setSunting] = useState(null)
  const [galat, setGalat] = useState(null)
  const kanvas = useRef(null)
  const grafik = useRef(null)

  async function muat() {
    try {
      const [kunjungan, waliBalitaData, posyanduData] = await Promise.all([
        db.kunjungan
          .where('balita_id')
          .equals(balita.id)
          .filter((k) => !k.dihapus_pada)
          .toArray(),
        waliBalita(balita.id),
        balita.posyandu_id ? detailPosyandu(balita.posyandu_id) : Promise.resolve(null),
      ])
      kunjungan.sort((a, b) => a.tanggal_kunjungan.localeCompare(b.tanggal_kunjungan))
      const lengkap = []
      for (const k of kunjungan) {
        const ukur = await db.pengukuran.where('kunjungan_id').equals(k.id).first()
        // Kunjungan tanpa ukur (tidak hadir) tetap tampil di riwayat.
        lengkap.push({ ...k, pengukuran: ukur && !ukur.dihapus_pada ? ukur : null })
      }
      setBaris(lengkap)
      setWali(waliBalitaData)
      setPosyandu(posyanduData)
      setGalat(null)
    } catch (salah) {
      // Riwayat tetap bisa dibaca luring; detail Posyandu menyusul saat daring.
      setGalat(salah?.message && !salah.status ? null : 'Detail Posyandu belum bisa dimuat.')
      setWali(await waliBalita(balita.id))
    }
  }

  useEffect(() => {
    muat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balita.id])

  useEffect(() => {
    const denganUkur = baris.filter((b) => b.pengukuran)
    if (!kanvas.current || denganUkur.length === 0) return
    grafik.current?.destroy()
    grafik.current = new Chart(kanvas.current, {
      type: 'line',
      data: {
        labels: denganUkur.map((b) => tanggalPendek(b.tanggal_kunjungan)),
        datasets: [
          {
            label: 'Berat (kg)',
            data: denganUkur.map((b) => Number(b.pengukuran.berat_kg)),
            borderColor: '#12538a',
            backgroundColor: 'rgba(18,83,138,0.12)',
            borderWidth: 2.5,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#12538a',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#5b6e82', maxRotation: 0, autoSkipPadding: 12 },
          },
          y: {
            beginAtZero: false,
            title: { display: true, text: 'kg', color: '#5b6e82' },
            grid: { color: '#d1dce6' },
            ticks: { color: '#5b6e82' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0a192f',
            padding: 10,
            titleFont: { weight: '600' },
            callbacks: {
              label: (item) => ` ${item.parsed.y} kg`,
            },
          },
        },
      },
    })
    return () => {
      grafik.current?.destroy()
      grafik.current = null
    }
  }, [baris])

  async function simpanSunting(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    try {
      await ubahPengukuran(
        sunting.id,
        {
          berat_kg: sunting.berat_kg,
          tinggi_cm: sunting.tinggi_cm,
          lingkar_kepala_cm: sunting.lingkar_kepala_cm,
        },
        sesi.id_perangkat,
        sesi.pengguna.id,
      )
      setSunting(null)
      await muat()
      setelahUbah?.()
    } catch (salah) {
      setGalat(salah.message)
    }
  }

  /** Ubah satu angka ukur; koma diterima sebagai pemisah desimal. */
  function ubahUkur(kolom, nilai) {
    setSunting((lama) => ({ ...lama, [kolom]: rapikanDesimal(nilai) }))
  }

  const umur = usiaBulan(balita.tanggal_lahir, tanggalHariIni())
  const denganUkur = baris.filter((b) => b.pengukuran)
  const terakhir = denganUkur[denganUkur.length - 1]
  const statusTerakhir = terakhir?.pengukuran.status_gizi
  const waliTeks = wali.length
    ? wali.map((w) => `${w.nama_lengkap} (${w.hubungan.replaceAll('_', ' ')})`).join(', ')
    : 'Wali belum tercatat'

  return (
    <main className="mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
      <div className="kartu shadow-kontrol">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-[280px] items-center gap-3">
            <span
              className={`grid size-[50px] shrink-0 place-items-center rounded-kecil border text-judul font-bold shadow-kontrol ${balita.jenis_kelamin === 'laki-laki' ? 'border-biru-100 bg-aksen-biru-tint text-aksen-biru-ink' : 'border-merah-100 bg-aksen-rose-tint text-aksen-rose-ink'}`}
              aria-hidden="true"
            >
              {inisial(balita.nama_lengkap)}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-judul leading-tight font-bold tracking-[-0.015em] text-biru-950">{balita.nama_lengkap}</h1>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs leading-tight font-semibold ${balita.jenis_kelamin === 'laki-laki' ? 'border-aksen-biru-ink bg-aksen-biru-tint text-aksen-biru-ink' : 'border-aksen-rose-ink bg-aksen-rose-tint text-aksen-rose-ink'}`}
                >
                  {balita.jenis_kelamin === 'laki-laki' ? 'Laki-laki' : 'Perempuan'}
                </span>
              </div>
              <p className="m-0 inline-flex items-center gap-1.5 text-padat text-teks-redup [&_svg]:shrink-0 [&_svg]:text-teks-samar">
                <Ikon nama="balita" ukuran={14} />
                <span>{waliTeks}</span>
              </p>
              <p className="m-0 inline-flex items-center gap-1.5 text-padat text-teks-redup [&_svg]:shrink-0 [&_svg]:text-teks-samar">
                <Ikon nama="posyandu" ukuran={14} />
                <span>
                  {posyandu
                    ? [
                        posyandu.nama,
                        posyandu.dusun,
                        posyandu.desa,
                        posyandu.kecamatan,
                        posyandu.kabupaten,
                      ].filter(Boolean).join(' · ')
                    : 'Posyandu belum termuat'}
                </span>
              </p>
            </div>
          </div>

          <button type="button" className="sekunder self-start" onClick={kembali}>
            <Ikon nama="kembali" ukuran={17} />
            <span>Kembali</span>
          </button>
        </div>

        <div className="grid gap-3 border-t border-garis pt-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]" aria-label="Informasi Usia dan Tanggal Lahir">
          <div className="flex items-center gap-3 rounded-kecil border px-4 py-2.5 transition-[transform,box-shadow] hover:shadow-kontrol border-aksen-biru-ink bg-aksen-biru-tint">
            <div className="grid size-[38px] shrink-0 place-items-center rounded-kecil bg-kartu text-aksen-biru-ink">
              <Ikon nama="anak" ukuran={20} />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-mikro font-bold tracking-[0.05em] uppercase text-aksen-biru-ink">Usia Balita</span>
              <span className="flex items-baseline gap-1 text-subjudul leading-tight font-bold tabular-nums text-biru-950">
                <strong>{umur >= 0 ? `${umur}` : '—'}</strong>
                <span className="text-padat font-semibold text-teks-redup">{umur >= 0 ? ' bulan' : ''}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-kecil border px-4 py-2.5 transition-[transform,box-shadow] hover:shadow-kontrol border-aksen-hijau-ink bg-aksen-hijau-tint">
            <div className="grid size-[38px] shrink-0 place-items-center rounded-kecil bg-kartu text-aksen-hijau-ink">
              <Ikon nama="kunjungan" ukuran={20} />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-mikro font-bold tracking-[0.05em] uppercase text-aksen-hijau-ink">Tanggal Lahir</span>
              <span className="flex items-baseline gap-1 text-subjudul leading-tight font-bold tabular-nums text-biru-950">
                <strong>{tanggalLengkap(balita.tanggal_lahir)}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2.5 max-sempit:gap-2">
        <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-biru-tint text-aksen-biru-ink">
              <Ikon nama="kunjungan" ukuran={16} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">{baris.length}</div>
            <div className="text-2xs leading-tight font-medium text-teks-redup">Total kunjungan</div>
          </div>
        </div>

        <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="grid size-8 shrink-0 place-items-center rounded-kecil max-sempit:size-6 bg-aksen-teal-tint text-aksen-teal-ink">
              <Ikon nama="grafik" ukuran={16} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-judul leading-[1.15] font-bold tabular-nums tracking-[-0.02em] text-biru-950">
              {terakhir ? `${terakhir.pengukuran.berat_kg}` : '—'}
              {terakhir && <span className="ml-0.5 text-padat font-semibold text-teks-redup"> kg</span>}
            </div>
            <div className="text-2xs leading-tight font-medium text-teks-redup">Berat terakhir</div>
          </div>
        </div>

        <div className="relative flex min-h-[5.4rem] flex-col justify-between rounded-sedang border border-garis bg-kartu px-4 py-4 shadow-halus transition-[border-color,box-shadow] hover:border-garis-kuat hover:shadow-naik max-sempit:min-h-[4.8rem] max-sempit:px-3 max-sempit:py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span
              className={`lencana-gizi mt-1.5 w-fit ${statusTerakhir ?? 'menunggu'}`}
            >
              {statusTerakhir ? PESAN_STATUS[statusTerakhir] : 'Belum dinilai'}
            </span>
            <Bantuan
              id="bantuan-gizi-riwayat"
              label="Penjelasan status gizi"
              teks="Dihitung server dari berat menurut umur. Muncul setelah kunjungan terkirim dan divalidasi petugas."
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-2xs leading-tight font-medium text-teks-redup">Status gizi terakhir</div>
          </div>
        </div>
      </div>

      {baris.length === 0 ? (
        <Kosong
          ikon="riwayat"
          judul="Belum ada kunjungan"
          teks="Hasil ukur yang dicatat akan muncul di sini beserta grafik berat badan."
          aksi={
            <button type="button" className="sekunder" onClick={kembali}>
              Kembali ke daftar balita
            </button>
          }
        />
      ) : (
        <>
          {denganUkur.length > 1 && (
            <div className="kartu h-[280px] p-4 max-sempit:h-[230px]">
              <div className="kartu-judul">
                <h2>Berat badan</h2>
                <span className="text-padat text-teks-samar">
                  {tanggalPendek(denganUkur[0].tanggal_kunjungan)} –{' '}
                  {tanggalPendek(terakhir.tanggal_kunjungan)}
                </span>
              </div>
              <div className="relative h-[calc(100%_-_2.1rem)]">
                <canvas
                  ref={kanvas}
                  aria-label="Grafik berat badan menurut tanggal kunjungan"
                  role="img"
                />
              </div>
            </div>
          )}

          <div className="kartu">
            <div className="kartu-judul">
              <h2>Riwayat pengukuran</h2>
              <button type="button" className="sekunder" onClick={() => window.print()}>
                <Ikon nama="unduh" ukuran={17} />
                Cetak
              </button>
            </div>
            <div className="tabel-bungkus">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Berat</th>
                    <th>Tinggi</th>
                    <th>Status</th>
                    <th aria-label="Tindakan" />
                  </tr>
                </thead>
                <tbody>
                  {baris.map((b) => (
                    <tr key={b.id}>
                      <td>{tanggalPendek(b.tanggal_kunjungan)}</td>
                      <td>{b.pengukuran ? `${b.pengukuran.berat_kg} kg` : '—'}</td>
                      <td>{b.pengukuran ? `${b.pengukuran.tinggi_cm ?? '—'} cm` : '—'}</td>
                      <td>
                        {!b.pengukuran ? (
                          <span className="lencana-gizi menunggu">Tidak hadir</span>
                        ) : b.pengukuran.status_gizi ? (
                          <span className={`lencana-gizi ${b.pengukuran.status_gizi}`}>
                            {PESAN_STATUS[b.pengukuran.status_gizi]}
                          </span>
                        ) : b.divalidasi_oleh ? (
                          <span className="lencana-gizi valid">Tervalidasi</span>
                        ) : (
                          <span className="lencana-gizi menunggu">Menunggu server</span>
                        )}
                      </td>
                      <td className="sel-aksi">
                        {b.pengukuran && !b.divalidasi_oleh && (
                          <button
                            type="button"
                            className="sekunder"
                            onClick={() => setSunting({ ...b.pengukuran })}
                            aria-label={`Ubah pengukuran ${tanggalPendek(b.tanggal_kunjungan)}`}
                          >
                            Ubah
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {sunting && (
        <form className="kartu" onSubmit={simpanSunting}>
          <div className="kartu-judul">
            <h2>Ubah pengukuran</h2>
            <span className="lencana-gizi menunggu">Belum divalidasi</span>
          </div>
          <div className="grid gap-x-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            <div className="bidang">
              <label htmlFor="u-berat">
                <span>Berat (kg)</span>
                <span className="wajib" aria-hidden="true">*</span>
              </label>
              <div className="wadah-satuan">
                <input
                  id="u-berat"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="cth. 9.45"
                  value={sunting.berat_kg}
                  onChange={(e) => ubahUkur('berat_kg', e.target.value)}
                  required
                />
                <span className="satuan">kg</span>
              </div>
            </div>
            <div className="bidang">
              <label htmlFor="u-tinggi">Tinggi (cm)</label>
              <div className="wadah-satuan">
                <input
                  id="u-tinggi"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="cth. 75.0"
                  value={sunting.tinggi_cm ?? ''}
                  onChange={(e) => ubahUkur('tinggi_cm', e.target.value)}
                />
                <span className="satuan">cm</span>
              </div>
            </div>
            <div className="bidang">
              <label htmlFor="u-kepala">Lingkar kepala (cm)</label>
              <div className="wadah-satuan">
                <input
                  id="u-kepala"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="cth. 45.0"
                  value={sunting.lingkar_kepala_cm ?? ''}
                  onChange={(e) => ubahUkur('lingkar_kepala_cm', e.target.value)}
                />
                <span className="satuan">cm</span>
              </div>
            </div>
          </div>
          <p className="text-padat text-teks-samar">
            Rentang wajar: berat {RENTANG.berat_kg[0]}–{RENTANG.berat_kg[1]} kg, tinggi{' '}
            {RENTANG.tinggi_cm[0]}–{RENTANG.tinggi_cm[1]} cm, lingkar kepala{' '}
            {RENTANG.lingkar_kepala_cm[0]}–{RENTANG.lingkar_kepala_cm[1]} cm.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="submit">
              <Ikon nama="simpan" ukuran={18} />
              Simpan perubahan
            </button>
            <button type="button" className="sekunder" onClick={() => setSunting(null)}>
              Batal
            </button>
          </div>
        </form>
      )}

      <p className="text-padat text-teks-samar">
        Status gizi dihitung server. Setelah divalidasi petugas, pengukuran tidak bisa diubah.
      </p>
    </main>
  )
}
