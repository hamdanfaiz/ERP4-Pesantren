# Rekonsiliasi Ledger Migrasi PTSAS Production — 28 November 2026

## Ringkasan baca-saja

Target pemeriksaan: Supabase Production `ptsasgdvgrbdtgyqieie`.

Perbandingan dilakukan terhadap source `main` pada commit `45d9c0d670de0715e57154b043465e2a970c796e` dan query baca-saja berikut:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

| Temuan | Hasil |
| --- | ---: |
| File migrasi pada source | 170 |
| Entri ledger Production | 100 |
| Versi Production yang tidak memiliki file dengan versi sama di source | 0 |
| Konflik nama antara entri bernama dan file source | 0 |
| Entri Production tanpa nama | 3 |
| Versi source yang belum tercatat di ledger Production | 70 |
| Versi Production tertinggi | `20270316000000` (`communication_ops_runtime`) |
| Versi source tertinggi | `20270408000000` (`alumni_tracer_study`) |

Semua 100 versi ledger Production mempunyai file source dengan versi yang sama. Tiga baris bernama `NULL` tetap sudah memiliki versi di ledger, jadi bukan migrasi pending:

| Versi ledger | Nama file source |
| --- | --- |
| `20261205000000` | `data_api_default_privilege_hardening` |
| `20261206000000` | `ppdb_legacy_candidate_import` |
| `20270118000000` | `crm_contact_management` |

## Versi source yang belum tercatat di ledger Production

Daftar ini diurutkan berdasarkan versi migrasi. Daftar menunjukkan selisih metadata ledger; **daftar ini bukan instruksi untuk menjalankan `db push`**.

| Versi | Nama file migrasi |
| --- | --- |
| `20261207000000` | `library_legacy_catalog_import` |
| `20261208000000` | `hris_legacy_employees_import` |
| `20261210000000` | `cooperative_supplier_import_status` |
| `20261211000000` | `library_circulation_legacy_import` |
| `20261213000000` | `marketplace_mutation_payload_guard` |
| `20261214000000` | `donation_mutation_payload_guard` |
| `20261216000000` | `tahfidz_session_result_integrity` |
| `20261217000000` | `tahfidz_target_tenant_business_date` |
| `20261218000000` | `cbt_server_authoritative_deadline` |
| `20261220000000` | `inventory_adjustment_payload_guard` |
| `20261222000000` | `ga_inventory_event_payload_guard` |
| `20261223000000` | `cbt_request_payload_guard` |
| `20261224000000` | `lms_request_payload_guard` |
| `20261225000000` | `lms_submission_grade_integrity` |
| `20261226000000` | `lms_learning_record_integrity` |
| `20261227000000` | `lms_progress_integrity` |
| `20261228000000` | `boarding_attendance_active_students` |
| `20261229000000` | `boarding_attendance_retry_after_status_change` |
| `20261230000000` | `cooperative_financial_legacy_import` |
| `20270101000000` | `profiles_user_directory_indexes` |
| `20270104000000` | `guardian_boarding_access` |
| `20270109000000` | `boarding_room_history_baseline` |
| `20270111000000` | `ppdb_document_access_audit` |
| `20270113000000` | `admin_ppdb_document_upload` |
| `20270119000000` | `master_data_student_search_indexes` |
| `20270120000000` | `communication_import_canonical_audience` |
| `20270121000000` | `tenant_admin_bootstrap` |
| `20270122000000` | `lms_learning_record_tenant_fk` |
| `20270123000000` | `public_ppdb_idempotency` |
| `20270127000000` | `fix_cbt_answer_object_limit` |
| `20270131000000` | `finance_legacy_unit_assignment` |
| `20270205000000` | `guardian_self_registration` |
| `20270207000000` | `public_schema_migration_ownership` |
| `20270208000000` | `guardian_pre_onboarding_candidate_finance` |
| `20270209000000` | `harden_ppdb_trigger_search_path` |
| `20270210000000` | `internalize_tenant_rls_helpers` |
| `20270211000000` | `optimize_profile_rls_initplans` |
| `20270212000000` | `optimize_core_tenant_query_indexes` |
| `20270215000000` | `harden_reference_relationship_contract` |
| `20270217000000` | `index_tenant_choice_foreign_keys` |
| `20270220000000` | `student_nis_source_idempotency` |
| `20270221000000` | `enforce_auto_business_identifiers` |
| `20270224000000` | `ga_business_identifier_update_guard` |
| `20270225000000` | `restore_idempotency_for_generated_identifiers` |
| `20270226000000` | `ppdb_onboarding_uses_tenant_nis_grade_code` |
| `20270227000000` | `remove_redundant_document_number_index` |
| `20270303000000` | `master_data_student_import_relationships` |
| `20270304000000` | `student_room_assignment_reference_locks` |
| `20270307000000` | `tenant_settings_conflict_http_409` |
| `20270320000000` | `tahfidz_quran_surah_catalog` |
| `20270321000000` | `cbt_tenant_settings_write_api` |
| `20270322000000` | `cbt_admin_dashboard_summary` |
| `20270323000000` | `cbt_admin_question_keyset_pages` |
| `20270324000000` | `cbt_admin_student_roster_pages` |
| `20270325000000` | `cbt_admin_assignment_pages` |
| `20270326000000` | `cbt_admin_exam_pages` |
| `20270327000000` | `tahfidz_persisted_leaderboard` |
| `20270328000000` | `tahfidz_bulk_daily_target_write_api` |
| `20270329000000` | `tahfidz_target_decimal_precision` |
| `20270330000000` | `add_core_composite_fk_indexes` |
| `20270331000000` | `tahfidz_active_days_leaderboard` |
| `20270401000000` | `tahfidz_monthly_leaderboard` |
| `20270402000000` | `tahfidz_bulk_target_precision_guard` |
| `20270403000000` | `tahfidz_unique_memorization_leaderboard` |
| `20270404000000` | `tahfidz_unique_ayah_projection_indexes` |
| `20270404010000` | `crm_broadcast_idempotency` |
| `20270405000000` | `role_permission_fallback` |
| `20270406000000` | `alumni_community_events` |
| `20270407000000` | `hris_shift_scheduling` |
| `20270408000000` | `alumni_tracer_study` |

