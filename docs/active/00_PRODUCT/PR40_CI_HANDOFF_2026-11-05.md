# Checkpoint pengembangan ERP4 Pesantren — 5 November 2026

## Status pengiriman

- Repo: hamdanfaiz/ERP4-Pesantren.
- PR #40 — Relasi tenant dan penomoran otomatis: https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40
- Branch: codex/menu-owner-placement-20261101.
- Head PR yang diperiksa: `35879df49af8a2d791bbd3c4587e4cc3be3745bd`. Checkout uji lokal berada pada `440878623dc2f0bedb98a483301923885957bfc7`; file `src/pages/SupabaseDocumentManager.tsx` di checkout itu cocok dengan blob PR `d80a9368816f43a387cde58f6226f42c1300052e`. Build lokal tidak menggantikan CI pada seluruh head PR.
- PR masih Draft/Open dan belum boleh di-merge. GitHub saat diperiksa melaporkan `mergeable=false`; belum ada workflow run untuk head `35879df49af8a2d791bbd3c4587e4cc3be3745bd`. Periksa konflik/status PR lagi sebelum merge.
- Proyek Production PTSAS ptsasgdvgrbdtgyqieie tidak diubah. Semua pemeriksaan database pada checkpoint ini hanya menyentuh staging VQE vqemuyzveuirlkvdggjd.

## Bukti runtime dan source

- Pada checkout lokal yang memuat source Dokumen Digital yang sama dengan PR, npm run test:supabase-runtime-no-firebase lulus: 152 modul pada graph frontend/server tidak mengimpor Firebase; 26 route Supabase dikenali dan 26 route migrasi lama tertutup. Ini membuktikan batas graph runtime yang diperiksa, bukan bahwa seluruh repo bebas kode atau dependensi Firebase.
- SDK Firebase masih tercantum sebagai devDependency dan sejumlah file legacy yang tidak masuk graph runtime masih memiliki referensi Firestore.
- Pada checkout uji lokal `4408786`, `npm run lint` dan `npm run build` baru dijalankan ulang dan lulus. File Dokumen Digital yang dibuild cocok dengan blob PR saat diperiksa; seluruh hasil tetap pemeriksaan lokal, bukan CI pada keseluruhan head PR. Build memberi peringatan anotasi Rollup dari Zod dan chunk `react-pdf` sekitar 1,46 MB.
- Smoke instalasi production-only dan runtime juga pernah lulus; halaman utama merespons 200 dan /api/users tanpa autentikasi merespons 401. Smoke ini tidak menguji koneksi Supabase live.
- `npm run test:migration-preflight` dan `npm run test:supabase-runtime-no-firebase` juga baru lulus pada checkout lokal: pemeriksaan lineage/preflight offline berhasil; graph runtime memeriksa 152 modul, mengenali 26 route Supabase, dan menutup 26 route migrasi lama. Sebanyak 39 skrip non-database/API sebelumnya juga pernah lulus.
- Hasil lokal tersebut bukan pengganti workflow GitHub Actions. Fetch run untuk head `35879df49af8a2d791bbd3c4587e4cc3be3745bd` mengembalikan daftar kosong.

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
- Tidak ada penulisan data, perubahan ledger, pengubahan aturan, ataupun migration Production pada pemeriksaan ini.

## Advisory Supabase staging terbaru (read-only)

- Security advisor VQE melaporkan 162 tabel `public` dengan RLS aktif tanpa policy (INFO), dan satu peringatan karena perlindungan kata sandi yang pernah bocor belum aktif pada Auth staging.
- Query katalog baca-saja memastikan semua 162 tabel tersebut tidak memberi hak SELECT/INSERT/UPDATE/DELETE kepada role `anon` atau `authenticated`. Temuan RLS tanpa policy karena itu fail-closed untuk akses Data API langsung; akses lewat server/RPC tetap perlu dicakup dalam tes.
- Performance advisor melaporkan 258 foreign key tanpa indeks penutup dan 104 indeks yang belum digunakan (INFO). Jangan menambah atau menghapus semuanya otomatis; petakan dulu ke query berfrekuensi tinggi, rencana query, dan beban tulis.
- Production PTSAS `ptsasgdvgrbdtgyqieie` tetap tidak tersentuh. Konektor menolak pembacaan ledger Production, sehingga status migrasi Production belum terverifikasi.

