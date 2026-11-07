// Uji skema konten publik: tiap jenis punya bidang sendiri, dan muatan yang
// dikirim hanya memuat bidang yang relevan bagi jenis itu.
import { describe, expect, it } from 'vitest'
import {
  SKEMA,
  URUT_JENIS,
  bidangKurang,
  blokTanggal,
  formatJadwal,
  formatRentang,
  gabungRentang,
  gabungTanggalJam,
  jadwalMendatang,
  jadwalPerPosyandu,
  kosong,
  muatanDari,
  nilaiTampil,
  pecahRentang,
  pecahTanggalJam,
  wilayahPosyandu,
} from './konten-skema.js'

describe('skema konten publik', () => {
  it('setiap jenis punya label, keterangan, dan contoh', () => {
    for (const jenis of URUT_JENIS) {
      const s = SKEMA[jenis]
      expect(s.label, jenis).toBeTruthy()
      expect(s.ket, jenis).toBeTruthy()
      expect(s.judul, jenis).toBeTruthy()
      expect(s.isi, jenis).toBeTruthy()
      expect(Array.isArray(s.bidang), jenis).toBe(true)
    }
  })

  it('bidang tambahan berbeda per jenis', () => {
    expect(SKEMA.jadwal.bidang.map((b) => b.kunci)).toEqual(['posyandu_id', 'tanggal', 'kategori'])
    expect(SKEMA.layanan.bidang.map((b) => b.kunci)).toEqual(['kategori'])
    expect(SKEMA.pengumuman.bidang.map((b) => b.kunci)).toEqual(['tanggal'])
    expect(SKEMA.edukasi.bidang.map((b) => b.kunci)).toEqual(['kategori'])
  })

  it('kosong() hanya memuat bidang milik jenisnya', () => {
    expect(Object.keys(kosong('layanan'))).not.toContain('tanggal')
    expect(Object.keys(kosong('layanan'))).not.toContain('posyandu_id')
    expect(Object.keys(kosong('jadwal'))).toContain('tanggal')
    expect(Object.keys(kosong('jadwal'))).toContain('posyandu_id')
    expect(kosong('edukasi').penting).toBe(false)
  })

  it('posyandu_id ikut dikirim untuk jadwal, tidak untuk jenis lain', () => {
    const jadwal = muatanDari({ ...kosong('jadwal'), judul: 'J', isi: 'I', posyandu_id: 'abc-123' })
    expect(jadwal.posyandu_id).toBe('abc-123')
    const layanan = muatanDari({ ...kosong('layanan'), judul: 'L', isi: 'I', posyandu_id: 'abc-123' })
    expect(layanan).not.toHaveProperty('posyandu_id')
  })

  it('bidangKurang() menyebut Posyandu bila jadwal belum memilih', () => {
    expect(bidangKurang({ ...kosong('jadwal'), judul: 'J', isi: 'I' })).toContain('Posyandu')
  })

  it('posyandu_id tetap wajib di form walau disembunyikan dari tabel', () => {
    const b = SKEMA.jadwal.bidang.find((x) => x.kunci === 'posyandu_id')
    expect(b.wajib).toBe(true)
    expect(b.hanyaForm).toBe(true)
  })

  it('abaikan melewatkan validasi dan muatan untuk peran yang tidak merender field itu', () => {
    const nilai = { ...kosong('jadwal'), judul: 'J', isi: 'I', tanggal: '2026-12-01T08:00' }
    expect(bidangKurang(nilai)).toContain('Posyandu')
    expect(bidangKurang(nilai, { abaikan: ['posyandu_id'] })).toEqual([])
    expect(muatanDari(nilai, { abaikan: ['posyandu_id'] })).not.toHaveProperty('posyandu_id')
  })

  it('muatanDari() membuang bidang yang tidak berlaku untuk jenis itu', () => {
    const nilai = { ...kosong('layanan'), judul: 'Imunisasi', isi: 'Gratis', kategori: 'Bayi', tanggal: 'besok' }
    const muatan = muatanDari(nilai)
    expect(muatan.kategori).toBe('Bayi')
    expect(muatan).not.toHaveProperty('tanggal')
  })

  it('muatanDari() mengubah isian kosong menjadi null', () => {
    const muatan = muatanDari({ ...kosong('jadwal'), judul: 'J', isi: 'I', tanggal: '  ', kategori: '' })
    expect(muatan.tanggal).toBeNull()
    expect(muatan.kategori).toBeNull()
  })

  it('bidangKurang() menyebut bidang wajib yang kosong per jenis', () => {
    expect(bidangKurang({ ...kosong('jadwal'), judul: '', isi: '' })).toEqual(
      expect.arrayContaining(['Judul', 'Isi', 'Tanggal & jam']),
    )
    expect(bidangKurang({ ...kosong('edukasi'), judul: 'A', isi: 'B' })).toEqual(['Topik'])
    expect(bidangKurang({ ...kosong('layanan'), judul: 'A', isi: 'B' })).toEqual([])
  })
})

