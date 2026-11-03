// Autentikasi: token sesi dari tabel sesi_login, bukan JWT supaya bisa dicabut.
// Token diambil dari cookie HttpOnly, bukan header Authorization, supaya
// kode di klien tidak pernah memegangnya.

const { satu } = require('../db/pool')
const { hashToken } = require('../domain/keamanan')
const cookie = require('../domain/sesi-cookie')

/** Token sesi dari cookie, atau null. */
function tokenSesi(minta) {
  return cookie.baca(minta)
}

/** Pasang `minta.pengguna`. Tidak melempar — rute yang memutuskan. */
async function muatPengguna(minta, balas, lanjut) {
  minta.pengguna = null
  const token = tokenSesi(minta)
  if (!token) return lanjut()

  const baris = await satu(
    `SELECT p.id, p.nama_pengguna, p.nama_lengkap, p.peran, p.posyandu_id, p.aktif
     FROM sesi_login s
     JOIN pengguna p ON p.id = s.pengguna_id
     WHERE s.token_hash = $1 AND s.dicabut_pada IS NULL AND s.kadaluarsa_pada > now()
       AND p.dihapus_pada IS NULL`,
    [hashToken(token)],
  )
  if (baris && baris.aktif) minta.pengguna = baris
  lanjut()
}

/** Tolak bila belum masuk. */
function butuhLogin(minta, balas, lanjut) {
  if (!minta.pengguna) {
    return balas.status(401).json({ detail: 'butuh_masuk' })
  }
  lanjut()
}

/** Tolak bila peran tidak termasuk. */
function butuhPeran(...peran) {
  return (minta, balas, lanjut) => {
    if (!minta.pengguna) return balas.status(401).json({ detail: 'butuh_masuk' })
    if (!peran.includes(minta.pengguna.peran)) {
      return balas.status(403).json({ detail: 'tidak_diizinkan' })
    }
    lanjut()
  }
}

module.exports = { muatPengguna, butuhLogin, butuhPeran, tokenSesi }
