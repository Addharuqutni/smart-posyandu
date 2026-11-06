-- =============================================================
-- Migrasi 005 — tabel konten publik desa (jadwal, layanan, pengumuman)
--
-- Idempoten: aman dijalankan berulang.
-- =============================================================

CREATE TABLE IF NOT EXISTS konten_publik (
    id              UUID PRIMARY KEY,
    jenis           TEXT        NOT NULL CHECK (jenis IN ('jadwal', 'layanan', 'pengumuman', 'edukasi')),
    judul           TEXT        NOT NULL,
    isi             TEXT        NOT NULL,
    kategori        TEXT,       -- misal: nama posyandu untuk jadwal, tag kategori untuk edukasi/pengumuman
    tanggal         TEXT,       -- tanggal kegiatan / label agenda
    penting         BOOLEAN     NOT NULL DEFAULT FALSE,
    aktif           BOOLEAN     NOT NULL DEFAULT TRUE,
    urutan          INTEGER     NOT NULL DEFAULT 0,
    dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_konten_publik_jenis ON konten_publik (jenis, aktif)
    WHERE dihapus_pada IS NULL;
