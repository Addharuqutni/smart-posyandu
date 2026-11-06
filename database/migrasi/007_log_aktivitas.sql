-- =============================================================
-- Migrasi 007 — log aktivitas untuk admin desa
--
-- `log_audit` sudah mencatat perubahan baris data. Migrasi ini menambah
-- peristiwa akses (masuk, keluar, gagal masuk) dan alamat IP, supaya layar
-- "Log aktivitas" bisa menampilkan seluruh jejak pemakaian, bukan hanya
-- perubahan data.
--
-- Idempoten: aman dijalankan berulang.
-- =============================================================

ALTER TABLE log_audit
    ADD COLUMN IF NOT EXISTS alamat_ip TEXT;

-- Vocabulary aksi diperluas. Nama constraint bawaan PostgreSQL untuk CHECK
-- kolom adalah <tabel>_<kolom>_check.
ALTER TABLE log_audit DROP CONSTRAINT IF EXISTS log_audit_aksi_check;
ALTER TABLE log_audit ADD CONSTRAINT log_audit_aksi_check
    CHECK (aksi IN ('buat', 'ubah', 'hapus', 'masuk', 'keluar', 'gagal_masuk'));

-- Layar admin selalu mengurutkan dari yang terbaru.
CREATE INDEX IF NOT EXISTS idx_log_audit_waktu
    ON log_audit (diterima_pada DESC);

CREATE INDEX IF NOT EXISTS idx_log_audit_pengguna_waktu
    ON log_audit (pengguna_id, diterima_pada DESC);
