-- =============================================================
-- Migrasi 002 — indeks kursor sinkron
--
-- `GET /sinkron` membaca per halaman dengan
--     WHERE diperbarui_pada >= $1 ORDER BY diperbarui_pada, id LIMIT n
-- untuk keenam tabel sinkron. Tanpa indeks, PostgreSQL memindai seluruh
-- tabel lalu menyortir pada setiap halaman. Terukur pada 87.000 kunjungan:
-- 173 ms per halaman, dan tarikan awal 180.000 baris butuh ~2 menit.
--
-- Indeks (diperbarui_pada, id) membuat pembacaan berhenti setelah n baris.
--
-- Idempoten: aman dijalankan berulang.
-- =============================================================

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'balita', 'orang_tua', 'balita_orang_tua',
        'kunjungan', 'pengukuran', 'tindak_lanjut'
    ] LOOP
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON %I (diperbarui_pada, id)',
            'idx_' || t || '_sinkron', t
        );
    END LOOP;
END $$;
