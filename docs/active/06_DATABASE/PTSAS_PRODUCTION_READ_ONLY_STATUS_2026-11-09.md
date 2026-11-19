# Status baca-saja Supabase Production — 9 November 2026

## Ringkasan

| Pemeriksaan | Hasil |
| --- | --- |
| Proyek target | PTSAS `ptsasgdvgrbdtgyqieie` |
| Konektor | Konektor Supabase pada sesi ini berhasil menemukan proyek dan membaca metadata |
| Tabel schema `public` | 119; semuanya melaporkan RLS aktif melalui `list_tables` |
| Ledger migrasi Production | 47 versi |
| Source PR #91 | 140 file migrasi pada head `2747f65d53081397bb06c8ca6c1fc39b77722d99` |
| Versi ledger yang ada pada source | 47/47 |
| Source yang belum tercatat pada ledger | 93 file |
| Perbandingan source lokal dan file remote PR | 140/140 nama dan blob SHA cocok |
| Perubahan pada Production | Tidak ada |

## Batas kesimpulan

Pembacaan ini membuktikan konektivitas ke metadata proyek Production dan perbandingan **versi ledger** dengan source PR. Ini tidak membandingkan DDL aktual, isi policy, grants, konfigurasi Storage, atau perilaku route/API. Versi source yang belum tercatat tidak membuktikan migrasinya belum diterapkan: sebagian perubahan mungkin sudah ada dari prosedur lain atau tertutup perubahan lain.

Jangan menerapkan atau menandai selesai untuk 93 file secara massal. Tim backend perlu membandingkan DDL Production dengan setiap perubahan source, meninjau urutan/dependensi serta dampak, lalu menguji rencana migrasi korektif pada lingkungan terisolasi. Backup Production dan bukti restore tetap menjadi gerbang tim backend.

## Perbandingan 47 entri ledger Production

Dua entri ledger tidak mengembalikan nama; nama file source dipetakan hanya melalui versi.

