import { useEffect, useState } from 'react'
import {
  buatKontenPublik,
  daftarSemuaKontenPublik,
  daftarSemuaPosyandu,
  hapusKontenPublik,
  putuskanKontenPublik,
  ubahKontenPublik,
} from '../jaringan/api.js'
import Ikon from './Ikon.jsx'
import { Modal, Layar, bukaPemilih } from './Bersama.jsx'
import { RincianKonten, LencanaStatus, TabelKonten } from './KontenTabel.jsx'
import {
  SKEMA,
  URUT_JENIS,
  bidangKurang,
  formatJadwal,
  gabungRentang,
  gabungTanggalJam,
  kosong,
  muatanDari,
  pecahRentang,
  pecahTanggalJam,
} from '../logika/konten-skema.js'

/** Bidang tambahan khusus jenis konten yang dipilih. */
function BidangJenis({ nilai, ubah, idAwal, daftarPosyandu = [], kader = false }) {
  const bidang = SKEMA[nilai.jenis]?.bidang ?? []
  if (!bidang.length) return null
  return bidang.map((b) => {
    const id = `${idAwal}-${b.kunci}`
    const wajib = b.wajib ? <span className="wajib" aria-hidden="true">*</span> : (
      <span className="text-padat text-teks-samar">(opsional)</span>
    )

    if (b.tipe === 'posyandu') {
      // Kader sudah terikat satu Posyandu; tidak boleh memilih yang lain.
      if (kader) return null
      return (
        <div key={b.kunci} className="bidang flex flex-col">
          <label htmlFor={id}>
            <span>{b.label}</span>
            {wajib}
          </label>
          <select
            id={id}
            value={nilai[b.kunci] ?? ''}
            onChange={(e) => ubah(b.kunci, e.target.value)}
            required={b.wajib}
          >
            <option value="">Pilih Posyandu…</option>
            {daftarPosyandu.map((p) => (
              <option key={p.id} value={p.id}>{p.nama}</option>
            ))}
          </select>
          <span className="mt-1 text-2xs text-teks-samar">
            Jadwal ini akan tampil pada kartu lokasi Posyandu di kanal publik.
          </span>
        </div>
      )
    }

    if (b.tipe === 'tanggal-jam' || b.tipe === 'rentang') {
      const jam = b.tipe === 'tanggal-jam'
      const { a, bb } = jam
        ? (() => { const p = pecahTanggalJam(nilai[b.kunci] ?? ''); return { a: p.tanggal, bb: p.jam } })()
        : (() => { const p = pecahRentang(nilai[b.kunci] ?? ''); return { a: p.mulai, bb: p.akhir } })()
      const gabung = (x, y) => (jam ? gabungTanggalJam(x, y) : gabungRentang(x, y))
      return (
        <fieldset key={b.kunci} className="bidang m-0 flex flex-col border-0 p-0">
          <legend className="label-bidang p-0">
            {b.label}
            {wajib}
          </legend>
          <div className="grid grid-cols-2 gap-2 max-sempit:grid-cols-1">
            <input
              id={`${id}-a`}
              type="date"
              required={b.wajib}
              max={jam ? undefined : bb || undefined}
              value={a}
              onClick={bukaPemilih}
              onChange={(e) => ubah(b.kunci, gabung(e.target.value, bb))}
              aria-label={jam ? 'Tanggal' : 'Tanggal mulai'}
            />
            <input
              id={`${id}-b`}
              type={jam ? 'time' : 'date'}
              min={jam ? undefined : a || undefined}
              value={bb}
              onClick={bukaPemilih}
              onChange={(e) => ubah(b.kunci, gabung(a, e.target.value))}
              aria-label={jam ? 'Jam mulai' : 'Tanggal akhir'}
            />
          </div>
          <span className="mt-1 text-2xs text-teks-samar">
            {jam ? 'Jam boleh dikosongkan.' : 'Kosongkan akhir bila berlaku sampai dicabut.'}
          </span>
        </fieldset>
      )
    }

    return (
      <div key={b.kunci} className="bidang flex flex-col">
        <label htmlFor={id}>
          <span>{b.label}</span>
          {wajib}
        </label>
        <input
          id={id}
          placeholder={b.placeholder}
          value={nilai[b.kunci] ?? ''}
          onChange={(e) => ubah(b.kunci, e.target.value)}
          required={b.wajib}
        />
      </div>
    )
  })
}

