import { useEffect, useState } from 'react'
import { db } from '../penyimpanan/db.js'
import { simpanKunjungan, hapusKunjungan, kunjunganPadaTanggal } from '../penyimpanan/kunjungan.js'
import { usiaBulan, tanggalHariIni } from '../logika/waktu.js'
import { LABEL, RENTANG, periksaRentang } from '../logika/rentang.js'
import { rapikanDesimal } from '../logika/angka.js'
import Ikon from './Ikon.jsx'
import { Layar, Modal } from './Bersama.jsx'
import Bantuan from './Bantuan.jsx'

const AWAL = {
  tanggal: tanggalHariIni(),
  berat_kg: '',
  tinggi_cm: '',
  lingkar_kepala_cm: '',
  cara_ukur_tinggi: 'terlentang',
  status_kehadiran: 'hadir',
  catatan: '',
}

// Draf hanya berisi angka ukur dan catatan; tidak pernah NIK atau kredensial.
const KUNCI_DRAF = 'draf-catat:'

// Kolom angka ukur: menerima koma sebagai pemisah desimal.
const UKUR = ['berat_kg', 'tinggi_cm', 'lingkar_kepala_cm']

function bacaDraf(idBalita) {
  try {
    const draf = JSON.parse(localStorage.getItem(KUNCI_DRAF + idBalita))
    return draf && draf.id_balita === idBalita ? { ...AWAL, ...draf.isi } : null
  } catch {
    return null
  }
}

function tulisDraf(idBalita, isi) {
  localStorage.setItem(KUNCI_DRAF + idBalita, JSON.stringify({ id_balita: idBalita, isi }))
}

function rentangTeks(kolom) {
  const [min, maks] = RENTANG[kolom]
  return `${min}–${maks}`
}

