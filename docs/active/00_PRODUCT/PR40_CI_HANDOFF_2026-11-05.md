# Checkpoint pengembangan ERP4 Pesantren — 5 November 2026

## Status pengiriman

- Repo: hamdanfaiz/ERP4-Pesantren.
- PR #40 — Relasi tenant dan penomoran otomatis: https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40
- Branch: codex/menu-owner-placement-20261101.
- Basis source aplikasi yang diperiksa tetap sama dengan head PR `ce41c5128cacee85f2ca7744d866df919587243e`; perubahan setelah itu hanya dokumentasi. Checkpoint ini akan memajukan head melalui commit dokumentasi, sehingga status CI perlu diperiksa lagi pada SHA barunya.
- PR masih Draft/Open dan belum siap merge. Pada head `ce41c5128cacee85f2ca7744d866df919587243e`, GitHub hanya menampilkan check Supabase Preview berstatus `skipped`; tidak ada workflow Actions. `mergeable_state` terakhir `unknown`.
- Proyek Production PTSAS ptsasgdvgrbdtgyqieie tidak diubah. Semua pemeriksaan database pada checkpoint ini hanya menyentuh staging VQE vqemuyzveuirlkvdggjd.

## Bukti runtime dan source

- Pada checkout lokal, `npm run test:supabase-runtime-no-firebase` lulus: 152 modul pada graph frontend/server tidak mengimpor Firebase; 26 route Supabase dikenali dan 26 route migrasi lama tertutup. Ini membuktikan batas graph runtime yang diperiksa, bukan bahwa seluruh repo bebas kode atau dependensi Firebase.
- SDK Firebase masih tercantum sebagai devDependency dan sejumlah file legacy yang tidak masuk graph runtime masih memiliki referensi Firestore.
- Pada checkpoint lokal ini, `npm ci --offline --no-audit --no-fund` berhasil dari cache (839 paket); `npm run lint`, `npm run build`, dan `git diff --check` lulus. Build memberi peringatan anotasi Rollup dari Zod dan chunk `react-pdf` sekitar 1,46 MB.
- Sebanyak 19 pemeriksaan mandiri lulus: preflight migration, graph runtime Supabase-only, private API schema, guard target staging, cleanup fixture sintetis, dashboard cash-flow, Naming Series, Master Data tanpa PII browser, deployment flags, CBT/PPDB import, Finance unit-scope/filter, Library import, business date, RBAC, pemulihan Auth, undangan wali, dan HRIS import.
- `test:trusted-proxy-hops` belum menghasilkan verdict aplikasi: proses gagal membuka koneksi loopback dengan `EACCES` pada sandbox. Jalankan ulang pada runner CI/host yang mengizinkan loopback.
- `npm ci --omit=dev` berhasil (478 paket). `node scripts/test-production-runtime.mjs` lulus: server produksi lokal merespons halaman utama 200, `/api/users` tanpa autentikasi merespons 401, dan paket Firebase tidak terpasang. Ini tidak menguji koneksi Supabase live.
- Run GitHub Actions terakhir yang lulus adalah 4 November 2026, SHA `79d516880fb0c957d672cc4db8d9725f7f294ba3`; itu bukan bukti untuk head PR `ce41c5128cacee85f2ca7744d866df919587243e`.
- File workflow branch PR memiliki `workflow_dispatch`, tetapi file workflow `main` belum memilikinya. Pembaruan branch melalui integrasi sudah diterima, tetapi belum membuat run Actions pada SHA baru; verifikasi CI tetap harus dilakukan dari workflow/runner yang tersedia bagi pemilik repo atau team backend.

## Supabase staging VQE — pemeriksaan baca-saja terbaru

