import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../penyimpanan/db.js'
import { jalankanSinkron, terapkan } from './sinkron.js'
import { simpanKunjungan, ubahPengukuran } from '../penyimpanan/kunjungan.js'

const BALITA = {
  id: 'b1',
  posyandu_id: 'p1',
  nama_lengkap: 'Ani',
  jenis_kelamin: 'perempuan',
  tanggal_lahir: '2025-11-01',
  aktif: true,
}

function jawab(isi) {
  return { ok: true, status: 200, json: async () => isi }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.balita.put(BALITA)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('putaran sinkron', () => {
  it('mengirim antrean lalu menarik perubahan dan menyimpan kursor', async () => {
    const { kunjungan_id, pengukuran_id } = await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
    })

    const panggilan = []
    vi.stubGlobal('fetch', async (jalur, opsi) => {
      panggilan.push({ jalur, opsi })
      if (jalur.endsWith('/sinkron') && opsi.method === 'POST') {
        const isi = JSON.parse(opsi.body)
        return jawab({
          diterima: isi.perubahan.map((p) => p.id_baris),
          ditolak: [],
          waktu_server: '2026-11-20T03:00:00Z',
        })
      }
      return jawab({
        perubahan: [
          {
            nama_tabel: 'pengukuran',
            id_baris: pengukuran_id,
            aksi: 'ubah',
            terjadi_pada: '2026-11-20T03:00:01Z',
            dihapus_pada: null,
            muatan: {
              id: pengukuran_id,
              kunjungan_id,
              berat_kg: 9.4,
              status_gizi: 'gizi_baik',
              persen_median: 105.62,
            },
          },
        ],
        waktu_server: '2026-11-20T03:00:02Z',
        berikutnya: null,
      })
    })

    const hasil = await jalankanSinkron('tablet-uji')
    expect(hasil).toMatchObject({ luring: false, terkirim: 2, ditolak: 0, ditarik: 1 })

    expect(await db.antrean_sinkron.count()).toBe(0)
    const ukur = await db.pengukuran.get(pengukuran_id)
    expect(ukur.status_gizi).toBe('gizi_baik')

    const kursor = await db.penyiapan.get('kursor_sinkron')
    expect(kursor).toBeUndefined() // tidak ada halaman kedua
    const terakhir = await db.penyiapan.get('sinkron_terakhir')
    expect(terakhir.nilai).toBe('2026-11-20T03:00:02Z')
    expect((await db.penyiapan.get('selisih_jam_detik')).nilai).toBeTypeOf('number')
  })

  it('memulihkan nilai lokal bila suntingan ditolak karena sudah divalidasi', async () => {
    const { pengukuran_id } = await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
    })
    await db.antrean_sinkron.clear()
    await ubahPengukuran(pengukuran_id, { berat_kg: 9.9 }, 'tablet-uji')
    const ubah = (await db.antrean_sinkron.where('status').equals('menunggu').toArray())[0]

    vi.stubGlobal('fetch', async (jalur, opsi) => {
      if (jalur.endsWith('/sinkron') && opsi.method === 'POST') {
        const isi = JSON.parse(opsi.body)
        return jawab({
          diterima: isi.perubahan.filter((p) => p.id_baris !== ubah.id_baris).map((p) => p.id_baris),
          ditolak: [{ id_baris: ubah.id_baris, alasan: 'sudah_divalidasi' }],
          waktu_server: new Date().toISOString(),
        })
      }
      return jawab({ perubahan: [], waktu_server: new Date().toISOString(), berikutnya: null })
    })

    await jalankanSinkron('tablet-uji')
    const baris = await db.pengukuran.get(pengukuran_id)
    expect(baris.berat_kg).toBe(9.4)
    expect(await db.antrean_sinkron.where('status').equals('gagal').count()).toBe(1)
  })

  it('tidak mengirim antrean milik akun lain', async () => {
    await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
      pemilik_id: 'kader-a',
    })
    let posting = 0
    vi.stubGlobal('fetch', async (jalur, opsi) => {
      if (jalur.endsWith('/sinkron') && opsi.method === 'POST') {
        posting += 1
        const isi = JSON.parse(opsi.body)
        return jawab({
          diterima: isi.perubahan.map((p) => p.id_baris),
          ditolak: [],
          waktu_server: new Date().toISOString(),
        })
      }
      return jawab({ perubahan: [], waktu_server: new Date().toISOString(), berikutnya: null })
    })

    await jalankanSinkron('tablet-uji', 'kader-b')
    expect(posting).toBe(0)
    expect(await db.antrean_sinkron.count()).toBe(2)

    await jalankanSinkron('tablet-uji', 'kader-a')
    expect(posting).toBe(1)
    expect(await db.antrean_sinkron.count()).toBe(0)
  })

  it('menggeser waktu kiriman yang ditolak karena jam tablet di depan', async () => {
    await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
    })
    const waktuServer = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    let pertama = true
    vi.stubGlobal('fetch', async (jalur, opsi) => {
      if (jalur.endsWith('/sinkron') && opsi.method === 'POST') {
        const isi = JSON.parse(opsi.body)
        if (pertama) {
          pertama = false
          return jawab({
            diterima: [],
            ditolak: isi.perubahan.map((p) => ({
              id_baris: p.id_baris,
              alasan: 'waktu_lewat_masa_depan',
            })),
            waktu_server: waktuServer,
          })
        }
        return jawab({
          diterima: isi.perubahan.map((p) => p.id_baris),
          ditolak: [],
          waktu_server: waktuServer,
        })
      }
      return jawab({ perubahan: [], waktu_server: waktuServer, berikutnya: null })
    })

    const pertamaHasil = await jalankanSinkron('tablet-uji')
    expect(pertamaHasil.ditolak).toBe(2)
    const antrean = await db.antrean_sinkron.toArray()
    expect(antrean.every((a) => a.status === 'menunggu')).toBe(true)
    expect(antrean.every((a) => new Date(a.terjadi_pada).getTime() <= Date.now())).toBe(true)

    const kedua = await jalankanSinkron('tablet-uji')
    expect(kedua.terkirim).toBe(2)
    expect(await db.antrean_sinkron.count()).toBe(0)
  })

  it('menolak nilai di luar rentang dan mempertahankan antrean gagal', async () => {
    await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
    })
    vi.stubGlobal('fetch', async (jalur, opsi) => {
      if (opsi?.method === 'POST') {
        const isi = JSON.parse(opsi.body)
        return jawab({
          diterima: [],
          ditolak: isi.perubahan.map((p) => ({ id_baris: p.id_baris, alasan: 'di_luar_rentang' })),
          waktu_server: '2026-11-20T03:00:00Z',
        })
      }
      return jawab({ perubahan: [], waktu_server: '2026-11-20T03:00:01Z', berikutnya: null })
    })

    const hasil = await jalankanSinkron('tablet-uji')
    expect(hasil.ditolak).toBe(2)
    const antrean = await db.antrean_sinkron.toArray()
    expect(antrean.every((a) => a.status === 'gagal')).toBe(true)
    expect(antrean.every((a) => a.pesan_gagal === 'di_luar_rentang')).toBe(true)
  })

  it('saat jaringan mati: antrean utuh dan tidak ada yang hilang', async () => {
    await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
    })
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('gagal jaringan')
    })

    const hasil = await jalankanSinkron('tablet-uji')
    expect(hasil.luring).toBe(true)
    expect(await db.antrean_sinkron.where('status').equals('menunggu').count()).toBe(2)
    expect(await db.kunjungan.count()).toBe(1)
  })

  it('tolakan kalah_versi menandai antrean gagal, lalu tarikan menimpa data lokal', async () => {
    const { kunjungan_id } = await simpanKunjungan({
      balita: BALITA,
      idPerangkat: 'tablet-uji',
      tanggal: '2026-11-20',
      berat_kg: 9.4,
    })
    vi.stubGlobal('fetch', async (jalur, opsi) => {
      if (opsi?.method === 'POST') {
        const isi = JSON.parse(opsi.body)
        return jawab({
          diterima: [],
          ditolak: isi.perubahan.map((p) => ({
            id_baris: p.id_baris,
            alasan: 'kalah_versi',
            terjadi_pada_tersimpan: '2026-11-20T04:00:00Z',
          })),
          waktu_server: '2026-11-20T04:00:01Z',
        })
      }
      return jawab({
        perubahan: [
          {
            nama_tabel: 'kunjungan',
            id_baris: kunjungan_id,
            aksi: 'ubah',
            terjadi_pada: '2026-11-20T04:00:00Z',
            dihapus_pada: null,
            muatan: { id: kunjungan_id, balita_id: 'b1', tanggal_kunjungan: '2026-11-20', catatan: 'dari tablet lain' },
          },
        ],
        waktu_server: '2026-11-20T04:00:01Z',
        berikutnya: null,
      })
    })

    const hasil = await jalankanSinkron('tablet-uji')
    expect(hasil.ditolak).toBe(2)
    // KONTRAK_API 3: kalah_versi dibuang dari antrean; tarikan menimpa lokal.
    expect(await db.antrean_sinkron.count()).toBe(0)

    const kunjungan = await db.kunjungan.get(kunjungan_id)
    expect(kunjungan.catatan).toBe('dari tablet lain')
  })

  // Regresi: tablet pernah menampilkan 101 balita padahal server punya 3000.
  // Kursor tersimpan lebih baru daripada `diperbarui_pada` baris demo, jadi
  // sinkron tambahan tidak pernah lagi menarik baris yang hilang.
  it('salinan lokal yang basi ditarik ulang dari awal', async () => {
    await db.penyiapan.put({ kunci: 'kursor_sinkron', nilai: '2026-11-20T03:00:00Z|kunjungan|x' })

    const panggilan = []
    vi.stubGlobal('fetch', async (jalur, opsi) => {
      if (opsi?.method === 'POST') return jawab({ diterima: [], ditolak: [], waktu_server: '2026-11-20T03:00:00Z' })
      panggilan.push(jalur)
      const penuh = panggilan.length > 1
      return jawab({
        perubahan: penuh
          ? [
              { nama_tabel: 'balita', id_baris: 'b1', aksi: 'ubah', terjadi_pada: '2026-11-20T03:00:01Z', dihapus_pada: null, muatan: { id: 'b1', nama_lengkap: 'Ani' } },
              { nama_tabel: 'balita', id_baris: 'b2', aksi: 'ubah', terjadi_pada: '2026-11-20T03:00:02Z', dihapus_pada: null, muatan: { id: 'b2', nama_lengkap: 'Budi' } },
            ]
          : [],
        waktu_server: '2026-11-20T03:00:03Z',
        berikutnya: null,
        jumlah: { balita: 2 },
      })
    })

    await jalankanSinkron('tablet-uji')

    // Halaman pertama kosong dan jumlah server (2) > lokal (1): tarik ulang.
    expect(panggilan).toHaveLength(2)
    expect(panggilan[1]).not.toContain('sejak=')
    expect(await db.balita.count()).toBe(2)
  })

  it('salinan lokal yang sudah lengkap tidak ditarik ulang', async () => {
    await db.balita.put({ ...BALITA, id: 'b2' })
    const panggilan = []
    vi.stubGlobal('fetch', async (jalur, opsi) => {
      if (opsi?.method === 'POST') return jawab({ diterima: [], ditolak: [], waktu_server: '2026-11-20T03:00:00Z' })
      panggilan.push(jalur)
      return jawab({ perubahan: [], waktu_server: '2026-11-20T03:00:03Z', berikutnya: null, jumlah: { balita: 2 } })
    })

    await jalankanSinkron('tablet-uji')
    expect(panggilan).toHaveLength(1)
  })

  // Regresi: setelah basis data server dikosongkan, tablet masih menampilkan
  // balita lama selamanya. salinanBasi() lama cuma memeriksa `punya < harus`,
  // jadi 42 < 0 tidak pernah terdeteksi.
  it('server dikosongkan: salinan lokal dibuang, bukan dibiarkan', async () => {
    await db.balita.put({ ...BALITA, id: 'b2' })
    await db.kunjungan.put({ id: 'k1', balita_id: 'b1', tanggal_kunjungan: '2026-11-01' })
    await db.pengukuran.put({ id: 'u1', kunjungan_id: 'k1', berat_kg: 9.4 })
    // Antrean gagal boleh ada: jangan sampai ikut terhapus.
    await db.antrean_sinkron.put({ id: 'a1', nama_tabel: 'balita', id_baris: 'b3', status: 'gagal', muatan: {} })

    const panggilan = []
    vi.stubGlobal('fetch', async (jalur, opsi) => {
      if (opsi?.method === 'POST') return jawab({ diterima: [], ditolak: [], waktu_server: '2026-11-20T03:00:00Z' })
      panggilan.push(jalur)
      return jawab({ perubahan: [], waktu_server: '2026-11-20T03:00:03Z', berikutnya: null, jumlah: { balita: 0 } })
    })

    await jalankanSinkron('tablet-uji')

    expect(panggilan).toHaveLength(2)
    expect(panggilan[1]).not.toContain('sejak=')
    expect(await db.balita.count()).toBe(0)
    expect(await db.kunjungan.count()).toBe(0)
    expect(await db.pengukuran.count()).toBe(0)
    // Data yang belum terkirim tetap ada.
    expect(await db.antrean_sinkron.count()).toBe(1)
  })

})

