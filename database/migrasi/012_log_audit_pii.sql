-- =============================================================
-- Migrasi 012 — Buang kontak dan alamat wali dari log_audit lama
--
-- Sejak domain/tabel.js memasukkan nomor_kontak dan alamat ke RAHASIA,
-- perubahan baru tidak menyimpan keduanya. Baris lama tetap mengandung PII
-- dan masih dikembalikan /aktivitas. Bersihkan kunci itu di tempat, tanpa
-- menghapus baris audit lain. Idempoten: aman dijalankan berulang.
-- =============================================================

UPDATE log_audit
SET nilai_lama = nilai_lama - 'nomor_kontak' - 'alamat',
    nilai_baru = nilai_baru - 'nomor_kontak' - 'alamat'
WHERE nilai_lama ? 'nomor_kontak'
   OR nilai_lama ? 'alamat'
   OR nilai_baru ? 'nomor_kontak'
   OR nilai_baru ? 'alamat';
