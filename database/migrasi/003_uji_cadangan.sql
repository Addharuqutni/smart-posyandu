-- 003 — Hasil verifikasi cadangan (dipakai jobs/verifikasi.js).
--
-- Setiap kali cadangan selesai dibuat, berkasnya dibaca ulang dan jumlah
-- barisnya dibandingkan dengan basis data saat itu. Baris di tabel ini yang
-- membuktikan "cadangan terakhir benar-benar bisa dipakai", bukan sekadar ada.

CREATE TABLE IF NOT EXISTS uji_cadangan (
    id              UUID PRIMARY KEY,
    berkas          TEXT        NOT NULL,
    ukuran_byte     BIGINT      NOT NULL,
    jumlah          JSONB       NOT NULL,
    jumlah_db       JSONB       NOT NULL,
    cocok           BOOLEAN     NOT NULL,
    catatan         TEXT,
    diperiksa_pada  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uji_cadangan_waktu ON uji_cadangan (diperiksa_pada DESC);
