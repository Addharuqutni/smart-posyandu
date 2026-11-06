import { useEffect, useState } from 'react'
import { daftarAktivitas } from '../jaringan/api.js'
import Ikon from './Ikon.jsx'
import { KendaliHalaman, Kosong, Layar } from './Bersama.jsx'

const AKSI = {
  buat: 'Buat',
  ubah: 'Ubah',
  hapus: 'Hapus',
  masuk: 'Masuk',
  keluar: 'Keluar',
  gagal_masuk: 'Gagal masuk',
}

const NAMA_TABEL = {
  balita: 'Balita',
  kunjungan: 'Kunjungan',
  pengukuran: 'Pengukuran',
  tindak_lanjut: 'Tindak lanjut',
  pengguna: 'Akun',
  posyandu: 'Posyandu',
  konten_publik: 'Konten publik',
  sesi: 'Sesi',
  ekspor: 'Ekspor',
  cadangan: 'Cadangan',
  pemulihan: 'Pemulihan',
  uji_cadangan: 'Uji cadangan',
}

const NAMA_PERAN = {
  kader: 'Kader',
  nakes: 'Petugas kesehatan',
  admin_desa: 'Admin desa',
}

const KOLOM_DIABAIKAN = new Set([
  'id', 'dibuat_pada', 'diperbarui_pada', 'dihapus_pada', 'id_perangkat', 'terjadi_pada',
  'versi', 'hash_kata_sandi', 'token_hash',
])

const PEMBENTUK_WAKTU = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function waktuLog(iso) {
  if (!iso) return '-'
  const waktu = new Date(iso)
  return Number.isNaN(waktu.getTime()) ? iso : PEMBENTUK_WAKTU.format(waktu)
}

/** Nilai JSONB jadi teks pendek; nilai panjang dipotong, bukan dibungkus. */
function nilaiPendek(nilai) {
  if (nilai === null || nilai === undefined) return 'kosong'
  if (typeof nilai === 'object') return JSON.stringify(nilai).slice(0, 60)
  const teks = String(nilai)
  return teks.length > 60 ? `${teks.slice(0, 57)}…` : teks
}

/** Bidang yang benar-benar berubah, maksimal enam baris. */
function perubahan(lama, baru) {
  if (!baru || typeof baru !== 'object') return []
  const hasil = []
  for (const [kunci, nilai] of Object.entries(baru)) {
    if (KOLOM_DIABAIKAN.has(kunci)) continue
    if (lama && JSON.stringify(lama[kunci]) === JSON.stringify(nilai)) continue
    hasil.push([kunci, nilai])
    if (hasil.length === 6) break
  }
  return hasil
}

