-- =============================================================
-- Skema basis data — Aplikasi Smart Posyandu
-- Pilot 1 Posyandu, Desa Ketenger, Kabupaten Banyumas
--
-- Sumber kebenaran untuk struktur tabel. Perubahan skema harus
-- dilakukan di berkas ini, lalu diterapkan ke basis data.
--
-- Konvensi (lihat AGENTS.md bagian 3):
--   * nama tabel dan kolom bahasa Indonesia, snake_case, tunggal
--   * id = UUID v4 yang dibuat di klien (tablet), bukan di server
--   * baris tidak dihapus fisik: penghapusan = mengisi dihapus_pada
--   * satuan ada di nama kolom: _kg, _cm
--   * waktu memakai TIMESTAMPTZ (UTC)
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), digest()

-- -------------------------------------------------------------
-- Fungsi pembantu: memperbarui diperbarui_pada otomatis
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_diperbarui_pada()
RETURNS TRIGGER AS $$
BEGIN
    NEW.diperbarui_pada = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 1. Identitas dan wilayah
-- =============================================================

CREATE TABLE IF NOT EXISTS posyandu (
    id              UUID PRIMARY KEY,
    nama            TEXT        NOT NULL,
    dusun           TEXT,
    desa            TEXT        NOT NULL,
    kecamatan       TEXT,
    kabupaten       TEXT,
    aktif           BOOLEAN     NOT NULL DEFAULT TRUE,
    dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada    TIMESTAMPTZ,
    id_perangkat    TEXT
);

CREATE TABLE IF NOT EXISTS pengguna (
    id                  UUID PRIMARY KEY,
    nama_pengguna       TEXT        NOT NULL UNIQUE,
    hash_kata_sandi     TEXT        NOT NULL,          -- Argon2id
    nama_lengkap        TEXT        NOT NULL,
    peran               TEXT        NOT NULL CHECK (peran IN ('kader', 'nakes', 'admin_desa')),
    posyandu_id         UUID        REFERENCES posyandu(id),   -- NULL untuk admin_desa
    aktif               BOOLEAN     NOT NULL DEFAULT TRUE,
    harus_ganti_sandi   BOOLEAN     NOT NULL DEFAULT FALSE,
    dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada        TIMESTAMPTZ,
    id_perangkat        TEXT
);

CREATE TABLE IF NOT EXISTS kader (
    id              UUID PRIMARY KEY,
    pengguna_id     UUID        REFERENCES pengguna(id),   -- boleh NULL: kader belum punya akun
    posyandu_id     UUID        NOT NULL REFERENCES posyandu(id),
    nama_lengkap    TEXT        NOT NULL,
    nomor_kontak    TEXT,
    jabatan         TEXT,
    aktif           BOOLEAN     NOT NULL DEFAULT TRUE,
    dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada    TIMESTAMPTZ,
    id_perangkat    TEXT
);

CREATE TABLE IF NOT EXISTS orang_tua (
    id              UUID PRIMARY KEY,
    nama_lengkap    TEXT        NOT NULL,
    nik             TEXT,                               -- dienkripsi di lapisan aplikasi
    nomor_kontak    TEXT,
    alamat          TEXT,
    rt_rw           TEXT,
    terjadi_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
    versi           INTEGER     NOT NULL DEFAULT 1,
    dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada    TIMESTAMPTZ,
    id_perangkat    TEXT
);

CREATE TABLE IF NOT EXISTS balita (
    id                  UUID PRIMARY KEY,
    posyandu_id         UUID        NOT NULL REFERENCES posyandu(id),
    nama_lengkap        TEXT        NOT NULL,
    nik                 TEXT,                           -- boleh kosong saat lahir; dienkripsi
    jenis_kelamin       TEXT        NOT NULL CHECK (jenis_kelamin IN ('laki-laki', 'perempuan')),
    tanggal_lahir       DATE        NOT NULL,
    nama_ibu_kandung    TEXT,
    berat_lahir_kg      NUMERIC(4, 2),
    panjang_lahir_cm    NUMERIC(4, 1),
    aktif               BOOLEAN     NOT NULL DEFAULT TRUE,   -- diperbarui proses berkala
    terjadi_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
    versi           INTEGER     NOT NULL DEFAULT 1,
    dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada        TIMESTAMPTZ,
    id_perangkat        TEXT
);

-- Penghubung banyak-ke-banyak balita ↔ wali
CREATE TABLE IF NOT EXISTS balita_orang_tua (
    id              UUID PRIMARY KEY,
    balita_id       UUID        NOT NULL REFERENCES balita(id),
    orang_tua_id    UUID        NOT NULL REFERENCES orang_tua(id),
    hubungan        TEXT        NOT NULL CHECK (hubungan IN ('ibu_kandung', 'ayah_kandung', 'wali')),
    kontak_utama    BOOLEAN     NOT NULL DEFAULT FALSE,
    terjadi_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
    versi           INTEGER     NOT NULL DEFAULT 1,
    dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada    TIMESTAMPTZ,
    id_perangkat    TEXT,
    UNIQUE (balita_id, orang_tua_id)
);

