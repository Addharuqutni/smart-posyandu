// Sinkronkan `aria-invalid` dengan status visual `:user-invalid` milik peramban.
//
// Tanpa ini ada dua kegagalan berlawanan: Firefox/Safari mengumumkan "entri
// tidak sah" begitu fokus masuk ke kolom wajib yang masih kosong, sedangkan
// Chromium tidak pernah menandai apa pun. Keduanya karena `aria-invalid`
// manual (atau absen) tidak mengikuti kapan peramban menganggap kolom itu
// benar-benar salah — yaitu setelah pengguna menyentuhnya.
//
// Dipanggil sekali untuk seluruh aplikasi: listener-nya didelegasikan ke
// `document`, jadi kolom yang dipasang React belakangan ikut tertangani.

const PESAN_ID = 'pengumum-galad'
const ditandai = new WeakSet()
const sudahDiumumkan = new WeakSet()
let pengumum = null
let timer = null

/** Kaitkan pesan galat (id di `data-error`) ke kolom hanya selama pesan tampil. */
function kaitkanPesan(el, tampil) {
  const idPesan = el.dataset?.error
  if (!idPesan) return
  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== idPesan)
  if (tampil) ids.push(idPesan)
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '))
  else el.removeAttribute('aria-describedby')
}

/**
 * Putuskan `aria-invalid` berikutnya, murni supaya bisa diuji tanpa DOM.
 * `dariSkrip` = kolom ini sudah ditandai oleh sinkronisasi ini; `ariaLama`
 * yang `'true'` dan bukan dari sini (mis. hasil pemeriksaan server) tidak
 * boleh ditimpa.
 */
export function ariaBerikutnya({ salah, dariSkrip, ariaLama }) {
  if (salah) return 'true'
  if (!dariSkrip && ariaLama === 'true') return null
  return 'false'
}

/** Nama kolom dibaca seperti pembaca layar membacanya. */
function teksTerdengar(el) {
  const label = el.labels?.[0]?.textContent ?? el.getAttribute('aria-label') ?? ''
  return label.replace(/\s+/g, ' ').replace(/\*\s*$/, '').trim()
}

function umumkan(el) {
  if (!pengumum) return
  const pesan = el.validationMessage
  if (!pesan) return
  clearTimeout(timer)
  pengumum.textContent = ''
  // Beri jeda supaya pembaca layar selesai mengumumkan kolom yang barusan
  // menerima fokus, bukan ditimpa pesan galatnya.
  timer = setTimeout(() => {
    const nama = teksTerdengar(el)
    pengumum.textContent = nama ? `${nama}: ${pesan}` : pesan
  }, 500)
}

/** `umumkan` hanya untuk blur/change; submit & input tidak perlu bicara. */
function sinkron(el, umumkanSekarang = false) {
  if (!el?.matches?.('input, select, textarea')) return
  const berikut = ariaBerikutnya({
    salah: el.matches(':user-invalid'),
    dariSkrip: ditandai.has(el),
    ariaLama: el.getAttribute('aria-invalid'),
  })
  if (!berikut) return
  el.setAttribute('aria-invalid', berikut)
  if (berikut === 'true') {
    kaitkanPesan(el, true)
    ditandai.add(el)
    if (umumkanSekarang && !sudahDiumumkan.has(el)) {
      umumkan(el)
      sudahDiumumkan.add(el)
    }
    return
  }
  kaitkanPesan(el, false)
  ditandai.delete(el)
  sudahDiumumkan.delete(el)
}

export function pasangValidasiAksesibel() {
  if (typeof document === 'undefined' || pengumum) return

  pengumum = document.createElement('div')
  pengumum.id = PESAN_ID
  pengumum.setAttribute('aria-live', 'polite')
  pengumum.className = 'sr-only'
  document.body.append(pengumum)

  // Kolom baru selalu mulai dari "belum salah" supaya peramban yang menganggap
  // kolom wajib kosong sudah tidak sah tidak mengumumkannya sebelum disentuh.
  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (!el.matches?.('input, select, textarea')) return
    if (!el.hasAttribute('aria-invalid')) el.setAttribute('aria-invalid', 'false')
  }, true)

  document.addEventListener('blur', (e) => sinkron(e.target, true), true)
  document.addEventListener('change', (e) => sinkron(e.target, true), true)
  document.addEventListener('input', (e) => sinkron(e.target), true)

  // `invalid` tidak bubbling dan menyala juga untuk kolom wajib yang belum
  // disentuh; fokus sudah pindah ke kolom pertama yang salah, jadi cukup
  // tandai tanpa mengumumkan.
  document.addEventListener('invalid', (e) => {
    sudahDiumumkan.add(e.target)
    sinkron(e.target)
  }, true)
}