- Ledger VQE berisi 134 entri dan repo memiliki 134 file migration. Jumlahnya sama, tetapi dua versi ledger adalah alias dan bukan versi source:
  - Source 20270214120000_tenant_reference_relationships tercatat sebagai 20261101015832_tenant_reference_relationships.
  - Source 20270302000000_academic_class_reference_pagination tercatat sebagai 20261105070231_academic_class_reference_pagination.
- Perbandingan katalog PostgreSQL baca-saja terhadap source chain untuk relasi katalog, hardening, dan pagination kelas menemukan:
  - 21 indeks yang diharapkan beserta definisinya.
  - 20 foreign key relasi tenant beserta definisinya.
  - 14 trigger relasi inti beserta event dan fungsi pemicunya.
  - 11 badan fungsi yang sebelumnya dibandingkan cocok dengan source efektif. Fungsi Finance cocok dengan migrasi hardening 20270215000000, yang memang menggantikan definisi awal.
  - Constraint katalog tenant ditemukan; domain check live mencakup perluasan dari migration 20270216000000_tenant_operational_choice_relationships.
  - Pengaturan search_path, mode keamanan, hak EXECUTE, RLS paksa, dan trigger Finance yang dibandingkan cocok dengan source.
- Bukti ini menutup pemeriksaan definisi objek yang disebut di atas. Bukti ini tidak membuktikan semua migrasi database dari 134 file telah dibandingkan satu per satu, kesesuaian setiap efek backfill pada data, atau kesiapan Production.
- Pemeriksaan katalog yang disebut di bagian ini bersifat baca-saja. Setelah pemeriksaan, tes Finance/Storage membuat fixture sintetis pada VQE dan cleanup berikutnya dicatat di bagian tes di bawah. Tidak ada perubahan ledger, aturan, atau migration Production.

## Advisory Supabase staging terbaru (read-only)

- Security advisor VQE melaporkan 162 tabel `public` dengan RLS aktif tanpa policy (INFO), dan satu peringatan karena perlindungan kata sandi yang pernah bocor belum aktif pada Auth staging.
- Query katalog baca-saja memastikan semua 162 tabel tersebut tidak memberi hak SELECT/INSERT/UPDATE/DELETE kepada role `anon` atau `authenticated`. Temuan RLS tanpa policy karena itu fail-closed untuk akses Data API langsung; akses lewat server/RPC tetap perlu dicakup dalam tes.
- Performance advisor terbaru pada 2026-11-05 melaporkan 258 foreign key tanpa indeks penutup dan 96 indeks yang belum digunakan (INFO). Catatan lama tentang 104 indeks belum digunakan sudah kedaluwarsa. Jangan menambah atau menghapus indeks secara massal; VQE belum mewakili beban produksi. Petakan temuan ke query berfrekuensi tinggi, rencana query, dan beban tulis dengan data sintetis berskala realistis.
- Auth advisor memperingatkan perlindungan kata sandi bocor belum aktif di VQE staging. Aktifkan dan uji di staging sebelum rilis; verifikasi konfigurasi Production secara terpisah. Jangan mengirim password atau secret melalui chat.
- Pemeriksaan katalog terbaru: 167/167 tabel `public` mengaktifkan dan mewajibkan RLS. `anon` tidak memiliki hak CRUD langsung; `authenticated` hanya memiliki SELECT pada lima tabel, masing-masing dilindungi policy self/tenant/role yang sesuai, tanpa hak tulis langsung. Tidak ditemukan fungsi `SECURITY DEFINER` di `public` yang dapat dieksekusi `anon` atau `authenticated`.
- Empat bucket Storage (`erp4-private-document-attachments`, `erp4-private-finance-proofs`, `erp4-private-library-assets`, `ppdb-documents`) berstatus privat. Tabel internal `storage.objects` dan `storage.buckets` mengaktifkan RLS tanpa policy browser. Jalur aplikasi membuat token upload terbatas lewat server dengan secret key yang hanya server, kemudian mengunggah melalui `uploadToSignedUrl`; token tersebut adalah jalur kapabilitas khusus, bukan akses Storage langsung dari hak browser. Pembuatan token dilakukan server, dan kebijakan insert Storage tetap perlu dipertahankan bila nanti pembuatan token berpindah ke pengguna.
- Query baca-saja dan tinjauan source mengonfirmasi alur upload Dokumen Digital dan Library memakai token bertanda tangan. Referensi Supabase menyebut `uploadToSignedUrl` menggunakan token dari `createSignedUploadUrl` dan tidak memerlukan policy pada operasi upload bertoken: [uploadToSignedUrl](https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl), [createSignedUploadUrl](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl). Ini menjelaskan mengapa bucket tetap privat dan tidak memberi policy langsung ke browser.
- Production PTSAS `ptsasgdvgrbdtgyqieie` tetap tidak tersentuh. Dashboard yang diperiksa baca-saja pada 5 November menampilkan 47 versi ledger; repo memiliki 134 migration dan perbandingan versi menemukan 87 versi source belum tercatat, tanpa versi ledger tambahan. Konektor MCP menolak `list_migrations`; angka ini bukti metadata ledger, bukan pemeriksaan struktur/checksum atau efek setiap migration.

