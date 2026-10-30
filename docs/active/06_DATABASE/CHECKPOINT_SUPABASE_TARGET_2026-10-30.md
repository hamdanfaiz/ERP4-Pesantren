# Checkpoint target Supabase ERP4-Pesantren — 30 Oktober 2026

## Status akses dan source terbaru setelah merge

- PR #13 sudah merged ke `main` pada source commit `e449c234c253eb7a65795af18c5794fa45e6e9cb`, merge commit `cea0ed481950c4e40a1035ff9d971cf3a43929bc`. CI run `41051400486` lulus 2/2 job pada source head tersebut.
- Konektor Supabase Codex hanya menampilkan `vqemuyzveuirlkvdggjd`; target `ptsasgdvgrbdtgyqieie` tidak terdaftar dan permintaan konektor read-only ditolak. Sebagai jalur terpisah, pada 30 Oktober SQL Editor dashboard berhasil membaca ringkasan ledger dengan transaksi `READ ONLY`.
- SQL Editor target menampilkan project `ERP4-Pesantren`, ref `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`. Ini berbeda dari jawaban sebelumnya yang menyebut staging; perlakukan target sebagai Production sampai tim backend memastikan lingkungan staging terisolasi. Jangan rehearsal atau menerapkan migration di target ini.
- Pembacaan terbaru mengonfirmasi 47 versi ledger, dari `20260603000000` sampai `20261206000000`. Dua baris mempunyai metadata `name` dan `statements` kosong. Source `main` berisi 109 migration; selisih hitungan potensial 62 bukan daftar migration yang boleh diterapkan dan belum membuktikan kesesuaian statement.
- Tidak ada migration live yang diterapkan setelah merge. Penyelesaian fitur tetap diperkirakan sekitar **73%**; target belum dinyatakan siap deploy atau dijual.

## Target aplikasi dan deployment

- Project Supabase yang dituju adalah `ptsasgdvgrbdtgyqieie` (`https://ptsasgdvgrbdtgyqieie.supabase.co`).
- `supabase/config.toml` pada PR #13 menunjuk ke project tersebut dan menetapkan `db.major_version = 17`, selaras dengan PostgreSQL 17.11 yang dilaporkan target.
- Dashboard menampilkan branch `main / PRODUCTION`. Organisasi memakai Free plan; branch preview tidak tersedia di integrasi saat ini.
- Repo `hamdanfaiz/ERP4-Pesantren` terhubung pada halaman Integrations project ini. Toggle `Deploy to production` terverifikasi **off**. Merge tidak akan menerapkan migrasi secara otomatis.
- Halaman **Database → Backups** saat ini menyatakan Free plan tidak menyertakan backup project. Belum ada backup yang dapat dipulihkan; upgrade berbayar memerlukan keputusan pemilik, jadi perlakukan target sebagai Production dan jangan gunakan untuk rehearsal migrasi.

Data dummy Firestore tidak akan disalin. Target Supabase tidak diubah selama pemeriksaan ini.

## Status runtime pada source PR

