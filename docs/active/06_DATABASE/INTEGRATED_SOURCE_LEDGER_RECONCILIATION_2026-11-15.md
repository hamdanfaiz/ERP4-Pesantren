# Rekonsiliasi ledger migrasi pada source integrasi — 15 November 2026

## Tujuan dan ruang lingkup

Catatan ini membandingkan nama/versi file pada branch review `codex/integration-current-main-20261115` (source commit kode `ca07d58e`, 161 file SQL di `supabase/migrations`) dengan migration ledger Supabase VQE staging dan PTSAS Production. Pemeriksaan menggunakan konektor Supabase MCP `list_migrations` dan hanya membaca metadata versi/nama. Tidak membaca baris aplikasi, isi DDL, kebijakan RLS, atau menjalankan perubahan.

Source branch menggabungkan PR #91, #92, #112, #114, #115, dan #121. Perbandingan ini bukan persetujuan migrasi dan bukan bukti bahwa objek yang tidak tercatat pada ledger belum ada di database.

## Hasil per lingkungan

| Lingkungan | File source | Entri ledger | Pasangan versi/nama persis | Nama source tidak ditemukan | Nama sama, versi berbeda | Entri ledger tanpa nama |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| VQE staging (`vqemuyzveuirlkvdggjd`) | 161 | 150 | 140 | 11 | 10 | 0 |
| PTSAS Production (`ptsasgdvgrbdtgyqieie`) | 161 | 100 | 97 | 64 | 0 | 3 |

### PTSAS Production

Sebanyak 64 nama source tidak muncul sebagai nama pada ledger Production. Tiga versi ledger yang namanya tidak dikembalikan bertepatan dengan versi source berikut; nama migrasi belum dapat dipastikan dari metadata tersebut:

- `20261205000000` — source `data_api_default_privilege_hardening`
- `20261206000000` — source `ppdb_legacy_candidate_import`
- `20270118000000` — source `crm_contact_management`

61 nama source lainnya tidak memiliki entri ledger bernama yang cocok maupun versi ledger yang sama. Daftar source:

```text
20261207000000_library_legacy_catalog_import
20261208000000_hris_legacy_employees_import
20261210000000_cooperative_supplier_import_status
20261211000000_library_circulation_legacy_import
20261213000000_marketplace_mutation_payload_guard
20261214000000_donation_mutation_payload_guard
20261216000000_tahfidz_session_result_integrity
20261217000000_tahfidz_target_tenant_business_date
20261218000000_cbt_server_authoritative_deadline
20261220000000_inventory_adjustment_payload_guard
20261222000000_ga_inventory_event_payload_guard
20261223000000_cbt_request_payload_guard
20261224000000_lms_request_payload_guard
20261225000000_lms_submission_grade_integrity
20261226000000_lms_learning_record_integrity
20261227000000_lms_progress_integrity
20261228000000_boarding_attendance_active_students
20261229000000_boarding_attendance_retry_after_status_change
20261230000000_cooperative_financial_legacy_import
20270101000000_profiles_user_directory_indexes
20270104000000_guardian_boarding_access
20270109000000_boarding_room_history_baseline
20270111000000_ppdb_document_access_audit
20270113000000_admin_ppdb_document_upload
20270119000000_master_data_student_search_indexes
20270120000000_communication_import_canonical_audience
20270121000000_tenant_admin_bootstrap
20270122000000_lms_learning_record_tenant_fk
20270123000000_public_ppdb_idempotency
20270127000000_fix_cbt_answer_object_limit
20270131000000_finance_legacy_unit_assignment
20270205000000_guardian_self_registration
20270207000000_public_schema_migration_ownership
20270208000000_guardian_pre_onboarding_candidate_finance
20270209000000_harden_ppdb_trigger_search_path
20270210000000_internalize_tenant_rls_helpers
20270211000000_optimize_profile_rls_initplans
20270212000000_optimize_core_tenant_query_indexes
20270215000000_harden_reference_relationship_contract
20270217000000_index_tenant_choice_foreign_keys
20270220000000_student_nis_source_idempotency
20270221000000_enforce_auto_business_identifiers
20270224000000_ga_business_identifier_update_guard
20270225000000_restore_idempotency_for_generated_identifiers
20270226000000_ppdb_onboarding_uses_tenant_nis_grade_code
20270227000000_remove_redundant_document_number_index
20270303000000_master_data_student_import_relationships
20270304000000_student_room_assignment_reference_locks
20270307000000_tenant_settings_conflict_http_409
20270320000000_tahfidz_quran_surah_catalog
20270321000000_cbt_tenant_settings_write_api
20270322000000_cbt_admin_dashboard_summary
20270323000000_cbt_admin_question_keyset_pages
20270324000000_cbt_admin_student_roster_pages
20270325000000_cbt_admin_assignment_pages
20270326000000_cbt_admin_exam_pages
20270327000000_tahfidz_persisted_leaderboard
20270328000000_tahfidz_bulk_daily_target_write_api
20270329000000_tahfidz_target_decimal_precision
20270330000000_add_core_composite_fk_indexes
20270331000000_tahfidz_active_days_leaderboard
```

