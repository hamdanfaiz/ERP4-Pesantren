# Rekonsiliasi ledger migrasi Production dan VQE — 12 November 2026

## Ringkasan

Pemeriksaan ini hanya membaca ledger migrasi Supabase dan daftar file SQL pada branch PR #91. Tidak ada DDL, data, aturan, atau migrasi yang diterapkan.

- Source PR #91 pada head `32c09d9451eb3bae76b7877b79b4594a020caf37`: **144** file migrasi.
- PTSAS Production (`ptsasgdvgrbdtgyqieie`): **48** entri ledger; **96** versi source belum tercatat.
- VQE staging (`vqemuyzveuirlkvdggjd`): **143** entri ledger.
- PTSAS memiliki dua versi tanpa nama dan satu konflik nama pada versi `20270309000000`.
- VQE menyimpan tiga migrasi Tahfidz dengan timestamp alias yang tidak sama dengan nama/versi source; versi source `20270309000000` sampai `20270312000000` belum tercatat persis di VQE.
- Inventaris baca-saja ini dicocokkan ulang pada **12 November 2026** dengan head PR yang sama. PR #91 masih Open/Draft. [CI #1481](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42939819678) lulus 3/3 job dan round-trip Tahfidz lulus di VQE. Hasil tersebut tidak membuktikan bahwa DDL Production sama dengan source.

## Perbedaan nama di Production

| Versi | Nama pada source | Nama pada ledger PTSAS |
|---|---|---|
| `20261205000000` | `data_api_default_privilege_hardening` | kosong |
| `20261206000000` | `ppdb_legacy_candidate_import` | kosong |
| `20270309000000` | `tahfidz_quran_surah_catalog` | `academic_report_card` |

Versi `20270309000000` adalah benturan nyata: PTSAS telah menandai versi tersebut sebagai `academic_report_card`, sedangkan source PR #91 memakai versi yang sama untuk `tahfidz_quran_surah_catalog`. Jangan mengandalkan `db push` untuk menerapkan isi migrasi Tahfidz yang memiliki versi sama; ledger dapat membuatnya tampak sudah diterapkan.

## Versi source yang belum tercatat pada PTSAS

Daftar ini berasal dari perbandingan nomor versi file source dengan ledger Production. Nama/versi di tabel bukan instruksi untuk langsung menjalankan migrasi.

| Versi source | Nama file |
|---|---|
| `20261031104213` | `master_data_import_create_only` |
| `20261031225438` | `master_data_audit_feed` |
| `20261207000000` | `library_legacy_catalog_import` |
| `20261208000000` | `hris_legacy_employees_import` |
| `20261209000000` | `cooperative_tenant_business_day` |
| `20261210000000` | `cooperative_supplier_import_status` |
| `20261211000000` | `library_circulation_legacy_import` |
| `20261212000000` | `cooperative_sale_idempotency_wallet` |
| `20261213000000` | `marketplace_mutation_payload_guard` |
| `20261214000000` | `donation_mutation_payload_guard` |
| `20261215000000` | `laundry_mutation_payload_guard` |
| `20261216000000` | `tahfidz_session_result_integrity` |
| `20261217000000` | `tahfidz_target_tenant_business_date` |
| `20261218000000` | `cbt_server_authoritative_deadline` |
| `20261219000000` | `academic_request_idempotency_guard` |
| `20261220000000` | `inventory_adjustment_payload_guard` |
| `20261221000000` | `healthcare_request_idempotency_guard` |
| `20261222000000` | `ga_inventory_event_payload_guard` |
| `20261223000000` | `cbt_request_payload_guard` |
| `20261224000000` | `lms_request_payload_guard` |
| `20261225000000` | `lms_submission_grade_integrity` |
| `20261226000000` | `lms_learning_record_integrity` |
| `20261227000000` | `lms_progress_integrity` |
| `20261228000000` | `boarding_attendance_active_students` |
| `20261229000000` | `boarding_attendance_retry_after_status_change` |
| `20261230000000` | `cooperative_financial_legacy_import` |
| `20261231000000` | `cooperative_supplier_payload_idempotency` |
| `20270101000000` | `profiles_user_directory_indexes` |
| `20270102000000` | `guardian_accounts_and_invitations` |
| `20270103000000` | `guardian_finance_access` |
| `20270104000000` | `guardian_boarding_access` |
| `20270105000000` | `communication_guardian_audience` |
| `20270106000000` | `boarding_room_assignment_history` |
| `20270107000000` | `tahfidz_roster_keyset_pagination` |
| `20270108000000` | `tahfidz_dashboard_follow_up_summary` |
| `20270109000000` | `boarding_room_history_baseline` |
| `20270110000000` | `ppdb_candidate_finance_bills` |
| `20270111000000` | `ppdb_document_access_audit` |
| `20270112000000` | `admin_ppdb_candidate_create` |
| `20270113000000` | `admin_ppdb_document_upload` |
| `20270114000000` | `cbt_tenant_settings_import` |
| `20270115000000` | `ppdb_admin_search_keyset` |
| `20270116000000` | `private_library_digital_assets` |
| `20270117000000` | `document_center_core` |
| `20270118000000` | `crm_contact_management` |
| `20270119000000` | `master_data_student_search_indexes` |
| `20270120000000` | `communication_import_canonical_audience` |
| `20270121000000` | `tenant_admin_bootstrap` |
| `20270122000000` | `lms_learning_record_tenant_fk` |
| `20270123000000` | `public_ppdb_idempotency` |
| `20270124000000` | `finance_proof_upload_rate_limit` |
| `20270125000000` | `finance_budget_plans` |
| `20270126000000` | `tenant_enterprise_units` |
| `20270127000000` | `fix_cbt_answer_object_limit` |
| `20270128000000` | `finance_expense_unit_scope` |
| `20270129000000` | `finance_budget_unit_scope` |
| `20270130000000` | `master_data_unit_assignment` |
| `20270131000000` | `finance_legacy_unit_assignment` |
| `20270201000000` | `academic_unit_scope` |
| `20270202000000` | `academic_class_unit_mapping` |
| `20270203000000` | `boarding_unit_scope` |
| `20270204000000` | `tahfidz_achievement_summary` |
| `20270205000000` | `guardian_self_registration` |
| `20270206000000` | `tahfidz_peer_review_moderation` |
| `20270207000000` | `public_schema_migration_ownership` |
| `20270208000000` | `guardian_pre_onboarding_candidate_finance` |
| `20270209000000` | `harden_ppdb_trigger_search_path` |
| `20270210000000` | `internalize_tenant_rls_helpers` |
| `20270211000000` | `optimize_profile_rls_initplans` |
| `20270212000000` | `optimize_core_tenant_query_indexes` |
| `20270214120000` | `tenant_reference_relationships` |
| `20270215000000` | `harden_reference_relationship_contract` |
| `20270216000000` | `tenant_operational_choice_relationships` |
| `20270217000000` | `index_tenant_choice_foreign_keys` |
| `20270218000000` | `operational_relationships_and_naming_series` |
| `20270219000000` | `naming_series_master_data_ids` |
| `20270220000000` | `student_nis_source_idempotency` |
| `20270221000000` | `enforce_auto_business_identifiers` |
| `20270222000000` | `extend_naming_series_business_identifiers` |
| `20270223000000` | `additional_operational_naming_series` |
| `20270224000000` | `ga_business_identifier_update_guard` |
| `20270225000000` | `restore_idempotency_for_generated_identifiers` |
| `20270226000000` | `ppdb_onboarding_uses_tenant_nis_grade_code` |
| `20270227000000` | `remove_redundant_document_number_index` |
| `20270228000000` | `academic_record_cursor_indexes` |
| `20270301000000` | `academic_student_roster_pagination` |
| `20270302000000` | `academic_class_reference_pagination` |
| `20270303000000` | `master_data_student_import_relationships` |
| `20270304000000` | `student_room_assignment_reference_locks` |
| `20270305000000` | `academic_schedule_idempotency_retry` |
| `20270306000000` | `library_book_category_reference_writes` |
| `20270307000000` | `tenant_settings_conflict_http_409` |
| `20270308000000` | `academic_class_unit_admin_role_baseline` |
| `20270310000000` | `tahfidz_persisted_leaderboard` |
| `20270311000000` | `tahfidz_bulk_daily_target_write_api` |
| `20270312000000` | `tahfidz_target_decimal_precision` |