## Cara membaca temuan

- **Ledger bukan bukti DDL.** Versi yang tidak ada pada ledger belum membuktikan bahwa semua DDL-nya tidak ada di Production; objek bisa pernah dibuat melalui jalur lain. Sebaliknya, versi yang tercatat tidak membuktikan struktur aktual sama dengan source.
- **Jangan jalankan ulang tiga versi tanpa nama.** Ketiganya sudah tercatat berdasarkan versi. Nama source di tabel atas adalah kandidat alias untuk rekonsiliasi metadata, bukan perintah untuk memperbaiki ledger langsung.
- **CI bukan rehearsal pada Production live.** Run GitHub Actions `46111065984` lulus tiga job wajib, termasuk replay migrasi pada database Supabase lokal terisolasi dari baseline historis `2026-11-06`, pgTAP, dan backup/restore lokal. Ini tidak memeriksa DDL aktual PTSAS atau membuktikan backup Production dapat dipulihkan.
- **Preview branch Supabase dinonaktifkan.** Job Supabase Preview untuk PR terkait dilewati. Rehearsal CI yang lulus menggunakan database lokal terisolasi, bukan Production dan bukan branch Supabase VQE.

## Urutan tindakan untuk tim backend/database

1. Bekukan source target: mulai dari `main` `45d9c0d670de0715e57154b043465e2a970c796e`; tinjau ulang daftar ini bila `main` atau ledger Production berubah.
2. Ambil inventaris/schema dump Production baca-saja lalu bandingkan struktur aktual dengan source hasil replay seluruh 170 file migrasi. Catat perbedaan per tabel, kolom, constraint, index, trigger, function, policy, privilege, dan Storage policy.
3. Untuk masing-masing 70 versi di atas, klasifikasikan apakah DDL/data effect sudah ada, belum ada, berubah, atau hanya ledger yang berbeda. Tinjau khusus migrasi import/backfill, pengamanan privilege/RLS, foreign key, idempotency, dan index sebelum memilih urutan eksekusi.
4. Selesaikan rekonsiliasi 3 nama `NULL` secara terpisah. Jangan mengubah ledger sebelum tim memastikan nama sumber dan metode repair yang digunakan; jangan menjalankan ulang DDL hanya untuk mengisi nama.
5. Buktikan backup Production dapat direstore ke lingkungan terisolasi dan aplikasi dapat membaca hasil restore. Catat titik pemulihan, waktu, versi source, serta pemeriksaan konsistensi.
6. Setelah perbedaan DDL, dampak data, backup/restore, dan urutan promosi disetujui tim, susun batch migrasi yang dapat diaudit. Jalankan dry-run pada lingkungan target terlebih dahulu, lalu verifikasi ledger dan health check setelah setiap batch.
7. Jangan mengubah RLS agar migrasi lolos, jangan menjalankan query repair dari sesi ini, dan jangan memasukkan data dummy ke PTSAS Production.

## Batas pemeriksaan ini

Pemeriksaan ini hanya membaca metadata `version, name` dari ledger Production dan nama file source. Tidak membaca baris aplikasi, tidak mengambil schema dump Production, tidak memverifikasi backup Production, dan tidak mengubah Production, VQE, environment hosting, atau data.