Daftar ini adalah selisih metadata nama/versi terhadap 161 file pada source branch, bukan daftar migrasi yang otomatis aman dijalankan. Migrasi dapat sudah diterapkan manual, tercatat dengan metadata lain, atau membutuhkan perbaikan forward-only.

### VQE staging

Nama source yang tidak ditemukan pada ledger VQE:

```text
20270215500000_sample_class_grade_labels
20270309000000_academic_report_card
20270310000000_academic_sample_catalog
20270311000000_academic_sample_term
20270312000000_sample_nis_grade_codes
20270313000000_education_boarding_operational_seed
20270314000000_education_boarding_operational_fill
20270315000000_lms_dashboard_operational_fill
20270316000000_communication_ops_runtime
20270330000000_add_core_composite_fk_indexes
20270331000000_tahfidz_active_days_leaderboard
```

Sepuluh nama source tercatat pada versi lain di VQE:

| Source branch | Versi/nama pada VQE |
| --- | --- |
| `20270320000000_tahfidz_quran_surah_catalog` | `20261109145507_tahfidz_quran_surah_catalog` |
| `20270321000000_cbt_tenant_settings_write_api` | `20270314000000_cbt_tenant_settings_write_api` |
| `20270322000000_cbt_admin_dashboard_summary` | `20270315000000_cbt_admin_dashboard_summary` |
| `20270323000000_cbt_admin_question_keyset_pages` | `20270316000000_cbt_admin_question_keyset_pages` |
| `20270324000000_cbt_admin_student_roster_pages` | `20270317000000_cbt_admin_student_roster_pages` |
| `20270325000000_cbt_admin_assignment_pages` | `20270318000000_cbt_admin_assignment_pages` |
| `20270326000000_cbt_admin_exam_pages` | `20270319000000_cbt_admin_exam_pages` |
| `20270327000000_tahfidz_persisted_leaderboard` | `20261109145522_tahfidz_persisted_leaderboard` |
| `20270328000000_tahfidz_bulk_daily_target_write_api` | `20261109145534_tahfidz_bulk_daily_target_write_api` |
| `20270329000000_tahfidz_target_decimal_precision` | `20270312000000_tahfidz_target_decimal_precision` |

Empat versi source bertabrakan dengan nama lain di ledger VQE: `20270312000000` (`sample_nis_grade_codes` vs `tahfidz_target_decimal_precision`), `20270314000000` (`education_boarding_operational_fill` vs `cbt_tenant_settings_write_api`), `20270315000000` (`lms_dashboard_operational_fill` vs `cbt_admin_dashboard_summary`), dan `20270316000000` (`communication_ops_runtime` vs `cbt_admin_question_keyset_pages`).

## Instruksi rekonsiliasi untuk tim backend

1. Jangan menjalankan `supabase db push`, `migration repair`, atau SQL untuk mengubah ledger hanya berdasarkan perbedaan daftar ini.
2. Untuk setiap migrasi yang berbeda/tidak tercatat, cocokkan file SQL dengan DDL aktual: tabel/kolom, constraint, indeks, trigger, function/RPC, policy/grant, serta perubahan data. Beri status `sudah setara`, `belum diterapkan`, `sudah digantikan`, atau `perlu forward migration`; sertakan bukti objek.
3. Tinjau setiap `INSERT`/`UPDATE`/`DELETE` dan data seed terpisah dari perubahan DDL. Pastikan tenant sasaran, duplikasi, idempotensi, serta dampak ke data operasional sebelum menyetujui.
4. Jangan mengubah file migrasi historis yang mungkin sudah diterapkan. Bila perlu koreksi, buat migrasi forward-only dengan versi unik yang disepakati setelah urutan source dan ledger dipetakan.
5. Rehearse kandidat rekonsiliasi di staging dengan backup yang dapat dipulihkan, periksa ulang skema/RLS/API, lalu jalankan UAT. Production memerlukan backup, uji restore, jendela pemeliharaan, dan persetujuan rilis tim backend.

## Batas bukti

CI pada Supabase lokal terisolasi membuktikan replay dan suite otomatis untuk source, bukan kesamaan DDL atau pemulihan database cloud. Pemeriksaan ini tidak membaca baris aplikasi dan tidak mengubah VQE maupun PTSAS. Snapshot ini harus diperbarui bila source branch atau ledger berubah.

Source/review: [branch integrasi](https://github.com/hamdanfaiz/ERP4-Pesantren/tree/codex/integration-current-main-20261115) · [checkpoint integrasi](../00_PRODUCT/CHECKPOINT_2026-11-15_CURRENT_MAIN_INTEGRATION.md)