## Rekonsiliasi VQE staging

| Versi source yang belum tercatat persis | Nama file |
|---|---|
| `20270309000000` | `tahfidz_quran_surah_catalog` |
| `20270310000000` | `tahfidz_persisted_leaderboard` |
| `20270311000000` | `tahfidz_bulk_daily_target_write_api` |
| `20270312000000` | `tahfidz_target_decimal_precision` |

VQE memiliki entri berikut dengan nama sama tetapi timestamp berbeda:

| Versi ledger VQE | Nama pada ledger | Versi source yang cocok berdasarkan nama |
|---|---|---|
| `20261109145507` | `tahfidz_quran_surah_catalog` | `20270309000000` |
| `20261109145522` | `tahfidz_persisted_leaderboard` | `20270310000000` |
| `20261109145534` | `tahfidz_bulk_daily_target_write_api` | `20270311000000` |

Migrasi `20270312000000_tahfidz_target_decimal_precision` belum muncul di ledger VQE, dan tidak memiliki alias dengan nama sama pada hasil baca ini.

## Tindakan yang diperlukan tim backend

1. Ekspor dan bandingkan DDL aktual PTSAS dengan baseline/migrasi source menggunakan metode baca-saja; identifikasi objek yang sudah ada, kurang, atau berbeda. Ledger tidak membuktikan kesamaan DDL.
2. Rekonsiliasi dua entri tanpa nama dan benturan versi `20270309000000`; pilih timestamp migrasi source yang unik dan tinjau efeknya pada VQE maupun PTSAS.
3. Telaah 96 migrasi source yang belum tercatat satu per satu dalam urutan dependensinya. Kelompokkan migrasi yang memang diperlukan, yang DDL-nya sudah ada, dan yang memerlukan migrasi forward/rebaseline.
4. Rehearsal pada database staging/clone terisolasi yang berangkat dari schema dan ledger Production; jalankan verifikasi data dan rollback/restore sebelum ada penulisan ke PTSAS.
5. Terapkan hanya rencana yang sudah ditinjau dan disetujui oleh pemilik Production; verifikasi ledger, DDL, RLS, Storage, dan alur aplikasi setelahnya.

## Batas bukti

- `list_migrations` hanya membuktikan isi ledger, bukan isi DDL atau data.
- CI #1481 memakai Supabase lokal terisolasi; UAT Tahfidz API dilakukan di VQE staging.
- Belum ada bukti backup/restore Production, kesetaraan DDL, atau kelulusan UAT seluruh modul pada PTSAS.
- **PTSAS Production tidak diubah.**

