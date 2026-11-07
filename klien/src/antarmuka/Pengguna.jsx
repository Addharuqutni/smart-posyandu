import { useEffect, useState } from 'react'
import {
  buatPengguna,
  cabutSesi,
  daftarPengguna,
  daftarPosyandu,
  daftarSesi,
  perbaruiAkun,
  ubahPengguna,
} from '../jaringan/api.js'
import { inisial } from '../logika/nama.js'
import { idBaru, waktuPendek } from '../logika/waktu.js'
import Ikon from './Ikon.jsx'
import { Layar, Modal } from './Bersama.jsx'

const KOSONG = {
  nama_pengguna: '',
  kata_sandi: '',
  nama_lengkap: '',
  peran: 'kader',
  posyandu_id: '',
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
  const [cabutUntuk, setCabutUntuk] = useState(null)
  const [sunting, setSunting] = useState(null)
  const [daftarPos, setDaftarPos] = useState([])
  const [menyimpan, setMenyimpan] = useState(false)

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
    try {
      const resPos = await daftarPosyandu()
      const list = resPos.posyandu ?? []
      setDaftarPos(list)
      if (list.length === 1) {
        setIsi((prev) => (prev.posyandu_id ? prev : { ...prev, posyandu_id: list[0].id }))
      }
    } catch {
      setDaftarPos([])
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
    if (isi.peran === 'kader' && !isi.posyandu_id) {
      setGalat('Akun kader wajib terikat pada satu Posyandu.')
      return
    }
    try {
      await buatPengguna({
        ...isi,
        id: idBaru(),
        posyandu_id: isi.peran === 'admin_desa' ? null : (isi.posyandu_id || null),
      })
      setIsi({
        ...KOSONG,
        posyandu_id: daftarPos.length === 1 ? daftarPos[0].id : '',
      })
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
      await muat()
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal mencabut sesi.')
      setCabutUntuk(null)
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

  async function simpanSunting(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setPesan(null)
    if (!sunting.nama_lengkap.trim() || !sunting.nama_pengguna.trim()) {
      setGalat('Nama lengkap dan username wajib diisi.')
      return
    }
    setMenyimpan(true)
    try {
      await perbaruiAkun({
        id: sunting.id,
        nama_lengkap: sunting.nama_lengkap.trim(),
        nama_pengguna: sunting.nama_pengguna.trim(),
      })
      setPesan(`Akun ${sunting.nama_pengguna.trim()} diperbarui.`)
      setSunting(null)
      await muat()
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal memperbarui akun.')
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <Layar>
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Kelola akun</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">Akun kader, petugas kesehatan, dan admin desa.</p>
        </div>
        <button type="button" className="sekunder" onClick={muat}>
          <Ikon nama="sinkron" ukuran={18} />
          Muat ulang
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

      <form className="kartu" onSubmit={tambah}>
        <div className="kepala-akun mb-5 flex items-center gap-3 max-sempit:mb-4">
          <span className="grid size-[42px] shrink-0 place-items-center rounded-kecil border border-biru-100 bg-biru-50 text-biru-700 max-sempit:size-[38px]">
            <Ikon nama="akun" ukuran={20} />
          </span>
          <div>
            <h2 className="m-0 leading-tight">Akun baru</h2>
            <p className="mt-1 mb-0 text-padat text-teks-redup">Buat akun untuk kader, petugas kesehatan, atau admin desa.</p>
          </div>
        </div>

        <div className="grid items-start gap-x-4 gap-y-4 [grid-template-columns:repeat(2,minmax(0,1fr))] max-sempit:grid-cols-1">
          <div className="bidang">
            <label htmlFor="p-nama">
              <span>Username</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="p-nama"
                name="username"

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
                name="nama_lengkap"

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
                name="kata_sandi"

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
              value={isi.peran}
              onChange={(e) => {
                const p = e.target.value
                setIsi({
                  ...isi,
                  peran: p,
                  posyandu_id: p === 'kader' ? (isi.posyandu_id || (daftarPos.length === 1 ? daftarPos[0].id : '')) : '',
                })
              }}
            >
              <option value="kader">Kader</option>
              <option value="nakes">Petugas kesehatan</option>
              <option value="admin_desa">Admin desa</option>
            </select>
          </div>
          <div className="bidang max-sempit:col-span-1 mini:col-span-2">
            <label htmlFor="p-posyandu">
              <span>Posyandu</span>
              {isi.peran === 'kader' && <span className="wajib" aria-hidden="true">*</span>}
            </label>
            <select
              id="p-posyandu"
              value={isi.peran === 'kader' ? isi.posyandu_id : ''}
              onChange={(e) => setIsi({ ...isi, posyandu_id: e.target.value })}
              disabled={isi.peran !== 'kader'}
              required={isi.peran === 'kader'}
            >
              <option value="">
                {isi.peran === 'kader'
                  ? '(Pilih Posyandu)'
                  : '(Tidak terikat posyandu / semua)'}
              </option>
              {daftarPos.map((pos) => (
                <option key={pos.id} value={pos.id}>
                  {pos.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-garis pt-4 max-sempit:[&>button]:w-full">
          <button type="submit">
            <Ikon nama="tambah" ukuran={18} />
            Buat akun
          </button>
        </div>
      </form>

      {sandiUntuk && (
        <form className="kartu" onSubmit={simpanSandi}>
          <div className="kartu-judul">
            <h2>Setel ulang kata sandi</h2>
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
          <p className="-mt-1.5 text-isi text-teks-redup">
            Untuk <strong>{sandiUntuk.nama_lengkap}</strong> ({sandiUntuk.nama_pengguna}).
          </p>
          <div className="bidang">
            <label htmlFor="sandi-baru">
              <span>Kata sandi baru</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="sandi-baru"
                name="kata_sandi_baru"

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
          <div className="flex flex-wrap items-center gap-2">
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
          <h2>Daftar akun</h2>
          <span className="text-padat text-teks-samar">{daftar ? `${daftar.length} akun` : "Memuat…"}</span>
        </div>
        <div className="tabel-bungkus">
          <table className="tabel tabel-kartu tabel-aksi">
            <thead>
              <tr>
                <th>Akun</th>
                <th>Peran</th>
                <th>Posyandu</th>
                <th>Status</th>
                <th aria-label="Tindakan" />
              </tr>
            </thead>
            <tbody>
              {(daftar ?? []).map((p) => (
                <tr key={p.id}>
                  <td data-label="Akun">
                    <div className="flex flex-nowrap items-center gap-2">
                      <span className="grid size-[34px] shrink-0 place-items-center rounded-kecil border border-garis-kuat bg-latar text-padat font-bold text-teks-redup">
                        {inisial(p.nama_lengkap)}
                      </span>
                      <span>
                        <strong>{p.nama_lengkap}</strong>
                        <div className="text-padat text-teks-samar">{p.nama_pengguna}</div>
                      </span>
                    </div>
                  </td>
                  <td data-label="Peran">
                    <span className="lencana peran">{NAMA_PERAN[p.peran] ?? p.peran}</span>
                  </td>
                  <td data-label="Posyandu">
                    <span className="text-padat text-teks-redup">
                      {p.posyandu_id ? (daftarPos.find((pos) => pos.id === p.posyandu_id)?.nama ?? 'Posyandu') : '-'}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className={`lencana ${p.aktif ? 'aktif' : 'nonaktif'}`}>
                      {p.aktif ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="sel-aksi">
                    <button
                      type="button"
                      className="sekunder"
                      onClick={() => setSunting({ ...p })}
                      aria-label={`Sunting akun ${p.nama_lengkap || p.nama_pengguna}`}
                    >
                      Sunting
                    </button>
                    <button
                      type="button"
                      className="sekunder ml-1.5"
                      onClick={() => {
                        setSandiUntuk(p)
                        setSandiBaru('')
                      }}
                    >
                      Setel sandi
                    </button>
                    {p.aktif && p.peran !== 'admin_desa' && (
                      <button
                        type="button"
                        className="bahaya ml-1.5"
                        onClick={() => setNonaktifUntuk(p)}
                      >
                        Nonaktifkan
                      </button>
                    )}
                    {!p.aktif && (
                      <button
                        type="button"
                        className="sekunder ml-1.5"
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
      </div>

      {sunting && (
        <Modal
          judul="Sunting Data Akun"
          subjudul={`${sunting.nama_lengkap} · ${NAMA_PERAN[sunting.peran] ?? sunting.peran}`}
          onTutup={() => setSunting(null)}
        >
          <form onSubmit={simpanSunting} className="flex flex-col gap-5 overflow-y-auto p-4">
            <div className="flex flex-col gap-3">
              <div className="border-b border-garis pb-1.5 text-2xs font-bold uppercase tracking-[0.075em] text-aksen-biru-ink">Identitas Akun</div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                <div className="bidang">
                  <label htmlFor="modal-akun-nama">
                    <span>Nama lengkap</span>
                    <span className="wajib" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="modal-akun-nama"
                    name="nama_lengkap"
                    autoComplete="name"
                    maxLength={120}
                    value={sunting.nama_lengkap}
                    onChange={(e) => setSunting({ ...sunting, nama_lengkap: e.target.value })}
                    required
                  />
                </div>
                <div className="bidang">
                  <label htmlFor="modal-akun-username">
                    <span>Username</span>
                    <span className="wajib" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="modal-akun-username"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    minLength={3}
                    maxLength={50}
                    pattern="[a-z0-9_.\-]{3,50}"
                    title="3-50 karakter: huruf kecil, angka, titik, garis bawah, atau strip"
                    value={sunting.nama_pengguna}
                    onChange={(e) => setSunting({ ...sunting, nama_pengguna: e.target.value.toLowerCase() })}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setSunting(null)}>
                Batal
              </button>
              <button type="submit" disabled={menyimpan}>
                <Ikon nama="simpan" ukuran={18} />
                <span>{menyimpan ? 'Menyimpan…' : 'Simpan Perubahan'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Konfirmasi nonaktifkan akun. Sama seperti cabut sesi: tidak boleh
          disisipkan di dalam sel tabel karena membuat baris membengkak. */}
      {nonaktifUntuk && (
        <Modal
          judul="Nonaktifkan akun?"
          subjudul={`${nonaktifUntuk.nama_lengkap} · ${nonaktifUntuk.nama_pengguna}`}
          onTutup={() => setNonaktifUntuk(null)}
        >
          <div className="flex flex-col gap-4 p-4">
            <p className="m-0 text-isi leading-relaxed text-teks-redup">
              <strong>{nonaktifUntuk.nama_lengkap}</strong> tidak bisa masuk lagi ke aplikasi.
              Data dan riwayatnya tetap tersimpan; akun bisa diaktifkan kembali kapan saja.
            </p>
            <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setNonaktifUntuk(null)}>
                Batal
              </button>
              <button
                type="button"
                className="bahaya"
                onClick={async () => {
                  await ubah(
                    nonaktifUntuk.id,
                    { aktif: false },
                    `Akun ${nonaktifUntuk.nama_pengguna} dinonaktifkan.`,
                  )
                  setNonaktifUntuk(null)
                }}
              >
                Ya, nonaktifkan
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Konfirmasi cabut sesi. Sebelumnya disisipkan di dalam sel tabel,
          sehingga baris membengkak dan kolom aksi melebar. Pola ini menyamakan
          konfirmasi dengan layar Kelola Posyandu dan Kelola Konten. */}
      {cabutUntuk && (
        <Modal
          judul="Cabut sesi tablet?"
          subjudul={`${cabutUntuk.nama_pengguna} · ${cabutUntuk.id_perangkat}`}
          onTutup={() => setCabutUntuk(null)}
        >
          <div className="flex flex-col gap-4 p-4">
            <p className="m-0 text-isi leading-relaxed text-teks-redup">
              Sesi <strong>{cabutUntuk.nama_lengkap}</strong> pada perangkat{' '}
              <strong>{cabutUntuk.id_perangkat}</strong> akan dihentikan. Orang di tablet itu harus
              memasukkan username dan kata sandi lagi untuk masuk.
            </p>
            <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setCabutUntuk(null)}>
                Batal
              </button>
              <button
                type="button"
                className="bahaya"
                onClick={() => cabut(cabutUntuk.id, `${cabutUntuk.nama_pengguna} di ${cabutUntuk.id_perangkat}`)}
              >
                Ya, cabut
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="kartu">
        <div className="kartu-judul">
          <h2>Sesi tablet aktif</h2>
          <span className="text-padat text-teks-samar">
            {sesiAktif ? `${sesiAktif.length} sesi` : 'Memuat…'}
          </span>
        </div>
        <div className="tabel-bungkus">
          <table className="tabel tabel-kartu tabel-aksi">
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
                  <td data-label="Akun">
                    <strong>{s.nama_lengkap}</strong>
                    <div className="text-padat text-teks-samar">{s.nama_pengguna}</div>
                  </td>
                  <td className="text-padat text-teks-samar" data-label="Perangkat">{s.id_perangkat}</td>
                  <td className="text-padat text-teks-samar" data-label="Masuk">{waktuPendek(s.dibuat_pada)}</td>
                  <td className="text-padat text-teks-samar" data-label="Kedaluwarsa">{waktuPendek(s.kadaluarsa_pada)}</td>
                  <td className="sel-aksi">
                    <button
                      type="button"
                      className="bahaya"
                      onClick={() => setCabutUntuk(s)}
                    >
                      Cabut
                    </button>
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
                  <td colSpan={5} className="text-padat text-teks-redup">Memuat daftar sesi…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layar>
  )
}