/** Pilih jenis konten; kader terkunci pada jadwal. */
function PilihJenis({ nilai, onUbah, terkunci, id }) {
  return (
    <div className="bidang flex flex-col">
      <label htmlFor={id}>
        <span>Jenis konten</span>
        <span className="wajib" aria-hidden="true">*</span>
      </label>
      <select
        id={id}
        value={nilai}
        onChange={(e) => onUbah(e.target.value)}
        disabled={terkunci}
        required
      >
        {URUT_JENIS.filter((j) => !terkunci || j === 'jadwal').map((j) => (
          <option key={j} value={j}>
            {SKEMA[j].label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function KelolaKonten({ sesi }) {
  const peran = sesi?.pengguna?.peran ?? 'kader'
  const kader = peran === 'kader'
  const nakes = peran === 'nakes'
  const admin = peran === 'admin_desa'

  const [daftar, setDaftar] = useState([])
  const [daftarPos, setDaftarPos] = useState([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState(null)
  const [pesan, setPesan] = useState(null)
  const [isi, setIsi] = useState(() => kosong('jadwal'))
  const [sunting, setSunting] = useState(null)
  const [hapusUntuk, setHapusUntuk] = useState(null)
  const [putuskanUntuk, setPutuskanUntuk] = useState(null)
  const [keputusan, setKeputusan] = useState('disetujui')
  const [catatanTinjau, setCatatanTinjau] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)

  async function muat() {
    setMemuat(true)
    setGalat(null)
    try {
      const [res, resPos] = await Promise.all([
        daftarSemuaKontenPublik(),
        // Pilihan Posyandu hanya dipakai form admin. Kader sudah terikat
        // akunnya, nakes tidak membuat konten; keduanya tidak boleh memanggil
        // /posyandu/semua yang khusus admin. Memanggilnya membuat Promise.all
        // gagal 403 dan seluruh layar menampilkan galat "tidak_diizinkan".
        admin ? daftarSemuaPosyandu() : Promise.resolve({ posyandu: [] }),
      ])
      setDaftar(res.konten ?? [])
      setDaftarPos(resPos.posyandu ?? [])
    } catch (salah) {
      setGalat(salah.rincian ?? 'Gagal memuat daftar konten. Periksa koneksi ke server.')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => {
    muat()
  }, [])

  const perJenis = Object.fromEntries(URUT_JENIS.map((j) => [j, daftar.filter((k) => k.jenis === j)]))
  // Kader dan nakes hanya berurusan dengan jadwal Posyandu; konten jenis lain
  // milik admin desa, jadi tidak ditampilkan sama sekali bagi mereka.
  const jenisTampil = kader || nakes ? ['jadwal'] : URUT_JENIS
  const antrean = perJenis.jadwal.filter((k) => k.status_persetujuan === 'menunggu')
  const skemaForm = SKEMA[isi.jenis]
  // Kader tidak memilih Posyandu: server mengisinya dari akun. Field itu
  // tidak dirender, jangan divalidasi dan jangan dikirim sebagai null.
  const abaikan = kader ? ['posyandu_id'] : []

  async function tambah(e) {
    e.preventDefault()
    setGalat(null)
    setPesan(null)
    const kurang = bidangKurang(isi, { abaikan })
    if (kurang.length) {
      setGalat(`Lengkapi dulu: ${kurang.join(', ')}.`)
      return
    }
    setMenyimpan(true)
    try {
      const hasil = await buatKontenPublik(muatanDari(isi, { abaikan }))
      setIsi(kosong(kader ? 'jadwal' : isi.jenis))
      setPesan(
        hasil.status_persetujuan === 'menunggu'
          ? `Jadwal "${hasil.judul}" diajukan. Menunggu persetujuan petugas kesehatan.`
          : `${SKEMA[hasil.jenis].label} "${hasil.judul}" diterbitkan.`,
      )
      await muat()
    } catch (salah) {
      setGalat(salah.rincian || salah.message || 'Gagal menyimpan konten.')
    } finally {
      setMenyimpan(false)
    }
  }

  async function simpanSunting(e) {
    e.preventDefault()
    if (!sunting) return
    setGalat(null)
    setPesan(null)
    const kurang = bidangKurang(sunting, { abaikan })
    if (kurang.length) {
      setGalat(`Lengkapi dulu: ${kurang.join(', ')}.`)
      return
    }
    setMenyimpan(true)
    try {
      const hasil = await ubahKontenPublik(sunting.id, muatanDari(sunting, { abaikan }))
      setPesan(
        hasil.status_persetujuan === 'menunggu'
          ? `Perubahan "${hasil.judul}" diajukan ulang untuk persetujuan nakes.`
          : `"${hasil.judul}" diperbarui.`,
      )
      setSunting(null)
      await muat()
    } catch (salah) {
      setGalat(salah.rincian || salah.message || 'Gagal menyimpan perubahan.')
    } finally {
      setMenyimpan(false)
    }
  }

  async function eksekusiHapus(id) {
    setGalat(null)
    setPesan(null)
    try {
      await hapusKontenPublik(id)
      setPesan('Konten dihapus.')
      setHapusUntuk(null)
      await muat()
    } catch (salah) {
      setGalat(salah.rincian || salah.message || 'Gagal menghapus konten.')
    }
  }

  async function simpanKeputusan(e) {
    e.preventDefault()
    if (!putuskanUntuk) return
    if (keputusan === 'ditolak' && !catatanTinjau.trim()) {
      setGalat('Alasan penolakan wajib diisi agar kader tahu yang perlu diperbaiki.')
      return
    }
    setGalat(null)
    setPesan(null)
    setMenyimpan(true)
    try {
      await putuskanKontenPublik(putuskanUntuk.id, keputusan, catatanTinjau.trim() || null)
      setPesan(
        keputusan === 'disetujui'
          ? `Jadwal "${putuskanUntuk.judul}" disetujui dan tayang di kanal publik.`
          : `Jadwal "${putuskanUntuk.judul}" ditolak; kader dapat memperbaiki dan mengajukan ulang.`,
      )
      setPutuskanUntuk(null)
      setCatatanTinjau('')
      await muat()
    } catch (salah) {
      setGalat(salah.rincian || salah.message || 'Gagal menyimpan keputusan.')
    } finally {
      setMenyimpan(false)
    }
  }

  function bukaPutuskan(k) {
    setPutuskanUntuk(k)
    setKeputusan('disetujui')
    setCatatanTinjau('')
    // Galat lama milik aksi sebelumnya; dialog baru mulai dari keadaan bersih.
    setGalat(null)
  }

  const aksiTabel = { putuskan: bukaPutuskan, sunting: setSunting, hapus: setHapusUntuk }

  return (
    <Layar>
      <div className="kepala-layar mb-4 flex items-start justify-between gap-4">
        <div>
          <h1>{kader || nakes ? 'Jadwal Posyandu' : 'Konten Publik'}</h1>
          <p className="mt-1 mb-0 text-isi text-teks-redup">
            {kader
              ? 'Ajukan jadwal Posyandu dusunmu; petugas kesehatan memeriksa sebelum tayang.'
              : nakes
                ? 'Periksa dan setujui jadwal yang diajukan kader sebelum tampil di kanal publik.'
                : 'Setiap jenis konten punya tabelnya sendiri. Admin dapat menyunting atau memutuskan bila kader/nakes berhalangan.'}
          </p>
        </div>
        <button type="button" className="sekunder" onClick={muat}>
          <Ikon nama="sinkron" ukuran={18} />
          Muat ulang
        </button>
      </div>

      {galat && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border border-merah-100 bg-merah-100 px-3 py-3 text-isi font-semibold leading-snug text-merah-800" role="alert">
          <Ikon nama="peringatan" ukuran={19} />
          <span>{galat}</span>
        </div>
      )}
      {pesan && (
        <div className="mb-3 flex items-start gap-2 rounded-kecil border border-hijau-100 bg-hijau-100 px-3 py-3 text-isi font-semibold leading-snug text-hijau-800" role="status">
          <Ikon nama="cek" ukuran={19} />
          <span>{pesan}</span>
        </div>
      )}

      {/* Form. Nakes tidak membuat konten. */}
      {!nakes && (
        <form className="kartu mb-6 p-5 max-sempit:p-4" onSubmit={tambah}>
          <div className="kepala-akun mb-5 flex items-center gap-3 max-sempit:mb-4">
            <span className="grid size-[42px] shrink-0 place-items-center rounded-kecil border border-biru-100 bg-biru-50 text-biru-700 max-sempit:size-[38px]">
              <Ikon nama={skemaForm.ikon} ukuran={20} />
            </span>
            <div>
              <h2 className="m-0 leading-tight">
                {kader ? 'Ajukan Jadwal Posyandu' : `Tambah ${skemaForm.label}`}
              </h2>
              <p className="mt-1 mb-0 text-padat text-teks-redup">
                {kader
                  ? 'Jadwal belum tampil ke warga sampai disetujui petugas kesehatan.'
                  : skemaForm.ket}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 items-start gap-x-4 gap-y-4 max-sempit:grid-cols-1">
            <PilihJenis
              id="k-jenis"
              nilai={isi.jenis}
              terkunci={kader}
              onUbah={(j) => setIsi((lama) => ({ ...kosong(j), judul: lama.judul, isi: lama.isi }))}
            />

            <div className="bidang flex flex-col">
              <label htmlFor="k-judul">
                <span>Judul</span>
                <span className="wajib" aria-hidden="true">*</span>
              </label>
              <input
                id="k-judul"
                name="judul"

                placeholder={skemaForm.judul}
                value={isi.judul}
                onChange={(e) => setIsi({ ...isi, judul: e.target.value })}
                required
              />
            </div>

            <div className="bidang col-span-2 flex flex-col max-sempit:col-span-1">
              <label htmlFor="k-isi">
                <span>Isi / keterangan</span>
                <span className="wajib" aria-hidden="true">*</span>
              </label>
              <textarea
                id="k-isi"
                rows={3}
                placeholder={skemaForm.isi}
                value={isi.isi}
                onChange={(e) => setIsi({ ...isi, isi: e.target.value })}
                required
              />
            </div>

            <BidangJenis
              nilai={isi}
              ubah={(k, v) => setIsi({ ...isi, [k]: v })}
              idAwal="k"
              daftarPosyandu={daftarPos}
              kader={kader}
            />

            <div className="col-span-2 flex flex-wrap items-center gap-6 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-padat font-medium text-teks">
                <input
                  type="checkbox"
                  checked={isi.penting}
                  onChange={(e) => setIsi({ ...isi, penting: e.target.checked })}
                  className="size-4"
                />
                <span>Tandai <strong>penting</strong> (disorot di kanal publik)</span>
              </label>
              {!kader && isi.jenis !== 'jadwal' && (
                <label className="flex cursor-pointer items-center gap-2 text-padat font-medium text-teks">
                  <input
                    type="checkbox"
                    checked={isi.aktif}
                    onChange={(e) => setIsi({ ...isi, aktif: e.target.checked })}
                    className="size-4"
                  />
                  <span>Langsung tayang (bukan draf)</span>
                </label>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-garis pt-4 max-sempit:[&>button]:w-full">
            <button type="submit" disabled={menyimpan}>
              <Ikon nama={kader ? 'kirim' : 'tambah'} ukuran={18} />
              <span>{menyimpan ? 'Menyimpan…' : kader ? 'Ajukan untuk Disetujui' : `Terbitkan ${skemaForm.label}`}</span>
            </button>
          </div>
        </form>
      )}

      {/* Nakes: antrean persetujuan lebih dulu. */}
      {nakes && antrean.length > 0 && (
        <section className="kartu mb-6 border-kuning-100 bg-kuning-100/40" aria-labelledby="judul-antrean">
          <div className="kartu-judul">
            <h2 id="judul-antrean">Antrean Persetujuan Jadwal</h2>
            <span className="lencana nonaktif">{antrean.length} menunggu</span>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0">
            {antrean.map((k) => (
              <li key={k.id} className="rounded-kecil border border-garis bg-kartu p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <strong className="block text-teks">{k.judul}</strong>
                    <p className="mt-1 mb-0 text-padat leading-relaxed text-teks-redup">{k.isi}</p>
                    <p className="mt-1.5 mb-0 text-2xs text-teks-samar">
                      {[formatJadwal(k.tanggal), k.kategori, k.posyandu_nama, k.pengaju_nama && `Diajukan ${k.pengaju_nama}`]
                        .filter(Boolean)
                        .join(' · ') || 'Tanpa keterangan tambahan'}
                    </p>
                  </div>
                  <button type="button" onClick={() => bukaPutuskan(k)}>
                    <Ikon nama="cek" ukuran={18} />
                    Periksa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Satu tabel per jenis konten. */}
      <div className="flex flex-col gap-5">
        {jenisTampil.map((jenis) => {
          const skema = SKEMA[jenis]
          const baris = perJenis[jenis]
          const menunggu = baris.filter((k) => k.status_persetujuan === 'menunggu').length
          return (
            <section key={jenis} className="kartu" aria-labelledby={`tabel-${jenis}`}>
              <div className="kartu-judul flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-kecil bg-biru-100 text-biru-800">
                    <Ikon nama={skema.ikon} ukuran={17} />
                  </span>
                  <div>
                    <h2 id={`tabel-${jenis}`}>{skema.label}</h2>
                    <p className="mt-0.5 mb-0 text-padat text-teks-redup">{skema.ket}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {menunggu > 0 && (
                    <span className="lencana border border-kuning-100 bg-kuning-100 text-kuning-800">
                      {menunggu} menunggu
                    </span>
                  )}
                  <span className="text-padat text-teks-samar">
                    {memuat ? 'Memuat…' : `${baris.length} konten`}
                  </span>
                </div>
              </div>
              {memuat ? (
                <p className="m-0 px-4 py-6 text-center text-isi text-teks-samar">Memuat…</p>
              ) : (
                <TabelKonten jenis={jenis} daftar={baris} peran={peran} aksi={tabelAksi(jenis)} />
              )}
            </section>
          )
        })}
      </div>

      {/* Konfirmasi hapus */}
      {hapusUntuk && (
        <Modal judul="Hapus konten?" subjudul={hapusUntuk.judul} onTutup={() => setHapusUntuk(null)}>
          <div className="flex flex-col gap-4 p-4">
            <p className="m-0 text-isi leading-relaxed text-teks-redup">
              Konten <strong>{hapusUntuk.judul}</strong> tidak akan tampil lagi di kanal publik. Data
              tetap tersimpan sebagai arsip di server.
            </p>
            <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setHapusUntuk(null)}>
                Batal
              </button>
              <button type="button" className="bahaya" onClick={() => eksekusiHapus(hapusUntuk.id)}>
                Ya, hapus
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Keputusan nakes/admin */}
      {putuskanUntuk && (
        <Modal
          judul="Periksa Jadwal Posyandu"
          subjudul={putuskanUntuk.judul}
          onTutup={() => setPutuskanUntuk(null)}
        >
          <form onSubmit={simpanKeputusan} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-4 overflow-y-auto p-4">
              <RincianKonten konten={putuskanUntuk} />

              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-1 text-padat font-semibold text-teks">Keputusan</legend>
                {[
                  {
                    nilai: 'disetujui',
                    ikon: 'centang',
                    judul: 'Setujui dan tayangkan',
                    ket: 'Jadwal langsung muncul di kanal publik.',
                  },
                  {
                    nilai: 'ditolak',
                    ikon: 'tutup',
                    judul: 'Tolak, kader perlu memperbaiki',
                    ket: 'Jadwal dikembalikan ke kader dengan catatan Anda.',
                  },
                ].map((p) => {
                  const aktif = keputusan === p.nilai
                  return (
                    <label
                      key={p.nilai}
                      className={`flex cursor-pointer items-start gap-3 rounded-kecil border p-3 transition-colors ${
                        aktif
                          ? 'border-biru-700 bg-biru-50'
                          : 'border-garis bg-kartu hover:border-garis-kuat'
                      }`}
                    >
                      <input
                        type="radio"
                        name="keputusan"
                        value={p.nilai}
                        checked={aktif}
                        onChange={() => setKeputusan(p.nilai)}
                        className="mt-0.5"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className={`flex items-center gap-1.5 text-isi font-semibold ${aktif ? 'text-biru-900' : 'text-teks'}`}>
                          <Ikon nama={p.ikon} ukuran={15} />
                          {p.judul}
                        </span>
                        <span className="text-padat leading-snug text-teks-redup">{p.ket}</span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>

              <div className="bidang flex flex-col">
                <label htmlFor="catatan-tinjau">
                  <span>Catatan untuk kader</span>
                  {keputusan === 'ditolak' && <span className="wajib" aria-hidden="true">*</span>}
                </label>
                <textarea
                  id="catatan-tinjau"
                  rows={3}
                  placeholder={
                    keputusan === 'ditolak'
                      ? 'cth. Bentrok dengan jadwal imunisasi Puskesmas; mohon ganti pekan.'
                      : 'Catatan tambahan (opsional).'
                  }
                  value={catatanTinjau}
                  onChange={(e) => setCatatanTinjau(e.target.value)}
                  required={keputusan === 'ditolak'}
                />
              </div>

              {galat && (
                <p className="m-0 flex items-start gap-2 rounded-kecil border border-merah-100 bg-merah-100 px-3 py-2.5 text-padat font-semibold leading-snug text-merah-800" role="alert">
                  <Ikon nama="peringatan" ukuran={17} />
                  <span>{galat}</span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
              <button type="button" className="sekunder" onClick={() => setPutuskanUntuk(null)}>
                Batal
              </button>
              <button type="submit" disabled={menyimpan}>
                <Ikon nama="simpan" ukuran={18} />
                <span>{menyimpan ? 'Menyimpan…' : 'Simpan keputusan'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Sunting: bidang mengikuti jenis konten yang dipilih. */}
      {sunting && (
        <Modal
          judul={`Sunting ${SKEMA[sunting.jenis].label}`}
          subjudul={sunting.judul}
          onTutup={() => setSunting(null)}
        >
          <form onSubmit={simpanSunting} className="flex flex-col gap-4 p-4">
            <div className="grid grid-cols-2 items-start gap-x-4 gap-y-4 max-sempit:grid-cols-1">
              <PilihJenis
                id="s-jenis"
                nilai={sunting.jenis}
                terkunci={kader}
                onUbah={(j) => setSunting((lama) => ({ ...kosong(j), id: lama.id, judul: lama.judul, isi: lama.isi, status_persetujuan: lama.status_persetujuan }))}
              />

              <div className="bidang flex flex-col">
                <label htmlFor="s-judul">
                  <span>Judul</span>
                  <span className="wajib" aria-hidden="true">*</span>
                </label>
                <input
                  id="s-judul"
                name="judul"

                  value={sunting.judul}
                  onChange={(e) => setSunting({ ...sunting, judul: e.target.value })}
                  required
                />
              </div>

              <div className="bidang col-span-2 flex flex-col max-sempit:col-span-1">
                <label htmlFor="s-isi">
                  <span>Isi / keterangan</span>
                  <span className="wajib" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="s-isi"
                  rows={4}
                  value={sunting.isi}
                  onChange={(e) => setSunting({ ...sunting, isi: e.target.value })}
                  required
                />
              </div>

              <BidangJenis
                nilai={sunting}
                ubah={(k, v) => setSunting({ ...sunting, [k]: v })}
                idAwal="s"
                daftarPosyandu={daftarPos}
                kader={kader}
              />

              <div className="col-span-2 flex flex-wrap items-center gap-6 pt-1">
                <label className="flex cursor-pointer items-center gap-2 text-padat font-medium text-teks">
                  <input
                    type="checkbox"
                    checked={Boolean(sunting.penting)}
                    onChange={(e) => setSunting({ ...sunting, penting: e.target.checked })}
                    className="size-4"
                  />
                  <span>Tandai <strong>penting</strong></span>
                </label>
                {!kader && sunting.jenis !== 'jadwal' && (
                  <label className="flex cursor-pointer items-center gap-2 text-padat font-medium text-teks">
                    <input
                      type="checkbox"
                      checked={sunting.aktif !== false}
                      onChange={(e) => setSunting({ ...sunting, aktif: e.target.checked })}
                      className="size-4"
                    />
                    <span>Tayang di publik</span>
                  </label>
                )}
              </div>

              {sunting.status_persetujuan && (
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <LencanaStatus status={sunting.status_persetujuan} />
                  {kader && sunting.status_persetujuan !== 'menunggu' && (
                    <p className="m-0 text-2xs leading-normal text-kuning-800">
                      Menyimpan perubahan akan mengajukan jadwal ini ulang untuk diperiksa nakes.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-garis bg-biru-50 p-4 max-dialog:flex-col-reverse max-dialog:gap-2 max-dialog:[&>button]:w-full">
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
    </Layar>
  )

  /** Aksi tabel dibatasi per jenis: hanya jadwal yang bisa diputuskan. */
  function tabelAksi(jenis) {
    if (nakes && jenis !== 'jadwal') return null
    return aksiTabel
  }
}
