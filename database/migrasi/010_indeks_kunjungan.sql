-- =============================================================
-- Migrasi 010 — Indeks untuk daftar kunjungan per Posyandu
--
-- Layar validasi dan rekap bulanan menyaring kunjungan per Posyandu lalu
-- mengurutkan menurut tanggal. Tanpa indeks ini PostgreSQL membaca seluruh
-- tabel kunjungan dan mengurutkannya di memori setiap permintaan.
--
-- Idempoten: aman dijalankan berulang.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_kunjungan_posyandu_tanggal
    ON kunjungan (posyandu_id, tanggal_kunjungan DESC)
    WHERE dihapus_pada IS NULL;
