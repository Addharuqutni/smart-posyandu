import { useEffect, useState } from 'react'
import {
  buatBalita,
  daftarBalita,
  daftarPosyandu,
  hapusBalita,
  ubahBalita,
} from '../jaringan/api.js'
import { batasTanggalLahir, tanggalHariIni, rincianUsia, usiaDiterima } from '../logika/waktu.js'
import { rapikanDesimal } from '../logika/angka.js'
import Ikon from './Ikon.jsx'
import { Modal, Kosong, KotakCari, KendaliHalaman, UKURAN_HALAMAN } from './Bersama.jsx'
const KOSONG = {
  nama_lengkap: '',
  jenis_kelamin: 'perempuan',
  tanggal_lahir: '',
  nik: '',
  nama_ibu_kandung: '',
  berat_lahir_kg: '',
  panjang_lahir_cm: '',
}

const LABEL_KELAMIN = { perempuan: 'Perempuan', 'laki-laki': 'Laki-laki' }

/** Kelola data balita terdaftar: daftar, tambah, sunting, nonaktifkan (F-04). */
export default function KelolaBalita({ sesi }) {
  const [daftar, setDaftar] = useState([])
  const [cari, setCari] = useState('')
  const [isi, setIsi] = useState(KOSONG)
  const [galat, setGalat] = useState(null)
  const [pesan, setPesan] = useState(null)
  const [memuat, setMemuat] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [sunting, setSunting] = useState(null)
  const [konfirm, setKonfirm] = useState(null)
  const [posyandu, setPosyandu] = useState([])
  const [posyanduId, setPosyanduId] = useState('')
  const [filterPosyanduId, setFilterPosyanduId] = useState('')
  const [total, setTotal] = useState(0)
  const [halaman, setHalaman] = useState(0)
  const [memuatLagi, setMemuatLagi] = useState(false)


  async function muatPosyandu() {
    try {
      const hasil = await daftarPosyandu()
      setPosyandu(hasil.posyandu)
      // Form "Balita baru" boleh terisi otomatis bila hanya ada satu Posyandu.
      if (hasil.posyandu.length === 1) setPosyanduId(hasil.posyandu[0].id)
    } catch {
      // pilihan tetap kosong bila server tidak terjangkau
    }
  }

  /**
   * Pencarian dilakukan di server, bukan dengan menyaring 500 baris yang
   * kebetulan sudah dimuat. Dulu daftar dipotong di 500 dan pencarian hanya
   * menyaring potongan itu, sehingga balita ke-501 ke atas seolah tidak ada.
   */
  async function muat(kunci = cari, h = halaman, posId = filterPosyanduId) {
    if (!posId) {
      setDaftar([])
      setTotal(0)
      setMemuat(false)
      return
    }
    setMemuat(true)
    try {
      const hasil = await daftarBalita({
        aktif: false,
        batas: UKURAN_HALAMAN,
        offset: h * UKURAN_HALAMAN,
        q: kunci.trim(),
        posyandu_id: posId,
      })
      setDaftar(hasil.balita)
      setTotal(hasil.total ?? hasil.balita.length)
      setGalat(null)
    } catch {
      setGalat('Daftar balita butuh koneksi ke server.')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => {
    setHalaman(0)
    muatPosyandu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const jeda = setTimeout(() => { setHalaman(0); muat(cari, 0) }, 300)
    return () => clearTimeout(jeda)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cari, filterPosyanduId])

  function angka(nilai) {
    const bersih = String(nilai).trim()
    return bersih === '' ? null : Number(bersih)
  }

  function muatanDariForm() {
    return {
      posyandu_id: posyanduId,
      nama_lengkap: isi.nama_lengkap.trim(),
      jenis_kelamin: isi.jenis_kelamin,
      tanggal_lahir: isi.tanggal_lahir,
      nik: isi.nik.trim() === '' ? null : isi.nik.trim(),
      nama_ibu_kandung: isi.nama_ibu_kandung.trim() || null,
      berat_lahir_kg: angka(isi.berat_lahir_kg),
      panjang_lahir_cm: angka(isi.panjang_lahir_cm),
      aktif: true,
    }
  }

  async function tambah(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setPesan(null)
    if (!posyanduId) {
      setGalat('Pilih Posyandu lebih dulu.')
      return
    }
    if (!usiaDiterima(isi.tanggal_lahir)) {
      setGalat('Usia balita harus antara 0 hari dan 7 tahun (84 bulan).')
      return
    }
    setMenyimpan(true)
    try {
      await buatBalita(muatanDariForm())
      setIsi(KOSONG)
      setPesan('Balita terdaftar.')
      setFilterPosyanduId(posyanduId)
      await muat(cari, 0, posyanduId)
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal mendaftarkan balita.')
    } finally {
      setMenyimpan(false)
    }
  }

  async function simpanSunting(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setPesan(null)
    if (!usiaDiterima(sunting.tanggal_lahir)) {
      setGalat('Usia balita harus antara 0 hari dan 7 tahun (84 bulan).')
      return
    }
    if (!sunting.posyandu_id) {
      setGalat('Pilih Posyandu lebih dulu.')
      return
    }
    try {
      await ubahBalita(sunting.id, {
        posyandu_id: sunting.posyandu_id,
        nama_lengkap: sunting.nama_lengkap.trim(),
        jenis_kelamin: sunting.jenis_kelamin,
        tanggal_lahir: sunting.tanggal_lahir,
        nama_ibu_kandung: sunting.nama_ibu_kandung.trim() || null,
        berat_lahir_kg: angka(sunting.berat_lahir_kg),
        panjang_lahir_cm: angka(sunting.panjang_lahir_cm),
        aktif: sunting.aktif,
      })
      setPesan(`Data ${sunting.nama_lengkap} diperbarui.`)
      setFilterPosyanduId(sunting.posyandu_id)
      setSunting(null)
      await muat(cari, 0, sunting.posyandu_id)
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal menyimpan perubahan.')
    }
  }

  async function pakaiNonaktif(balita) {
    setGalat(null)
    setPesan(null)
    try {
      await ubahBalita(balita.id, { aktif: false })
      setPesan(`${balita.nama_lengkap} dinonaktifkan.`)
      setKonfirm(null)
      await muat()
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal menonaktifkan.')
    }
  }

  async function hapus(balita) {
    setGalat(null)
    setPesan(null)
    try {
      await hapusBalita(balita.id)
      setPesan(`${balita.nama_lengkap} dihapus.`)
      setKonfirm(null)
      await muat()
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal menghapus.')
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100dvh_-_4rem)] max-w-lebar px-4 pt-4 pb-[calc(6.2rem_+_env(safe-area-inset-bottom))] max-sempit:px-3 max-sempit:pb-[calc(6.4rem_+_env(safe-area-inset-bottom))]" id="isi-utama">
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Data balita</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">Daftar, sunting, dan hapus balita terdaftar di Posyandu ini.</p>
        </div>
        <button type="button" className="sekunder" onClick={() => muat()}>
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

      <form className="kartu p-5 max-sempit:p-4" onSubmit={tambah}>
        <div className="kepala-akun mb-5 flex items-start gap-3 max-sempit:mb-4">
          <span className="grid size-[42px] shrink-0 place-items-center rounded-sedang border border-biru-100 bg-biru-50 text-biru-700 max-sempit:size-[38px]">
            <Ikon nama="tambah" ukuran={20} />
          </span>
          <div>
            <h2>Balita baru</h2>
          </div>
        </div>

        <div className="grid gap-4 [grid-template-columns:repeat(2,minmax(0,1fr))] max-sempit:grid-cols-1 max-sempit:gap-3">
          <div className="bidang">
            <label htmlFor="b-posyandu">
              <span>Posyandu</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <select
              id="b-posyandu"
              value={posyanduId}
              onChange={(e) => setPosyanduId(e.target.value)}
              required
            >
              <option value="">— pilih posyandu —</option>
              {posyandu.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
          </div>

          <div className="bidang">
            <label htmlFor="b-nama">
              <span>Nama lengkap</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="b-nama"
              autoComplete="off"
              placeholder="cth. Budi Santoso"
              value={isi.nama_lengkap}
              onChange={(e) => setIsi({ ...isi, nama_lengkap: e.target.value })}
              required
            />
          </div>

          <div className="bidang">
            <label htmlFor="b-lahir">
              <span>Tanggal lahir</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <input
              id="b-lahir"
              type="date"
              max={tanggalHariIni()}
              min={batasTanggalLahir()}
              value={isi.tanggal_lahir}
              onChange={(e) => setIsi({ ...isi, tanggal_lahir: e.target.value })}
              required
            />
            <p className="petunjuk">Usia balita maksimal 7 tahun (84 bulan).</p>
          </div>

          <div className="bidang">
            <label htmlFor="b-kelamin">
              <span>Jenis kelamin</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            <select
              id="b-kelamin"
              value={isi.jenis_kelamin}
              onChange={(e) => setIsi({ ...isi, jenis_kelamin: e.target.value })}
            >
              <option value="perempuan">Perempuan</option>
              <option value="laki-laki">Laki-laki</option>
            </select>
          </div>

          <div className="bidang">
            <label htmlFor="b-ibu">Nama ibu kandung</label>
            <input
              id="b-ibu"
              autoComplete="off"
              placeholder="cth. Siti"
              value={isi.nama_ibu_kandung}
              onChange={(e) => setIsi({ ...isi, nama_ibu_kandung: e.target.value })}
            />
          </div>

          <div className="bidang">
            <label htmlFor="b-berat">Berat lahir (kg)</label>
            <input
              id="b-berat"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="cth. 3.2"
              value={isi.berat_lahir_kg}
              onChange={(e) => setIsi({ ...isi, berat_lahir_kg: rapikanDesimal(e.target.value) })}
            />
          </div>

          <div className="bidang">
            <label htmlFor="b-panjang">Panjang lahir (cm)</label>
            <input
              id="b-panjang"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="cth. 49.5"
              value={isi.panjang_lahir_cm}
              onChange={(e) => setIsi({ ...isi, panjang_lahir_cm: rapikanDesimal(e.target.value) })}
            />
          </div>

          <div className="bidang">
            <label htmlFor="b-nik">NIK balita</label>
            <input
              id="b-nik"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={16}
              autoComplete="off"
              placeholder="16 digit angka (opsional)"
              value={isi.nik}
              onChange={(e) => setIsi({ ...isi, nik: e.target.value.replace(/\D/g, '') })}
              aria-describedby="b-nik-bantuan"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end border-t border-garis pt-4 max-sempit:[&>button]:w-full">
          <button type="submit" disabled={menyimpan}>
            <Ikon nama="tambah" ukuran={18} />
            {menyimpan ? 'Menyimpan…' : 'Daftarkan balita'}
          </button>
        </div>
      </form>

      {sunting && (
        <Modal
          judul="Sunting Data Balita"
          subjudul={sunting.nama_lengkap}
          onTutup={() => setSunting(null)}
        >
          <form onSubmit={simpanSunting} className="flex flex-col gap-5 overflow-y-auto px-5 py-5 max-dialog:gap-4 max-dialog:p-4">
            <div className="flex flex-col gap-3">
              <div className="border-b border-garis pb-1.5 text-2xs font-bold uppercase tracking-[0.05em] text-aksen-biru-ink">Identitas Utama</div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                <div className="bidang">
                  <label htmlFor="s-posyandu">
                    <span>Posyandu</span>
                    <span className="wajib" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="s-posyandu"
                    value={sunting.posyandu_id ?? ''}
                    onChange={(e) => setSunting({ ...sunting, posyandu_id: e.target.value })}
                    required
                  >
                    <option value="">-- Pilih Posyandu --</option>
                    {posyandu.filter((p) => p.aktif).map((p) => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))}
                  </select>
                </div>

                <div className="bidang">
                  <label htmlFor="s-nama">
                    <span>Nama lengkap</span>
                    <span className="wajib" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="s-nama"
                    value={sunting.nama_lengkap}
                    onChange={(e) => setSunting({ ...sunting, nama_lengkap: e.target.value })}
                    required
                  />
                </div>

                <div className="bidang">
                  <label htmlFor="s-lahir">
                    <span>Tanggal lahir</span>
                    <span className="wajib" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="s-lahir"
                    type="date"
                    max={tanggalHariIni()}
                    min={batasTanggalLahir()}
                    value={sunting.tanggal_lahir}
                    onChange={(e) => setSunting({ ...sunting, tanggal_lahir: e.target.value })}
                    required
                  />
                </div>

                <div className="bidang">
                  <label htmlFor="s-kelamin">
                    <span>Jenis kelamin</span>
                    <span className="wajib" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="s-kelamin"
                    value={sunting.jenis_kelamin}
                    onChange={(e) => setSunting({ ...sunting, jenis_kelamin: e.target.value })}
                  >
                    <option value="perempuan">Perempuan</option>
                    <option value="laki-laki">Laki-laki</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="border-b border-garis pb-1.5 text-2xs font-bold uppercase tracking-[0.05em] text-aksen-biru-ink">Orang Tua & Data Lahir (Opsional)</div>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                <div className="bidang">
                  <label htmlFor="s-ibu">Nama ibu kandung</label>
                  <input
                    id="s-ibu"
                    placeholder="Nama ibu"
                    value={sunting.nama_ibu_kandung ?? ''}
                    onChange={(e) => setSunting({ ...sunting, nama_ibu_kandung: e.target.value })}
                  />
                </div>

                <div className="bidang">
                  <label htmlFor="s-status">Status balita</label>
                  <select
                    id="s-status"
                    value={sunting.aktif ? 'aktif' : 'nonaktif'}
                    onChange={(e) => setSunting({ ...sunting, aktif: e.target.value === 'aktif' })}
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>

                <div className="bidang">
                  <label htmlFor="s-berat">Berat lahir (kg)</label>
                  <input
                    id="s-berat"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Contoh: 3.2"
                    value={sunting.berat_lahir_kg ?? ''}
                    onChange={(e) => setSunting({ ...sunting, berat_lahir_kg: rapikanDesimal(e.target.value) })}
                  />
                </div>

                <div className="bidang">
                  <label htmlFor="s-panjang">Panjang lahir (cm)</label>
                  <input
                    id="s-panjang"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Contoh: 49.5"
                    value={sunting.panjang_lahir_cm ?? ''}
                    onChange={(e) => setSunting({ ...sunting, panjang_lahir_cm: rapikanDesimal(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-garis bg-biru-50 px-5 py-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:p-3 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setSunting(null)}>
                Batal
              </button>
              <button type="submit" disabled={menyimpan}>
                <Ikon nama="simpan" ukuran={18} />
                <span>{menyimpan ? 'Menyimpan…' : 'Simpan perubahan'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      <div className="kartu">
        <div className="kartu-judul">
          <h2>Balita terdaftar</h2>
          <span className="text-padat text-teks-samar">
            {cari.trim() ? `${daftar.length} cocok` : `${total} balita`}
          </span>
        </div>


        <div className="bidang mb-4 max-w-[22rem] min-w-0 flex-[1_1_190px]">
          <label htmlFor="filter-posyandu-balita">
            <span>Posyandu</span>
            <span className="wajib" aria-hidden="true">*</span>
          </label>
          <select
            id="filter-posyandu-balita"
            value={filterPosyanduId}
            onChange={(e) => { setHalaman(0); setFilterPosyanduId(e.target.value) }}
            required
          >
            <option value="">— pilih posyandu —</option>
            {posyandu.map((p) => (
              <option key={p.id} value={p.id}>{p.nama}</option>
            ))}
          </select>
        </div>
        <KotakCari id="cari-balita" nilai={cari} onUbah={setCari} />

        {!filterPosyanduId ? (
          <p className="text-isi text-teks-redup">Pilih Posyandu untuk menampilkan daftar balita.</p>
        ) : memuat ? (
          <div className="grid gap-2 py-3" role="status" aria-label="Memuat daftar balita">
            <div className="kerangka kerangka-baris" style={{ width: '85%' }} />
            <div className="kerangka kerangka-baris" style={{ width: '95%' }} />
            <div className="kerangka kerangka-baris" style={{ width: '60%' }} />
          </div>
        ) : daftar.length === 0 ? (
          <Kosong
            ikon="balita"
            judul={cari.trim() ? 'Tidak ada nama yang cocok' : 'Belum ada balita terdaftar'}
            teks={
              cari.trim()
                ? 'Periksa ejaan atau hapus kata pencarian.'
                : 'Tambahkan balita lewat formulir di atas.'
            }
            aksi={
              cari.trim() ? (
                <button type="button" className="sekunder" onClick={() => setCari('')}>
                  Hapus pencarian
                </button>
              ) : null
            }
          />
        ) : (
          <div className="tabel-bungkus">
            <table className="tabel tabel-balita tabel-kartu tabel-aksi">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th className="w-[10%] text-left">Usia</th>
                  <th>Jenis kelamin</th>
                  <th>Status</th>
                  <th aria-label="Tindakan" />
                </tr>
              </thead>
              <tbody>
                {daftar.map((b) => {
                  const usia = rincianUsia(b.tanggal_lahir, tanggalHariIni())
                  return (
                    <tr key={b.id}>
                      <td data-label="Nama">
                        <div className="flex min-w-0 flex-col gap-1">
                          <strong>{b.nama_lengkap}</strong>
                          {b.nama_ibu_kandung && (
                            <span className="text-padat text-teks-samar">Ibu: {b.nama_ibu_kandung}</span>
                          )}
                        </div>
                      </td>
                      <td data-label="Usia">
                        {usia ? (
                          <span className="chip-usia">
                            <strong className="chip-usia-angka">{usia.nilai}</strong>
                            <span className="chip-usia-satuan">{usia.satuan}</span>
                            {usia.keterangan && (
                              <span className="chip-usia-keterangan">({usia.keterangan})</span>
                            )}
                          </span>
                        ) : (
                          <span className="chip-usia perlu-diperbaiki" title="Di luar rentang usia balita 0–7 tahun">
                            Perlu diperbaiki
                          </span>
                        )}
                      </td>
                      <td data-label="Jenis kelamin">{LABEL_KELAMIN[b.jenis_kelamin] ?? b.jenis_kelamin}</td>
                      <td data-label="Status">
                        <span className={`lencana-status ${b.aktif ? 'aktif' : 'nonaktif'}`}>
                          {b.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="sel-aksi">
                        {konfirm?.id === b.id ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="bahaya"
                              onClick={() => hapus(b)}
                            >
                              Ya, hapus
                            </button>
                            <button
                              type="button"
                              className="tautan"
                              onClick={() => setKonfirm(null)}
                            >
                              Batal
                            </button>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="sekunder"
                              onClick={() => setSunting({ ...b })}
                            >
                              Sunting
                            </button>
                            <button
                              type="button"
                              className="bahaya ml-1.5"
                              onClick={() => setKonfirm(b)}
                            >
                              Hapus
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <KendaliHalaman
          halaman={halaman}
          total={total}
          nonaktif={memuat}
          onPilih={(h) => {
            setHalaman(h)
            muat(cari, h)
          }}
          keterangan={`Halaman ${halaman + 1} dari ${Math.max(1, Math.ceil(total / UKURAN_HALAMAN))} · ${daftar.length} baris (total ${total})`}
        />
      </div>
    </main>
  )
}
