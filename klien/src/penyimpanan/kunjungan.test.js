import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db.js'
import { hapusKunjungan, kunjunganPadaTanggal, simpanKunjungan, ubahPengukuran } from './kunjungan.js'
import { simpanBalita, waliBalita } from './balita.js'
import { teksWali } from '../antarmuka/Riwayat.jsx'
import { dekripsiNik } from '../logika/nik.js'

const BALITA = {
  id: 'b1',
  posyandu_id: 'p1',
  nama_lengkap: 'Ani',
  jenis_kelamin: 'perempuan',
  tanggal_lahir: '2025-11-01',
  aktif: true,
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.balita.put(BALITA)
})

describe('pencatatan luring', () => {
  it('menyimpan kunjungan dan pengukuran tanpa jaringan, lalu mengantrekannya', async () => {
    const hasil = await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
      tinggi_cm: 72.5,
    })

    const kunjungan = await db.kunjungan.get(hasil.kunjungan_id)
    expect(kunjungan.terjadi_pada.endsWith('Z')).toBe(true)
    expect(kunjungan.usia_bulan).toBe(12)
    expect(kunjungan.dihapus_pada).toBeNull()

    const ukur = await db.pengukuran.get(hasil.pengukuran_id)
    expect(ukur.berat_kg).toBe(9.4)
    expect(ukur.status_gizi).toBeNull() // hanya server yang menilai

    const antrean = await db.antrean_sinkron.toArray()
    expect(antrean.map((a) => a.nama_tabel).sort()).toEqual(['kunjungan', 'pengukuran'])
    expect(antrean.every((a) => a.status === 'menunggu')).toBe(true)
    expect(antrean.find((a) => a.nama_tabel === 'pengukuran').muatan.berat_kg).toBe(9.4)
  })

  it('menolak nilai di luar rentang tanpa menulis apa pun', async () => {
    await expect(
      simpanKunjungan({
        balita: BALITA,
        idPerangkat: 'tablet-uji',
        tanggal: '2026-11-20',
        berat_kg: 0.5,
      }),
    ).rejects.toThrow('Berat (kg) di luar rentang wajar')

    expect(await db.kunjungan.count()).toBe(0)
    expect(await db.antrean_sinkron.count()).toBe(0)
  })

  it('hapus mengisi dihapus_pada dan tidak menghapus baris', async () => {
    const { kunjungan_id } = await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
    })
    await hapusKunjungan(kunjungan_id, 'tablet-uji')

    const baris = await db.kunjungan.get(kunjungan_id)
    expect(baris).toBeDefined()
    expect(baris.dihapus_pada).toBeTruthy()
    expect(baris.versi).toBe(2)

    const antrean = await db.antrean_sinkron.toArray()
    expect(antrean.some((a) => a.aksi === 'hapus' && a.id_baris === kunjungan_id)).toBe(true)
  })

  it('tidak hadir menyimpan kunjungan tanpa pengukuran', async () => {
    const hasil = await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: '',
      status_kehadiran: 'tidak_hadir',
    })
    expect(hasil.pengukuran_id).toBeNull()
    expect(await db.pengukuran.count()).toBe(0)
    const antrean = await db.antrean_sinkron.toArray()
    expect(antrean.map((a) => a.nama_tabel)).toEqual(['kunjungan'])
    expect((await db.kunjungan.get(hasil.kunjungan_id)).status_kehadiran).toBe('tidak_hadir')
  })

  it('mengosongkan ukur opsional menjadi null, bukan string kosong', async () => {
    const { pengukuran_id } = await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
      tinggi_cm: 72.5,
    })
    await db.antrean_sinkron.add({
      id: 'lama-gagal', nama_tabel: 'pengukuran', id_baris: pengukuran_id,
      aksi: 'ubah', versi: 2, terjadi_pada: new Date().toISOString(),
      muatan: {}, status: 'gagal', jumlah_coba: 1, pesan_gagal: 'di_luar_rentang',
    })
    await ubahPengukuran(
      pengukuran_id,
      { berat_kg: '9.5', tinggi_cm: '', lingkar_kepala_cm: '' },
      'tablet-uji',
    )
    const baris = await db.pengukuran.get(pengukuran_id)
    expect(baris.berat_kg).toBe(9.5)
    expect(baris.tinggi_cm).toBeNull()
    expect(baris.lingkar_kepala_cm).toBeNull()
    expect(await db.antrean_sinkron.where('status').equals('gagal').count()).toBe(0)
  })

  it('ubah menaikkan versi dan mengantrekan versi baru', async () => {
    const { pengukuran_id } = await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
    })
    await db.antrean_sinkron.clear()

    const baru = await ubahPengukuran(pengukuran_id, { berat_kg: 9.8 }, 'tablet-uji')
    expect(baru.versi).toBe(2)
    expect(baru.berat_kg).toBe(9.8)
    const antrean = await db.antrean_sinkron.toArray()
    expect(antrean).toHaveLength(1)
    expect(antrean[0].aksi).toBe('ubah')
    expect(antrean[0].versi).toBe(2)
  })
})