export default function Catat({ sesi, balitaAwal, setelahSimpan, kembali }) {
  const [daftar, setDaftar] = useState([])
  const [balita, setBalita] = useState(balitaAwal ?? null)
  const [isi, setIsi] = useState(() => {
    if (balitaAwal) {
      const draf = bacaDraf(balitaAwal.id)
      if (draf) return draf
      const u = usiaBulan(balitaAwal.tanggal_lahir, AWAL.tanggal)
      const caraBawaan = u !== null && u >= 24 ? 'berdiri' : 'terlentang'
      return { ...AWAL, cara_ukur_tinggi: caraBawaan }
    }
    return AWAL
  })
  const [galat, setGalat] = useState(null)
  const [bidangSalah, setBidangSalah] = useState([])
  const [adaDraf, setAdaDraf] = useState(() =>
    Boolean(balitaAwal ? bacaDraf(balitaAwal.id) : null),
  )
  const [sukses, setSukses] = useState(false)
  const [kunjunganTerakhir, setKunjunganTerakhir] = useState(null)
  const [mengirim, setMengirim] = useState(false)
  // Kunjungan balita ini pada tanggal yang sedang diisi (bila sudah ada).
  // Peringatan muncul saat pasien/tanggal dipilih, sebelum kader mengetik.
  const [duplikat, setDuplikat] = useState(null)
  const [tanyaGanda, setTanyaGanda] = useState(false)

  useEffect(() => {
    let batal = false
    if (!balita?.id || !isi.tanggal) {
      setDuplikat(null)
      return undefined
    }
    kunjunganPadaTanggal(balita.id, isi.tanggal)
      .then((k) => { if (!batal) setDuplikat(k) })
      .catch(() => { if (!batal) setDuplikat(null) })
    return () => { batal = true }
  }, [balita?.id, isi.tanggal])

  useEffect(() => {
    if (balitaAwal) return
    db.balita
      .filter((b) => !b.dihapus_pada && b.aktif !== false)
      .toArray()
      .then((b) => b.sort((x, y) => x.nama_lengkap.localeCompare(y.nama_lengkap)))
      .then(setDaftar)
  }, [balitaAwal])

  function ubah(kolom, nilai) {
    const bersih = UKUR.includes(kolom) ? rapikanDesimal(nilai) : nilai
    setIsi((lama) => {
      const baru = { ...lama, [kolom]: bersih }
      if (balita) tulisDraf(balita.id, baru)
      return baru
    })
    setBidangSalah((lama) => lama.filter((k) => k !== kolom))
  }

  function pilihBalita(id) {
    const dipilih = daftar.find((b) => b.id === id) ?? null
    setBalita(dipilih)
    const draf = dipilih ? bacaDraf(dipilih.id) : null
    if (draf) {
      setIsi(draf)
      setAdaDraf(true)
    } else {
      const u = dipilih ? usiaBulan(dipilih.tanggal_lahir, isi.tanggal) : null
      const caraBawaan = u !== null && u >= 24 ? 'berdiri' : 'terlentang'
      setIsi((lama) => ({ ...AWAL, tanggal: lama.tanggal, cara_ukur_tinggi: caraBawaan }))
      setAdaDraf(false)
    }
    setSukses(false)
    setGalat(null)
  }

  async function simpan(peristiwa) {
    peristiwa.preventDefault()
    setGalat(null)
    setSukses(false)

    if (!balita) {
      setGalat('Pilih balita lebih dulu.')
      return
    }
    if (!isi.tanggal) {
      setGalat('Tanggal kunjungan wajib diisi.')
      return
    }
    if (isi.tanggal > tanggalHariIni()) {
      setGalat('Tanggal kunjungan tidak boleh melewati hari ini.')
      return
    }
    const tidakHadir = isi.status_kehadiran === 'tidak_hadir'
    if (!tidakHadir && !isi.berat_kg) {
      setBidangSalah(['berat_kg'])
      setGalat('Berat wajib diisi.')
      return
    }
    const salah = tidakHadir
      ? []
      : periksaRentang({
          berat_kg: isi.berat_kg,
          tinggi_cm: isi.tinggi_cm,
          lingkar_kepala_cm: isi.lingkar_kepala_cm,
        })
    if (salah.length) {
      setBidangSalah(salah)
      setGalat(
        `${salah.map((k) => LABEL[k]).join(', ')} di luar rentang wajar. Periksa lagi sebelum menyimpan.`,
      )
      return
    }

    setMengirim(true)
    try {
      await tulisKunjungan(false)
    } finally {
      setMengirim(false)
    }
  }

  /** Simpan kunjungan. `izinkanGanda` = kader sudah menyetujui peringatan. */
  async function tulisKunjungan(izinkanGanda) {
    try {
      const hasil = await simpanKunjungan({
        balita,
        idPerangkat: sesi.id_perangkat,
        pemilik_id: sesi.pengguna.id,
        tanggal: isi.tanggal,
        izinkanGanda,
        berat_kg: isi.berat_kg,
        tinggi_cm: isi.tinggi_cm,
        lingkar_kepala_cm: isi.lingkar_kepala_cm,
        cara_ukur_tinggi: isi.cara_ukur_tinggi,
        status_kehadiran: isi.status_kehadiran,
        catatan: isi.catatan || null,
      })
      setKunjunganTerakhir(hasil.kunjungan_id)
      setSukses(true)
      setAdaDraf(false)
      setDuplikat(null)
      if (balita) localStorage.removeItem(KUNCI_DRAF + balita.id)
      setIsi({ ...AWAL, tanggal: isi.tanggal })
      setBidangSalah([])
      setelahSimpan?.()
      return true
    } catch (salahSimpan) {
      if (salahSimpan.kode === 'kunjungan_ganda') {
        setTanyaGanda(true)
        return false
      }
      setGalat(salahSimpan.message)
      return false
    }
  }

  async function tetapSimpanGanda() {
    setTanyaGanda(false)
    setMengirim(true)
    try { await tulisKunjungan(true) } finally { setMengirim(false) }
  }

  async function batalkanTerakhir() {
    if (!kunjunganTerakhir) return
    try {
      await hapusKunjungan(kunjunganTerakhir, sesi.id_perangkat, sesi.pengguna.id)
      setKunjunganTerakhir(null)
      setSukses(false)
      setGalat('Kunjungan dibatalkan.')
    } catch (salahBatal) {
      setGalat(salahBatal.message)
    }
  }

  const usia = balita ? usiaBulan(balita.tanggal_lahir, isi.tanggal) : null
  const gender = balita?.jenis_kelamin === 'laki-laki' ? 'Laki-laki' : 'Perempuan'

  function diLuarRentang(kolom) {
    const nilai = isi[kolom]
    if (nilai === undefined || nilai === null || nilai === '') return false
    const angka = Number(nilai)
    if (!Number.isFinite(angka)) return true
    const [min, maks] = RENTANG[kolom]
    return angka < min || angka > maks
  }

  const salahBerat = diLuarRentang('berat_kg')
  const salahTinggi = diLuarRentang('tinggi_cm')
  const salahKepala = diLuarRentang('lingkar_kepala_cm')

  return (
    <Layar>
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>Catat kunjungan</h1>
          <p className="m-0 inline-flex items-center gap-1.5 text-padat text-teks-redup [&_svg]:shrink-0 [&_svg]:text-teks-samar">
            <Ikon nama="posyandu" ukuran={15} />
            <span>{sesi?.pengguna?.nama_posyandu || 'Posyandu'}</span>
          </p>
        </div>
        <button type="button" className="sekunder" onClick={kembali}>
          <Ikon nama="kembali" ukuran={18} />
          Kembali
        </button>
      </div>

      {sukses && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-hijau-100 bg-hijau-100 text-hijau-800" role="status">
          <Ikon nama="cek" ukuran={19} />
          <span>Tersimpan di tablet. Terkirim otomatis saat jaringan tersedia.</span>
          {kunjunganTerakhir && (
            <button type="button" className="tautan" onClick={batalkanTerakhir}>
              Batalkan pencatatan
            </button>
          )}
        </div>
      )}
      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-merah-100 bg-merah-100 text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}
      {adaDraf && !sukses && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-garis bg-biru-100 text-biru-800" role="status">
          <Ikon nama="simpan" ukuran={18} />
          <span>Draf pengukuran sebelumnya dipulihkan dari tablet ini.</span>
        </div>
      )}
      {/* Peringatan dini: muncul begitu pasien dan tanggal dipilih, sebelum
          kader mengetik angka. Server akan menolak duplikat ini saat sinkron,
          jadi lebih baik diketahui sekarang. Kader tetap boleh melanjutkan. */}
      {duplikat && !sukses && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-kuning-100 bg-kuning-100 text-kuning-800" role="status">
          <Ikon nama="peringatan" ukuran={19} />
          <span>
            {balita?.nama_lengkap} sudah tercatat berkunjung pada{' '}
            {new Date(`${isi.tanggal}T00:00:00`).toLocaleDateString('id-ID', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
            . Periksa dulu, bisa jadi ini kunjungan ganda.
          </span>
        </div>
      )}

      {tanyaGanda && (
        <Modal
          judul="Kunjungan ganda di hari yang sama?"
          subjudul={balita?.nama_lengkap}
          onTutup={() => setTanyaGanda(false)}
        >
          <div className="flex flex-col gap-4 p-4">
            <p className="m-0 text-isi leading-relaxed text-teks-redup">
              <strong>{balita?.nama_lengkap}</strong> sudah punya catatan kunjungan pada tanggal
              ini. Server hanya menerima satu kunjungan per balita per hari, jadi catatan kedua
              akan ditolak saat sinkron dan tertahan di perangkat.
            </p>
            <p className="m-0 text-padat leading-relaxed text-teks-samar">
              Periksa riwayat balita dulu. Simpan hanya bila ini memang pencatatan ulang yang
              disengaja.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
            <button type="button" className="sekunder" onClick={() => setTanyaGanda(false)}>
              Periksa lagi
            </button>
            <button type="button" className="bahaya" onClick={tetapSimpanGanda} disabled={mengirim}>
              <Ikon nama="simpan" ukuran={18} />
              {mengirim ? 'Menyimpan…' : 'Tetap simpan'}
            </button>
          </div>
        </Modal>
      )}

      <form onSubmit={simpan} noValidate>
        <section className="mb-6 border-t border-garis pt-4 [&:first-of-type]:border-t-0 [&:first-of-type]:pt-0">
          <div className="kartu-judul">
            <h2>1. Balita dan kunjungan</h2>
            <span className="text-padat text-teks-samar">Wajib</span>
          </div>

          <div className="bidang">
            <label htmlFor="balita">
              <span>Balita</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            {balitaAwal ? (
              <div className="flex items-center gap-3 rounded-kecil border border-biru-100 bg-biru-50 px-4 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-kecil border border-garis-kuat bg-biru-50 text-biru-700" aria-hidden="true">
                  <Ikon nama="anak" ukuran={20} />
                </span>
                <div>
                  <strong>{balita?.nama_lengkap}</strong>
                  <div className="text-isi text-teks-redup">
                    {usia !== null && usia >= 0 ? `${usia} bulan` : 'Usia belum bisa dihitung'} ·{' '}
                    {gender}
                  </div>
                </div>
              </div>
            ) : (
              <select
                id="balita"
                value={balita?.id ?? ''}
                onChange={(e) => pilihBalita(e.target.value)}
                required
              >
                <option value="">(Pilih Balita)</option>
                {daftar.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nama_lengkap}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            <div className="bidang">
              <label htmlFor="tanggal">
                <span>Tanggal kunjungan</span>
                <span className="wajib" aria-hidden="true">*</span>
              </label>
              <input
                id="tanggal"
                name="tanggal_kunjungan"

                type="date"
                value={isi.tanggal}
                max={tanggalHariIni()}
                onChange={(e) => ubah('tanggal', e.target.value)}
                required
              />
            </div>
            <div className="bidang">
              <span className="label-segmen" id="label-kehadiran">
                <span>Kehadiran</span>
                <span className="wajib" aria-hidden="true">*</span>
              </span>
              <div
                className="segmen"
                role="group"
                aria-labelledby="label-kehadiran"
                style={{ '--segmen-jumlah': '2', '--segmen-posisi': isi.status_kehadiran === 'tidak_hadir' ? '1' : '0' }}
              >
                <button
                  type="button"
                  className={isi.status_kehadiran === 'hadir' ? 'aktif' : ''}
                  aria-pressed={isi.status_kehadiran === 'hadir'}
                  onClick={() => ubah('status_kehadiran', 'hadir')}
                >
                  Hadir
                </button>
                <button
                  type="button"
                  className={isi.status_kehadiran === 'tidak_hadir' ? 'aktif' : ''}
                  aria-pressed={isi.status_kehadiran === 'tidak_hadir'}
                  onClick={() => ubah('status_kehadiran', 'tidak_hadir')}
                >
                  Tidak hadir
                </button>
              </div>
            </div>
          </div>
        </section>

        {isi.status_kehadiran !== 'tidak_hadir' && (
          <section className="mb-6 border-t border-garis pt-4 [&:first-of-type]:border-t-0 [&:first-of-type]:pt-0">
            <div className="kartu-judul items-start gap-4">
              <div>
                <h2>2. Hasil ukur balita</h2>
              </div>
              <span className="inline-flex items-center rounded-mikro border border-garis bg-biru-50 px-2 py-0.5 text-2xs font-semibold whitespace-nowrap text-biru-800">Berat wajib</span>
            </div>

            <div className="grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
              {/* 1. BERAT BADAN */}
              <div
                className={`flex flex-col rounded-kecil border bg-kartu p-4 transition-colors duration-200 ease-ui focus-within:border-biru-600 ${bidangSalah.includes('berat_kg') ? 'border-merah-700 bg-merah-100' : salahBerat ? 'border-aksen-amber-ink bg-aksen-amber-tint' : 'border-garis'}`}
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <label htmlFor="berat" className="m-0 text-isi font-bold text-teks">
                    Berat badan <span className="wajib">*</span>
                  </label>
                  <span className="rounded-kecil bg-biru-100 px-2 py-0.5 text-2xs font-bold tracking-[0.02em] text-biru-800">
                    Wajib
                    <Bantuan
                      id="bantuan-wajib-berat"
                      label="Penjelasan rentang wajar berat"
                      teks={`Nilai wajar ${rentangTeks('berat_kg')} kg. Di luar itu ditolak agar salah ukur tidak tersimpan.`}
                    />
                  </span>
                </div>

                <div className="wadah-satuan">
                  <input
                    id="berat"
                name="berat_kg"

                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Contoh: 9.45"
                    value={isi.berat_kg}
                    onChange={(e) => ubah('berat_kg', e.target.value)}
                    aria-describedby="bantuan-berat"
                    aria-invalid={bidangSalah.includes('berat_kg') || salahBerat}
                    required
                  />
                  <span className="satuan">kg</span>
                </div>

                <div className="mt-2.5 flex flex-col gap-1 text-padat leading-snug" id="bantuan-berat">
                  {salahBerat ? (
                    <span className="flex items-center gap-1 font-bold text-kuning-800">
                      <Ikon nama="peringatan" ukuran={14} />
                      Di luar rentang ({RENTANG.berat_kg[0]}–{RENTANG.berat_kg[1]} kg)
                    </span>
                  ) : (
                    <span className="font-semibold text-teks-redup">
                      Rentang wajar: {rentangTeks('berat_kg')} kg
                    </span>
                  )}
                  <div className="text-2xs text-teks-samar">
                    Wajib untuk penentuan status gizi & grafik KMS
                  </div>
                </div>
              </div>

              {/* 2. TINGGI / PANJANG BADAN */}
              <div
                className={`flex flex-col rounded-kecil border bg-kartu p-4 transition-colors duration-200 ease-ui focus-within:border-biru-600 ${bidangSalah.includes('tinggi_cm') ? 'border-merah-700 bg-merah-100' : salahTinggi ? 'border-aksen-amber-ink bg-aksen-amber-tint' : 'border-garis'}`}
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <label htmlFor="tinggi" className="m-0 text-isi font-bold text-teks">
                    {isi.cara_ukur_tinggi === 'terlentang' ? 'Panjang badan (PB)' : 'Tinggi badan (TB)'}
                  </label>
                  <span className="rounded-kecil bg-garis px-2 py-0.5 text-2xs font-bold tracking-[0.02em] text-teks-redup">Disarankan</span>
                </div>

                <div className="wadah-satuan">
                  <input
                    id="tinggi"
                name="tinggi_cm"

                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Contoh: 74.0"
                    value={isi.tinggi_cm}
                    onChange={(e) => ubah('tinggi_cm', e.target.value)}
                    aria-describedby="bantuan-tinggi"
                    aria-invalid={bidangSalah.includes('tinggi_cm') || salahTinggi}
                  />
                  <span className="satuan">cm</span>
                </div>

                <div className="mt-2.5 flex flex-col gap-1 text-padat leading-snug" id="bantuan-tinggi">
                  {salahTinggi ? (
                    <span className="flex items-center gap-1 font-bold text-kuning-800">
                      <Ikon nama="peringatan" ukuran={14} />
                      Di luar rentang ({RENTANG.tinggi_cm[0]}–{RENTANG.tinggi_cm[1]} cm)
                    </span>
                  ) : (
                    <span className="font-semibold text-teks-redup">
                      Rentang wajar: {rentangTeks('tinggi_cm')} cm
                    </span>
                  )}
                </div>

                {/* Cara Ukur Tinggi terintegrasi langsung di bawah input tinggi */}
                <div className="mt-3 border-t border-dashed border-garis-kuat pt-3.5">
                  <div className="mb-2 flex items-center justify-between text-padat font-semibold text-teks-redup">
                    <span>Posisi saat diukur:</span>
                    {usia !== null && usia >= 0 && (
                      <span className="rounded-mikro bg-biru-100 px-1.5 py-0.5 text-2xs font-bold text-biru-700">
                        {usia < 24 ? 'Disarankan < 2 thn' : 'Disarankan ≥ 2 thn'}
                      </span>
                    )}
                  </div>
                  <div
                    className="segmen [&>button]:min-h-10 [&>button]:px-2 [&>button]:text-padat [&>button]:font-semibold max-sempit:[&>button]:min-h-12"
                    role="group"
                    aria-label="Cara ukur tinggi"
                    style={{ '--segmen-jumlah': '2', '--segmen-posisi': isi.cara_ukur_tinggi === 'berdiri' ? '1' : '0' }}
                  >
                    <button
                      type="button"
                      className={isi.cara_ukur_tinggi === 'terlentang' ? 'aktif' : ''}
                      aria-pressed={isi.cara_ukur_tinggi === 'terlentang'}
                      onClick={() => ubah('cara_ukur_tinggi', 'terlentang')}
                      title="Panjang Badan (PB) posisi telentang: standar balita usia < 2 tahun"
                    >
                      Terlentang (PB)
                    </button>
                    <button
                      type="button"
                      className={isi.cara_ukur_tinggi === 'berdiri' ? 'aktif' : ''}
                      aria-pressed={isi.cara_ukur_tinggi === 'berdiri'}
                      onClick={() => ubah('cara_ukur_tinggi', 'berdiri')}
                      title="Tinggi Badan (TB) posisi berdiri: standar balita usia ≥ 2 tahun"
                    >
                      Berdiri (TB)
                    </button>
                  </div>
                  <div className="mt-1.5 text-2xs leading-snug text-teks-samar">
                    {isi.cara_ukur_tinggi === 'terlentang'
                      ? 'Posisi telentang (infantometer) untuk panjang badan.'
                      : 'Posisi berdiri tegak (stadiometer) untuk tinggi badan.'}
                  </div>
                </div>
              </div>

              {/* 3. LINGKAR KEPALA */}
              <div
                className={`flex flex-col rounded-kecil border bg-kartu p-4 transition-colors duration-200 ease-ui focus-within:border-biru-600 ${bidangSalah.includes('lingkar_kepala_cm') ? 'border-merah-700 bg-merah-100' : salahKepala ? 'border-aksen-amber-ink bg-aksen-amber-tint' : 'border-garis'}`}
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <label htmlFor="kepala" className="m-0 text-isi font-bold text-teks">
                    Lingkar kepala
                  </label>
                  <span className="rounded-kecil bg-garis px-2 py-0.5 text-2xs font-bold tracking-[0.02em] text-teks-redup">Opsional</span>
                </div>

                <div className="wadah-satuan">
                  <input
                    id="kepala"
                name="lingkar_kepala_cm"

                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Contoh: 44.5"
                    value={isi.lingkar_kepala_cm}
                    onChange={(e) => ubah('lingkar_kepala_cm', e.target.value)}
                    aria-describedby="bantuan-kepala"
                    aria-invalid={bidangSalah.includes('lingkar_kepala_cm') || salahKepala}
                  />
                  <span className="satuan">cm</span>
                </div>

                <div className="mt-2.5 flex flex-col gap-1 text-padat leading-snug" id="bantuan-kepala">
                  {salahKepala ? (
                    <span className="flex items-center gap-1 font-bold text-kuning-800">
                      <Ikon nama="peringatan" ukuran={14} />
                      Di luar rentang ({RENTANG.lingkar_kepala_cm[0]}–{RENTANG.lingkar_kepala_cm[1]} cm)
                    </span>
                  ) : (
                    <span className="font-semibold text-teks-redup">
                      Rentang wajar: {rentangTeks('lingkar_kepala_cm')} cm
                    </span>
                  )}
                  <div className="text-2xs text-teks-samar">
                    Diukur pita melingkari dahi & bagian belakang kepala
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {isi.status_kehadiran === 'tidak_hadir' && (
          <div className="mb-3 flex items-start gap-2 rounded-kecil border px-3 py-3 text-isi font-semibold leading-snug border-garis bg-biru-100 text-biru-800" role="status">
            <Ikon nama="info" ukuran={18} />
            <span>Tidak hadir: kunjungan disimpan tanpa hasil ukur.</span>
          </div>
        )}

        <section className="mb-6 border-t border-garis pt-4 [&:first-of-type]:border-t-0 [&:first-of-type]:pt-0">
          <div className="kartu-judul">
            <h2>3. Catatan</h2>
            <span className="text-padat text-teks-samar">Opsional</span>
          </div>
          <div className="bidang">
            <label htmlFor="catatan">Catatan kunjungan</label>
            <textarea
              id="catatan"
              rows={3}
              value={isi.catatan}
              onChange={(e) => ubah('catatan', e.target.value)}
              placeholder="cth. Batuk ringan, anak aktif, sudah diberi edukasi gizi"
            />
          </div>
        </section>

        <button type="submit" className="lebar besar" disabled={mengirim}>
          <Ikon nama="simpan" ukuran={19} />
          {mengirim ? 'Menyimpan…' : 'Simpan kunjungan'}
        </button>
      </form>
    </Layar>
  )
}