## Prasyarat yang masih kurang untuk rekonsiliasi

- Checkout ini tidak memiliki SUPABASE_DB_POOLER_URL khusus VQE; yang ada hanya .env.example. Jangan memakai .env Production atau menaruh password/kunci di chat.
- Supabase CLI 2.84.2 sesuai versi workflow repo, psql, dan Docker belum tersedia pada checkout ini.
- Karena itu preflight database resmi dan dry-run terhadap koneksi Postgres VQE belum dijalankan. MCP hanya dipakai untuk query katalog baca-saja.
- Jangan mengubah ledger dengan SQL manual atau menjalankan ulang migration yang sudah diterapkan.
- Tim backend dapat melanjutkan di runner lokal/CI yang terisolasi: sediakan URL pooler VQE sebagai secret environment, pasang CLI versi pin, lalu jalankan langkah berikut dari repo yang ter-link ke VQE.

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

## Tes integrasi dan UAT yang belum selesai

Tujuh tes berikut belum terbukti lulus terhadap database/API VQE yang terhubung:

1. test:db
2. test:db:nis-race
3. test:db:tahfidz-session-race
4. test:api:auth-tenant
5. test:api:finance-storage
6. test:api:library-storage
7. test:db:backup-restore

UAT Admin staging masih perlu mencakup isolasi tenant/role, Data Induk dan Naming Series, alur PPDB/NIS, Akademik, Tahfidz, transaksi Finance, unggah/unduh Storage, impor/ekspor, serta pemulihan backup. Gunakan tenant dan data sintetis saja.

## Dokumen Digital — style tab masih menjadi temuan terbuka

- Source SupabaseDocumentManager menggunakan komponen bersama ERPTabs dan lima bagian utama: Surat Masuk, Surat Keluar, Persetujuan elektronik, Arsip Digital, dan Pemindai OCR. Fungsi Semua dokumen tersedia sebagai aksi di toolbar; Dokumen internal tersedia melalui filter jenis.
- Jumlah dan susunan tab sesuai dengan acuan yang diperiksa. Pengguna masih melaporkan style tab berbeda dari standar. Source yang memakai komponen bersama belum membuktikan tampilan render sudah sama.
- Browser yang diperiksa pada checkpoint ini sedang menampilkan halaman ChatGPT, bukan ERP atau sesi Admin staging. UAT visual/responsif belum dilakukan. Perlu membandingkan keadaan aktif, normal, hover, fokus, gulir, desktop, dan layar sempit sebelum menutup temuan ini.

## Gerbang sebelum merge dan cutover

1. Jalankan preflight dan dry-run VQE menggunakan CLI yang dipin; rekonsiliasi alias lewat CLI hanya setelah syarat di atas terpenuhi.
2. Jalankan tujuh tes integrasi pada staging terisolasi dan catat hasil per tes.
3. Selesaikan UAT Admin dan visual/responsif; perbaiki temuan tab bila render membuktikan masih berbeda.
4. Picu atau pulihkan workflow CI pada head PR terbaru, periksa status mergeability dan konflik.
5. Verifikasi schema, aturan akses, dan konfigurasi Production secara terpisah sebelum cutover. Jangan lakukan migrasi atau perubahan Production sebelum seluruh gerbang staging lulus.
6. Setelah PR siap, minta review team backend. Deploy dan UAT hosting tetap dikerjakan team Anda.

Checkpoint ini menunjukkan pekerjaan implementasi sudah tersedia untuk direview di PR, tetapi belum menyatakan sistem siap merge, cutover, atau deploy.