-- =============================================================
-- 2. Layanan
-- =============================================================

CREATE TABLE IF NOT EXISTS kunjungan (
    id                  UUID PRIMARY KEY,
    balita_id           UUID        NOT NULL REFERENCES balita(id),
    posyandu_id         UUID        NOT NULL REFERENCES posyandu(id),
    kader_id            UUID        REFERENCES kader(id),
    tanggal_kunjungan   DATE        NOT NULL,
    usia_bulan          INTEGER     NOT NULL CHECK (usia_bulan BETWEEN 0 AND 60),
    status_kehadiran    TEXT        NOT NULL DEFAULT 'hadir'
                                    CHECK (status_kehadiran IN ('hadir', 'tidak_hadir', 'dirujuk')),
    catatan             TEXT,
    divalidasi_oleh     UUID        REFERENCES pengguna(id),   -- NULL = belum divalidasi
    divalidasi_pada     TIMESTAMPTZ,
    terjadi_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
    versi           INTEGER     NOT NULL DEFAULT 1,
    dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada        TIMESTAMPTZ,
    id_perangkat        TEXT
);

CREATE TABLE IF NOT EXISTS pengukuran (
    id                      UUID PRIMARY KEY,
    kunjungan_id            UUID        NOT NULL REFERENCES kunjungan(id),
    berat_kg                NUMERIC(4, 2) NOT NULL,
    tinggi_cm               NUMERIC(4, 1),
    lingkar_kepala_cm       NUMERIC(4, 1),
    cara_ukur_tinggi        TEXT        CHECK (cara_ukur_tinggi IN ('terlentang', 'berdiri')),
    z_berat_umur            NUMERIC(4, 2),      -- dihitung server
    z_tinggi_umur           NUMERIC(4, 2),
    z_berat_tinggi          NUMERIC(4, 2),
    status_gizi             TEXT,
    sumber_z                TEXT,               -- acuan: 'WHO 2006' / 'Kemenkes'
    sumber_status           TEXT,               -- acuan persen median yang dipakai
    terjadi_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
    versi           INTEGER     NOT NULL DEFAULT 1,
    persen_median           NUMERIC(5, 2),   -- berat / median BB/U x 100
    dibuat_pada             TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada            TIMESTAMPTZ,
    id_perangkat            TEXT,
    UNIQUE (kunjungan_id)
);

CREATE TABLE IF NOT EXISTS tindak_lanjut (
    id                      UUID PRIMARY KEY,
    kunjungan_id            UUID        NOT NULL REFERENCES kunjungan(id),
    petugas_id              UUID        REFERENCES pengguna(id),
    jenis                   TEXT        NOT NULL CHECK (jenis IN ('pmt', 'rujukan', 'imunisasi', 'edukasi')),
    isi                     TEXT        NOT NULL,
    tanggal_tindak_lanjut   DATE,
    selesai                 BOOLEAN     NOT NULL DEFAULT FALSE,
    terjadi_pada    TIMESTAMPTZ NOT NULL DEFAULT now(),
    versi           INTEGER     NOT NULL DEFAULT 1,
    dibuat_pada             TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada            TIMESTAMPTZ,
    id_perangkat            TEXT
);

-- =============================================================
-- 3. Sistem — HANYA di server, tidak pernah dikirim ke tablet
-- =============================================================

