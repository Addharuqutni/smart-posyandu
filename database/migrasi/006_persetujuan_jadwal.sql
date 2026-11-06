-- =============================================================
-- Migrasi 006 — alur persetujuan jadwal posyandu (kader → nakes)
--
-- Idempoten: aman dijalankan berulang.
-- =============================================================

ALTER TABLE konten_publik
    ADD COLUMN IF NOT EXISTS status_persetujuan TEXT NOT NULL DEFAULT 'disetujui'
        CHECK (status_persetujuan IN ('menunggu', 'disetujui', 'ditolak'));

ALTER TABLE konten_publik
    ADD COLUMN IF NOT EXISTS pengaju_id UUID REFERENCES pengguna(id);

ALTER TABLE konten_publik
    ADD COLUMN IF NOT EXISTS posyandu_id UUID REFERENCES posyandu(id);

ALTER TABLE konten_publik
    ADD COLUMN IF NOT EXISTS diputuskan_oleh UUID REFERENCES pengguna(id);

ALTER TABLE konten_publik
    ADD COLUMN IF NOT EXISTS diputuskan_pada TIMESTAMPTZ;

ALTER TABLE konten_publik
    ADD COLUMN IF NOT EXISTS catatan_peninjau TEXT;

CREATE INDEX IF NOT EXISTS idx_konten_publik_menunggu
    ON konten_publik (jenis, status_persetujuan)
    WHERE dihapus_pada IS NULL AND status_persetujuan = 'menunggu';
