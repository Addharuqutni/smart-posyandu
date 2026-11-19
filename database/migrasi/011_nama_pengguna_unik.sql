-- =============================================================
-- Migrasi 011 — Nama pengguna unik hanya untuk akun yang masih hidup
--
-- Sejak hapus akun memakai hapus lunak (migrasi tidak lagi DELETE fisik),
-- batasan UNIQUE lama tetap memegang baris yang sudah dihapus: membuat akun
-- baru dengan nama yang sama balas 409 "nama pengguna sudah dipakai" padahal
-- nama itu tidak ada lagi di daftar akun.
--
-- Diganti indeks unik parsial supaya jaminan "satu akun hidup per nama" tetap
-- berlaku. Idempoten: aman dijalankan berulang.
-- =============================================================

ALTER TABLE pengguna DROP CONSTRAINT IF EXISTS pengguna_nama_pengguna_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pengguna_nama_hidup
    ON pengguna (nama_pengguna) WHERE dihapus_pada IS NULL;
