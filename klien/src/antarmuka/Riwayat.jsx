import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { db } from '../penyimpanan/db.js'
import { ubahPengukuran } from '../penyimpanan/kunjungan.js'
import { PESAN_STATUS } from '../logika/rentang.js'
import { waliBalita } from '../penyimpanan/balita.js'
import { usiaBulan, tanggalHariIni } from '../logika/waktu.js'
import { inisial } from '../logika/nama.js'
import Ikon from './Ikon.jsx'
import Bantuan from './Bantuan.jsx'

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
  const [sunting, setSunting] = useState(null)
  const [galat, setGalat] = useState(null)
  const kanvas = useRef(null)
  const grafik = useRef(null)

  async function muat() {
    const kunjungan = await db.kunjungan
      .where('balita_id')
      .equals(balita.id)
      .filter((k) => !k.dihapus_pada)
      .toArray()
    kunjungan.sort((a, b) => a.tanggal_kunjungan.localeCompare(b.tanggal_kunjungan))
    const lengkap = []
    for (const k of kunjungan) {
      const ukur = await db.pengukuran.where('kunjungan_id').equals(k.id).first()
      // Kunjungan tanpa ukur (tidak hadir) tetap tampil di riwayat.
      lengkap.push({ ...k, pengukuran: ukur && !ukur.dihapus_pada ? ukur : null })
    }
    setBaris(lengkap)
    setWali(await waliBalita(balita.id))
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
            borderColor: '#14557f',
            backgroundColor: 'rgba(20,85,127,0.12)',
            borderWidth: 2.5,
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#14557f',
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
            ticks: { color: '#64748b', maxRotation: 0, autoSkipPadding: 12 },
          },
          y: {
            beginAtZero: false,
            title: { display: true, text: 'kg', color: '#64748b' },
            grid: { color: '#e8edf2' },
            ticks: { color: '#64748b' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0b2a4a',
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

  const umur = usiaBulan(balita.tanggal_lahir, tanggalHariIni())
  const denganUkur = baris.filter((b) => b.pengukuran)
  const terakhir = denganUkur[denganUkur.length - 1]
  const statusTerakhir = terakhir?.pengukuran.status_gizi
  const waliTeks = wali.length
    ? wali.map((w) => `${w.nama_lengkap} (${w.hubungan.replaceAll('_', ' ')})`).join(', ')
    : 'Wali belum tercatat'

  return (
    <main className="layar" id="isi-utama">
      <div className="kartu detail-balita-kartu">
        <div className="detail-balita-header">
          <div className="detail-balita-identitas">
            <span
              className={`avatar avatar-balita-detail ${balita.jenis_kelamin === 'laki-laki' ? 'laki' : 'perempuan'}`}
              aria-hidden="true"
            >
              {inisial(balita.nama_lengkap)}
            </span>
            <div className="detail-balita-nama-wadah">
              <div className="detail-balita-nama-baris">
                <h1>{balita.nama_lengkap}</h1>
                <span
                  className={`lencana-kelamin ${balita.jenis_kelamin === 'laki-laki' ? 'laki' : 'perempuan'}`}
                >
                  {balita.jenis_kelamin === 'laki-laki' ? 'Laki-laki' : 'Perempuan'}
                </span>
              </div>
              <p className="detail-balita-wali">
                <Ikon nama="balita" ukuran={14} />
                <span>{waliTeks}</span>
              </p>
            </div>
          </div>

          <button type="button" className="sekunder tombol-kembali-detail" onClick={kembali}>
            <Ikon nama="kembali" ukuran={17} />
            <span>Kembali</span>
          </button>
        </div>

        <div className="sorotan-balita-wadah" aria-label="Informasi Usia dan Tanggal Lahir">
          <div className="sorotan-item sorotan-item--usia">
            <div className="sorotan-ikon">
              <Ikon nama="anak" ukuran={20} />
            </div>
            <div className="sorotan-konten">
              <span className="sorotan-label">Usia Balita</span>
              <span className="sorotan-nilai">
                <strong>{umur >= 0 ? `${umur}` : '—'}</strong>
                <span className="sorotan-satuan">{umur >= 0 ? ' bulan' : ''}</span>
              </span>
            </div>
          </div>

          <div className="sorotan-item sorotan-item--lahir">
            <div className="sorotan-ikon">
              <Ikon nama="kunjungan" ukuran={20} />
            </div>
            <div className="sorotan-konten">
              <span className="sorotan-label">Tanggal Lahir</span>
              <span className="sorotan-nilai">
                <strong>{tanggalLengkap(balita.tanggal_lahir)}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
      {galat && (
        <div className="pesan galat" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}

      <div className="ringkasan">
        <div className="stat stat--kunjungan">
          <div className="stat-atas">
            <span className="stat-ikon">
              <Ikon nama="kunjungan" ukuran={16} />
            </span>
          </div>
          <div className="stat-bawah">
            <div className="stat-nilai">{baris.length}</div>
            <div className="stat-label">Total kunjungan</div>
          </div>
        </div>

        <div className="stat stat--berat">
          <div className="stat-atas">
            <span className="stat-ikon">
              <Ikon nama="grafik" ukuran={16} />
            </span>
          </div>
          <div className="stat-bawah">
            <div className="stat-nilai">
              {terakhir ? `${terakhir.pengukuran.berat_kg}` : '—'}
              {terakhir && <span className="satuan-stat"> kg</span>}
            </div>
            <div className="stat-label">Berat terakhir</div>
          </div>
        </div>

        <div className="stat stat--gizi">
          <div className="stat-atas">
            <span
              className={`lencana-gizi lencana-mandiri ${statusTerakhir ?? 'menunggu'}`}
            >
              {statusTerakhir ? PESAN_STATUS[statusTerakhir] : 'Belum dinilai'}
            </span>
            <Bantuan
              id="bantuan-gizi-riwayat"
              label="Penjelasan status gizi"
              teks="Dihitung server dari berat menurut umur. Muncul setelah kunjungan terkirim dan divalidasi petugas."
            />
          </div>
          <div className="stat-bawah">
            <div className="stat-label">Status gizi terakhir</div>
          </div>
        </div>
      </div>

      {baris.length === 0 ? (
        <div className="kosong">
          <div className="kosong-ikon">
            <Ikon nama="riwayat" ukuran={24} />
          </div>
          <h3>Belum ada kunjungan</h3>
          <p>Hasil ukur yang dicatat akan muncul di sini beserta grafik berat badan.</p>
          <button type="button" className="sekunder" onClick={kembali}>
            Kembali ke daftar balita
          </button>
        </div>
      ) : (
        <>
          {denganUkur.length > 1 && (
            <div className="kartu grafik-kartu">
              <div className="kartu-judul">
                <h3>Berat badan</h3>
                <span className="samar">
                  {tanggalPendek(denganUkur[0].tanggal_kunjungan)} –{' '}
                  {tanggalPendek(terakhir.tanggal_kunjungan)}
                </span>
              </div>
              <div className="wadah-kanvas">
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
              <h3>Riwayat pengukuran</h3>
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
            <h3>Ubah pengukuran</h3>
            <span className="lencana-gizi menunggu">Belum divalidasi</span>
          </div>
          <div className="grid3">
            <div className="bidang ukuran">
              <label htmlFor="u-berat">
                <span>Berat (kg)</span>
                <span className="wajib" aria-hidden="true">*</span>
              </label>
              <div className="wadah-satuan">
                <input
                  id="u-berat"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="1"
                  max="40"
                  placeholder="cth. 9.45"
                  value={sunting.berat_kg}
                  onChange={(e) => setSunting({ ...sunting, berat_kg: e.target.value })}
                  required
                />
                <span className="satuan-teks">kg</span>
              </div>
            </div>
            <div className="bidang ukuran">
              <label htmlFor="u-tinggi">Tinggi (cm)</label>
              <div className="wadah-satuan">
                <input
                  id="u-tinggi"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="30"
                  max="130"
                  placeholder="cth. 75.0"
                  value={sunting.tinggi_cm ?? ''}
                  onChange={(e) => setSunting({ ...sunting, tinggi_cm: e.target.value })}
                />
                <span className="satuan-teks">cm</span>
              </div>
            </div>
            <div className="bidang ukuran">
              <label htmlFor="u-kepala">Lingkar kepala (cm)</label>
              <div className="wadah-satuan">
                <input
                  id="u-kepala"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="25"
                  max="60"
                  placeholder="cth. 45.0"
                  value={sunting.lingkar_kepala_cm ?? ''}
                  onChange={(e) => setSunting({ ...sunting, lingkar_kepala_cm: e.target.value })}
                />
                <span className="satuan-teks">cm</span>
              </div>
            </div>
          </div>
          <div className="baris-rapat spasi-atas">
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

      <p className="samar">
        Status gizi dihitung server. Setelah divalidasi petugas, pengukuran tidak bisa diubah.
      </p>
    </main>
  )
}