- `src/runtimeBackend.ts` menetapkan `SUPABASE_ONLY_RUNTIME = true`. Router aplikasi memilih layar operasional Supabase, tanpa fallback ke layar Firebase.
- `isLegacyFirebaseAdminEnabled()` dan `isLegacyArchiveImportEnabled()` selalu `false`; flag environment tidak dapat mengaktifkan kembali Firebase atau impor arsip.
- Guard CI menelusuri import graph dari `src/main.tsx`, menolak paket Firebase maupun adapter Firebase, memeriksa route operasional Supabase, dan memaksa empat route yang belum ada untuk fail-closed: Enterprise, ERP umum, Intelligence, dan Ecosystem. File uji: [test-supabase-runtime-no-firebase.mjs](https://github.com/hamdanfaiz/ERP4-Pesantren/blob/codex/supabase-runtime-cutover-20261022/scripts/test-supabase-runtime-no-firebase.mjs).
- Ini membuktikan konfigurasi source cutover, bukan bahwa perubahan sudah berjalan di Production. Ketika pemeriksaan ini dicatat, PR #13 belum merge; source kemudian merged seperti dinyatakan di status terbaru di atas. Empat route fail-closed juga perlu diperlakukan sebagai fitur yang belum tersedia jika masuk cakupan penawaran awal.

## Rekonsiliasi ledger baca-saja — 30 Oktober 2026

Query ringkasan `SELECT` di SQL Editor dashboard project target dijalankan di transaksi `READ ONLY`. Query membaca versi dan kelengkapan metadata `supabase_migrations.schema_migrations`; tidak membaca record operasional dan tidak mengubah database.

- Ledger target berisi 47 versi: versi pertama `20260603000000` dan versi terakhir `20261206000000`.
- Source `main` memiliki 109 file migrasi, terakhir `20270206000000_tahfidz_peer_review_moderation.sql`.
- Semua 47 versi ledger memiliki pasangan versi di repository. Ada 62 file source sesudah `20261206000000` yang belum tercatat pada hitungan ledger, mulai `20261207000000_library_legacy_catalog_import.sql` sampai `20270206000000_tahfidz_peer_review_moderation.sql`.
- Ringkasan terbaru menunjukkan 45 baris berisi metadata dan dua baris memiliki `name` serta `statements` kosong. Kesetaraan statement dan provenance deployment untuk dua baris itu belum terbukti; preflight tidak dapat menyatakan ledger cocok sepenuhnya.
- Ada 62 lebih banyak file migration di source daripada jumlah versi pada ledger. Ini perbedaan hitungan untuk ditelusuri, bukan izin atau rencana untuk menerapkan migration. Jangan menjalankan `migration repair` atau `db push` ke Production untuk menutupi metadata kosong.

Snapshot katalog terdahulu melaporkan 119 tabel publik dan PostgreSQL 17.11. Hitungan ini belum dibaca ulang dan tidak membuktikan kesesuaian seluruh schema, grant, RLS, data, atau fungsi dengan source.

## Preflight yang bisa dijalankan tim backend sekarang

Source `main` menyediakan `npm run preflight:db-migrations`. Script ini membaca ledger dan metadata statement dalam transaksi PostgreSQL read-only, lalu membandingkan versi, nama, dan isi SQL dengan file lokal pada `supabase/migrations`. Script tidak menerapkan migrasi dan tidak membaca record operasional.

Sebelum menjalankan perintah:

1. Dashboard saat ini menandai `ptsasgdvgrbdtgyqieie` sebagai Production. Pastikan tim backend menyediakan staging terisolasi yang dapat dipulihkan; jangan gunakan target Production untuk rehearsal.
2. Di mesin operator, gunakan checkout `main` yang hendak dirilis dan `.env` lokal yang sudah diisi aman. Konfirmasi hostname koneksi pada dashboard sebelum mengeksekusi; target harus benar-benar project/ref `ptsasgdvgrbdtgyqieie`, bukan project lain. Jangan mencetak atau mengirim URL database, password, atau key.
3. Jalankan dari root repository: `npm run preflight:db-migrations`. Script memilih `SUPABASE_DB_POOLER_URL` atau `SUPABASE_DB_URL`, meminta `psql`, mengaktifkan `default_transaction_read_only=on`, dan tidak menampilkan nilai kredensial.
4. Kirim hanya laporan terminal yang sudah disanitasi. Jika hasil memuat `HENTIKAN`, mismatch metadata, atau error SSL, hentikan proses dan kirim pesan error/laporan tanpa kredensial. Jangan menjalankan `migration repair`, `db push`, atau migrasi manual untuk menghilangkan temuan.

Daftar versi yang dilaporkan sebagai belum tercatat hanya menjadi bahan review. Rehearsal tetap harus dilakukan pada lingkungan terisolasi yang dapat dipulihkan; output preflight tidak membuktikan migration aman diterapkan ke Production.

## Snapshot keamanan database baca-saja — 30 Oktober 2026

Snapshot berikut dibaca melalui SQL Editor Dashboard dalam transaksi/query `SELECT` saja; tidak ada data aplikasi yang dibaca atau diubah.

- Ada 119 tabel di schema `public`; seluruh 119 mengaktifkan RLS dan `FORCE ROW LEVEL SECURITY`. Sebanyak 118 tabel memiliki `tenant_id NOT NULL`; satu-satunya tabel tanpa `tenant_id` adalah root `tenants`.
- Hak tabel efektif: role `anon` tidak memiliki SELECT atau hak tulis pada tabel `public`; `authenticated` memiliki SELECT pada lima tabel dan hak tulis pada nol tabel.
- Lima policy publik bersifat SELECT-only: kandidat dan dokumen PPDB dibatasi ke tenant aktif, Admin tenant, dan modul PPDB; profil dapat dibaca sendiri atau Admin tenant berizin Users; tenant aktif saat ini dan `user_profiles` sendiri dapat dibaca melalui policy masing-masing.
- Ada 42 fungsi `SECURITY DEFINER` dalam schema `public`; semuanya menetapkan `search_path`. Tidak ada yang dapat dipanggil oleh `anon`; empat helper dapat dipanggil `authenticated`: `current_app_role`, `current_tenant_id`, `has_module_access`, dan `is_tenant_admin`. Source definisi yang dibaca mensyaratkan `auth.uid()`, profil aktif, serta tenant aktif; daftar modul mengikuti role dan boolean override profil.
- Ada dua bucket Storage dan keduanya privat: `erp4-private-finance-proofs` serta `ppdb-documents`. `storage.objects` mengaktifkan RLS tetapi tidak FORCE; tidak ditemukan policy `storage.objects`. Katalog juga memberi `anon` dan `authenticated` hak SQL SELECT/INSERT/UPDATE/DELETE atas tabel tersebut, tetapi tanpa policy RLS keduanya tidak memperoleh baris yang dapat dibaca/diubah. Pertahankan pemeriksaan deny melalui API Storage pada UAT; jangan menambah policy klien umum. Endpoint server memakai secret Supabase dan harus terus memvalidasi aktor, tenant, dan path sebelum akses.
- Pemeriksaan metadata ini tidak membuktikan request HTTP Auth/Storage, konfigurasi edge/API, backup/restore, atau perilaku semua endpoint. Uji HTTP sintetis pada CI bukan pengganti UAT project target.

## Verifikasi kode dan batas uji

Pada commit `7eb3848e7ce8f560818db640959210da46491b6e`, GitHub Actions [run 40969933315](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40969933315) lulus pada kedua job:

- `Frontend build and Firebase bundle guard` lulus.
- `Migrations, API auth, and pgTAP` lulus, termasuk migrasi lokal, isolasi tenant, alur Storage, serta backup/restore lokal.

Job database memakai Supabase lokal sintetis dan memulai reset dari versi `20261206000000`, lalu menerapkan migrasi sisanya. Ini menguji source dan migrasi pada baseline lokal yang dibangun ulang; bukan restore schema/data Production dan bukan rehearsal pada project target.

Job `Supabase Preview` dilewati karena branch belum terhubung ke Supabase Branch. URL yang ditampilkan job tersebut masih mengarah ke project lama `vqemuyzveuirlkvdggjd`.

Pada saat snapshot ini ditulis, PR #13 masih **Open / Draft**. Status tersebut kemudian berubah: source telah merged sesuai pembaruan di atas. Tidak ada migrasi, perubahan schema, record, feature flag, atau data yang diterapkan pada project target.

## Gerbang sebelum cutover

1. Sediakan staging terpisah atau backup Production yang dapat dipulihkan. Uji pemulihan pada environment terisolasi; project target saat ini branch `main / PRODUCTION`, Free plan, dan tidak menyediakan branch preview.
2. Minta pemilik backend menelusuri provenance versi `20261205000000` dan `20261206000000`, termasuk mengapa nama dan array statement kosong. Rekonsiliasi metadata dan schema tanpa mengubah ledger Production.
3. Setelah metadata ledger direkonsiliasi, lakukan rehearsal atas set migration yang benar-benar belum diterapkan pada staging terisolasi. Ringkasan saat ini menunjukkan 109 migration di source dan 47 versi pada ledger, tetapi dua baris tidak memiliki metadata `name`/`statements`; jangan menyimpulkan isi set yang aman hanya dari selisih hitungan. Periksa tabel, constraint, indeks dan lock, RLS/grant, function/RPC, Storage, serta kompatibilitas versi API. CI sintetis saja belum cukup.
4. Perbarui integrasi Supabase Preview agar menggunakan project/ref yang benar jika preview branch tersedia. Jangan biarkan pemeriksaan PR menunjuk ke project lama.
5. Jalankan UAT login, role/tenant, alur setiap modul, unggah/akses Storage privat, backup/restore, dan deployment customer-managed sebelum rilis.
6. Rotasi secret key Supabase dan password database yang pernah dibagikan sebelum go-live.

