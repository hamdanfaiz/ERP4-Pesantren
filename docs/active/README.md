# Dokumentasi Aktif

Folder ini berisi dokumen pekerjaan, fitur, dan rancangan arsitektur yang **masih dalam proses**.

Setelah fitur diterapkan dan digabung, pindahkan dokumentasinya ke folder `completed` atau gabungkan ke panduan utama bila sesuai.

## Kesiapan produk
- [**Agent Start Here**](00_PRODUCT/AGENT_START_HERE.md) — wajib dibaca semua agent sebelum mengubah kode, skema, flag, atau data.
- [Kesiapan Komersial dan Handoff Backend](00_PRODUCT/COMMERCIAL_READINESS.md) — status, bukti, risiko migrasi, dan tahapan handoff; periksa tanggal snapshot sebelum menggunakannya.
- [Checkpoint pengembangan — 12 Nov 2026](00_PRODUCT/CHECKPOINT_2026-11-12_RESUME.md) — posisi PR #91, penghambat, dan langkah saat melanjutkan.
- [Checkpoint Relasi & Ekosistem + OpenWA — 13 Nov 2026](00_PRODUCT/CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md) — perubahan Alumni/CRM/Donasi/Marketplace/Analitik, integrasi OpenWA, dan backlog lanjutan.
- [Checkpoint jeda pengembangan — 10 Nov 2026 (historis)](00_PRODUCT/CHECKPOINT_2026-11-10_PAUSE.md) — snapshot historis sebelum UAT Tahfidz terbaru.
- [UAT API VQE staging — 10–11 Nov 2026](00_PRODUCT/VQE_STAGING_API_UAT_2026-11-10.md) — hasil Dokumen Digital, PPDB/Keuangan, Perpustakaan, Tahfidz, serta isolasi fixture sintetis.
- [Rekonsiliasi ledger migrasi PTSAS Production dan VQE](06_DATABASE/PRODUCTION_MIGRATION_LEDGER_RECONCILIATION_2026-11-11.md) — perbandingan nomor/nama migrasi source dengan ledger kedua proyek, alias staging, dan langkah rekonsiliasi.
- [Progres historis — 30 Okt 2026](05_ARCHITECTURE/PROJECT_COMPLETION_PROGRESS_2026-10-30.md) — arsip historis, bukan ukuran status terkini.
- [Checkpoint penempatan menu — 1 Nov 2026](00_PRODUCT/MODULE_OWNERSHIP_CHECKPOINT_2026-11-01.md) — lokasi menu pada modul pemilik, batas katalog baca-saja, hasil pemeriksaan lokal, dan gate yang masih terbuka.
- [Audit paritas submodul dan isi tab AI Studio — 9 Nov 2026](00_PRODUCT/AI_STUDIO_TAB_LEVEL_PARITY_2026-11-09.md) — perbandingan fitur per tab, termasuk status yang benar-benar tersambung dan gap yang masih perlu dibangun.

## Referensi aktif
- [Audit akses RLS Supabase staging — 8 Nov 2026](05_ARCHITECTURE/VQE_RLS_PRIVILEGE_AUDIT_2026-11-08.md) — grant, policy, FORCE RLS, Storage privat, view, dan fungsi PostgreSQL pada VQE; tidak mencakup Production.
- [Checkpoint terkini PR #38 — PPDB Wali di VQE](06_DATABASE/CHECKPOINT_GUARDIAN_PPDB_STAGING_2026-10-31.md) — snapshot historis; gunakan checkpoint 12 Nov untuk status proyek keseluruhan.
- [Tindak lanjut migration audit Data Induk di VQE](06_DATABASE/VQE_STAGING_MASTER_DATA_AUDIT_MIGRATION_2026-11-01.md) — alasan tidak memakai MCP `apply_migration`, status baca-saja, dan prosedur dry-run CLI tanpa membuat branch Supabase.
- [Query verifikasi audit Data Induk di VQE](06_DATABASE/VQE_MASTER_DATA_AUDIT_POSTCHECK.sql) — pemeriksaan pascamigrasi yang hanya mengembalikan hasil pass/fail.
- [Audit penutupan PR — 30 Okt 2026](05_ARCHITECTURE/PR_CLOSURE_AUDIT_2026-10-30.md) — catatan historis PR #1–#13.
- [Audit dependensi PR — 25 Okt 2026](05_ARCHITECTURE/PR_DEPENDENCY_AUDIT_2026-10-25.md) — catatan historis tentang base, stack, CI, review, dan kesiapan merge PR #1–#13.
- [Paritas fitur PR #11 → #13](05_ARCHITECTURE/PR11_TO_PR13_FEATURE_PARITY.md) — pemetaan fitur, perubahan autentikasi, serta gap PPDB, Finance, dan dokumen.
- [Design System](11_UI_UX/DESIGN_SYSTEM.md) — token visual, pola komponen bersama, aksesibilitas, dan tampilan responsif.
- [Checkpoint impor lama PPDB](06_DATABASE/PPDB_LEGACY_IMPORT_CHECKPOINT.md) — pemetaan tanggal dan syarat impor tenant yang dibatasi.
- [Checkpoint impor lama Master Data](06_DATABASE/MASTER_DATA_LEGACY_IMPORT_CHECKPOINT.md) — pemetaan tenant, data struktur/santri/wali, dan rekonsiliasi yang tersisa.
- [Inventaris Firestore ke Supabase](06_DATABASE/FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md) — sumber Firestore, koleksi, cakupan importer, dan gerbang migrasi.
- [Petunjuk Teknis Akses dan Rehearsal Migrasi](06_DATABASE/TEAM_TECHNICAL_ACCESS_AND_REHEARSAL_RUNBOOK_2026-10-26.md) — langkah connector Supabase, ADC Firestore, migration preflight, dry-run, dan checklist bukti untuk tim teknis.
- [ERD target Supabase](06_DATABASE/SUPABASE_ERD.md) — relasi tenant, domain utama, dan tabel berdasarkan migration pada checkout.
- [Checkpoint rilis — arsip estimasi 26 Okt 2026](05_ARCHITECTURE/CHECKPOINT_2026-10-25.md) — snapshot historis; gunakan dokumen Kesiapan Komersial untuk estimasi saat ini.
