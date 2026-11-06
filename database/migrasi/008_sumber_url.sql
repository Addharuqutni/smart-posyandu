-- =============================================================
-- Migrasi 008 — URL sumber untuk konten yang ditarik dari luar
--
-- Konten hasil tarikan KodeNara disimpan sebagai baris biasa di
-- konten_publik, tetapi kanal publik perlu menautkan pembaca ke artikel
-- aslinya. Tanpa kolom ini URL sumber hanya ada di dalam proses penarik,
-- tidak di database.
--
-- NULL berarti konten ditulis langsung oleh admin/kader (bukan tarikan).
-- Idempoten: aman dijalankan berulang.
-- =============================================================

ALTER TABLE konten_publik
    ADD COLUMN IF NOT EXISTS sumber_url TEXT;

COMMENT ON COLUMN konten_publik.sumber_url IS
    'URL artikel asli bila konten ditarik dari situs lain; NULL untuk konten yang ditulis di aplikasi.';
