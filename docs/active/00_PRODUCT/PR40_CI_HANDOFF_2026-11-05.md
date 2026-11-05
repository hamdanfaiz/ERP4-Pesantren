# Serah terima PR #40 — 5 November 2026

## Status PR dan bukti saat ini

- Repo: `hamdanfaiz/ERP4-Pesantren`; PR [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40), branch `codex/menu-owner-placement-20261101`.
- Commit kode terakhir adalah `180cc08`, yang menyatukan enam tab Dokumen Digital pada `ERPTabs`; commit `4d32053` sebelumnya menyamakan tab Operasional Fasilitas Asrama dengan komponen yang sama.
- Pada head `180cc08`, PR masih Draft/Open dan API GitHub menandainya belum mergeable.
- Diagnostik pada head tersebut menemukan hanya `Supabase Preview` berstatus `skipped` karena branch tidak diasosiasikan dengan Supabase Branch; tidak ada GitHub Actions workflow run atau status context. Check itu bukan bukti build atau tes aplikasi. Push Git terbaru juga belum menghasilkan workflow run; tim perlu memeriksa event delivery atau konfigurasi Actions.
- Tidak ada migration atau data Production PTSAS `ptsasgdvgrbdtgyqieie` yang diubah.
- Supabase MCP menolak `get_project` dan read-only SQL untuk Production. `list_migrations` mengembalikan daftar kosong, tetapi tanpa akses proyek hasil itu bukan bukti bahwa schema/ledger Production kosong; status Production tetap belum terverifikasi.

## Pemeriksaan lokal pada head `fb72586`

- `npm run lint` dan `npm run build` lulus. Build memberi peringatan anotasi Rollup dari Zod dan ukuran chunk `react-pdf` sekitar 1,46 MB.
- Seluruh 39 skrip tes non-database/API yang tersedia lulus. Ini mencakup pemeriksaan migrasi offline, runtime Supabase-only, tenant/RBAC, alur PPDB, Master Data, Akademik, Tahfidz, impor/ekspor, pengaturan Finance, serta dua tes HTTP loopback setelah akses `127.0.0.1` diizinkan.
- Tujuh tes yang memerlukan koneksi database/API live belum dijalankan: `test:db`, `test:db:nis-race`, `test:db:tahfidz-session-race`, `test:api:auth-tenant`, `test:api:finance-storage`, `test:api:library-storage`, dan `test:db:backup-restore`.
- Hasil lokal bukan workflow GitHub dan tidak membuktikan UAT visual, integrasi Supabase live, atau seluruh gerbang rilis.

## Staging VQE dan prasyarat koneksi

- Target staging yang disetujui: `vqemuyzveuirlkvdggjd`. Pemeriksaan baca-saja Supabase mencatat 133 migration staging dari 134 migration source. `20270302000000_academic_class_reference_pagination.sql` belum tercatat.
- Ledger staging masih menggunakan versi alias `20261101015832_tenant_reference_relationships`; source yang benar adalah `20270214120000_tenant_reference_relationships`. Runbook memuat pemeriksaan exact-SQL sebelum rekonsiliasi.
- `npm run preflight:db-migrations` berhenti dengan pesan bahwa `SUPABASE_DB_POOLER_URL` atau `SUPABASE_DB_URL` harus disediakan. `.env` worktree UAT VQE hanya memiliki URL dan API key Supabase, tanpa URL koneksi Postgres. `.env` pada worktree kanonis menunjuk ke Production dan tidak boleh dipakai untuk preflight staging.
- CLI `supabase` dan `psql` tidak tersedia di PATH; Docker juga tidak terdeteksi. Ada binary CLI sementara versi `2.122.0`, tetapi workflow repository meminta CLI `2.84.2`; gunakan versi yang dipin, bukan binary sementara.
- Jadi pemeriksaan alias yang tersimpan di database belum dapat diulang melalui skrip preflight resmi pada checkout ini. Tidak memakai API secret sebagai pengganti password Postgres.

## Snapshot Supabase staging VQE — baca-saja, 5 November 2026

