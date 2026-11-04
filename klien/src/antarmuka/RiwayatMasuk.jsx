import { useEffect, useState } from 'react'
import { riwayatSesi } from '../jaringan/api.js'
import { waktuPendek } from '../logika/waktu.js'
import Ikon from './Ikon.jsx'
import { KendaliHalaman } from './Bersama.jsx'

const LABEL_PERAN = {
  kader: 'Kader',
  nakes: 'Petugas kesehatan',
  admin_desa: 'Admin desa',
}

/** Satu halaman riwayat. 20 baris sudah cukup mengisi layar tanpa membuat
 *  halamannya jadi panjang ke bawah, dan tetap muat di tablet. */
const UKURAN_HALAMAN = 20

/**
 * Riwayat masuk perangkat dengan penomoran halaman.
 *
 * Dipakai layar Perangkat (kader/nakes) dan kartu Akun (admin), jadi pemuatan
 * data, penomoran, dan tabelnya hanya ada di satu tempat. Admin desa melihat
 * semua akun, pemakai lain hanya miliknya; itu dibatasi server.
 *
 * @param {object} props
 * @param {object} props.sesi
 * @param {number} [props.versi] Ubah angka ini untuk memaksa muat ulang
 *   (dipakai setelah admin mencabut sesi).
 */
export function PanelRiwayatMasuk({ sesi, versi = 0 }) {
  const [riwayat, setRiwayat] = useState(null)
  const [total, setTotal] = useState(0)
  const [halaman, setHalaman] = useState(0)
  const [memuat, setMemuat] = useState(false)
  const [galat, setGalat] = useState(null)

  useEffect(() => {
    let hidup = true
    async function muat() {
      setMemuat(true)
      setGalat(null)
      try {
        const jawab = await riwayatSesi({
          batas: UKURAN_HALAMAN,
          offset: halaman * UKURAN_HALAMAN,
        })
        if (!hidup) return
        setRiwayat(jawab.riwayat)
        setTotal(jawab.total ?? jawab.riwayat.length)
      } catch {
        if (!hidup) return
        setGalat('Riwayat masuk butuh koneksi ke server.')
        setRiwayat([])
      } finally {
        if (hidup) setMemuat(false)
      }
    }
    muat()
    return () => {
      hidup = false
    }
  }, [halaman, versi])

  const jumlahHalaman = Math.max(1, Math.ceil(total / UKURAN_HALAMAN))

  return (
    <>
      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}

      {riwayat === null ? (
        <div className="tabel-bungkus">
          <table className="tabel">
            <tbody>
              <tr>
                <td colSpan={5} className="text-isi text-teks-redup">
                  Memuat riwayat masuk…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : riwayat.length === 0 ? (
        <p className="text-isi text-teks-redup">Belum ada riwayat masuk.</p>
      ) : (
        <div className="tabel-bungkus">
          <table className="tabel tabel-kartu">
            <thead>
              <tr>
                <th>Akun</th>
                <th>Perangkat</th>
                <th>Masuk</th>
                <th>Selesai/Kedaluwarsa</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((s) => (
                <tr key={s.id}>
                  <td data-label="Akun">
                    <strong>{s.nama_lengkap}</strong>
                    <div className="text-padat text-teks-samar">
                      {s.nama_pengguna} · {LABEL_PERAN[s.peran] ?? s.peran}
                    </div>
                  </td>
                  <td className="text-padat text-teks-samar" data-label="Perangkat">{s.id_perangkat}</td>
                  <td className="text-padat text-teks-samar" data-label="Masuk">{waktuPendek(s.dibuat_pada)}</td>
                  <td className="text-padat text-teks-samar" data-label="Selesai">
                    {waktuPendek(s.dicabut_pada ?? s.kadaluarsa_pada)}
                  </td>
                  <td data-label="Status">
                    <span className={`lencana ${s.status === 'Aktif' ? 'aktif' : 'nonaktif'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > UKURAN_HALAMAN && (
        <KendaliHalaman
          halaman={halaman}
          total={total}
          ukuran={UKURAN_HALAMAN}
          nonaktif={memuat}
          onPilih={setHalaman}
          keterangan={`Halaman ${halaman + 1} dari ${jumlahHalaman} · ${riwayat?.length ?? 0} dari ${total} sesi`}
        />
      )}
    </>
  )
}

/** Layar Perangkat: riwayat masuk milik pemakainya (admin melihat semua akun). */
export default function RiwayatMasuk({ sesi }) {
  const [versi, setVersi] = useState(0)
  const semuaAkun = sesi.pengguna.peran === 'admin_desa'

  return (
    <main className="mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Perangkat</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">
            Riwayat masuk {semuaAkun ? 'semua akun' : 'akun ini'} beserta perangkat yang dipakai.
          </p>
        </div>
        <button
          type="button"
          className="sekunder"
          onClick={() => setVersi((n) => n + 1)}
          aria-label="Muat ulang riwayat masuk"
        >
          <Ikon nama="sinkron" ukuran={18} />
          Muat ulang
        </button>
      </div>

      <div className="kartu">
        <div className="kartu-judul">
          <h2>Riwayat masuk perangkat</h2>
        </div>
        <p className="-mt-1.5 text-isi text-teks-redup">
          Bila ada perangkat yang tidak dikenal, keluar dari akun lalu hubungi admin desa untuk mencabutnya.
        </p>
        <PanelRiwayatMasuk sesi={sesi} versi={versi} />
      </div>
    </main>
  )
}