| Versi Production | Nama Production | File source | Hasil |
| --- | --- | --- | --- |
| `20260603000000` | initial_schema | `20260603000000_initial_schema.sql` | Cocok |
| `20261022000000` | user_profiles | `20261022000000_user_profiles.sql` | Cocok |
| `20261023000000` | tenant_profile_foundation | `20261023000000_tenant_profile_foundation.sql` | Cocok |
| `20261024000000` | communication_announcements | `20261024000000_communication_announcements.sql` | Cocok |
| `20261025000000` | tenant_system_settings | `20261025000000_tenant_system_settings.sql` | Cocok |
| `20261026000000` | search_feedback | `20261026000000_search_feedback.sql` | Cocok |
| `20261027000000` | private_finance_proof_storage | `20261027000000_private_finance_proof_storage.sql` | Cocok |
| `20261028000000` | public_ppdb_runtime | `20261028000000_public_ppdb_runtime.sql` | Cocok |
| `20261029000000` | ppdb_admin_workflows | `20261029000000_ppdb_admin_workflows.sql` | Cocok |
| `20261030000000` | master_data_onboarding | `20261030000000_master_data_onboarding.sql` | Cocok |
| `20261031000000` | legacy_master_data_import | `20261031000000_legacy_master_data_import.sql` | Cocok |
| `20261101000000` | student_room_assignment | `20261101000000_student_room_assignment.sql` | Cocok |
| `20261102000000` | master_data_student_runtime | `20261102000000_master_data_student_runtime.sql` | Cocok |
| `20261103000000` | tahfidz_tenant_runtime | `20261103000000_tahfidz_tenant_runtime.sql` | Cocok |
| `20261104000000` | tahfidz_legacy_import | `20261104000000_tahfidz_legacy_import.sql` | Cocok |
| `20261105000000` | tahfidz_recorder_assignment_guard | `20261105000000_tahfidz_recorder_assignment_guard.sql` | Cocok |
| `20261106000000` | tahfidz_target_write_api | `20261106000000_tahfidz_target_write_api.sql` | Cocok |
| `20261107000000` | tahfidz_halaqah_membership_write_api | `20261107000000_tahfidz_halaqah_membership_write_api.sql` | Cocok |
| `20261108000000` | boarding_permits_runtime | `20261108000000_boarding_permits_runtime.sql` | Cocok |
| `20261109000000` | boarding_discipline_runtime | `20261109000000_boarding_discipline_runtime.sql` | Cocok |
| `20261110000000` | boarding_attendance_runtime | `20261110000000_boarding_attendance_runtime.sql` | Cocok |
| `20261111000000` | boarding_staff_assignments | `20261111000000_boarding_staff_assignments.sql` | Cocok |
| `20261112000000` | boarding_facility_ops_runtime | `20261112000000_boarding_facility_ops_runtime.sql` | Cocok |
| `20261113000000` | boarding_facility_ops_legacy_import | `20261113000000_boarding_facility_ops_legacy_import.sql` | Cocok |
| `20261114000000` | alumni_runtime | `20261114000000_alumni_runtime.sql` | Cocok |
| `20261115000000` | library_runtime | `20261115000000_library_runtime.sql` | Cocok |
| `20261116000000` | tahfidz_sessions_runtime | `20261116000000_tahfidz_sessions_runtime.sql` | Cocok |
| `20261117000000` | finance_runtime | `20261117000000_finance_runtime.sql` | Cocok |
| `20261118000000` | dashboard_snapshot | `20261118000000_dashboard_snapshot.sql` | Cocok |
| `20261119000000` | ppdb_guarded_admin_workflows | `20261119000000_ppdb_guarded_admin_workflows.sql` | Cocok |
| `20261120000000` | academic_runtime | `20261120000000_academic_runtime.sql` | Cocok |
| `20261121000000` | cbt_runtime | `20261121000000_cbt_runtime.sql` | Cocok |
| `20261122000000` | lms_runtime | `20261122000000_lms_runtime.sql` | Cocok |
| `20261123000000` | healthcare_runtime | `20261123000000_healthcare_runtime.sql` | Cocok |
| `20261124000000` | general_affairs_assets_runtime | `20261124000000_general_affairs_assets_runtime.sql` | Cocok |
| `20261125000000` | marketplace_runtime | `20261125000000_marketplace_runtime.sql` | Cocok |
| `20261126000000` | donation_waqf_runtime | `20261126000000_donation_waqf_runtime.sql` | Cocok |
| `20261127000000` | facility_bookings_runtime | `20261127000000_facility_bookings_runtime.sql` | Cocok |
| `20261128000000` | ppdb_onboarding_actor_audit | `20261128000000_ppdb_onboarding_actor_audit.sql` | Cocok |
| `20261129000000` | hris_core_runtime | `20261129000000_hris_core_runtime.sql` | Cocok |
| `20261130000000` | ppdb_religious_assessment | `20261130000000_ppdb_religious_assessment.sql` | Cocok |
| `20261201000000` | tahfidz_target_tenant_fk | `20261201000000_tahfidz_target_tenant_fk.sql` | Cocok |
| `20261202000000` | cooperative_runtime | `20261202000000_cooperative_runtime.sql` | Cocok |
| `20261203000000` | cooperative_finance_posting | `20261203000000_cooperative_finance_posting.sql` | Cocok |
| `20261204000000` | laundry_runtime | `20261204000000_laundry_runtime.sql` | Cocok |
| `20261205000000` | *(kosong pada ledger)* | `20261205000000_data_api_default_privilege_hardening.sql` | Nama kosong; versi cocok |
| `20261206000000` | *(kosong pada ledger)* | `20261206000000_ppdb_legacy_candidate_import.sql` | Nama kosong; versi cocok |

## 93 file source yang belum ada pada ledger Production

