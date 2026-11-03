import { useEffect, useState } from 'react'
import {
  buatPengguna,
  cabutSesi,
  daftarPengguna,
  daftarSesi,
  ubahPengguna,
} from '../jaringan/api.js'
import { inisial } from '../logika/nama.js'
import { idBaru, waktuPendek } from '../logika/waktu.js'
import Ikon from './Ikon.jsx'
import { PanelRiwayatMasuk } from './RiwayatMasuk.jsx'

const KOSONG = {
  nama_pengguna: '',
  kata_sandi: '',
  nama_lengkap: '',
  peran: 'kader',
}

const NAMA_PERAN = {
  kader: 'Kader',
  nakes: 'Petugas kesehatan',
  admin_desa: 'Admin desa',
}

/** Kelola akun (F-17): buat, nonaktifkan, setel ulang kata sandi. */
export default function Pengguna({ sesi }) {
  // null = belum pernah dimuat. Bedakan dari [] yang berarti benar-benar kosong,
  // supaya tabel tidak sempat tampil "Belum ada akun" lalu berkedip saat data tiba.
  const [daftar, setDaftar] = useState(null)
  const [isi, setIsi] = useState(KOSONG)
  const [galat, setGalat] = useState(null)
  const [pesan, setPesan] = useState(null)
  const [tampilSandi, setTampilSandi] = useState(false)
  const [sandiUntuk, setSandiUntuk] = useState(null)
  const [sandiBaru, setSandiBaru] = useState('')
  const [nonaktifUntuk, setNonaktifUntuk] = useState(null)
  const [sesiAktif, setSesiAktif] = useState(null)
  const [versiRiwayat, setVersiRiwayat] = useState(0)
  const [cabutUntuk, setCabutUntuk] = useState(null)

  async function muat() {
    setGalat(null)
    try {
      setDaftar((await daftarPengguna()).pengguna)
    } catch {
      setGalat('Daftar akun butuh koneksi ke server.')
    }
    try {
      setSesiAktif((await daftarSesi()).sesi)
    } catch {
      setSesiAktif([])
    }
  }

  useEffect(() => {
    muat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function tambah(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setPesan(null)
    try {
      await buatPengguna({
        ...isi,
        id: idBaru(),
        posyandu_id: isi.peran === 'admin_desa' ? null : sesi.pengguna.posyandu_id,
      })
      setIsi(KOSONG)
      setTampilSandi(false)
      setPesan('Akun dibuat.')
      await muat()
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal membuat akun.')
    }
  }

  async function ubah(id, muatan, keterangan) {
    setGalat(null)
    setPesan(null)
    try {
      await ubahPengguna(id, muatan)
      setPesan(keterangan)
      await muat()
      return true
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal mengubah akun.')
      return false
    }
  }

  async function cabut(id, label) {
    setGalat(null)
    setPesan(null)
    try {
      await cabutSesi(id)
      setCabutUntuk(null)
      setPesan(`Sesi ${label} dicabut. Perangkat itu harus masuk ulang.`)
      setVersiRiwayat((n) => n + 1)
      await muat()
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal mencabut sesi.')
    }
  }

  async function simpanSandi(peristiwa) {
    peristiwa.preventDefault()
    if (!sandiUntuk || sandiBaru.length < 8) return
    const berhasil = await ubah(
      sandiUntuk.id,
      { kata_sandi_baru: sandiBaru },
      `Kata sandi ${sandiUntuk.nama_pengguna} disetel ulang.`,
    )
    if (berhasil) {
      setSandiUntuk(null)
      setSandiBaru('')
    }
  }

  return (
    <main className="layar" id="isi-utama">
      <div className="kepala-layar">
        <div>
          <h1>Kelola akun</h1>
          <p>Akun kader, petugas kesehatan, dan admin desa.</p>
        </div>
        <button type="button" className="sekunder" onClick={muat}>
          <Ikon nama="sinkron" ukuran={18} />
          Muat ulang
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

      <form className="kartu kartu-akun" onSubmit={tambah}>
        <div className="kepala-akun">
          <span className="kepala-akun-ikon">
            <Ikon nama="akun" ukuran={20} />
          </span>
          <div>
            <h3>Akun baru</h3>
            <p>Buat akun untuk kader, petugas kesehatan, atau admin desa.</p>
          </div>
        </div>

        <div className="grid2 grid-akun">
          <div className="bidang">
            <label htmlFor="p-nama">
              <span>Username</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="p-nama"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="cth. kader_melati (username)"
              value={isi.nama_pengguna}
              onChange={(e) => setIsi({ ...isi, nama_pengguna: e.target.value })}
              required
            />
          </div>
          <div className="bidang">
            <label htmlFor="p-lengkap">
              <span>Nama lengkap</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="p-lengkap"
              autoComplete="off"
              placeholder="cth. Siti Aminah"
              value={isi.nama_lengkap}
              onChange={(e) => setIsi({ ...isi, nama_lengkap: e.target.value })}
              required
            />
          </div>
          <div className="bidang">
            <label htmlFor="p-sandi">
              <span>Kata sandi awal</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <div className="bidang-sandi">
              <input
                id="p-sandi"
                type={tampilSandi ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Minimal 8 karakter"
                aria-describedby="p-sandi-bantuan"
                value={isi.kata_sandi}
                onChange={(e) => setIsi({ ...isi, kata_sandi: e.target.value })}
                minLength={8}
                required
              />
              <button
                type="button"
                className="tombol-sandi"
                onClick={() => setTampilSandi((lama) => !lama)}
                aria-label={tampilSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                aria-pressed={tampilSandi}
              >
                <Ikon nama={tampilSandi ? 'mata-tutup' : 'mata'} ukuran={20} />
              </button>
            </div>
            <p className="petunjuk" id="p-sandi-bantuan">
              Minimal 8 karakter. Sampaikan kepada pemilik akun lewat jalur pribadi.
            </p>
          </div>
          <div className="bidang">
            <label htmlFor="p-peran">
              <span>Peran</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <select
              id="p-peran"
              aria-describedby="p-peran-bantuan"
              value={isi.peran}
              onChange={(e) => setIsi({ ...isi, peran: e.target.value })}
            >
              <option value="kader">Kader</option>
              <option value="nakes">Petugas kesehatan</option>
              <option value="admin_desa">Admin desa</option>
            </select>
            <p className="petunjuk" id="p-peran-bantuan">
              {isi.peran === 'kader'
                ? 'Mencatat kunjungan di tablet; hanya melihat Posyandu sendiri.'
                : isi.peran === 'nakes'
                  ? 'Memvalidasi pengukuran dan mencatat tindak lanjut.'
                  : 'Mengelola akun, rekap, dan pencadangan.'}
            </p>
          </div>
        </div>

        <div className="aksi-akun">
          <button type="submit">
            <Ikon nama="tambah" ukuran={18} />
            Buat akun
          </button>
        </div>
      </form>

      {sandiUntuk && (
        <form className="kartu" onSubmit={simpanSandi}>
          <div className="kartu-judul">
            <h3>Setel ulang kata sandi</h3>
            <button
              type="button"
              className="tombol-ikon sekunder"
              onClick={() => {
                setSandiUntuk(null)
                setSandiBaru('')
              }}
              aria-label="Tutup formulir setel sandi"
            >
              <Ikon nama="tutup" ukuran={18} />
            </button>
          </div>
          <p className="redup petunjuk-atas">
            Untuk <strong>{sandiUntuk.nama_lengkap}</strong> ({sandiUntuk.nama_pengguna}).
          </p>
          <div className="bidang">
            <label htmlFor="sandi-baru">
              <span>Kata sandi baru</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="sandi-baru"
              type="text"
              autoComplete="new-password"
              minLength={8}
              placeholder="Minimal 8 karakter baru"
              value={sandiBaru}
              onChange={(e) => setSandiBaru(e.target.value)}
              required
            />
            <p className="petunjuk">Minimal 8 karakter. Terlihat agar mudah disalin ke pemilik akun.</p>
          </div>
          <div className="baris-rapat">
            <button type="submit" disabled={sandiBaru.length < 8}>
              <Ikon nama="simpan" ukuran={18} />
              Simpan kata sandi
            </button>
            <button
              type="button"
              className="sekunder"
              onClick={() => {
                setSandiUntuk(null)
                setSandiBaru('')
              }}
            >
              Batal
            </button>
          </div>
        </form>
      )}

      <div className="kartu">
        <div className="kartu-judul">
          <h3>Daftar akun</h3>
          <span className="samar">{daftar ? `${daftar.length} akun` : "Memuat…"}</span>
        </div>
        <div className="tabel-bungkus">
          <table className="tabel">
            <thead>
              <tr>
                <th>Akun</th>
                <th>Peran</th>
                <th>Status</th>
                <th aria-label="Tindakan" />
              </tr>
            </thead>
            <tbody>
              {(daftar ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="baris-rapat avatar-baris">
                      <span className="avatar avatar-tabel">
                        {inisial(p.nama_lengkap)}
                      </span>
                      <span>
                        <strong>{p.nama_lengkap}</strong>
                        <div className="samar">{p.nama_pengguna}</div>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="lencana peran">{NAMA_PERAN[p.peran] ?? p.peran}</span>
                  </td>
                  <td>
                    <span className={`lencana ${p.aktif ? 'aktif' : 'nonaktif'}`}>
                      {p.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="sel-aksi">
                    <button
                      type="button"
                      className="sekunder"
                      onClick={() => {
                        setSandiUntuk(p)
                        setSandiBaru('')
                      }}
                    >
                      Setel sandi
                    </button>
                    {p.aktif && p.peran !== 'admin_desa' && (
                      <>
                        {nonaktifUntuk === p.id ? (
                          <span className="baris-rapat spasi-kiri-kecil">
                            <button
                              type="button"
                              className="bahaya"
                              onClick={async () => {
                                await ubah(
                                  p.id,
                                  { aktif: false },
                                  `Akun ${p.nama_pengguna} dinonaktifkan.`,
                                )
                                setNonaktifUntuk(null)
                              }}
                            >
                              Ya, nonaktifkan
                            </button>
                            <button
                              type="button"
                              className="tautan"
                              onClick={() => setNonaktifUntuk(null)}
                            >
                              Batal
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="bahaya spasi-kiri-kecil"
                            onClick={() => setNonaktifUntuk(p.id)}
                          >
                            Nonaktifkan
                          </button>
                        )}
                      </>
                    )}
                    {!p.aktif && (
                      <button
                        type="button"
                        className="sekunder spasi-kiri-kecil"
                        onClick={() => ubah(p.id, { aktif: true }, `Akun ${p.nama_pengguna} diaktifkan.`)}
                      >
                        Aktifkan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {daftar?.length === 0 && (
                <tr>
                  <td colSpan={4}>Belum ada akun.</td>
                </tr>
              )}
              {daftar === null && !galat && (
                <tr>
                  <td colSpan={4}>
                    <div className="kerangka kerangka-baris" style={{ width: '90%', margin: '0.4rem 0' }} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="samar teks-bawah">
          Akun admin desa tidak bisa dinonaktifkan dari layar ini untuk mencegah terkunci di luar
          sistem.
        </p>
      </div>

      <div className="kartu">
        <div className="kartu-judul">
          <h3>Sesi tablet aktif</h3>
          <span className="samar">
            {sesiAktif ? `${sesiAktif.length} sesi` : 'Memuat…'}
          </span>
        </div>
        <p className="redup petunjuk-atas">
          Cabut sesi bila tablet hilang atau dipinjamkan. Perangkat yang dicabut harus masuk lagi
          dengan kata sandi.
        </p>
        <div className="tabel-bungkus">
          <table className="tabel">
            <thead>
              <tr>
                <th>Akun</th>
                <th>Perangkat</th>
                <th>Masuk</th>
                <th>Kedaluwarsa</th>
                <th aria-label="Tindakan" />
              </tr>
            </thead>
            <tbody>
              {(sesiAktif ?? []).map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.nama_lengkap}</strong>
                    <div className="samar">{s.nama_pengguna}</div>
                  </td>
                  <td className="samar">{s.id_perangkat}</td>
                  <td className="samar">{waktuPendek(s.dibuat_pada)}</td>
                  <td className="samar">{waktuPendek(s.kadaluarsa_pada)}</td>
                  <td className="sel-aksi">
                    {cabutUntuk === s.id ? (
                      <span className="baris-rapat">
                        <button
                          type="button"
                          className="bahaya"
                          onClick={() => cabut(s.id, `${s.nama_pengguna} di ${s.id_perangkat}`)}
                        >
                          Ya, cabut
                        </button>
                        <button
                          type="button"
                          className="tautan"
                          onClick={() => setCabutUntuk(null)}
                        >
                          Batal
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="bahaya"
                        onClick={() => setCabutUntuk(s.id)}
                      >
                        Cabut
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {sesiAktif?.length === 0 && (
                <tr>
                  <td colSpan={5}>Tidak ada sesi aktif.</td>
                </tr>
              )}
              {sesiAktif === null && !galat && (
                <tr>
                  <td colSpan={5} className="redup">Memuat daftar sesi…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="kartu">
        <div className="kartu-judul">
          <h3>Riwayat masuk perangkat</h3>
        </div>
        <p className="redup petunjuk-atas">
          Sesi lama tetap tercatat meski perangkatnya sudah keluar.
        </p>
        <PanelRiwayatMasuk sesi={sesi} versi={versiRiwayat} />
      </div>
    </main>
  )
}