describe('nilai bidang tanggal', () => {
  it('jadwal: tanggal + jam digabung dan dipecah kembali', () => {
    expect(gabungTanggalJam('2026-11-14', '08:00')).toBe('2026-11-14T08:00')
    expect(pecahTanggalJam('2026-11-14T08:00')).toEqual({ tanggal: '2026-11-14', jam: '08:00' })
  })

  it('jadwal: jam boleh kosong', () => {
    expect(gabungTanggalJam('2026-11-14', '')).toBe('2026-11-14')
    expect(pecahTanggalJam('2026-11-14')).toEqual({ tanggal: '2026-11-14', jam: '' })
    expect(formatJadwal('2026-11-14')).toBe('14 November 2026')
  })

  it('jadwal: tanpa tanggal berarti kosong, bukan "T" menggantung', () => {
    expect(gabungTanggalJam('', '08:00')).toBe('')
  })

  it('rentang: mulai + akhir, akhir sama dengan mulai tidak diduplikasi', () => {
    expect(gabungRentang('2026-11-01', '2026-11-15')).toBe('2026-11-01/2026-11-15')
    expect(gabungRentang('2026-11-01', '2026-11-01')).toBe('2026-11-01')
    expect(pecahRentang('2026-11-01/2026-11-15')).toEqual({ mulai: '2026-11-01', akhir: '2026-11-15' })
    expect(pecahRentang('2026-11-01')).toEqual({ mulai: '2026-11-01', akhir: '' })
  })

  it('format ramah dibaca, bukan ISO mentah', () => {
    expect(formatJadwal('2026-11-14T08:00')).toBe('14 November 2026 · 08.00')
    expect(formatRentang('2026-11-01/2026-11-15')).toBe(
      '1 November 2026 s.d. 15 November 2026',
    )
    expect(formatRentang('2026-11-01')).toBe('1 November 2026')
  })

  it('nilai lama yang ditulis bebas ditampilkan apa adanya, tidak hilang', () => {
    expect(formatJadwal('Sabtu, 14 November 2026 · 08.00–11.00 WIB')).toBe(
      'Sabtu, 14 November 2026 · 08.00–11.00 WIB',
    )
    expect(pecahTanggalJam('Sabtu, 14 November')).toEqual({ tanggal: '', jam: '' })
  })

  it('nilaiTampil() memilih format sesuai tipe bidang', () => {
    const jadwal = SKEMA.jadwal.bidang.find((b) => b.tipe === 'tanggal-jam')
    const pengumuman = SKEMA.pengumuman.bidang[0]
    expect(nilaiTampil(jadwal, { tanggal: '2026-11-14T08:00' })).toBe('14 November 2026 · 08.00')
    expect(nilaiTampil(pengumuman, { tanggal: '2026-11-01/2026-11-15' })).toBe(
      '1 November 2026 s.d. 15 November 2026',
    )
    expect(nilaiTampil(jadwal, { tanggal: null })).toBeNull()
    expect(nilaiTampil(SKEMA.layanan.bidang[0], { kategori: 'Bayi' })).toBe('Bayi')
  })
})

describe('jadwal di kanal publik', () => {
  const HARI = '2026-11-06'
  const jadwal = (id, tanggal, posyandu_id = 'p1') => ({ id, jenis: 'jadwal', tanggal, posyandu_id })

  it('jadwal lampau dibuang, bukan ditampilkan sebagai "terdekat"', () => {
    const hasil = jadwalMendatang(
      [jadwal('lampau', '2026-10-27T08:00'), jadwal('nanti', '2026-11-09T08:00')],
      HARI,
    )
    expect(hasil.map((k) => k.id)).toEqual(['nanti'])
  })

  it('jadwal hari ini masih ditampilkan', () => {
    expect(jadwalMendatang([jadwal('kini', '2026-11-06T08:00')], HARI)).toHaveLength(1)
  })

  it('diurutkan menurut tanggal, bukan urutan kiriman server', () => {
    const hasil = jadwalMendatang(
      [jadwal('c', '2026-12-07T08:30'), jadwal('a', '2026-11-09T08:00'), jadwal('b', '2026-11-23T09:00')],
      HARI,
    )
    expect(hasil.map((k) => k.id)).toEqual(['a', 'b', 'c'])
  })

  it('jenis selain jadwal tidak ikut', () => {
    const hasil = jadwalMendatang(
      [{ id: 'x', jenis: 'pengumuman', tanggal: '2026-11-20' }, jadwal('j', '2026-11-09T08:00')],
      HARI,
    )
    expect(hasil.map((k) => k.id)).toEqual(['j'])
  })

  it('jadwalPerPosyandu() mengambil yang terdekat per Posyandu', () => {
    const peta = jadwalPerPosyandu(
      [
        jadwal('p1-jauh', '2026-12-07T08:30', 'p1'),
        jadwal('p1-dekat', '2026-11-09T08:00', 'p1'),
        jadwal('p2', '2026-11-23T09:00', 'p2'),
        jadwal('lampau', '2026-10-27T08:00', 'p3'),
      ],
      HARI,
    )
    expect(peta.get('p1').id).toBe('p1-dekat')
    expect(peta.get('p2').id).toBe('p2')
    expect(peta.has('p3')).toBe(false)
  })

  it('wilayahPosyandu() tidak mengulang kata "Dusun"', () => {
    expect(wilayahPosyandu({ dusun: 'Dusun Mawar', desa: 'Ketenger', kecamatan: 'Baturraden' })).toBe(
      'Dusun Mawar · Desa Ketenger · Kec. Baturraden',
    )
    expect(wilayahPosyandu({ dusun: 'Melati', desa: 'Ketenger' })).toBe('Dusun Melati · Desa Ketenger')
    expect(wilayahPosyandu({ desa: 'Ketenger' })).toBe('Desa Ketenger')
    expect(wilayahPosyandu({})).toBe('Wilayah desa')
  })

  it('blokTanggal() memecah tanggal untuk blok angka + bulan', () => {
    expect(blokTanggal('2026-11-09')).toEqual({ hari: '9', bulan: 'Nov' })
    expect(blokTanggal('2026-01-31')).toEqual({ hari: '31', bulan: 'Jan' })
    expect(blokTanggal('bukan tanggal')).toBeNull()
    expect(blokTanggal('')).toBeNull()
  })
})
