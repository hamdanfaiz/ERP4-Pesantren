# Serah terima PR #40 — 5 November 2026

## Status PR dan bukti saat ini

- Repo: `hamdanfaiz/ERP4-Pesantren`; PR [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40), branch `codex/menu-owner-placement-20261101`.
- Source aplikasi terakhir diverifikasi pada `989b0571a6b08a9069f09a6f8a05a56cc0202c81`; commit setelahnya hanya memperbarui dokumentasi handoff.
- PR masih Draft/Open dan API GitHub menandainya belum mergeable.
- Pemeriksaan GitHub pada head PR saat ditinjau dan pembaruan dokumentasi sesudahnya tidak menemukan workflow run, status check, atau review. Belum ada bukti CI GitHub.
- Tidak ada migration atau data Production PTSAS `ptsasgdvgrbdtgyqieie` yang diubah.
- Supabase MCP menolak `get_project` dan read-only SQL untuk Production. `list_migrations` mengembalikan daftar kosong, tetapi tanpa akses proyek hasil itu bukan bukti bahwa schema/ledger Production kosong; status Production tetap belum terverifikasi.

## Pemeriksaan lokal pada source `989b057`

- `npm run lint` — lulus.
- `npm run build` — lulus. Build memberi peringatan anotasi Rollup dari Zod dan ukuran chunk `react-pdf` sekitar 1,46 MB.
- 39/39 tes non-database/API lulus pada pemeriksaan ulang 5 November, termasuk guard runtime Supabase-only, Master Data, PPDB, Akademik, Tahfidz, tenant, impor/ekspor, RBAC, trusted-proxy, dan runtime-config HTTP. Dua tes loopback lulus setelah diberi izin untuk mengakses server lokal `127.0.0.1`; ini tetap bukti lokal, bukan workflow GitHub.
- Uji database/API yang belum terbukti: `test:db`, `test:db:nis-race`, `test:db:tahfidz-session-race`, `test:api:auth-tenant`, `test:api:finance-storage`, `test:api:library-storage`, dan `test:db:backup-restore`.

## Staging VQE dan prasyarat koneksi

- Target staging yang disetujui: `vqemuyzveuirlkvdggjd`. Pemeriksaan baca-saja Supabase mencatat 133 migration staging dari 134 migration source. `20270302000000_academic_class_reference_pagination.sql` belum tercatat.
- Ledger staging masih menggunakan versi alias `20261101015832_tenant_reference_relationships`; source yang benar adalah `20270214120000_tenant_reference_relationships`. Runbook memuat pemeriksaan exact-SQL sebelum rekonsiliasi.
- `npm run preflight:db-migrations` berhenti dengan pesan bahwa `SUPABASE_DB_POOLER_URL` atau `SUPABASE_DB_URL` harus disediakan. `.env` worktree UAT VQE hanya memiliki URL dan API key Supabase, tanpa URL koneksi Postgres. `.env` pada worktree kanonis menunjuk ke Production dan tidak boleh dipakai untuk preflight staging.
- CLI `supabase` dan `psql` tidak tersedia di PATH; Docker juga tidak terdeteksi. Ada binary CLI sementara versi `2.122.0`, tetapi workflow repository meminta CLI `2.84.2`; gunakan versi yang dipin, bukan binary sementara.
- Jadi pemeriksaan alias yang tersimpan di database belum dapat diulang melalui skrip preflight resmi pada checkout ini. Tidak memakai API secret sebagai pengganti password Postgres.

## Urutan aman untuk tim backend

1. Sediakan `SUPABASE_DB_POOLER_URL` khusus VQE di environment lokal/CI yang tidak di-commit. Pastikan project ref dalam URL adalah `vqemuyzveuirlkvdggjd`; jangan gunakan nilai dari `.env` Production dan jangan kirim kredensial melalui chat.
2. Siapkan Supabase CLI versi `2.84.2` sesuai workflow repo dan `psql`, atau runner CI terisolasi yang menyediakan keduanya. Jalankan `npm run preflight:db-migrations` terhadap VQE.
3. Lanjutkan hanya jika preflight memastikan SQL alias `20261101015832 → 20270214120000` cocok persis serta tidak ada versi asing, mismatch SQL/nama, atau urutan yang tertinggal. Rekonsiliasi ledger dengan `supabase migration repair 20270214120000 --status applied` hanya setelah verifikasi itu. Jangan mengubah ledger dengan SQL manual dan jangan menjalankan ulang migration tenant-reference.
4. Jalankan `supabase migration list` dan `supabase db push --dry-run` dengan target VQE yang eksplisit. Tinjau daftar perubahan sebelum menerapkan migration yang belum ada; verifikasi indeks dan fungsi picker kelas sesudahnya.
5. Jalankan seluruh tujuh tes integrasi di atas di Postgres/Supabase terisolasi dan lampirkan tautan workflow serta hasil per job. Jangan gunakan Production sebagai target tes.
6. Selesaikan UAT Admin VQE: login, isolasi tenant/role, Data Induk, Naming Series, pagination, impor/ekspor, dan modul terkait. Pertahankan PR Draft sampai CI, database, dan UAT terbukti lulus.

## Temuan UI Dokumen Digital — masih terbuka

- Pengguna melaporkan secara khusus bahwa style tab pada modul Dokumen Digital belum sesuai standar UI yang digunakan sistem. Temuan ini belum dianggap selesai.
- Dokumen Digital menggunakan komponen tab bersama `ERPTabs`; commit `4d8df2e` menghapus margin tambahan agar jaraknya mengikuti container halaman, tetapi pemakaian komponen bersama belum membuktikan hasil visualnya sudah konsisten.
- Preview lokal yang dapat diamati menampilkan landing publik, bukan sesi Admin. Perbandingan visual dengan modul acuan dan koreksi yang diperlukan masih menunggu UAT Admin VQE. Jangan tandai tab Dokumen Digital selesai sebelum tampilannya diperiksa langsung.

## Gerbang sebelum merge atau cutover

- PR tetap Draft/Open dan saat pemeriksaan GitHub belum mergeable.
- Tidak ada workflow run/check untuk head terbaru.
- Uji integrasi, rekonsiliasi ledger, penerapan/rehearsal migration staging, dan UAT Admin masih harus dibuktikan.
- Cutover Production baru dapat dipertimbangkan setelah staging diterima dan seluruh gerbang di atas lulus. Tidak ada langkah dalam handoff ini yang menerapkan perubahan ke Production.