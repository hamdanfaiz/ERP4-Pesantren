# Rekonsiliasi metadata migrasi Production — 9 November 2026

## Ringkasan eksekutif

| Ukuran | Hasil |
| --- | ---: |
| Ledger migrasi Production yang dilaporkan operator | 47 versi |
| File SQL migrasi pada PR #91 head `f882af0de993f27105ff5362f9f47cac592db233` | 140 |
| Versi Production yang ada pada source PR #91 | 47 dari 47 |
| Versi source PR #91 yang tidak tercantum pada ledger Production yang dilaporkan | 93 |
| Migration file SHA identik antara GitHub PR #91 head dan `HEAD` lokal yang dibandingkan | 140 dari 140 |
| Perubahan Production yang dilakukan untuk laporan ini | 0 |

**Kesimpulan:** ledger yang dilaporkan dapat dipetakan ke source PR #91 berdasarkan versi. Ada 93 file source yang belum tercatat pada daftar ledger Production tersebut. Ini adalah selisih metadata untuk diselidiki, **bukan perintah menjalankan 93 migrasi** dan bukan bukti bahwa 93 perubahan skema belum ada di Production.

## Sumber dan batas bukti

- **Production:** daftar 47 versi dan hasil katalog yang tercantum dalam [laporan baca-saja 7 November](PTSAS_PRODUCTION_RECONCILIATION_2026-11-07.md), berasal dari laporan operator bahwa metadata dibaca melalui MCP Codex Desktop. Konektor Supabase pada sesi agen belum memperoleh izin baca Production. Maka ledger dan katalog Production di dokumen ini tetap merupakan **laporan operator**, bukan pembacaan independen terkini.
- **Source:** GitHub REST contents pada ref PR #91 yang tepat, `f882af0de993f27105ff5362f9f47cac592db233`. GitHub mengembalikan 140 file SQL. Daftar nama serta object/blob SHA dibandingkan dengan tree `HEAD` lokal; 140/140 cocok. Pemeriksaan ini membandingkan file migrasi saja, bukan seluruh source aplikasi.
- **Staging VQE:** checkpoint sebelumnya mencatat 140/140 versi dan nama ledger cocok dengan source saat itu. Ini bukan pembacaan staging yang diulang dalam rekonsiliasi ini.
- Tidak ada SQL yang dijalankan ke Production, migrasi yang diterapkan, ledger yang ditulis, data aplikasi yang dibaca, atau file Production yang diubah.

## Daftar ledger Production yang dilaporkan dan pemetaan source

Dua nama terakhir pada output MCP yang dilaporkan operator kosong; nama file di bawah dipetakan hanya berdasarkan versi ledger.

