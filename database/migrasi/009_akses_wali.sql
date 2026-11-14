-- =============================================================
-- Migrasi 009 — Sesi baca untuk wali di "Cek Perkembangan Anak"
--
-- Wali tidak punya akun `pengguna`: akun baru di tabel itu otomatis boleh
-- membaca /balita dan /sinkron (keduanya cuma `butuhLogin`). Sesi ini
-- menyimpan SATU balita_id yang sudah dicocokkan lewat nama + NIK, jadi
-- riwayat tidak mungkin diarahkan ke balita lain lewat URL.
--
-- Token acak disimpan sebagai hash; cookie HttpOnly 30 menit. Tidak ikut
-- cadangan (sama seperti sesi_login): sesi lama tidak boleh dihidupkan lagi.
-- Idempoten: aman dijalankan berulang.
-- =============================================================

CREATE TABLE IF NOT EXISTS akses_wali (
    id               UUID PRIMARY KEY,
    balita_id        UUID        NOT NULL REFERENCES balita(id),
    token_hash       TEXT        NOT NULL UNIQUE,
    dibuat_pada      TIMESTAMPTZ NOT NULL DEFAULT now(),
    kadaluarsa_pada  TIMESTAMPTZ NOT NULL,
    dicabut_pada     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_akses_wali_token
    ON akses_wali (token_hash) WHERE dicabut_pada IS NULL;
