// Uji kontrak alur persetujuan jadwal posyandu: kader mengajukan, nakes
// memutuskan, admin bisa intervensi.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const sumber = fs.readFileSync(path.join(__dirname, '../src/routes/konten.js'), 'utf8')

test('kanal publik hanya menampilkan konten yang sudah disetujui', () => {
  const publik = sumber.slice(
    sumber.indexOf("router.get('/konten-publik',"),
    sumber.indexOf("router.get('/konten-publik/semua'"),
  )
  assert.match(publik, /status_persetujuan = 'disetujui'/)
  assert.match(publik, /aktif = TRUE/)
})

test('jadwal buatan kader masuk antrean menunggu persetujuan nakes', () => {
  assert.match(sumber, /function butuhPersetujuan\(jenis, peran\)/)
  assert.match(sumber, /jenis === 'jadwal' && peran === 'kader'/)
  assert.match(sumber, /perluSetuju \? 'menunggu' : 'disetujui'/)
  assert.match(sumber, /detail: 'kader_hanya_jadwal'/)
})

test('nakes dan admin boleh memutuskan, alas penolakan wajib', () => {
  assert.match(sumber, /NakesAtaudmin = butuhPeran\('nakes', 'admin_desa'\)/)
  assert.match(sumber, /router\.post\('\/konten-publik\/:id\/putuskan', NakesAtaudmin/)
  assert.match(sumber, /detail: 'alasan_wajib_diisi'/)
  assert.match(sumber, /aktif = \(\$1 = 'disetujui'\)/)
})

test('kader hanya melihat dan menghapus ajuan miliknya sendiri', () => {
  assert.match(sumber, /syarat\.push\(`pengaju_id = \$\$\{params\.length\}`\)/)
  assert.match(sumber, /String\(ada\.pengaju_id\) !== String\(minta\.pengguna\.id\)/)
  assert.match(sumber, /nilai\.status_persetujuan = 'menunggu'/)
})

test('penghapusan konten menggunakan soft delete (dihapus_pada)', () => {
  assert.match(sumber, /UPDATE konten_publik SET dihapus_pada = now\(\)/)
})
