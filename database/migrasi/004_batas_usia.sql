-- =============================================================
-- Migrasi 004 — batas usia balita 0 hari s.d. 7 tahun (84 bulan)
--
-- Idempoten: aman dijalankan berulang. Dijalankan setelah
-- database/schema.sql (atau pada basis data yang sudah ada).
-- =============================================================

-- Kunjungan balita di atas 84 bulan tidak boleh tersimpan diam-diam.
ALTER TABLE kunjungan DROP CONSTRAINT IF EXISTS kunjungan_usia_bulan_check;
ALTER TABLE kunjungan ADD CONSTRAINT kunjungan_usia_bulan_check
    CHECK (usia_bulan BETWEEN 0 AND 84);

-- Acuan berat menurut umur mengikuti rentang usia yang baru, agar status
-- gizi kunjungan bulan ke-61 s.d. 84 tetap bisa dihitung bila acuannya
-- kelak diisi. Baris 0–60 yang sudah ada tidak diubah.
ALTER TABLE acuan_berat_umur DROP CONSTRAINT IF EXISTS acuan_berat_umur_usia_bulan_check;
ALTER TABLE acuan_berat_umur ADD CONSTRAINT acuan_berat_umur_usia_bulan_check
    CHECK (usia_bulan BETWEEN 0 AND 84);
