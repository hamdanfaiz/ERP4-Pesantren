# Checkpoint target Supabase ERP4-Pesantren — 30 Oktober 2026

## Target aplikasi dan deployment

- Project Supabase yang dituju adalah `ptsasgdvgrbdtgyqieie` (`https://ptsasgdvgrbdtgyqieie.supabase.co`).
- `supabase/config.toml` pada PR #13 menunjuk ke project tersebut dan menetapkan `db.major_version = 17`, selaras dengan PostgreSQL 17.11 yang dilaporkan target.
- Dashboard menampilkan branch `main / PRODUCTION`. Organisasi memakai Free plan; branch preview tidak tersedia di integrasi saat ini.
- Repo `hamdanfaiz/ERP4-Pesantren` terhubung pada halaman Integrations project ini. Toggle `Deploy to production` terverifikasi **off**. Merge tidak akan menerapkan migrasi secara otomatis.
- Halaman project sebelumnya menunjukkan belum ada backup. Karena itu, perlakukan target sebagai Production dan jangan gunakan untuk rehearsal migrasi.

Data dummy Firestore tidak akan disalin. Target Supabase tidak diubah selama pemeriksaan ini.

## Status runtime pada source PR

- `src/runtimeBackend.ts` menetapkan `SUPABASE_ONLY_RUNTIME = true`. Router aplikasi memilih layar operasional Supabase, tanpa fallback ke layar Firebase.
- `isLegacyFirebaseAdminEnabled()` dan `isLegacyArchiveImportEnabled()` selalu `false`; flag environment tidak dapat mengaktifkan kembali Firebase atau impor arsip.
- Guard CI menelusuri import graph dari `src/main.tsx`, menolak paket Firebase maupun adapter Firebase, memeriksa route operasional Supabase, dan memaksa empat route yang belum ada untuk fail-closed: Enterprise, ERP umum, Intelligence, dan Ecosystem. File uji: [test-supabase-runtime-no-firebase.mjs](https://github.com/hamdanfaiz/ERP4-Pesantren/blob/codex/supabase-runtime-cutover-20261022/scripts/test-supabase-runtime-no-firebase.mjs).
- Ini membuktikan konfigurasi source cutover, bukan bahwa perubahan sudah berjalan di Production. PR #13 belum merge. Empat route fail-closed juga perlu diperlakukan sebagai fitur yang belum tersedia jika masuk cakupan penawaran awal.

## Rekonsiliasi ledger baca-saja

Query `SELECT` pada SQL Editor dashboard project target membaca `version`, `name`, dan jumlah statement pada `supabase_migrations.schema_migrations`.

- Ledger target berisi 47 versi: `20260603000000` dan rangkaian `20261022000000` sampai `20261206000000`.
- Repository PR #13 memiliki 96 file migrasi, terakhir `20270124000000_finance_proof_upload_rate_limit.sql`.
- Semua 47 versi ledger memiliki pasangan versi di repository. Ada 49 file repository sesudah `20261206000000` yang belum tercatat di ledger, mulai `20261207000000_library_legacy_catalog_import.sql` sampai `20270124000000_finance_proof_upload_rate_limit.sql`.
- Metadata untuk 45 baris ledger terisi. Dua baris terakhir, `20261205000000` dan `20261206000000`, mempunyai `name = NULL` dan `statements = NULL`. Nama dan isi SQL yang seharusnya untuk versi tersebut hanya dapat diinferensikan dari file repository; provenance penerapan live belum terbukti.
- Ini bukti perbedaan ledger, bukan izin atau rencana untuk menerapkan 49 migrasi. Jangan menjalankan `migration repair` atau `db push` ke Production untuk menutupi metadata kosong.

Target saat diperiksa melaporkan 119 tabel publik dan PostgreSQL 17.11. Hitungan ini tidak membuktikan kesesuaian seluruh schema, grant, RLS, data, atau fungsi dengan source.

## Verifikasi kode dan batas uji

Pada commit `7eb3848e7ce8f560818db640959210da46491b6e`, GitHub Actions [run 40969933315](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40969933315) lulus pada kedua job:

- `Frontend build and Firebase bundle guard` lulus.
- `Migrations, API auth, and pgTAP` lulus, termasuk migrasi lokal, isolasi tenant, alur Storage, serta backup/restore lokal.

Job database memakai Supabase lokal sintetis dan memulai reset dari versi `20261206000000`, lalu menerapkan migrasi sisanya. Ini menguji source dan migrasi pada baseline lokal yang dibangun ulang; bukan restore schema/data Production dan bukan rehearsal pada project target.

Job `Supabase Preview` dilewati karena branch belum terhubung ke Supabase Branch. URL yang ditampilkan job tersebut masih mengarah ke project lama `vqemuyzveuirlkvdggjd`.

PR #13 tetap **Open / Draft**, belum merge. Tidak ada migrasi, perubahan schema, record, feature flag, atau data yang diterapkan pada project target.

## Gerbang sebelum cutover

1. Sediakan staging terpisah atau backup Production yang dapat dipulihkan. Uji pemulihan pada environment terisolasi; project target saat ini branch `main / PRODUCTION`, Free plan, dan tidak menyediakan branch preview.
2. Minta pemilik backend menelusuri provenance versi `20261205000000` dan `20261206000000`, termasuk mengapa nama dan array statement kosong. Rekonsiliasi metadata dan schema tanpa mengubah ledger Production.
3. Lakukan rehearsal atas 49 migrasi terhadap baseline yang sedekat mungkin dengan target. Periksa perubahan tabel, constraint, indeks dan lock, RLS/grant, function/RPC, Storage, serta kompatibilitas versi API. CI sintetis saja belum cukup.
4. Perbarui integrasi Supabase Preview agar menggunakan project/ref yang benar jika preview branch tersedia. Jangan biarkan pemeriksaan PR menunjuk ke project lama.
5. Jalankan UAT login, role/tenant, alur setiap modul, unggah/akses Storage privat, backup/restore, dan deployment customer-managed sebelum rilis.
6. Rotasi secret key Supabase dan password database yang pernah dibagikan sebelum go-live.

