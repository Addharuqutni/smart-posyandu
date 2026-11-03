import { useEffect, useState } from 'react'
import { db } from '../penyimpanan/db.js'
import { simpanKunjungan, hapusKunjungan } from '../penyimpanan/kunjungan.js'
import { usiaBulan, tanggalHariIni } from '../logika/waktu.js'
import { LABEL, RENTANG, periksaRentang } from '../logika/rentang.js'
import Ikon from './Ikon.jsx'
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

  useEffect(() => {
    if (balitaAwal) return
    db.balita
      .filter((b) => !b.dihapus_pada && b.aktif !== false)
      .toArray()
      .then((b) => b.sort((x, y) => x.nama_lengkap.localeCompare(y.nama_lengkap)))
      .then(setDaftar)
  }, [balitaAwal])

  function ubah(kolom, nilai) {
    setIsi((lama) => {
      const baru = { ...lama, [kolom]: nilai }
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
      const hasil = await simpanKunjungan({
        balita,
        idPerangkat: sesi.id_perangkat,
        pemilik_id: sesi.pengguna.id,
        tanggal: isi.tanggal,
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
      if (balita) localStorage.removeItem(KUNCI_DRAF + balita.id)
      setIsi({ ...AWAL, tanggal: isi.tanggal })
      setBidangSalah([])
      setelahSimpan?.()
    } catch (salahSimpan) {
      setGalat(salahSimpan.message)
    } finally {
      setMengirim(false)
    }
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
    <main className="layar" id="isi-utama">
      <div className="kepala-layar">
        <div>
          <h1>Catat kunjungan</h1>
          <p>Simpan hasil ukur hari ini. Data langsung tersimpan di tablet.</p>
        </div>
        <button type="button" className="sekunder" onClick={kembali}>
          <Ikon nama="kembali" ukuran={18} />
          Kembali
        </button>
      </div>

      {sukses && (
        <div className="pesan sukses" role="status">
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
        <div className="pesan galat" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}
      {adaDraf && !sukses && (
        <div className="pesan info" role="status">
          <Ikon nama="simpan" ukuran={18} />
          <span>Draf pengukuran sebelumnya dipulihkan dari tablet ini.</span>
        </div>
      )}

      <form onSubmit={simpan} noValidate>
        <section className="kartu">
          <div className="kartu-judul">
            <h3>1. Balita dan kunjungan</h3>
            <span className="samar">Wajib</span>
          </div>

          <div className="bidang">
            <label htmlFor="balita">
              <span>Balita</span>
              <span className="wajib" aria-hidden="true">*</span>
            </label>
            {balitaAwal ? (
              <div className="kartu kartu-warnai kartu-balita-terpilih">
                <span className="avatar avatar-balita" aria-hidden="true">
                  <Ikon nama="anak" ukuran={20} />
                </span>
                <div>
                  <strong>{balita?.nama_lengkap}</strong>
                  <div className="redup">
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
                <option value="">— pilih balita —</option>
                {daftar.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nama_lengkap}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid2">
            <div className="bidang">
              <label htmlFor="tanggal">
                <span>Tanggal kunjungan</span>
                <span className="wajib" aria-hidden="true">*</span>
              </label>
              <input
                id="tanggal"
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
              <div className="segmen" role="group" aria-labelledby="label-kehadiran">
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
          <section className="kartu kartu-hasil-ukur">
            <div className="kartu-judul">
              <div>
                <h3>2. Hasil ukur balita</h3>
                <p className="redup kartu-petunjuk-sub">
                  Catat hasil timbang dan ukur. Nilai di luar rentang wajar ditolak agar salah ukur tidak lolos diam-diam.
                </p>
              </div>
              <span className="lencana-wajib-header">Berat wajib</span>
            </div>

            <div className="grid-hasil-ukur">
              {/* 1. BERAT BADAN */}
              <div
                className={`panel-ukur ${bidangSalah.includes('berat_kg') ? 'salah-bidang' : ''} ${salahBerat ? 'peringatan-rentang' : ''}`}
              >
                <div className="panel-ukur-kepala">
                  <label htmlFor="berat" className="label-ukur">
                    Berat badan <span className="wajib">*</span>
                  </label>
                  <span className="tag-status tag-wajib">
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
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={RENTANG.berat_kg[0]}
                    max={RENTANG.berat_kg[1]}
                    placeholder="Contoh: 9.45"
                    value={isi.berat_kg}
                    onChange={(e) => ubah('berat_kg', e.target.value)}
                    aria-describedby="bantuan-berat"
                    aria-invalid={bidangSalah.includes('berat_kg') || salahBerat}
                    required
                  />
                  <span className="satuan-teks">kg</span>
                </div>

                <div className="panel-ukur-kaki" id="bantuan-berat">
                  {salahBerat ? (
                    <span className="teks-peringatan">
                      ⚠️ Di luar rentang ({RENTANG.berat_kg[0]}–{RENTANG.berat_kg[1]} kg)
                    </span>
                  ) : (
                    <span className="teks-petunjuk">
                      Rentang wajar: {rentangTeks('berat_kg')} kg
                    </span>
                  )}
                  <div className="catatan-bawah">
                    Wajib untuk penentuan status gizi & grafik KMS
                  </div>
                </div>
              </div>

              {/* 2. TINGGI / PANJANG BADAN */}
              <div
                className={`panel-ukur ${bidangSalah.includes('tinggi_cm') ? 'salah-bidang' : ''} ${salahTinggi ? 'peringatan-rentang' : ''}`}
              >
                <div className="panel-ukur-kepala">
                  <label htmlFor="tinggi" className="label-ukur">
                    {isi.cara_ukur_tinggi === 'terlentang' ? 'Panjang badan (PB)' : 'Tinggi badan (TB)'}
                  </label>
                  <span className="tag-status tag-opsional">Disarankan</span>
                </div>

                <div className="wadah-satuan">
                  <input
                    id="tinggi"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={RENTANG.tinggi_cm[0]}
                    max={RENTANG.tinggi_cm[1]}
                    placeholder="Contoh: 74.0"
                    value={isi.tinggi_cm}
                    onChange={(e) => ubah('tinggi_cm', e.target.value)}
                    aria-describedby="bantuan-tinggi"
                    aria-invalid={bidangSalah.includes('tinggi_cm') || salahTinggi}
                  />
                  <span className="satuan-teks">cm</span>
                </div>

                <div className="panel-ukur-kaki" id="bantuan-tinggi">
                  {salahTinggi ? (
                    <span className="teks-peringatan">
                      ⚠️ Di luar rentang ({RENTANG.tinggi_cm[0]}–{RENTANG.tinggi_cm[1]} cm)
                    </span>
                  ) : (
                    <span className="teks-petunjuk">
                      Rentang wajar: {rentangTeks('tinggi_cm')} cm
                    </span>
                  )}
                </div>

                {/* Cara Ukur Tinggi terintegrasi langsung di bawah input tinggi */}
                <div className="bagian-cara-ukur">
                  <div className="label-mini-cara">
                    <span>Posisi saat diukur:</span>
                    {usia !== null && usia >= 0 && (
                      <span className="rekomendasi-cara">
                        {usia < 24 ? 'Disarankan < 2 thn' : 'Disarankan ≥ 2 thn'}
                      </span>
                    )}
                  </div>
                  <div className="segmen segmen-kompak" role="group" aria-label="Cara ukur tinggi">
                    <button
                      type="button"
                      className={isi.cara_ukur_tinggi === 'terlentang' ? 'aktif' : ''}
                      aria-pressed={isi.cara_ukur_tinggi === 'terlentang'}
                      onClick={() => ubah('cara_ukur_tinggi', 'terlentang')}
                      title="Panjang Badan (PB) posisi telentang — standar balita usia < 2 tahun"
                    >
                      Terlentang (PB)
                    </button>
                    <button
                      type="button"
                      className={isi.cara_ukur_tinggi === 'berdiri' ? 'aktif' : ''}
                      aria-pressed={isi.cara_ukur_tinggi === 'berdiri'}
                      onClick={() => ubah('cara_ukur_tinggi', 'berdiri')}
                      title="Tinggi Badan (TB) posisi berdiri — standar balita usia ≥ 2 tahun"
                    >
                      Berdiri (TB)
                    </button>
                  </div>
                  <div className="keterangan-cara-ukur">
                    {isi.cara_ukur_tinggi === 'terlentang'
                      ? 'Posisi telentang (infantometer) untuk panjang badan.'
                      : 'Posisi berdiri tegak (stadiometer) untuk tinggi badan.'}
                  </div>
                </div>
              </div>

              {/* 3. LINGKAR KEPALA */}
              <div
                className={`panel-ukur ${bidangSalah.includes('lingkar_kepala_cm') ? 'salah-bidang' : ''} ${salahKepala ? 'peringatan-rentang' : ''}`}
              >
                <div className="panel-ukur-kepala">
                  <label htmlFor="kepala" className="label-ukur">
                    Lingkar kepala
                  </label>
                  <span className="tag-status tag-opsional">Opsional</span>
                </div>

                <div className="wadah-satuan">
                  <input
                    id="kepala"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={RENTANG.lingkar_kepala_cm[0]}
                    max={RENTANG.lingkar_kepala_cm[1]}
                    placeholder="Contoh: 44.5"
                    value={isi.lingkar_kepala_cm}
                    onChange={(e) => ubah('lingkar_kepala_cm', e.target.value)}
                    aria-describedby="bantuan-kepala"
                    aria-invalid={bidangSalah.includes('lingkar_kepala_cm') || salahKepala}
                  />
                  <span className="satuan-teks">cm</span>
                </div>

                <div className="panel-ukur-kaki" id="bantuan-kepala">
                  {salahKepala ? (
                    <span className="teks-peringatan">
                      ⚠️ Di luar rentang ({RENTANG.lingkar_kepala_cm[0]}–{RENTANG.lingkar_kepala_cm[1]} cm)
                    </span>
                  ) : (
                    <span className="teks-petunjuk">
                      Rentang wajar: {rentangTeks('lingkar_kepala_cm')} cm
                    </span>
                  )}
                  <div className="catatan-bawah">
                    Diukur pita melingkari dahi & bagian belakang kepala
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {isi.status_kehadiran === 'tidak_hadir' && (
          <div className="pesan info" role="status">
            <Ikon nama="info" ukuran={18} />
            <span>Tidak hadir: kunjungan disimpan tanpa hasil ukur.</span>
          </div>
        )}

        <section className="kartu">
          <div className="kartu-judul">
            <h3>3. Catatan</h3>
            <span className="samar">Opsional</span>
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
        <p className="samar teks-tengah spasi-atas-kecil">
          Status gizi dihitung server setelah data terkirim.
        </p>
      </form>
    </main>
  )
}