- Proyek staging `vqemuyzveuirlkvdggjd` berstatus `ACTIVE_HEALTHY` di `ap-northeast-1`, PostgreSQL 17.11. Pemeriksaan migrations menemukan 133 versi terpasang; terbaru `20270301000000 academic_student_roster_pagination`. Source memiliki 134 file, sehingga `20270302000000_academic_class_reference_pagination.sql` masih belum terpasang. Alias ledger tenant-reference tetap perlu direkonsiliasi dengan prosedur pada bagian prasyarat.
- Daftar schema `public` berisi 167 tabel; 167 memakai RLS dan 0 tidak. Security Advisor melaporkan rls_enabled_no_policy: 162 (INFO); auth_leaked_password_protection: 1 (WARN). Temuan `rls_enabled_no_policy` berlevel INFO: tabel tanpa policy tetap tertutup untuk akses Data API langsung. Namun kode server menggunakan secret key yang melewati RLS; batas keamanan tetap memerlukan verifikasi profil aktif, tenant, role, dan izin modul di setiap handler. Source memiliki pemeriksaan actor tersebut untuk Master Data dan Dokumen Digital; tes integrasi Auth/tenant masih wajib sebelum merge.
- Temuan Auth `auth_leaked_password_protection` berlevel WARN; pengaturan perlindungan kata sandi bocor perlu diperiksa di Auth proyek staging. MCP tidak mengubah setting ini.
- Performance Advisor melaporkan unindexed_foreign_keys: 258 (INFO); unused_index: 102 (INFO). Jangan menambahkan indeks ke semua foreign key atau menghapus indeks yang belum terpakai secara massal. Triage dengan pola query produksi dan `EXPLAIN (ANALYZE, BUFFERS)` setelah data sintetis representatif tersedia.
- Ini snapshot advisory baca-saja, bukan persetujuan keamanan/performa atau bukti UAT. Tidak ada migration, policy, index, setting Auth, atau data Production yang diubah.

## Urutan aman untuk tim backend

1. Sediakan `SUPABASE_DB_POOLER_URL` khusus VQE di environment lokal/CI yang tidak di-commit. Pastikan project ref dalam URL adalah `vqemuyzveuirlkvdggjd`; jangan gunakan nilai dari `.env` Production dan jangan kirim kredensial melalui chat.
2. Siapkan Supabase CLI versi `2.84.2` sesuai workflow repo dan `psql`, atau runner CI terisolasi yang menyediakan keduanya. Jalankan `npm run preflight:db-migrations` terhadap VQE.
3. Lanjutkan hanya jika preflight memastikan SQL alias `20261101015832 → 20270214120000` cocok persis serta tidak ada versi asing, mismatch SQL/nama, atau urutan yang tertinggal. Rekonsiliasi ledger dengan `supabase migration repair 20270214120000 --status applied` hanya setelah verifikasi itu. Jangan mengubah ledger dengan SQL manual dan jangan menjalankan ulang migration tenant-reference.
4. Jalankan `supabase migration list` dan `supabase db push --dry-run` dengan target VQE yang eksplisit. Tinjau daftar perubahan sebelum menerapkan migration yang belum ada; verifikasi indeks dan fungsi picker kelas sesudahnya.
5. Jalankan seluruh tujuh tes integrasi di atas di Postgres/Supabase terisolasi dan lampirkan tautan workflow serta hasil per job. Jangan gunakan Production sebagai target tes.
6. Selesaikan UAT Admin VQE: login, isolasi tenant/role, Data Induk, Naming Series, pagination, impor/ekspor, dan modul terkait. Pertahankan PR Draft sampai CI, database, dan UAT terbukti lulus.

## Temuan UI Dokumen Digital — tab diselaraskan, verifikasi visual masih terbuka

- Pengguna melaporkan bahwa style tab pada modul Dokumen Digital belum sesuai standar UI.
- Pemeriksaan halaman referensi AI Studio pada 5 November menampilkan lima tab utama: Surat Masuk, Surat Keluar, E-Approval, Arsip Digital, dan AI OCR Scanner.
- Koreksi lanjutan menempatkan **Semua dokumen** dalam tab strip bersama, sehingga semua navigasi pada `SupabaseDocumentManager` menggunakan `ERPTabs` dan style standar yang sama. Tab utama kini enam: Semua dokumen, Surat Masuk, Surat Keluar, Persetujuan elektronik, Arsip Digital, dan Pemindai OCR.
- **Internal** tetap tersedia sebagai pilihan filter jenis ketika tab Semua dokumen dipilih. Perubahan hanya menyamakan tampilan dan penempatan navigasi; UAT visual/responsif masih perlu dilakukan pada sesi Admin staging.
- Commit `4d32053` mengganti navigasi khusus pada Operasional Fasilitas Asrama dengan `ERPTabs`, menjaga dua bagian sesuai role yang diizinkan. Tidak ada perubahan pada sumber data atau aturan akses.
- `npm run lint` dan `npm run build` lulus pada checkout persis yang berisi koreksi tab Dokumen Digital `180cc08`; build masih memberi peringatan Rollup dari Zod dan ukuran chunk `react-pdf` sekitar 1,46 MB.
- Belum ada UAT visual/responsif pada browser dengan sesi Admin VQE. Pemeriksaan source memastikan keenam kontrol menggunakan komponen bersama, tetapi belum membuktikan hasil render dan perpindahan tab di runtime.

## Gerbang sebelum merge atau cutover

- PR tetap Draft/Open dan saat pemeriksaan GitHub belum mergeable.
- Tidak ada workflow run/check untuk head terbaru.
- Uji integrasi, rekonsiliasi ledger, penerapan/rehearsal migration staging, dan UAT Admin masih harus dibuktikan.
- Cutover Production baru dapat dipertimbangkan setelah staging diterima dan seluruh gerbang di atas lulus. Tidak ada langkah dalam handoff ini yang menerapkan perubahan ke Production.
