# Serah terima PR #40 — 5 November 2026

## Status PR dan bukti saat ini

- Repo: `hamdanfaiz/ERP4-Pesantren`; PR [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40), branch `codex/menu-owner-placement-20261101`.
- Commit kode terakhir adalah `180cc08`, yang menyatukan enam tab Dokumen Digital pada `ERPTabs`; commit `4d32053` sebelumnya menyamakan tab Operasional Fasilitas Asrama dengan komponen yang sama.
- Pada pemeriksaan PR head `b60200b`, statusnya Draft/Open; endpoint GitHub mentah mengembalikan `mergeable=null` dan `mergeable_state=unknown`. Status ini belum membuktikan ada konflik merge.
- GitHub Actions repository aktif dan memiliki 1.135 run historis; run terbaru yang terlihat (#1135) selesai sukses pada 4 November 2026 pukul 10:21 UTC, sebelum commit UI pada 5 November. Untuk head `b60200b`, tidak ada workflow run/status baru; check yang terlihat hanya `Supabase Preview` berstatus `skipped` karena branch tidak diasosiasikan dengan Supabase Branch. Push Git pada 5 November belum menghasilkan workflow, jadi tim perlu memeriksa event delivery/configuration atau mendorong update dari kredensial GitHub lokal mereka. Run historis tidak membuktikan head terkini.
- Tidak ada migration atau data Production PTSAS `ptsasgdvgrbdtgyqieie` yang diubah.
- Supabase MCP menolak `get_project` dan read-only SQL untuk Production. `list_migrations` mengembalikan daftar kosong, tetapi tanpa akses proyek hasil itu bukan bukti bahwa schema/ledger Production kosong; status Production tetap belum terverifikasi.

## Pemeriksaan lokal pada source UI PR (`fb72586` dan commit kode `180cc08`)

- `npm run lint` dan `npm run build` lulus. Build memberi peringatan anotasi Rollup dari Zod dan ukuran chunk `react-pdf` sekitar 1,46 MB.
- Seluruh 39 skrip tes non-database/API yang tersedia lulus menggunakan npm/Node. Ini mencakup pemeriksaan migrasi offline, runtime Supabase-only, tenant/RBAC, alur PPDB, Master Data, Akademik, Tahfidz, impor/ekspor, pengaturan Finance, serta dua tes HTTP loopback setelah akses `127.0.0.1` diizinkan. Workflow repo memakai Bun `1.4.4`; Bun belum tersedia lokal sehingga hasil ini bukan reproduksi toolchain CI yang persis.
- Instalasi production-only (`npm ci --omit=dev`) lulus; `node scripts/test-production-dependencies.mjs` dan `node scripts/test-production-runtime.mjs` lulus. Smoke runtime membuktikan paket Firebase tidak terpasang pada instalasi produksi, halaman utama merespons 200, dan `/api/users` merespons 401 tanpa autentikasi. Tidak ada koneksi Supabase dalam smoke ini. Dependensi penuh dipulihkan setelahnya.
- Tujuh tes yang memerlukan koneksi database/API live belum dijalankan: `test:db`, `test:db:nis-race`, `test:db:tahfidz-session-race`, `test:api:auth-tenant`, `test:api:finance-storage`, `test:api:library-storage`, dan `test:db:backup-restore`.
- Hasil lokal bukan workflow GitHub dan tidak membuktikan UAT visual, integrasi Supabase live, atau seluruh gerbang rilis.

## Staging VQE dan prasyarat koneksi

- Target staging yang disetujui: `vqemuyzveuirlkvdggjd`. Pemeriksaan baca-saja Supabase mencatat 133 migration staging dari 134 migration source. `20270302000000_academic_class_reference_pagination.sql` belum tercatat.
- `.env` pada checkout staging tidak memiliki `SUPABASE_DB_POOLER_URL` atau `SUPABASE_DB_URL`. `.env` kanonis yang memiliki URL pooler menunjuk ke Production `ptsasgdvgrbdtgyqieie`; jangan gunakan untuk preflight/rehearsal staging.
- Ledger staging masih menggunakan versi alias `20261101015832_tenant_reference_relationships`; source yang benar adalah `20270214120000_tenant_reference_relationships`. Runbook memuat pemeriksaan exact-SQL sebelum rekonsiliasi.
- `npm run preflight:db-migrations` berhenti dengan pesan bahwa `SUPABASE_DB_POOLER_URL` atau `SUPABASE_DB_URL` harus disediakan. `.env` worktree UAT VQE hanya memiliki URL dan API key Supabase, tanpa URL koneksi Postgres. `.env` pada worktree kanonis menunjuk ke Production dan tidak boleh dipakai untuk preflight staging.
- Preflight remote kini memeriksa bahwa `SUPABASE_PROJECT_REF`, host `SUPABASE_URL`, dan project ref pada URL database Postgres mengarah ke proyek yang sama. Tes unit menolak URL Production PTSAS saat environment menunjuk ke VQE; koneksi langsung dan pooler untuk target yang cocok diterima.
- Validasi preflight juga menolak URL non-PostgreSQL. `npm run test:migration-preflight` dan `npm run lint` lulus pada perubahan lokal ini.
- `npm run build` lulus pada source aplikasi yang sama dengan head PR terbaru; perubahan sesudah build hanya menyentuh skrip preflight, tes skrip, dan dokumen handoff. Bundle memuat halaman `SupabaseDocumentManager` dan stylesheet `ERPTabs`; ini membuktikan source masuk build, tetapi belum membuktikan hasil render/responsivitas di browser. Build tetap memberi peringatan Rollup dari Zod dan chunk `react-pdf` sekitar 1,46 MB.
- Preflight terhadap database VQE tetap belum bisa dijalankan karena URL pooler khusus staging belum tersedia.
- Bun `1.4.4`, CLI `supabase` `2.84.2`, `psql`, dan Docker tidak tersedia di PATH/lingkungan lokal. Ada binary CLI sementara versi `2.122.0`, tetapi workflow repository meminta CLI `2.84.2`; gunakan versi yang dipin, bukan binary sementara.
- Jadi pemeriksaan alias yang tersimpan di database belum dapat diulang melalui skrip preflight resmi pada checkout ini. Tidak memakai API secret sebagai pengganti password Postgres.

## Snapshot Supabase staging VQE — baca-saja, 5 November 2026

- Proyek staging `vqemuyzveuirlkvdggjd` berstatus `ACTIVE_HEALTHY` di `ap-northeast-1`, PostgreSQL 17.11. Pemeriksaan migrations menemukan 133 versi terpasang; terbaru `20270301000000 academic_student_roster_pagination`. Source memiliki 134 file, sehingga `20270302000000_academic_class_reference_pagination.sql` masih belum terpasang. Alias ledger tenant-reference tetap perlu direkonsiliasi dengan prosedur pada bagian prasyarat.
- Daftar schema `public` berisi 167 tabel; 167 memakai RLS dan 0 tidak. Security Advisor melaporkan rls_enabled_no_policy: 162 (INFO); auth_leaked_password_protection: 1 (WARN). Temuan `rls_enabled_no_policy` berlevel INFO: tabel tanpa policy tetap tertutup untuk akses Data API langsung. Namun kode server menggunakan secret key yang melewati RLS; batas keamanan tetap memerlukan verifikasi profil aktif, tenant, role, dan izin modul di setiap handler. Source memiliki pemeriksaan actor tersebut untuk Master Data dan Dokumen Digital; tes integrasi Auth/tenant masih wajib sebelum merge.
- Temuan Auth `auth_leaked_password_protection` berlevel WARN; pengaturan perlindungan kata sandi bocor perlu diperiksa di Auth proyek staging. MCP tidak mengubah setting ini.
- Performance Advisor melaporkan unindexed_foreign_keys: 258 (INFO); unused_index: 102 (INFO). Jangan menambahkan indeks ke semua foreign key atau menghapus indeks yang belum terpakai secara massal. Triage dengan pola query produksi dan `EXPLAIN (ANALYZE, BUFFERS)` setelah data sintetis representatif tersedia.
- Ini snapshot advisory baca-saja, bukan persetujuan keamanan/performa atau bukti UAT. Tidak ada migration, policy, index, setting Auth, atau data Production yang diubah.

## Update staging setelah snapshot — migrasi kelas Akademik

- Migrasi sumber `20270302000000_academic_class_reference_pagination.sql` telah diterapkan ke **VQE staging saja** melalui Supabase migration tool. Verifikasi baca-saja menemukan kedua indeks kelas dan kedua fungsi paginasi.
- Kedua fungsi terverifikasi memakai `SECURITY INVOKER` dan `search_path=pg_catalog, public`; tabel prasyarat `master_data_records`, `students`, dan `academic_records` ada di staging. Tidak ada data tenant/Production yang diubah.
- Tool mencatat migrasi dengan versi waktu otomatis `20261105070231` dan nama `academic_class_reference_pagination`, bukan versi sumber `20270302000000`. Jadi ledger staging sekarang berisi 134 baris, tetapi **belum sinkron** dengan source. Jumlah baris yang sama bukan bukti kesamaan migrasi.
- Ledger lama juga masih mencatat alias `20261101015832_tenant_reference_relationships`, sementara source memakai versi `20270214120000`. Source Git membuktikan keduanya adalah rename identik (blob `789e09d7ad32be971acb029a2116106105f46c29`, commit `43e44dbabac7dac400da8fb9cb4545b3bf320e3f`), tetapi SQL live alias tetap harus diperiksa.
- Jangan menjalankan ulang SQL `20270302000000` atau melakukan penulisan ledger manual. Tim backend harus memakai Supabase CLI yang dipin dan URL pooler khusus VQE. Setelah preflight serta pemeriksaan definisi live memastikan setiap SQL alias cocok persis, rekonsiliasi lewat [`supabase migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair), yang hanya mengubah ledger:

  ```powershell
  supabase migration repair 20261101015832 --status reverted
  supabase migration repair 20270214120000 --status applied
  supabase migration repair 20261105070231 --status reverted
  supabase migration repair 20270302000000 --status applied
  supabase migration list
  supabase db push --dry-run
  ```

  Jalankan dari root repo yang ter-link khusus ke VQE. Jangan lanjut bila preflight menemukan mismatch SQL, versi asing, atau migrasi tertunda.
- Production PTSAS tetap tidak disentuh. PR dan cutover tetap tertahan oleh rekonsiliasi migration ledger, tujuh tes integrasi DB/API, workflow CI, dan UAT Admin.

## Urutan aman untuk tim backend

1. Sediakan `SUPABASE_DB_POOLER_URL` khusus VQE di environment lokal/CI yang tidak di-commit. Pastikan project ref dalam URL adalah `vqemuyzveuirlkvdggjd`; jangan gunakan nilai dari `.env` Production dan jangan kirim kredensial melalui chat.
2. Siapkan Supabase CLI versi `2.84.2` sesuai workflow repo dan `psql`, atau runner CI terisolasi yang menyediakan keduanya. Jalankan `npm run preflight:db-migrations` terhadap VQE.
3. Lanjutkan hanya jika preflight memastikan SQL alias `20261101015832 → 20270214120000` dan versi otomatis `20261105070231 → 20270302000000` cocok persis serta tidak ada versi asing, mismatch SQL/nama, atau urutan yang tertinggal. Gunakan empat perintah repair di bagian update staging di atas; jangan mengubah ledger dengan SQL manual dan jangan menjalankan ulang SQL migration yang telah berhasil diterapkan.
4. Jalankan `supabase migration list` dan `supabase db push --dry-run` dengan target VQE yang eksplisit. Tinjau daftar perubahan sebelum menerapkan migration yang belum ada; verifikasi indeks dan fungsi picker kelas sesudahnya.
5. Jalankan seluruh tujuh tes integrasi di atas di Postgres/Supabase terisolasi dan lampirkan tautan workflow serta hasil per job. Jangan gunakan Production sebagai target tes.
6. Selesaikan UAT Admin VQE: login, isolasi tenant/role, Data Induk, Naming Series, pagination, impor/ekspor, dan modul terkait. Pertahankan PR Draft sampai CI, database, dan UAT terbukti lulus.

## Temuan UI Dokumen Digital — ketidaksesuaian style tab masih terbuka

- Pengguna melaporkan bahwa style tab pada modul Dokumen Digital belum sesuai standar UI.
- Pada 5 November 2026 pengguna menegaskan bahwa style tab masih terlihat tidak sesuai dengan standar yang dipakai. Catatan ini menjadi status terbaru dan **menggantikan asumsi bahwa penyelarasan sebelumnya sudah menyelesaikan masalah**.
- Pemeriksaan halaman referensi AI Studio pada 5 November menampilkan lima tab utama: Surat Masuk, Surat Keluar, E-Approval, Arsip Digital, dan AI OCR Scanner.
- Source saat ini menunjukkan navigasi `SupabaseDocumentManager` dan `DocumentManager` memakai komponen bersama `ERPTabs`. Namun, itu hanya membuktikan pemakaian komponen pada source, bukan kesesuaian hasil render yang sedang dilihat pengguna.
- Tab pada source Supabase berjumlah enam: Semua dokumen, Surat Masuk, Surat Keluar, Persetujuan elektronik, Arsip Digital, dan Pemindai OCR. Pemeriksaan visual harus mencocokkan juga urutan, ukuran, jarak, responsivitas, dan keadaan aktif terhadap modul acuan.
- **Internal** tetap tersedia sebagai pilihan filter jenis ketika tab Semua dokumen dipilih. Perubahan hanya menyamakan tampilan dan penempatan navigasi; UAT visual/responsif masih perlu dilakukan pada sesi Admin staging.
- Commit `4d32053` mengganti navigasi khusus pada Operasional Fasilitas Asrama dengan `ERPTabs`, menjaga dua bagian sesuai role yang diizinkan. Tidak ada perubahan pada sumber data atau aturan akses.
- `npm run lint` dan `npm run build` lulus pada checkout persis yang berisi koreksi tab Dokumen Digital `180cc08`; build masih memberi peringatan Rollup dari Zod dan ukuran chunk `react-pdf` sekitar 1,46 MB.
- **Tindak lanjut wajib:** pada browser Admin staging, pastikan route dan build yang sedang dibuka berasal dari head terbaru; bandingkan tab Dokumen Digital dengan komponen tab standar pada referensi; catat perbedaan yang terlihat, lalu koreksi dan verifikasi ulang desktop serta layar sempit. Jangan tandai konsistensi UI selesai sampai hasil render dan perpindahan tab terbukti.
- Status visual/responsif: **belum diverifikasi dan masih terbuka**. Pemeriksaan source saja tidak membuktikan hasil render atau perpindahan tab di runtime.

## Gerbang sebelum merge atau cutover

- PR tetap Draft/Open; status mergeability GitHub pada head `b60200b` belum diketahui (`mergeable_state=unknown`). PR tetap Draft karena gerbang integrasi, staging, dan UAT di bawah belum lulus.
- Actions memiliki riwayat run, tetapi belum ada workflow run/check untuk head terbaru; workflow `Supabase Preview` hanya `skipped`.
- Uji integrasi, rekonsiliasi ledger, penerapan/rehearsal migration staging, dan UAT Admin masih harus dibuktikan.
- Cutover Production baru dapat dipertimbangkan setelah staging diterima dan seluruh gerbang di atas lulus. Tidak ada langkah dalam handoff ini yang menerapkan perubahan ke Production.