describe('penerapan perubahan dari server', () => {
  it('baris lokal yang lebih baru tidak ditimpa', async () => {
    await db.balita.put({ ...BALITA, nama_lengkap: 'Nama Lokal', terjadi_pada: '2026-11-20T05:00:00Z' })
    await terapkan([
      {
        nama_tabel: 'balita',
        id_baris: 'b1',
        aksi: 'ubah',
        terjadi_pada: '2026-11-20T04:00:00Z',
        dihapus_pada: null,
        muatan: { id: 'b1', nama_lengkap: 'Nama Server' },
      },
    ])
    expect((await db.balita.get('b1')).nama_lengkap).toBe('Nama Lokal')
  })

  it('hapus dari server menandai dihapus_pada, bukan menghapus baris', async () => {
    await db.balita.put({ ...BALITA, terjadi_pada: '2026-11-20T04:00:00Z' })
    await terapkan([
      {
        nama_tabel: 'balita',
        id_baris: 'b1',
        aksi: 'hapus',
        terjadi_pada: '2026-11-20T05:00:00Z',
        dihapus_pada: '2026-11-20T05:00:00Z',
        muatan: {},
      },
    ])
    const baris = await db.balita.get('b1')
    expect(baris).toBeDefined()
    expect(baris.dihapus_pada).toBe('2026-11-20T05:00:00Z')
  })
})
