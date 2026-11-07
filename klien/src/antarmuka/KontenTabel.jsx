import Ikon from './Ikon.jsx'
import { LENCANA_STATUS, SKEMA, nilaiTampil } from '../logika/konten-skema.js'

/** Lencana status persetujuan; satu tempat agar warna, ikon & teks konsisten. */
export function LencanaStatus({ status, aktif }) {
  const l = LENCANA_STATUS[status] ?? LENCANA_STATUS.menunggu
  return (
    <div className="flex flex-col gap-1">
      <span className={`lencana border ${l.kelas}`}>
        <Ikon nama={l.ikon} ukuran={12} />
        {l.teks}
      </span>
      {aktif !== undefined && (
        <span className="text-2xs text-teks-samar">{aktif ? 'Tayang' : 'Tidak tayang'}</span>
      )}
    </div>
  )
}

/**
 * Rincian jadwal untuk melihat, bukan menyunting: pasangan label–nilai.
 * Urutannya tetap (tanggal, kategori, posyandu, pengaju) supaya mata kader
 * dan nakes tidak perlu mencari ulang.
 */
export function RincianKonten({ konten }) {
  const bidang = (SKEMA[konten.jenis]?.bidang ?? []).filter((b) => !b.hanyaForm)
  const baris = [
    ...bidang.map((b) => [b.label, nilaiTampil(b, konten)]),
    ['Posyandu', konten.posyandu_nama],
    ['Diajukan oleh', konten.pengaju_nama],
  ].filter(([, v]) => v)

  return (
    <dl className="m-0 grid gap-2 rounded-kecil border border-garis bg-latar p-3.5 text-padat">
      {baris.map(([label, nilai]) => (
        <div key={label} className="flex flex-wrap gap-x-2 max-sempit:flex-col">
          <dt className="w-32 shrink-0 font-semibold text-teks-redup max-sempit:w-auto">{label}</dt>
          <dd className="m-0 min-w-0 flex-1 font-medium text-teks">{nilai}</dd>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-2 max-sempit:flex-col">
        <dt className="w-32 shrink-0 font-semibold text-teks-redup max-sempit:w-auto">Rincian</dt>
        <dd className="m-0 min-w-0 flex-1 leading-relaxed">{konten.isi}</dd>
      </div>
      {konten.catatan_peninjau && (
        <div className="flex flex-wrap gap-x-2 rounded-kecil border border-merah-100 bg-merah-100 px-2.5 py-2 text-merah-800 max-sempit:flex-col">
          <dt className="w-32 shrink-0 font-semibold max-sempit:w-auto">Catatan peninjau</dt>
          <dd className="m-0 min-w-0 flex-1">{konten.catatan_peninjau}</dd>
        </div>
      )}
    </dl>
  )
}

/**
 * Tabel satu jenis konten. Dipisah per jenis supaya banyaknya kolom mengikuti
 * bidang jenis itu (jadwal punya waktu, layanan punya sasaran, dst.) dan tidak
 * ada kolom kosong berulang di setiap baris.
 */
export function TabelKonten({ jenis, daftar, peran, aksi }) {
  const kader = peran === 'kader'
  const nakes = peran === 'nakes'
  const skema = SKEMA[jenis]
  const tampilAksi = aksi && (nakes ? jenis === 'jadwal' : true)

  if (daftar.length === 0) {
    return (
      <p className="m-0 px-4 py-6 text-center text-isi text-teks-samar">
        Belum ada konten jenis ini.
      </p>
    )
  }

  return (
    <div className="tabel-bungkus">
      <table className="tabel tabel-kartu tabel-aksi">
        <thead>
          <tr>
            <th>Judul & rincian</th>
            {skema.bidang.filter((b) => !b.hanyaForm).map((b) => (
              <th key={b.kunci}>{b.label}</th>
            ))}
            {jenis === 'jadwal' && <th>Asal</th>}
            <th>Status</th>
            {tampilAksi && <th aria-label="Tindakan" />}
          </tr>
        </thead>
        <tbody>
          {daftar.map((k) => (
            <tr key={k.id}>
              <td data-label="Judul & rincian">
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-teks">{k.judul}</strong>
                    {k.penting && (
                      <span className="rounded-kecil bg-aksen-teal-tint px-1.5 py-0.5 text-2xs font-bold uppercase tracking-[0.075em] text-aksen-teal-ink">
                        Penting
                      </span>
                    )}
                  </div>
                  <p className="m-0 line-clamp-2 text-padat text-teks-redup">{k.isi}</p>
                </div>
              </td>
              {skema.bidang.filter((b) => !b.hanyaForm).map((b) => (
                <td key={b.kunci} data-label={b.label}>
                  <span className="text-padat text-teks-redup">{nilaiTampil(b, k) || '-'}</span>
                </td>
              ))}
              {jenis === 'jadwal' && (
                <td data-label="Asal">
                  <div className="text-padat text-teks-redup">
                    <div>{k.posyandu_nama || '-'}</div>
                    <div className="text-teks-samar">
                      {k.pengaju_peran === 'kader' ? 'Kader' : k.pengaju_peran === 'admin_desa' ? 'Admin' : '-'}
                      {k.pengaju_nama ? ` · ${k.pengaju_nama}` : ''}
                    </div>
                  </div>
                </td>
              )}
              <td data-label="Status">
                <LencanaStatus status={k.status_persetujuan} aktif={!kader && jenis !== 'jadwal' ? k.aktif : undefined} />
                {kader && k.catatan_peninjau && (
                  <p className="m-0 mt-1 max-w-[26ch] text-2xs leading-normal text-merah-700">
                    {k.catatan_peninjau}
                  </p>
                )}
              </td>
              {tampilAksi && (
                <td className="sel-aksi">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {k.status_persetujuan === 'menunggu' && !kader && jenis === 'jadwal' && (
                      <button type="button" onClick={() => aksi.putuskan(k)}>
                        <Ikon nama="cek" ukuran={17} />
                        Periksa
                      </button>
                    )}
                    {!nakes && (
                      <button
                        type="button"
                        className="sekunder"
                        onClick={() => aksi.sunting(k)}
                        aria-label={`Sunting ${k.judul}`}
                      >
                        Sunting
                      </button>
                    )}
                    {!nakes && (
                      <button
                        type="button"
                        className="bahaya"
                        onClick={() => aksi.hapus(k)}
                        aria-label={`Hapus ${k.judul}`}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