| Versi source | File |
| --- | --- |
| `20261031104213` | `20261031104213_master_data_import_create_only.sql` |
| `20261031225438` | `20261031225438_master_data_audit_feed.sql` |
| `20261207000000` | `20261207000000_library_legacy_catalog_import.sql` |
| `20261208000000` | `20261208000000_hris_legacy_employees_import.sql` |
| `20261209000000` | `20261209000000_cooperative_tenant_business_day.sql` |
| `20261210000000` | `20261210000000_cooperative_supplier_import_status.sql` |
| `20261211000000` | `20261211000000_library_circulation_legacy_import.sql` |
| `20261212000000` | `20261212000000_cooperative_sale_idempotency_wallet.sql` |
| `20261213000000` | `20261213000000_marketplace_mutation_payload_guard.sql` |
| `20261214000000` | `20261214000000_donation_mutation_payload_guard.sql` |
| `20261215000000` | `20261215000000_laundry_mutation_payload_guard.sql` |
| `20261216000000` | `20261216000000_tahfidz_session_result_integrity.sql` |
| `20261217000000` | `20261217000000_tahfidz_target_tenant_business_date.sql` |
| `20261218000000` | `20261218000000_cbt_server_authoritative_deadline.sql` |
| `20261219000000` | `20261219000000_academic_request_idempotency_guard.sql` |
| `20261220000000` | `20261220000000_inventory_adjustment_payload_guard.sql` |
| `20261221000000` | `20261221000000_healthcare_request_idempotency_guard.sql` |
| `20261222000000` | `20261222000000_ga_inventory_event_payload_guard.sql` |
| `20261223000000` | `20261223000000_cbt_request_payload_guard.sql` |
| `20261224000000` | `20261224000000_lms_request_payload_guard.sql` |
| `20261225000000` | `20261225000000_lms_submission_grade_integrity.sql` |
| `20261226000000` | `20261226000000_lms_learning_record_integrity.sql` |
| `20261227000000` | `20261227000000_lms_progress_integrity.sql` |
| `20261228000000` | `20261228000000_boarding_attendance_active_students.sql` |
| `20261229000000` | `20261229000000_boarding_attendance_retry_after_status_change.sql` |
| `20261230000000` | `20261230000000_cooperative_financial_legacy_import.sql` |
| `20261231000000` | `20261231000000_cooperative_supplier_payload_idempotency.sql` |
| `20270101000000` | `20270101000000_profiles_user_directory_indexes.sql` |
| `20270102000000` | `20270102000000_guardian_accounts_and_invitations.sql` |
| `20270103000000` | `20270103000000_guardian_finance_access.sql` |
| `20270104000000` | `20270104000000_guardian_boarding_access.sql` |
| `20270105000000` | `20270105000000_communication_guardian_audience.sql` |
| `20270106000000` | `20270106000000_boarding_room_assignment_history.sql` |
| `20270107000000` | `20270107000000_tahfidz_roster_keyset_pagination.sql` |
| `20270108000000` | `20270108000000_tahfidz_dashboard_follow_up_summary.sql` |
| `20270109000000` | `20270109000000_boarding_room_history_baseline.sql` |
| `20270110000000` | `20270110000000_ppdb_candidate_finance_bills.sql` |
| `20270111000000` | `20270111000000_ppdb_document_access_audit.sql` |
| `20270112000000` | `20270112000000_admin_ppdb_candidate_create.sql` |
| `20270113000000` | `20270113000000_admin_ppdb_document_upload.sql` |
| `20270114000000` | `20270114000000_cbt_tenant_settings_import.sql` |
| `20270115000000` | `20270115000000_ppdb_admin_search_keyset.sql` |
| `20270116000000` | `20270116000000_private_library_digital_assets.sql` |
| `20270117000000` | `20270117000000_document_center_core.sql` |
| `20270118000000` | `20270118000000_crm_contact_management.sql` |
| `20270119000000` | `20270119000000_master_data_student_search_indexes.sql` |
| `20270120000000` | `20270120000000_communication_import_canonical_audience.sql` |
| `20270121000000` | `20270121000000_tenant_admin_bootstrap.sql` |
| `20270122000000` | `20270122000000_lms_learning_record_tenant_fk.sql` |
| `20270123000000` | `20270123000000_public_ppdb_idempotency.sql` |
| `20270124000000` | `20270124000000_finance_proof_upload_rate_limit.sql` |
| `20270125000000` | `20270125000000_finance_budget_plans.sql` |
| `20270126000000` | `20270126000000_tenant_enterprise_units.sql` |
| `20270127000000` | `20270127000000_fix_cbt_answer_object_limit.sql` |
| `20270128000000` | `20270128000000_finance_expense_unit_scope.sql` |
| `20270129000000` | `20270129000000_finance_budget_unit_scope.sql` |
| `20270130000000` | `20270130000000_master_data_unit_assignment.sql` |
| `20270131000000` | `20270131000000_finance_legacy_unit_assignment.sql` |
| `20270201000000` | `20270201000000_academic_unit_scope.sql` |
| `20270202000000` | `20270202000000_academic_class_unit_mapping.sql` |
| `20270203000000` | `20270203000000_boarding_unit_scope.sql` |
| `20270204000000` | `20270204000000_tahfidz_achievement_summary.sql` |
| `20270205000000` | `20270205000000_guardian_self_registration.sql` |
| `20270206000000` | `20270206000000_tahfidz_peer_review_moderation.sql` |
| `20270207000000` | `20270207000000_public_schema_migration_ownership.sql` |
| `20270208000000` | `20270208000000_guardian_pre_onboarding_candidate_finance.sql` |
| `20270209000000` | `20270209000000_harden_ppdb_trigger_search_path.sql` |
| `20270210000000` | `20270210000000_internalize_tenant_rls_helpers.sql` |
| `20270211000000` | `20270211000000_optimize_profile_rls_initplans.sql` |
| `20270212000000` | `20270212000000_optimize_core_tenant_query_indexes.sql` |
| `20270214120000` | `20270214120000_tenant_reference_relationships.sql` |
| `20270215000000` | `20270215000000_harden_reference_relationship_contract.sql` |
| `20270216000000` | `20270216000000_tenant_operational_choice_relationships.sql` |
| `20270217000000` | `20270217000000_index_tenant_choice_foreign_keys.sql` |
| `20270218000000` | `20270218000000_operational_relationships_and_naming_series.sql` |
| `20270219000000` | `20270219000000_naming_series_master_data_ids.sql` |
| `20270220000000` | `20270220000000_student_nis_source_idempotency.sql` |
| `20270221000000` | `20270221000000_enforce_auto_business_identifiers.sql` |
| `20270222000000` | `20270222000000_extend_naming_series_business_identifiers.sql` |
| `20270223000000` | `20270223000000_additional_operational_naming_series.sql` |
| `20270224000000` | `20270224000000_ga_business_identifier_update_guard.sql` |
| `20270225000000` | `20270225000000_restore_idempotency_for_generated_identifiers.sql` |
| `20270226000000` | `20270226000000_ppdb_onboarding_uses_tenant_nis_grade_code.sql` |
| `20270227000000` | `20270227000000_remove_redundant_document_number_index.sql` |
| `20270228000000` | `20270228000000_academic_record_cursor_indexes.sql` |
| `20270301000000` | `20270301000000_academic_student_roster_pagination.sql` |
| `20270302000000` | `20270302000000_academic_class_reference_pagination.sql` |
| `20270303000000` | `20270303000000_master_data_student_import_relationships.sql` |
| `20270304000000` | `20270304000000_student_room_assignment_reference_locks.sql` |
| `20270305000000` | `20270305000000_academic_schedule_idempotency_retry.sql` |
| `20270306000000` | `20270306000000_library_book_category_reference_writes.sql` |
| `20270307000000` | `20270307000000_tenant_settings_conflict_http_409.sql` |
| `20270308000000` | `20270308000000_academic_class_unit_admin_role_baseline.sql` |

## Bukti yang dapat direproduksi

- GitHub PR #91 head saat pemeriksaan: [`2747f65d53081397bb06c8ca6c1fc39b77722d99`](https://github.com/hamdanfaiz/ERP4-Pesantren/commit/2747f65d53081397bb06c8ca6c1fc39b77722d99), commit `feat: add bounded Tahfidz report export`.
- GitHub Actions untuk head tersebut: run [#1440](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42572804152), tiga job selesai dengan kesimpulan `success`: migration/API/pgTAP, frontend build/Firebase bundle guard, serta instalasi NPM.
- Daftar Production dibaca dengan `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`; metadata tabel diambil lewat `list_tables`.
- File migration pada PR head berjumlah 140; seluruh nama dan object SHA sama dengan checkout lokal pada saat pemeriksaan.
- Tidak ada baris operasional yang dibaca dan tidak ada SQL tulis, migrasi, atau perubahan Production yang dilakukan.