## Prasyarat yang masih kurang untuk rekonsiliasi

- Worktree verifikasi tidak memiliki `.env`. `.env` yang ditemukan di checkout canonical mengarah ke project selain VQE, sehingga tidak dibaca nilainya atau dipakai untuk tes staging. Tidak ada `SUPABASE_DB_POOLER_URL` VQE yang tersedia; jangan memakai `.env` Production atau menaruh password/kunci di chat.
- Executable CLI Supabase ada di direktori sementara workspace, tetapi percobaan lokal berhenti dengan `EPERM` saat menulis telemetry ke `%USERPROFILE%\\.supabase`. Docker dan `psql` tidak tersedia di lingkungan ini.
- Karena itu suite database lokal, preflight CLI, dan dry-run koneksi Postgres VQE belum dijalankan dari checkout ini. MCP hanya dipakai untuk query katalog baca-saja. CI yang menjalankan Supabase lokal terisolasi tetap menjadi jalur untuk membuktikan suite pada source terbaru.
- Jangan mengubah ledger dengan SQL manual atau menjalankan ulang migration yang sudah diterapkan.
- Tim backend dapat melanjutkan di runner lokal/CI yang terisolasi: sediakan URL pooler khusus VQE sebagai secret environment, pasang CLI versi pin, lalu jalankan langkah berikut dari repo yang ter-link ke VQE.

  npm run preflight:db-migrations
  supabase migration list
  supabase db push --dry-run

- Jika preflight mengonfirmasi kedua alias cocok persis, tidak ada versi asing, dan dry-run tidak merencanakan DDL yang sudah ada, rekonsiliasi ledger saja dengan CLI:
  supabase migration repair 20261101015832 --status reverted
  supabase migration repair 20270214120000 --status applied
  supabase migration repair 20261105070231 --status reverted
  supabase migration repair 20270302000000 --status applied
  supabase migration list
  supabase db push --dry-run
- Hentikan langkah tersebut bila ada mismatch SQL/nama, versi asing, perubahan DDL tak terduga, atau target bukan VQE. Jangan arahkan CLI ke Production.

## Tes integrasi dan UAT staging

