# Dokumentasi Aktif

Folder ini berisi dokumen pekerjaan, fitur, dan rancangan arsitektur yang **masih dalam proses**.

Setelah fitur diterapkan dan digabung, pindahkan dokumentasinya ke folder `completed` atau gabungkan ke panduan utama bila sesuai.

## Kesiapan produk
- [Kesiapan Komersial dan Go-Live](00_PRODUCT/COMMERCIAL_READINESS.md) — kontrak produk self-hosted, bukti teknis, dan tahapan pilot/deploy.
- [Progres penyelesaian pengembangan — 30 Okt 2026](05_ARCHITECTURE/PROJECT_COMPLETION_PROGRESS_2026-10-30.md) — estimasi progres pengembangan sekitar 73%, tidak termasuk pelaksanaan deployment dan UAT oleh tim penerapan.
- [Checkpoint penempatan menu — 1 Nov 2026](00_PRODUCT/MODULE_OWNERSHIP_CHECKPOINT_2026-11-01.md) — lokasi menu pada modul pemilik, batas katalog baca-saja, hasil pemeriksaan lokal, dan gate yang masih terbuka.

## Referensi aktif
- [Audit akses RLS Supabase staging — 8 Nov 2026](05_ARCHITECTURE/VQE_RLS_PRIVILEGE_AUDIT_2026-11-08.md) — grant, policy, FORCE RLS, Storage privat, view, dan fungsi PostgreSQL pada VQE; tidak mencakup Production.
- [Checkpoint terkini PR #38 — PPDB Wali di VQE](06_DATABASE/CHECKPOINT_GUARDIAN_PPDB_STAGING_2026-10-31.md) — 112 migrasi staging, selisih terhadap `main`, keterbatasan akses PTSAS, dan gerbang UAT.
- [Tindak lanjut migration audit Data Induk di VQE](06_DATABASE/VQE_STAGING_MASTER_DATA_AUDIT_MIGRATION_2026-11-01.md) — alasan tidak memakai MCP `apply_migration`, status baca-saja, dan prosedur dry-run CLI tanpa membuat branch Supabase.
- [Query verifikasi audit Data Induk di VQE](06_DATABASE/VQE_MASTER_DATA_AUDIT_POSTCHECK.sql) — pemeriksaan pascamigrasi yang hanya mengembalikan hasil pass/fail.
- [Audit penutupan PR — 30 Okt 2026](05_ARCHITECTURE/PR_CLOSURE_AUDIT_2026-10-30.md) — status terkini PR #1–#13, bukti CI, perbandingan awal, dan syarat penutupan/penggabungan.
- [Audit dependensi PR — 25 Okt 2026](05_ARCHITECTURE/PR_DEPENDENCY_AUDIT_2026-10-25.md) — catatan historis tentang base, stack, CI, review, dan kesiapan merge PR #1–#13.
- [Paritas fitur PR #11 → #13](05_ARCHITECTURE/PR11_TO_PR13_FEATURE_PARITY.md) — pemetaan fitur, perubahan autentikasi, serta gap PPDB, Finance, dan dokumen.

- [Design System](11_UI_UX/DESIGN_SYSTEM.md) — token visual, pola komponen bersama, aksesibilitas, dan tampilan responsif.
- [Checkpoint impor lama PPDB](06_DATABASE/PPDB_LEGACY_IMPORT_CHECKPOINT.md) — pemeriksaan sumber, pemetaan tanggal, dan syarat impor tenant yang dibatasi.
- [Checkpoint impor lama Master Data](06_DATABASE/MASTER_DATA_LEGACY_IMPORT_CHECKPOINT.md) — pemetaan tenant, data struktur/santri/wali, dan rekonsiliasi yang tersisa.
- [Inventaris Firestore ke Supabase](06_DATABASE/FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md) — sumber Firestore, koleksi, cakupan importer, dan gerbang migrasi.
- [Petunjuk Teknis Akses dan Rehearsal Migrasi](06_DATABASE/TEAM_TECHNICAL_ACCESS_AND_REHEARSAL_RUNBOOK_2026-10-26.md) — langkah connector Supabase, ADC Firestore, migration preflight, dry-run, dan checklist bukti untuk tim teknis.

- [ERD target Supabase](06_DATABASE/SUPABASE_ERD.md) — relasi tenant, domain utama, dan tabel berdasarkan migration pada checkout.
- [Checkpoint rilis — arsip estimasi 26 Okt 2026](05_ARCHITECTURE/CHECKPOINT_2026-10-25.md) — snapshot historis; gunakan dokumen progres pengembangan terbaru untuk persentase saat ini.