function Rincian({ baris }) {
  // Peristiwa sesi sudah terbaca dari kolomnya sendiri; membuka JSONB hanya
  // menambah baris "peran: admin_desa" yang tidak menjelaskan apa pun.
  if (baris.nama_tabel === 'sesi') {
    const nama = baris.nilai_baru?.nama_pengguna
    return nama ? (
      <div className="mt-1 text-2xs text-teks-samar">
        Nama dicoba: <span className="font-mono text-teks">{nama}</span>
      </div>
    ) : null
  }
  const ubah = perubahan(baris.nilai_lama, baris.nilai_baru)
  if (!ubah.length) return null
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-2xs font-semibold text-teks-samar select-none">
        Rincian
      </summary>
      <dl className="mt-1.5 grid gap-1 border-l-2 border-garis-kuat pl-2.5">
        {ubah.map(([kunci, nilai]) => (
          <div key={kunci} className="flex flex-wrap gap-x-2 text-2xs leading-snug">
            <dt className="font-mono text-teks-samar">{kunci}</dt>
            <dd className="m-0 break-all text-teks">
              {baris.nilai_lama?.[kunci] != null && (
                <span className="text-teks-samar line-through">{nilaiPendek(baris.nilai_lama[kunci])} </span>
              )}
              {nilaiPendek(nilai)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/** Log aktivitas (admin desa): satu tabel untuk seluruh jejak pemakaian. */
export default function LogAktivitas({ sesi }) {
  const [isi, setIsi] = useState(null)
  const [total, setTotal] = useState(0)
  const [aktor, setAktor] = useState([])
  const [daftarTabel, setDaftarTabel] = useState([])
  const [halaman, setHalaman] = useState(0)
  const [saring, setSaring] = useState({ aksi: '', tabel: '', pengguna_id: '', dari: '', sampai: '' })
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState(null)

  useEffect(() => {
    let hidup = true
    async function muat() {
      setMemuat(true)
      setGalat(null)
      try {
        const balasan = await daftarAktivitas({ batas: 50, offset: halaman * 50, ...saring })
        if (!hidup) return
        setIsi(balasan.aktivitas ?? [])
        setTotal(balasan.total ?? 0)
        setAktor(balasan.aktor ?? [])
        setDaftarTabel(balasan.tabel ?? [])
      } catch {
        if (!hidup) return
        setIsi(null)
        setGalat('Log aktivitas tersimpan di server. Sambungkan perangkat ke jaringan lalu coba lagi.')
      } finally {
        if (hidup) setMemuat(false)
      }
    }
    muat()
    return () => {
      hidup = false
    }
  }, [halaman, saring])

  function ubahSaring(kunci, nilai) {
    setHalaman(0)
    setSaring((lama) => ({ ...lama, [kunci]: nilai }))
  }

  const adaSaringan = Object.values(saring).some(Boolean)

  return (
    <Layar>
      <div className="kepala-layar mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Log aktivitas</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">
            Pencatatan, perubahan akun, ekspor, dan sesi masuk.
          </p>
        </div>
        <span className="text-padat text-teks-samar tabular-nums">
          {memuat && !isi ? 'Memuat…' : `${total.toLocaleString('id-ID')} baris`}
        </span>
      </div>

      <div className="kartu">

        <div className="mb-3 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <div className="bidang">
            <label htmlFor="log-dari">
              <span>Dari tanggal</span>
            </label>
            <input
              id="log-dari"
                name="dari_tanggal"

              type="date"
              value={saring.dari}
              max={saring.sampai || undefined}
              onChange={(e) => ubahSaring('dari', e.target.value)}
            />
          </div>
          <div className="bidang">
            <label htmlFor="log-sampai">
              <span>Sampai tanggal</span>
            </label>
            <input
              id="log-sampai"
                name="sampai_tanggal"

              type="date"
              value={saring.sampai}
              min={saring.dari || undefined}
              onChange={(e) => ubahSaring('sampai', e.target.value)}
            />
          </div>
          <div className="bidang">
            <label htmlFor="log-aksi">
              <span>Jenis aktivitas</span>
            </label>
            <select id="log-aksi" value={saring.aksi} onChange={(e) => ubahSaring('aksi', e.target.value)}>
              <option value="">Semua jenis</option>
              {Object.entries(AKSI).map(([nilai, label]) => (
                <option key={nilai} value={nilai}>{label}</option>
              ))}
            </select>
          </div>
          <div className="bidang">
            <label htmlFor="log-aktor">
              <span>Aktor</span>
            </label>
            <select id="log-aktor" value={saring.pengguna_id} onChange={(e) => ubahSaring('pengguna_id', e.target.value)}>
              <option value="">Semua aktor</option>
              {aktor.map((p) => (
                <option key={p.id} value={p.id}>{p.nama_lengkap}</option>
              ))}
            </select>
          </div>
          <div className="bidang">
            <label htmlFor="log-tabel">
              <span>Objek</span>
            </label>
            <select id="log-tabel" value={saring.tabel} onChange={(e) => ubahSaring('tabel', e.target.value)}>
              <option value="">Semua objek</option>
              {daftarTabel.map((t) => (
                <option key={t} value={t}>{NAMA_TABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
        </div>

        {adaSaringan && (
          <button
            type="button"
            className="tautan mb-3 inline-flex items-center gap-1.5 text-padat"
            onClick={() => {
              setHalaman(0)
              setSaring({ aksi: '', tabel: '', pengguna_id: '', dari: '', sampai: '' })
            }}
          >
            <Ikon nama="tutup" ukuran={14} />
            Hapus saringan
          </button>
        )}

        {galat && (
          <div className="mb-3 flex items-start gap-2 rounded-kecil border border-kuning-800 bg-kuning-100 px-3 py-2.5 text-isi font-semibold text-kuning-800" role="alert">
            <Ikon nama="peringatan" ukuran={18} />
            <span>{galat}</span>
          </div>
        )}

        {isi && isi.length === 0 && !galat ? (
          <Kosong
            ikon="waktu"
            judul="Belum ada aktivitas"
            teks={adaSaringan ? 'Tidak ada aktivitas yang cocok dengan saringan ini.' : 'Aktivitas kader, petugas, dan admin akan muncul di sini.'}
          />
        ) : (
          <div className="tabel-bungkus">
            <table className="tabel tabel-kartu">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Aktor</th>
                  <th>Aktivitas</th>
                  <th>Objek</th>
                  <th>Perangkat</th>
                </tr>
              </thead>
              <tbody>
                {!isi && memuat && (
                  <tr>
                    <td colSpan={5}>
                      <div className="kerangka kerangka-baris" style={{ width: '90%', margin: '0.4rem 0' }} />
                    </td>
                  </tr>
                )}
                {(isi ?? []).map((baris) => (
                  <tr key={baris.id}>
                    <td data-label="Waktu">
                      <span className="text-padat tabular-nums text-teks">{waktuLog(baris.diterima_pada)}</span>
                    </td>
                    <td data-label="Aktor">
                      <span className="text-padat font-semibold text-teks">
                        {baris.aktor_nama ?? (baris.aksi === 'gagal_masuk' ? 'Tidak dikenal' : 'Sistem')}
                      </span>
                      {baris.aktor_peran && (
                        <div className="text-2xs text-teks-samar">{NAMA_PERAN[baris.aktor_peran] ?? baris.aktor_peran}</div>
                      )}
                    </td>
                    <td data-label="Aktivitas">
                      <span className={`lencana ${baris.aksi}`}>{AKSI[baris.aksi] ?? baris.aksi}</span>
                    </td>
                    <td data-label="Objek">
                      <span className="text-padat font-semibold text-teks">
                        {NAMA_TABEL[baris.nama_tabel] ?? baris.nama_tabel}
                      </span>
                      {baris.ringkasan && (
                        <span className="text-padat text-teks-redup"> · {baris.ringkasan}</span>
                      )}
                      <Rincian baris={baris} />
                    </td>
                    <td data-label="Perangkat">
                      <span className="max-w-[16ch] truncate font-mono text-2xs text-teks-samar" title={baris.id_perangkat ?? ''}>
                        {baris.id_perangkat ?? '-'}
                      </span>
                      {baris.alamat_ip && (
                        <div className="font-mono text-2xs text-teks-samar">{baris.alamat_ip}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <KendaliHalaman halaman={halaman} total={total} onPilih={setHalaman} nonaktif={memuat} />
      </div>
    </Layar>
  )
}
