-- =============================================================
-- Migrasi 001 — fondasi minggu 1
--
-- Menerapkan:
--   1. kolom sinkronisasi (terjadi_pada, versi) pada 6 tabel yang
--      ikut sinkron dua arah;
--   2. persen_median pada pengukuran (acuan persen median BB/U);
--   3. tabel acuan_berat_umur;
--   4. isi acuan berat menurut umur 0–60 bulan, dua jenis kelamin.
--
-- Idempoten: aman dijalankan berulang. Dijalankan setelah
-- database/schema.sql (atau pada basis data yang sudah ada).
-- =============================================================

-- 1. Kolom sinkronisasi --------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'balita', 'orang_tua', 'balita_orang_tua',
        'kunjungan', 'pengukuran', 'tindak_lanjut'
    ] LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS terjadi_pada TIMESTAMPTZ NOT NULL DEFAULT now()', t);
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS versi INTEGER NOT NULL DEFAULT 1', t);
    END LOOP;
END $$;

-- 2. Persen median -------------------------------------------------------
ALTER TABLE pengukuran ADD COLUMN IF NOT EXISTS persen_median NUMERIC(5, 2);

-- 3. Acuan berat menurut umur -------------------------------------------
CREATE TABLE IF NOT EXISTS acuan_berat_umur (
    id              UUID PRIMARY KEY,
    usia_bulan      INTEGER     NOT NULL CHECK (usia_bulan BETWEEN 0 AND 60),
    jenis_kelamin   TEXT        NOT NULL CHECK (jenis_kelamin IN ('laki-laki', 'perempuan')),
    median_berat_kg NUMERIC(5, 3) NOT NULL,
    sumber          TEXT        NOT NULL,
    dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada    TIMESTAMPTZ,
    id_perangkat    TEXT,
    UNIQUE (usia_bulan, jenis_kelamin, sumber)
);

CREATE INDEX IF NOT EXISTS idx_acuan_berat_umur
    ON acuan_berat_umur (jenis_kelamin, usia_bulan)
    WHERE dihapus_pada IS NULL;

-- 4. Isi acuan ----------------------------------------------------------
-- Nilai median (P50) berat badan menurut umur, WHO Child Growth Standards
-- 2006. PRD Bagian 7.1 memakai persen median BB/U; bila petugas kesehatan
-- memutuskan memakai tabel Kemenkes, cukup ganti `sumber` dan angkanya —
-- kode tidak berubah.
INSERT INTO acuan_berat_umur (id, usia_bulan, jenis_kelamin, median_berat_kg, sumber, id_perangkat)
SELECT
    gen_random_uuid(),
    usia,
    jenis,
    median,
    'WHO 2006',
    'migrasi-001'
FROM (VALUES
    -- laki-laki (usia, median kg)
    (0,'laki-laki',3.3),(1,'laki-laki',4.5),(2,'laki-laki',5.6),(3,'laki-laki',6.4),
    (4,'laki-laki',7.0),(5,'laki-laki',7.5),(6,'laki-laki',7.9),(7,'laki-laki',8.3),
    (8,'laki-laki',8.6),(9,'laki-laki',8.9),(10,'laki-laki',9.2),(11,'laki-laki',9.4),
    (12,'laki-laki',9.6),(13,'laki-laki',9.9),(14,'laki-laki',10.1),(15,'laki-laki',10.3),
    (16,'laki-laki',10.5),(17,'laki-laki',10.7),(18,'laki-laki',10.9),(19,'laki-laki',11.1),
    (20,'laki-laki',11.3),(21,'laki-laki',11.5),(22,'laki-laki',11.8),(23,'laki-laki',12.0),
    (24,'laki-laki',12.2),(25,'laki-laki',12.4),(26,'laki-laki',12.5),(27,'laki-laki',12.7),
    (28,'laki-laki',12.9),(29,'laki-laki',13.1),(30,'laki-laki',13.3),(31,'laki-laki',13.5),
    (32,'laki-laki',13.7),(33,'laki-laki',13.8),(34,'laki-laki',14.0),(35,'laki-laki',14.2),
    (36,'laki-laki',14.3),(37,'laki-laki',14.5),(38,'laki-laki',14.7),(39,'laki-laki',14.8),
    (40,'laki-laki',15.0),(41,'laki-laki',15.2),(42,'laki-laki',15.3),(43,'laki-laki',15.5),
    (44,'laki-laki',15.7),(45,'laki-laki',15.8),(46,'laki-laki',16.0),(47,'laki-laki',16.2),
    (48,'laki-laki',16.3),(49,'laki-laki',16.5),(50,'laki-laki',16.7),(51,'laki-laki',16.8),
    (52,'laki-laki',17.0),(53,'laki-laki',17.2),(54,'laki-laki',17.3),(55,'laki-laki',17.5),
    (56,'laki-laki',17.7),(57,'laki-laki',17.8),(58,'laki-laki',18.0),(59,'laki-laki',18.2),
    (60,'laki-laki',18.3),
    -- perempuan
    (0,'perempuan',3.2),(1,'perempuan',4.2),(2,'perempuan',5.1),(3,'perempuan',5.8),
    (4,'perempuan',6.4),(5,'perempuan',6.9),(6,'perempuan',7.3),(7,'perempuan',7.6),
    (8,'perempuan',7.9),(9,'perempuan',8.2),(10,'perempuan',8.5),(11,'perempuan',8.7),
    (12,'perempuan',8.9),(13,'perempuan',9.2),(14,'perempuan',9.4),(15,'perempuan',9.6),
    (16,'perempuan',9.8),(17,'perempuan',10.0),(18,'perempuan',10.2),(19,'perempuan',10.4),
    (20,'perempuan',10.6),(21,'perempuan',10.9),(22,'perempuan',11.1),(23,'perempuan',11.3),
    (24,'perempuan',11.5),(25,'perempuan',11.7),(26,'perempuan',11.9),(27,'perempuan',12.1),
    (28,'perempuan',12.3),(29,'perempuan',12.5),(30,'perempuan',12.7),(31,'perempuan',12.8),
    (32,'perempuan',13.0),(33,'perempuan',13.2),(34,'perempuan',13.4),(35,'perempuan',13.5),
    (36,'perempuan',13.7),(37,'perempuan',13.9),(38,'perempuan',14.0),(39,'perempuan',14.2),
    (40,'perempuan',14.4),(41,'perempuan',14.5),(42,'perempuan',14.7),(43,'perempuan',14.8),
    (44,'perempuan',15.0),(45,'perempuan',15.2),(46,'perempuan',15.3),(47,'perempuan',15.5),
    (48,'perempuan',15.6),(49,'perempuan',15.8),(50,'perempuan',15.9),(51,'perempuan',16.1),
    (52,'perempuan',16.2),(53,'perempuan',16.4),(54,'perempuan',16.5),(55,'perempuan',16.7),
    (56,'perempuan',16.8),(57,'perempuan',17.0),(58,'perempuan',17.1),(59,'perempuan',17.3),
    (60,'perempuan',17.4)
) AS v(usia, jenis, median)
ON CONFLICT (usia_bulan, jenis_kelamin, sumber) DO NOTHING;