| Versi | File source pada PR #91 | Status nama |
| --- | --- | --- |
| `20260603000000` | `20260603000000_initial_schema.sql` | Nama MCP dilaporkan cocok |
| `20261022000000` | `20261022000000_user_profiles.sql` | Nama MCP dilaporkan cocok |
| `20261023000000` | `20261023000000_tenant_profile_foundation.sql` | Nama MCP dilaporkan cocok |
| `20261024000000` | `20261024000000_communication_announcements.sql` | Nama MCP dilaporkan cocok |
| `20261025000000` | `20261025000000_tenant_system_settings.sql` | Nama MCP dilaporkan cocok |
| `20261026000000` | `20261026000000_search_feedback.sql` | Nama MCP dilaporkan cocok |
| `20261027000000` | `20261027000000_private_finance_proof_storage.sql` | Nama MCP dilaporkan cocok |
| `20261028000000` | `20261028000000_public_ppdb_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261029000000` | `20261029000000_ppdb_admin_workflows.sql` | Nama MCP dilaporkan cocok |
| `20261030000000` | `20261030000000_master_data_onboarding.sql` | Nama MCP dilaporkan cocok |
| `20261031000000` | `20261031000000_legacy_master_data_import.sql` | Nama MCP dilaporkan cocok |
| `20261101000000` | `20261101000000_student_room_assignment.sql` | Nama MCP dilaporkan cocok |
| `20261102000000` | `20261102000000_master_data_student_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261103000000` | `20261103000000_tahfidz_tenant_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261104000000` | `20261104000000_tahfidz_legacy_import.sql` | Nama MCP dilaporkan cocok |
| `20261105000000` | `20261105000000_tahfidz_recorder_assignment_guard.sql` | Nama MCP dilaporkan cocok |
| `20261106000000` | `20261106000000_tahfidz_target_write_api.sql` | Nama MCP dilaporkan cocok |
| `20261107000000` | `20261107000000_tahfidz_halaqah_membership_write_api.sql` | Nama MCP dilaporkan cocok |
| `20261108000000` | `20261108000000_boarding_permits_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261109000000` | `20261109000000_boarding_discipline_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261110000000` | `20261110000000_boarding_attendance_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261111000000` | `20261111000000_boarding_staff_assignments.sql` | Nama MCP dilaporkan cocok |
| `20261112000000` | `20261112000000_boarding_facility_ops_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261113000000` | `20261113000000_boarding_facility_ops_legacy_import.sql` | Nama MCP dilaporkan cocok |
| `20261114000000` | `20261114000000_alumni_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261115000000` | `20261115000000_library_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261116000000` | `20261116000000_tahfidz_sessions_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261117000000` | `20261117000000_finance_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261118000000` | `20261118000000_dashboard_snapshot.sql` | Nama MCP dilaporkan cocok |
| `20261119000000` | `20261119000000_ppdb_guarded_admin_workflows.sql` | Nama MCP dilaporkan cocok |
| `20261120000000` | `20261120000000_academic_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261121000000` | `20261121000000_cbt_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261122000000` | `20261122000000_lms_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261123000000` | `20261123000000_healthcare_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261124000000` | `20261124000000_general_affairs_assets_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261125000000` | `20261125000000_marketplace_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261126000000` | `20261126000000_donation_waqf_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261127000000` | `20261127000000_facility_bookings_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261128000000` | `20261128000000_ppdb_onboarding_actor_audit.sql` | Nama MCP dilaporkan cocok |
| `20261129000000` | `20261129000000_hris_core_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261130000000` | `20261130000000_ppdb_religious_assessment.sql` | Nama MCP dilaporkan cocok |
| `20261201000000` | `20261201000000_tahfidz_target_tenant_fk.sql` | Nama MCP dilaporkan cocok |
| `20261202000000` | `20261202000000_cooperative_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261203000000` | `20261203000000_cooperative_finance_posting.sql` | Nama MCP dilaporkan cocok |
| `20261204000000` | `20261204000000_laundry_runtime.sql` | Nama MCP dilaporkan cocok |
| `20261205000000` | `20261205000000_data_api_default_privilege_hardening.sql` | Nama MCP tidak dikembalikan; dipetakan berdasarkan versi |
| `20261206000000` | `20261206000000_ppdb_legacy_candidate_import.sql` | Nama MCP tidak dikembalikan; dipetakan berdasarkan versi |

## Source PR #91 yang tidak ada pada ledger Production yang dilaporkan

**93 versi berikut hanya selisih yang perlu ditriase. Jangan menjalankannya secara massal.** Sebagian efeknya mungkin telah diterapkan manual atau melalui perubahan terdahulu, digantikan migrasi lain, cocok dengan DDL yang sudah ada, atau memang belum diterapkan. Ledger versi saja tidak membedakan keadaan tersebut.

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

## Tindakan backend yang disarankan

1. Ambil snapshot DDL/schema-only Production pada waktu yang disepakati dan simpan dengan kontrol akses. Tidak perlu mengekspor baris data aplikasi untuk pekerjaan perbandingan struktur ini.
2. Pastikan backup Production terbaru serta lakukan restore rehearsal pada target terisolasi. Catat waktu, versi, hasil pemeriksaan pasca-restore, dan siapa yang menyetujui.
3. Bandingkan DDL aktual dengan baseline migrasi PR #91 dan dokumentasikan tiap selisih per tabel, indeks, constraint, fungsi, trigger, grant, policy RLS, dan konfigurasi Storage yang relevan.
4. Untuk tiap 93 versi, klasifikasikan sebagai: sudah tercermin pada DDL (ledger tertinggal), belum diterapkan, digantikan/ditutupi migrasi lain, atau belum dapat dipastikan. Catat bukti dan dependency; tinjau urutan serta operasi destruktif/irreversibel.
5. Bila ada perubahan yang memang belum ada, buat rencana migrasi korektif maju yang idempoten dan dapat diuji. Jangan memalsukan/merekonsiliasi ledger tanpa bukti SQL yang ekuivalen, dan jangan menjalankan migrasi lama secara buta.
6. Uji rencana pada salinan hasil restore dan jalankan pemeriksaan keamanan serta integrasi. Tim backend menentukan waktu deploy dan UAT Production.

## Yang belum dapat dinyatakan

Laporan ini **tidak** membuktikan kesamaan DDL Production dengan source, keberhasilan backup/restore, urutan aktual saat migrasi diterapkan, kelengkapan policy/RPC/API, login, CRUD browser, atau kesiapan deploy. Gate tersebut tetap milik tim backend sesuai pembagian kerja yang disepakati.