describe('balita baru', () => {
  it('menyimpan balita + wali lokal, dan NIK hanya ada di antrean', async () => {
    const id = await simpanBalita({
      idPerangkat: 'tablet-uji',
      nama_lengkap: 'Budi',
      jenis_kelamin: 'laki-laki',
      tanggal_lahir: '2025-01-10',
      nik: '3301010101010009',
      wali: {
        posyandu_id: 'p1',
        nama_lengkap: 'Siti',
        hubungan: 'ibu_kandung',
        nomor_kontak: '0812',
      },
    })

    const balita = await db.balita.get(id)
    expect(balita.nama_lengkap).toBe('Budi')
    expect(balita.nik).toBeUndefined()

    const antrean = await db.antrean_sinkron.toArray()
    const muatan = antrean.find((a) => a.nama_tabel === 'balita').muatan
    expect(muatan.nik).toBeUndefined()
    expect(JSON.stringify(antrean)).not.toContain('3301010101010009')
    expect(await dekripsiNik(muatan.nik_terenkripsi)).toBe('3301010101010009')
    expect(antrean.map((a) => a.nama_tabel).sort()).toEqual([
      'balita',
      'balita_orang_tua',
      'orang_tua',
    ])
    expect(await waliBalita(id)).toMatchObject([{ nama_lengkap: 'Siti', hubungan: 'ibu_kandung' }])
  })

  it('baris lama tanpa relasi wali tetap menampilkan nama ibu kandung', async () => {
    await db.balita.put({ ...BALITA, id: 'b-lama', nama_ibu_kandung: 'Siti' })
    const lama = await db.balita.get('b-lama')
    expect(await waliBalita(lama.id)).toEqual([])
    expect(teksWali([], lama.nama_ibu_kandung)).toBe('Siti (ibu kandung)')
    expect(teksWali([{ nama_lengkap: 'Siti', hubungan: 'ibu_kandung' }], lama.nama_ibu_kandung)).toBe('Siti (ibu kandung)')
    expect(teksWali([], null)).toBe('Wali belum tercatat')
  })
})

describe('batas usia balita', () => {
  it('menolak balita yang lahir lebih dari 7 tahun lalu', async () => {
    const lama = new Date()
    lama.setFullYear(lama.getFullYear() - 8)
    const tanggal_lahir = `${lama.getFullYear()}-${String(lama.getMonth() + 1).padStart(2, '0')}-${String(lama.getDate()).padStart(2, '0')}`
    await expect(
      simpanBalita({
        idPerangkat: 'tablet-uji',
        nama_lengkap: 'Terlalu Tua',
        jenis_kelamin: 'laki-laki',
        tanggal_lahir,
        nik: '3301010101010009',
        wali: { posyandu_id: 'p1', nama_lengkap: 'Siti', hubungan: 'ibu_kandung' },
      }),
    ).rejects.toThrow('Usia balita harus antara 0 hari dan 7 tahun')
    expect(await db.balita.count()).toBe(1) // hanya BALITA milik beforeEach
  })
})

describe('kunjungan ganda di hari yang sama', () => {
  const dasar = { balita: BALITA, idPerangkat: 'tablet-uji', tanggal: '2026-11-20', berat_kg: 9.4 }

  it('menolak kunjungan kedua dengan kode kunjungan_ganda', async () => {
    await simpanKunjungan(dasar)
    await expect(simpanKunjungan(dasar)).rejects.toMatchObject({ kode: 'kunjungan_ganda' })
    // Penolakan tidak boleh menulis apa pun.
    expect(await db.kunjungan.count()).toBe(1)
    expect(await db.antrean_sinkron.count()).toBe(2)
  })

  it('tanggal berbeda tetap boleh', async () => {
    await simpanKunjungan(dasar)
    await expect(simpanKunjungan({ ...dasar, tanggal: '2026-11-21' })).resolves.toBeTruthy()
    expect(await db.kunjungan.count()).toBe(2)
  })

  it('`sudah dihapus` tidak menghalangi pencatatan baru', async () => {
    const lama = await simpanKunjungan(dasar)
    await hapusKunjungan(lama.kunjungan_id, 'tablet-uji')
    await expect(simpanKunjungan(dasar)).resolves.toBeTruthy()
  })

  it('izinkanGanda: true hanya dipakai setelah kader menyetujui peringatan', async () => {
    await simpanKunjungan(dasar)
    await expect(simpanKunjungan({ ...dasar, izinkanGanda: true })).resolves.toBeTruthy()
    expect(await db.kunjungan.count()).toBe(2)
  })

  it('kunjunganPadaTanggal() mengabaikan baris yang sudah dihapus', async () => {
    const { kunjungan_id } = await simpanKunjungan(dasar)
    expect((await kunjunganPadaTanggal(BALITA.id, '2026-11-20'))?.id).toBe(kunjungan_id)
    await hapusKunjungan(kunjungan_id, 'tablet-uji')
    expect(await kunjunganPadaTanggal(BALITA.id, '2026-11-20')).toBeNull()
  })
})
