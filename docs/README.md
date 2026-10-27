# ERP4 Pesantren — Dokumentasi

ERP modular untuk operasional pesantren. Model rilis awal yang sedang disiapkan adalah **instalasi mandiri per pesantren** pada VPS atau infrastruktur on-premise. Produk ini bukan SaaS multi-pelanggan yang dioperasikan vendor.

Dokumentasi memisahkan kontrak produk, rancangan backend, skema Supabase, panduan deployment, dan checkpoint validasi. Data Firestore pada snapshot development merupakan data dummy dan tidak menjadi prasyarat migrasi; data contoh dapat dibuat manual setelah instalasi stabil.

## Dokumen utama

- [Kesiapan Komersial dan Go-Live](active/00_PRODUCT/COMMERCIAL_READINESS.md) — status bukti, gerbang keamanan/staging, portabilitas, pilot, lisensi, dan dukungan.
- [ERD target Supabase](active/06_DATABASE/SUPABASE_ERD.md) — tabel dan relasi berdasarkan source migration Supabase.
- [Design System](active/11_UI_UX/DESIGN_SYSTEM.md) — token visual, pola komponen, aksesibilitas, dan responsivitas.
- [Deployment pelanggan](guides/CUSTOMER_MANAGED_DEPLOYMENT.md) — konfigurasi Docker dan provisioning tenant/Admin.
- [Panduan migrasi dan upgrade](guides/MIGRATION_GUIDE.md) — prosedur tim teknis untuk perubahan schema dan deployment.
- [Checkpoint tanpa salin data](active/06_DATABASE/CHECKPOINT_NO_DATA_COPY_SCHEMA_READINESS_2026-10-27.md) — bukti CI dan status akses/migration staging saat ini.
- [Struktur Firestore historis](active/06_DATABASE/FIRESTORE_STRUCTURE.md) — inventaris legacy untuk konteks saja; bukan sumber data yang harus disalin.

## Batas klaim

Status fitur dan deployment harus mengikuti bukti di checkpoint komersial terbaru. CI lokal dengan fixture sintetis tidak sama dengan migrasi staging, UAT login, instalasi pelanggan, atau kesiapan produksi.

