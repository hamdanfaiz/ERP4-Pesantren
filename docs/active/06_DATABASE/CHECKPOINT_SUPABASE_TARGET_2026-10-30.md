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
- Guard CI menelusuri import graph dari `src/main.tsx`, menolak paket Firebase maupun adapter Firebase, dan memeriksa 26 route Supabase serta satu route fail-closed (`ecosystem`). `enterprise` dan `erp` memiliki layar Supabase, tetapi API Multi-Unit dan Anggaran dikunci feature flag server yang default-nya `false`; `intelligence` memakai ringkasan Supabase berbasis aturan, bukan prediksi AI. File uji: [test-supabase-runtime-no-firebase.mjs](https://github.com/hamdanfaiz/ERP4-Pesantren/blob/main/scripts/test-supabase-runtime-no-firebase.mjs).
- Ini membuktikan pemetaan source, bukan fungsi runtime pada Production. Multi-Unit dan Anggaran tetap tidak siap diaktifkan sebelum migration, tenant, role, dan alur diuji di staging. Ecosystem/PPOB dikeluarkan dari rilis awal dan fail-closed. PR #13 sudah merged seperti tercatat di status terbaru di atas.

## Rekonsiliasi ledger baca-saja — 30 Oktober 2026

Query ringkasan `SELECT` di SQL Editor dashboard project target dijalankan di transaksi `READ ONLY`. Query membaca versi dan kelengkapan metadata `supabase_migrations.schema_migrations`; tidak membaca record operasional dan tidak mengubah database.

- Ledger target berisi 47 versi: versi pertama `20260603000000` dan versi terakhir `20261206000000`.
- Source `main` memiliki 109 file migrasi, terakhir `20270206000000_tahfidz_peer_review_moderation.sql`.
- Perbandingan prefix versi pada 47 baris ledger dengan 109 file source menemukan 47 kecocokan, nol versi ledger yang tidak ada di source, nol duplikasi prefix source, dan 62 versi source yang tidak tercatat pada ledger.
- Query detail memastikan metadata kosong pada `20261205000000` dan `20261206000000`: kedua baris memiliki `name = NULL`, `statements = NULL`, dan jumlah statement nol. Kesetaraan SQL/provenance deployment untuk keduanya belum terbukti; preflight tidak dapat menyatakan ledger cocok sepenuhnya.
- Ada 62 lebih banyak file migration di source daripada jumlah versi pada ledger. Ini perbedaan hitungan untuk ditelusuri, bukan izin atau rencana untuk menerapkan migration. Jangan menjalankan `migration repair` atau `db push` ke Production untuk menutupi metadata kosong.

### Manifest 62 versi source yang belum tercatat pada ledger

Daftar ini hanya menunjukkan prefix versi source yang tidak ditemukan pada daftar ledger. **Jangan menganggap migration belum pernah berjalan atau menjalankannya ke Production hanya berdasarkan daftar ini.** Rekonsiliasi definisi schema dan provenance di staging terisolasi yang dapat dipulihkan terlebih dahulu.

```text
20261207000000_library_legacy_catalog_import.sql
20261208000000_hris_legacy_employees_import.sql
20261209000000_cooperative_tenant_business_day.sql
20261210000000_cooperative_supplier_import_status.sql
20261211000000_library_circulation_legacy_import.sql
20261212000000_cooperative_sale_idempotency_wallet.sql
20261213000000_marketplace_mutation_payload_guard.sql
20261214000000_donation_mutation_payload_guard.sql
20261215000000_laundry_mutation_payload_guard.sql
20261216000000_tahfidz_session_result_integrity.sql
20261217000000_tahfidz_target_tenant_business_date.sql
20261218000000_cbt_server_authoritative_deadline.sql
20261219000000_academic_request_idempotency_guard.sql
20261220000000_inventory_adjustment_payload_guard.sql
20261221000000_healthcare_request_idempotency_guard.sql
20261222000000_ga_inventory_event_payload_guard.sql
20261223000000_cbt_request_payload_guard.sql
20261224000000_lms_request_payload_guard.sql
20261225000000_lms_submission_grade_integrity.sql
20261226000000_lms_learning_record_integrity.sql
20261227000000_lms_progress_integrity.sql
20261228000000_boarding_attendance_active_students.sql
20261229000000_boarding_attendance_retry_after_status_change.sql
20261230000000_cooperative_financial_legacy_import.sql
20261231000000_cooperative_supplier_payload_idempotency.sql
20270101000000_profiles_user_directory_indexes.sql
20270102000000_guardian_accounts_and_invitations.sql
20270103000000_guardian_finance_access.sql
20270104000000_guardian_boarding_access.sql
20270105000000_communication_guardian_audience.sql
20270106000000_boarding_room_assignment_history.sql
20270107000000_tahfidz_roster_keyset_pagination.sql
20270108000000_tahfidz_dashboard_follow_up_summary.sql
20270109000000_boarding_room_history_baseline.sql
20270110000000_ppdb_candidate_finance_bills.sql
20270111000000_ppdb_document_access_audit.sql
20270112000000_admin_ppdb_candidate_create.sql
20270113000000_admin_ppdb_document_upload.sql
20270114000000_cbt_tenant_settings_import.sql
20270115000000_ppdb_admin_search_keyset.sql
20270116000000_private_library_digital_assets.sql
20270117000000_document_center_core.sql
20270118000000_crm_contact_management.sql
20270119000000_master_data_student_search_indexes.sql
20270120000000_communication_import_canonical_audience.sql
20270121000000_tenant_admin_bootstrap.sql
20270122000000_lms_learning_record_tenant_fk.sql
20270123000000_public_ppdb_idempotency.sql
20270124000000_finance_proof_upload_rate_limit.sql
20270125000000_finance_budget_plans.sql
20270126000000_tenant_enterprise_units.sql
20270127000000_fix_cbt_answer_object_limit.sql
20270128000000_finance_expense_unit_scope.sql
20270129000000_finance_budget_unit_scope.sql
20270130000000_master_data_unit_assignment.sql
20270131000000_finance_legacy_unit_assignment.sql
20270201000000_academic_unit_scope.sql
20270202000000_academic_class_unit_mapping.sql
20270203000000_boarding_unit_scope.sql
20270204000000_tahfidz_achievement_summary.sql
20270205000000_guardian_self_registration.sql
20270206000000_tahfidz_peer_review_moderation.sql
```

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