- `npm run test:api:finance-storage` dan `npm run test:api:library-storage` lulus terhadap VQE setelah perbaikan cleanup. Cakupannya termasuk upload/download privat, isolasi tenant dan role, validasi/idempotensi, audit, serta pemulihan objek.
- Cleanup menangguhkan tenant dan profil sintetis serta memblokir akun Auth. Audit append-only dan referensi tanpa hak DELETE dipertahankan sebagai tombstone; objek Storage tes dihapus. Ini menjaga integritas audit tanpa membiarkan akun fixture mengakses sistem.
- Verifikasi baca-saja setelah kedua suite: 8 tenant berawalan slug tes tersimpan, semuanya `suspended`; profil aktif = 0; akun Auth yang tidak diblokir = 0; objek Storage pada jalur tenant tes = 0. Production PTSAS tidak disentuh.
- Suite integrasi berikut masih harus dijalankan dan dibuktikan: `test:db`, `test:db:nis-race`, `test:db:tahfidz-session-race`, `test:api:auth-tenant`, dan `test:db:backup-restore`.
- Tes lokal tambahan lulus untuk guard Production, RBAC, Naming Series, Master Data pagination dan CSV, dashboard keuangan, validasi PPDB, runtime tanpa Firebase, alur pemulihan/undangan wali, pagination akademik, aset dan sirkulasi perpustakaan, tanggal bisnis, serta pagination/pencapaian Tahfidz. Tes unit tidak menggantikan tes database dan UAT.
- Guard staging mewajibkan ref dan URL VQE yang tepat, `ERP4_ALLOW_STAGING_MUTATIONS=true`, publishable key dan key server; Production ditolak. Cleanup gagal tertutup jika tenant/profil tidak berhasil disuspensi atau akun Auth tidak berhasil diblokir.
- UAT Admin staging masih mencakup matriks role/tenant lintas modul, Data Induk dan Naming Series, PPDB/NIS, Akademik, Tahfidz, Finance, impor/ekspor, backup/restore, serta tampilan responsif. Gunakan tenant sintetis saja.

## Dokumen Digital — koreksi source, UAT visual masih terbuka

- Perubahan lokal memindahkan “Semua dokumen” ke grup bersama `ERPTabs`, sehingga semua kategori navigasi memakai ukuran, warna, status aktif, dan perilaku responsif dari komponen standar. Filter “Jenis dokumen” tetap ditampilkan pada tab tersebut; fungsi filter tidak berubah.
- Perubahan source tab disiapkan pada branch koreksi PR #40; hasil render/responsif masih belum diverifikasi.
- Koreksi mengatasi ketidakkonsistenan struktur tab pada source. Pengguna sebelumnya masih melihat perbedaan visual; kesesuaian render tetap belum terbukti sampai Admin staging membandingkan keadaan aktif, normal, hover, fokus, gulir, desktop, dan layar sempit.

## Gerbang sebelum merge dan cutover

1. Jalankan preflight dan dry-run VQE menggunakan CLI yang dipin; rekonsiliasi alias lewat CLI hanya setelah syarat di atas terpenuhi.
2. Jalankan `test:db`, race NIS/Tahfidz, Auth/tenant, dan backup/restore pada staging terisolasi; catat kode keluar dan bukti isolasi untuk masing-masing.
3. Tinjau kebijakan retensi tombstone sintetis sebelum staging digunakan ulang untuk UAT berikutnya.
4. Selesaikan UAT Admin dan visual/responsif, termasuk tab Dokumen Digital pada source terbaru.
5. Picu atau pulihkan workflow CI pada head PR terbaru, periksa status mergeability dan konflik.
6. Verifikasi schema, aturan akses, dan konfigurasi Production secara terpisah sebelum cutover. Jangan lakukan migrasi atau perubahan Production sebelum seluruh gerbang staging lulus.
7. Setelah PR siap, minta review team backend. Deploy dan UAT hosting tetap dikerjakan team Anda.

Checkpoint aman 5 November 2026: perubahan aplikasi tidak dibuat pada sesi pemeriksaan ini; dependency lokal terpasang dari cache dan file build/`node_modules` diabaikan Git. Checkpoint dokumentasi ini dicatat pada cabang PR; Production tidak disentuh. PR belum siap merge, cutover, atau deploy. Untuk melanjutkan, jalankan CI pada SHA terbaru, sediakan konfigurasi VQE yang benar melalui secret lokal/CI, lalu selesaikan gerbang database dan UAT di atas.