CREATE TABLE IF NOT EXISTS sesi_login (
    id              UUID PRIMARY KEY,
    pengguna_id     UUID        NOT NULL REFERENCES pengguna(id),
    token_hash      TEXT        NOT NULL,
    id_perangkat    TEXT        NOT NULL,
    dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    kadaluarsa_pada TIMESTAMPTZ NOT NULL,
    dicabut_pada    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS log_audit (
    id              UUID PRIMARY KEY,
    pengguna_id     UUID        REFERENCES pengguna(id),   -- NULL untuk proses otomatis
    id_perangkat    TEXT,
    nama_tabel      TEXT        NOT NULL,
    id_baris        UUID        NOT NULL,
    aksi            TEXT        NOT NULL CHECK (aksi IN ('buat', 'ubah', 'hapus')),
    nilai_lama      JSONB,
    nilai_baru      JSONB,
    terjadi_pada    TIMESTAMPTZ NOT NULL,   -- waktu menurut perangkat
    diterima_pada   TIMESTAMPTZ NOT NULL DEFAULT now()  -- waktu menurut server
);

-- Hasil verifikasi cadangan: jumlah baris berkas dibandingkan basis data.
-- Inilah bukti "cadangan terakhir benar-benar bisa dipakai" (dr migrasi 003).
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

-- =============================================================
-- 4. Indeks
-- =============================================================

-- Hampir semua layar dimulai dari daftar balita aktif di satu Posyandu
CREATE INDEX IF NOT EXISTS idx_balita_posyandu_aktif      ON balita (posyandu_id, aktif)
    WHERE dihapus_pada IS NULL;

-- Riwayat pertumbuhan balita
CREATE INDEX IF NOT EXISTS idx_kunjungan_balita_tanggal   ON kunjungan (balita_id, tanggal_kunjungan DESC)
    WHERE dihapus_pada IS NULL;

-- Antrean validasi petugas kesehatan
CREATE INDEX IF NOT EXISTS idx_kunjungan_belum_validasi   ON kunjungan (posyandu_id, divalidasi_oleh)
    WHERE dihapus_pada IS NULL AND divalidasi_oleh IS NULL;

CREATE INDEX IF NOT EXISTS idx_pengukuran_kunjungan       ON pengukuran (kunjungan_id);
CREATE INDEX IF NOT EXISTS idx_tindak_lanjut_kunjungan    ON tindak_lanjut (kunjungan_id);
CREATE INDEX IF NOT EXISTS idx_balita_orang_tua_balita    ON balita_orang_tua (balita_id);

CREATE INDEX IF NOT EXISTS idx_log_audit_baris            ON log_audit (nama_tabel, id_baris, terjadi_pada DESC);
CREATE INDEX IF NOT EXISTS idx_uji_cadangan_waktu         ON uji_cadangan (diperiksa_pada DESC);
CREATE INDEX IF NOT EXISTS idx_sesi_pengguna              ON sesi_login (pengguna_id) WHERE dicabut_pada IS NULL;

-- =============================================================
-- 5. Batasan penting
-- =============================================================

-- Satu balita tidak boleh tercatat dua kali pada hari yang sama
CREATE UNIQUE INDEX IF NOT EXISTS uq_kunjungan_balita_tanggal
    ON kunjungan (balita_id, tanggal_kunjungan)
    WHERE dihapus_pada IS NULL;

-- Hanya satu wali utama per balita
CREATE UNIQUE INDEX IF NOT EXISTS uq_wali_utama
    ON balita_orang_tua (balita_id)
    WHERE kontak_utama AND dihapus_pada IS NULL;

-- Menolak salah ketik yang mencolok sebelum data tersimpan.
-- NILAI INI BELUM FINAL — harus ditinjau petugas kesehatan (lihat PRD Bagian 10).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_pengukuran_rentang'
    ) THEN
        ALTER TABLE pengukuran ADD CONSTRAINT ck_pengukuran_rentang CHECK (
                berat_kg            IS NULL OR berat_kg            BETWEEN 1   AND 40
            AND tinggi_cm           IS NULL OR tinggi_cm           BETWEEN 30  AND 130
            AND lingkar_kepala_cm   IS NULL OR lingkar_kepala_cm   BETWEEN 25  AND 60
        );
    END IF;
END $$;

-- =============================================================
-- 5b. Acuan pertumbuhan
-- Bila nanti beralih ke z-skor WHO, tambah tabel acuan LMS dan
-- isi kolom z_* pada pengukuran. Kolomnya sudah tersedia.
-- =============================================================

CREATE TABLE IF NOT EXISTS acuan_berat_umur (
    id              UUID PRIMARY KEY,
    usia_bulan      INTEGER     NOT NULL CHECK (usia_bulan BETWEEN 0 AND 60),
    jenis_kelamin   TEXT        NOT NULL CHECK (jenis_kelamin IN ('laki-laki', 'perempuan')),
    median_berat_kg NUMERIC(5, 3) NOT NULL,
    sumber          TEXT        NOT NULL,          -- misal 'Kemenkes 2020'
    dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    dihapus_pada    TIMESTAMPTZ,
    id_perangkat    TEXT,
    UNIQUE (usia_bulan, jenis_kelamin, sumber)
);

CREATE INDEX IF NOT EXISTS idx_acuan_berat_umur
    ON acuan_berat_umur (jenis_kelamin, usia_bulan)
    WHERE dihapus_pada IS NULL;

-- =============================================================
-- 6. Trigger: perbarui diperbarui_pada otomatis
-- =============================================================

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'posyandu', 'pengguna', 'kader', 'orang_tua', 'balita', 'balita_orang_tua',
        'kunjungan', 'pengukuran', 'tindak_lanjut', 'acuan_berat_umur'
    ] LOOP
        -- Idempoten: jangan buat ulang trigger yang sudah ada.
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = format('trg_%s_diperbarui', t)
              AND tgrelid = format('%I', t)::regclass
        ) THEN
            EXECUTE format('
                CREATE TRIGGER trg_%1$s_diperbarui
                BEFORE UPDATE ON %1$s
                FOR EACH ROW EXECUTE FUNCTION set_diperbarui_pada()', t);
        END IF;
    END LOOP;
END $$;

-- =============================================================
-- 7. CATATAN: tabel khusus tablet
--
-- antrean_sinkron HANYA ada di penyimpanan lokal tablet
-- (IndexedDB), bukan di PostgreSQL. Tidak dibuat di sini.
--
-- Kolomnya: id, nama_tabel, id_baris, aksi, muatan JSONB,
--           versi, status, jumlah_coba, pesan_gagal, dibuat_pada
--
-- Isi antrean yang dikirim ke server, bukan tabelnya.
-- =============================================================
