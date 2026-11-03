import { useEffect, useState } from 'react'
import {
  buatBalita,
  daftarBalita,
  daftarPosyandu,
  hapusBalita,
  ubahBalita,
} from '../jaringan/api.js'
import { batasTanggalLahir, tanggalHariIni, usiaBulan, usiaDiterima } from '../logika/waktu.js'
import Ikon from './Ikon.jsx'

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
  const [total, setTotal] = useState(0)
  const [halaman, setHalaman] = useState(0)
  const [memuatLagi, setMemuatLagi] = useState(false)


  async function muatPosyandu() {
    try {
      const hasil = await daftarPosyandu()
      setPosyandu(hasil.posyandu)
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
  async function muat(kunci = cari, h = halaman) {
    setMemuat(true)
    try {
      const hasil = await daftarBalita({
        aktif: false,
        batas: 50,
        offset: h * 50,
        q: kunci.trim(),
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
    muat('', 0)
    muatPosyandu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ketik nama → tanya server setelah jeda, bukan menyaring daftar lokal.
  useEffect(() => {
    const jeda = setTimeout(() => { setHalaman(0); muat(cari, 0) }, 300)
    return () => clearTimeout(jeda)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cari])

  function angka(nilai) {
    const bersih = String(nilai).trim()
    return bersih === '' ? null : Number(bersih)
  }

  function muatanDariForm() {
    return {
      posyandu_id: posyanduId || sesi.pengguna.posyandu_id,
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
    if (!posyanduId && !sesi.pengguna.posyandu_id) {
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
      await muat()
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
    try {
      await ubahBalita(sunting.id, {
        nama_lengkap: sunting.nama_lengkap.trim(),
        jenis_kelamin: sunting.jenis_kelamin,
        tanggal_lahir: sunting.tanggal_lahir,
        nama_ibu_kandung: sunting.nama_ibu_kandung.trim() || null,
        berat_lahir_kg: angka(sunting.berat_lahir_kg),
        panjang_lahir_cm: angka(sunting.panjang_lahir_cm),
        aktif: sunting.aktif,
      })
      setPesan(`Data ${sunting.nama_lengkap} diperbarui.`)
      setSunting(null)
      await muat()
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
    <main className="layar" id="isi-utama">
      <div className="kepala-layar">
        <div>
          <h1>Data balita</h1>
          <p>Daftar, sunting, dan hapus balita terdaftar di Posyandu ini.</p>
        </div>
        <button type="button" className="sekunder" onClick={() => muat()}>
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
            <Ikon nama="tambah" ukuran={20} />
          </span>
          <div>
            <h3>Balita baru</h3>
            <p>Didaftarkan admin desa. NIK disimpan terenkripsi dan tidak pernah dikirim ke tablet.</p>
          </div>
        </div>

        <div className="grid2 grid-akun">
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
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1"
              max="40"
              placeholder="cth. 3.2"
              value={isi.berat_lahir_kg}
              onChange={(e) => setIsi({ ...isi, berat_lahir_kg: e.target.value })}
            />
          </div>

          <div className="bidang">
            <label htmlFor="b-panjang">Panjang lahir (cm)</label>
            <input
              id="b-panjang"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="30"
              max="130"
              placeholder="cth. 49.5"
              value={isi.panjang_lahir_cm}
              onChange={(e) => setIsi({ ...isi, panjang_lahir_cm: e.target.value })}
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
            <p className="petunjuk" id="b-nik-bantuan">
              Opsional. Dienkripsi di server; tidak ikut ke tablet.
            </p>
          </div>
        </div>

        <div className="aksi-akun">
          <button type="submit" disabled={menyimpan}>
            <Ikon nama="tambah" ukuran={18} />
            {menyimpan ? 'Menyimpan…' : 'Daftarkan balita'}
          </button>
        </div>
      </form>

      {sunting && (
        <form className="kartu" onSubmit={simpanSunting}>
          <div className="kartu-judul">
            <h3>Sunting balita</h3>
            <button
              type="button"
              className="tombol-ikon sekunder"
              onClick={() => setSunting(null)}
              aria-label="Tutup formulir sunting"
            >
              <Ikon nama="tutup" ukuran={18} />
            </button>
          </div>
          <div className="grid2 grid-akun">
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
              <label htmlFor="s-kelamin">Jenis kelamin</label>
              <select
                id="s-kelamin"
                value={sunting.jenis_kelamin}
                onChange={(e) => setSunting({ ...sunting, jenis_kelamin: e.target.value })}
              >
                <option value="perempuan">Perempuan</option>
                <option value="laki-laki">Laki-laki</option>
              </select>
            </div>
            <div className="bidang">
              <label htmlFor="s-ibu">Nama ibu kandung</label>
              <input
                id="s-ibu"
                value={sunting.nama_ibu_kandung ?? ''}
                onChange={(e) => setSunting({ ...sunting, nama_ibu_kandung: e.target.value })}
              />
            </div>
            <div className="bidang">
              <label htmlFor="s-berat">Berat lahir (kg)</label>
              <input
                id="s-berat"
                type="number"
                step="0.01"
                min="1"
                max="40"
                value={sunting.berat_lahir_kg ?? ''}
                onChange={(e) => setSunting({ ...sunting, berat_lahir_kg: e.target.value })}
              />
            </div>
            <div className="bidang">
              <label htmlFor="s-panjang">Panjang lahir (cm)</label>
              <input
                id="s-panjang"
                type="number"
                step="0.1"
                min="30"
                max="130"
                value={sunting.panjang_lahir_cm ?? ''}
                onChange={(e) => setSunting({ ...sunting, panjang_lahir_cm: e.target.value })}
              />
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

      <div className="kartu">
        <div className="kartu-judul">
          <h3>Balita terdaftar</h3>
          <span className="samar">
            {cari.trim() ? `${daftar.length} cocok` : `${total} balita`}
          </span>
        </div>

        <div className="cari">
          <label className="sr-only" htmlFor="cari-balita">
            Cari nama balita
          </label>
          <Ikon nama="cari" ukuran={20} />
          <input
            id="cari-balita"
            type="search"
            placeholder="Cari nama balita…"
            autoComplete="off"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>

        {memuat ? (
          <div className="kerangka-tabel" role="status" aria-label="Memuat daftar balita">
            <div className="kerangka kerangka-baris" style={{ width: '85%' }} />
            <div className="kerangka kerangka-baris" style={{ width: '95%' }} />
            <div className="kerangka kerangka-baris" style={{ width: '60%' }} />
          </div>
        ) : daftar.length === 0 ? (
          <p className="redup">Belum ada balita terdaftar.</p>
        ) : (
          <div className="tabel-bungkus">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Usia</th>
                  <th>Jenis kelamin</th>
                  <th>Status</th>
                  <th aria-label="Tindakan" />
                </tr>
              </thead>
              <tbody>
                {daftar.map((b) => {
                  const bulan = usiaBulan(b.tanggal_lahir, tanggalHariIni())
                  return (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.nama_lengkap}</strong>
                        {b.nama_ibu_kandung && (
                          <div className="samar">Ibu: {b.nama_ibu_kandung}</div>
                        )}
                      </td>
                      <td className="angka">
                        {bulan === null ? '—' : `${bulan} bulan`}
                      </td>
                      <td>{LABEL_KELAMIN[b.jenis_kelamin] ?? b.jenis_kelamin}</td>
                      <td>
                        <span className={`lencana ${b.aktif ? 'aktif' : 'nonaktif'}`}>
                          {b.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="sel-aksi">
                        {konfirm?.id === b.id ? (
                          <span className="baris-rapat">
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
                              className="bahaya spasi-kiri-kecil"
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
        {total > 50 && (
          <div className="baris baris-subjudul spasi-atas">
            <span className="samar">
              Halaman {halaman + 1} dari {Math.max(1, Math.ceil(total / 50))} ·{' '}
              {daftar.length} baris (total {total})
            </span>
            <span className="baris-rapat">
              <button
                type="button"
                className="sekunder"
                onClick={() => { if (halaman > 0) { setHalaman(halaman - 1); muat(cari, halaman - 1) } }}
                disabled={memuat || halaman === 0}
              >
                ‹ Sebelumnya
              </button>
              <button
                type="button"
                className="sekunder"
                onClick={() => { if ((halaman + 1) * 50 < total) { setHalaman(halaman + 1); muat(cari, halaman + 1) } }}
                disabled={memuat || (halaman + 1) * 50 >= total}
              >
                Berikutnya ›
              </button>
            </span>
          </div>
        )}
        <p className="samar teks-bawah">
          Hapus memakai hapus lunak: baris ditandai, riwayat kunjungan tetap tersimpan.
          Menonaktifkan bisa dilakukan lewat formulir sunting.
        </p>
      </div>
    </main>
  )
}
