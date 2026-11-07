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
import { BarisPetak, Kosong, Petak, Layar } from './Bersama.jsx'
import { detailPosyandu } from '../jaringan/api.js'

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

function tanggalPendek(iso) {
  if (!iso) return '-'
  const [tahun, bulan, hari] = iso.split('-')
  return `${Number(hari)}/${Number(bulan)}/${tahun}`
}

function tanggalLengkap(iso) {
  if (!iso) return '-'
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
    let kunjungan
    try {
      kunjungan = await db.kunjungan
        .where('balita_id')
        .equals(balita.id)
        .filter((k) => !k.dihapus_pada)
        .toArray()
    } catch {
      // Gagal baca lokal bukan "belum ada kunjungan": menampilkan keadaan
      // kosong di sini membuat kader mengira balita belum pernah diukur.
      setGalat('Riwayat tidak bisa dibaca dari perangkat ini. Muat ulang aplikasi.')
      return
    }
    kunjungan.sort((a, b) => a.tanggal_kunjungan.localeCompare(b.tanggal_kunjungan))
    const lengkap = []
    for (const k of kunjungan) {
      const ukur = await db.pengukuran.where('kunjungan_id').equals(k.id).first()
      // Kunjungan tanpa ukur (tidak hadir) tetap tampil di riwayat.
      lengkap.push({ ...k, pengukuran: ukur && !ukur.dihapus_pada ? ukur : null })
    }
    setBaris(lengkap)
    // Riwayat tetap bisa dibaca luring; detail Posyandu menyusul saat daring.
    setGalat(null)
    setWali(await waliBalita(balita.id))
    try {
      setPosyandu(balita.posyandu_id ? await detailPosyandu(balita.posyandu_id) : null)
    } catch {
      setGalat('Detail Posyandu belum bisa dimuat.')
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
    <Layar>
      <div className="kartu">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-[280px] items-center gap-3">
            <span
              className={`grid size-[50px] shrink-0 place-items-center rounded-kecil border text-judul font-bold ${balita.jenis_kelamin === 'laki-laki' ? 'border-biru-100 bg-aksen-biru-tint text-aksen-biru-ink' : 'border-merah-100 bg-aksen-rose-tint text-aksen-rose-ink'}`}
              aria-hidden="true"
            >
              {inisial(balita.nama_lengkap)}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-judul leading-tight font-bold tracking-[-0.015em] text-biru-950">{balita.nama_lengkap}</h1>
                <span
                  className={`inline-flex items-center rounded-mikro border px-2 py-0.5 text-2xs leading-tight font-semibold ${balita.jenis_kelamin === 'laki-laki' ? 'border-aksen-biru-ink bg-aksen-biru-tint text-aksen-biru-ink' : 'border-aksen-rose-ink bg-aksen-rose-tint text-aksen-rose-ink'}`}
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

        <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-garis pt-3">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-padat text-teks-samar">Usia</dt>
            <dd className="m-0 text-padat font-semibold tabular-nums text-biru-950">
              {umur >= 0 ? `${umur} bulan` : '-'}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-padat text-teks-samar">Tanggal lahir</dt>
            <dd className="m-0 text-padat font-semibold tabular-nums text-biru-950">
              {tanggalLengkap(balita.tanggal_lahir)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-padat text-teks-samar">Kunjungan</dt>
            <dd className="m-0 text-padat font-semibold tabular-nums text-biru-950">
              {baris.length} tercatat
            </dd>
          </div>
        </dl>
      </div>
      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}

      <BarisPetak jumlah={3} label="Ringkasan balita">
        <Petak ikon="kunjungan" warna="biru" nilai={baris.length} label="Total kunjungan" />
        <Petak
          ikon="grafik"
          warna="teal"
          nilai={terakhir ? terakhir.pengukuran.berat_kg : '-'}
          satuan={terakhir ? 'kg' : undefined}
          label="Berat terakhir"
        />
        <Petak
          ikon="info"
          warna="hijau"
          nilai={
            <span className={`lencana-gizi w-fit ${statusTerakhir ?? 'menunggu'}`}>
              {statusTerakhir ? PESAN_STATUS[statusTerakhir] : 'Belum dinilai'}
            </span>
          }
          label="Status gizi terakhir"
          bantuan={{
            id: 'bantuan-gizi-riwayat',
            label: 'Penjelasan status gizi',
            teks: 'Dihitung server dari berat menurut umur. Muncul setelah kunjungan terkirim dan divalidasi petugas.',
          }}
        />
      </BarisPetak>

      {baris.length === 0 && !galat ? (
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
                      <td>{b.pengukuran ? `${b.pengukuran.berat_kg} kg` : '-'}</td>
                      <td>{b.pengukuran ? `${b.pengukuran.tinggi_cm ?? '-'} cm` : '-'}</td>
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
                          <span className="lencana-gizi menunggu">Menunggu Persetujuan Nakes</span>
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
                name="berat_kg"

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
                name="tinggi_cm"

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
                name="lingkar_kepala_cm"

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
    </Layar>
  )
}
