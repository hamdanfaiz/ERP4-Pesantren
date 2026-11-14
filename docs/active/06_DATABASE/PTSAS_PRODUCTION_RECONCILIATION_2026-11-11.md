# Rekonsiliasi baca-saja PTSAS Production — 11 November 2026

## Cakupan

- Project: `ptsasgdvgrbdtgyqieie`. PostgreSQL 17.11. Database sesi: `postgres`.
- Source pembanding: `main` `fd937f4876aa1069500694b9bc20ec70eef8ee14` (merge PR #90), 140 file di `supabase/migrations`.
- Kueri dijalankan lewat pooler dengan transaksi `READ ONLY`, lalu `ROLLBACK`. Tidak ada baris data aplikasi, nama objek Storage, atau isi berkas yang dibaca. Tidak ada perubahan Production.
- Pembanding ledger memakai `scripts/preflight-supabase-migrations.mjs` (`compareMigrationVersions` setelah kanonikalisasi statement).

## Ringkasan

| Pemeriksaan | Hasil |
| --- | ---: |
| File migrasi source | 140 |
| Versi ledger Production | 47 |
| Versi ledger yang nama dan SQL-nya cocok dengan source | 45 |
| Versi ledger tanpa nama dan tanpa payload SQL | 2 |
| Versi source yang belum tercatat | 93 |
| Versi source yang belum tercatat dan lebih lama dari kepala ledger | 2 |
| Tabel `public` | 119 |
| Tabel dengan RLS dan FORCE RLS | 119 dari 119 |
| Policy `public` | 5, semuanya `PERMISSIVE SELECT` |
| Fungsi `public` yang dapat di-`EXECUTE` `anon` | 0 |
| Fungsi `public` yang dapat di-`EXECUTE` `authenticated` | 4 |

Kepala ledger: `20261206000000`. Dua baris tanpa metadata adalah `20261205000000` dan `20261206000000`.

## Versi yang tercatat tetapi payload-nya kosong

Ledger menyebut kedua versi ini applied, tetapi `statements` kosong sehingga preflight tidak dapat menyamakan SQL.

- `20261206000000_ppdb_legacy_candidate_import`: tabel `ppdb_legacy_import_batches`, fungsi `import_legacy_ppdb_candidates`, dan indeks `candidates_legacy_source_record_uq` ada. Efek DDL-nya sebagian terbukti; kesetaraan seluruh file belum terbukti.
- `20261205000000_data_api_default_privilege_hardening`: tidak dibandingkan pernyataan per pernyataan. `anon` tidak dapat `EXECUTE` fungsi `public` mana pun, selaras dengan arah revoke pada file itu, bukan bukti bahwa seluruh default privilege sudah sama dengan source.

## Versi source yang lebih tua daripada kepala ledger

Preflight mengembalikan `HENTIKAN` karena dua file ini belum tercatat padahal kepalanya sudah `20261206000000`:

| Versi | File | Objek yang diperiksa |
| --- | --- | --- |
| 20261031104213 | `20261031104213_master_data_import_create_only.sql` | `create_master_data_structure_if_absent` tidak ada |
| 20261031225438 | `20261031225438_master_data_audit_feed.sql` | `master_data_audit_events` dan `capture_master_data_audit_event` tidak ada |

Keduanya harus masuk rencana rehearsal sebagai migrasi yang hilang di tengah riwayat, bukan sebagai ekor `db push` biasa.

## Definisi yang sudah ada versus source PR #86 dan PR #90

- `save_tenant_system_settings(uuid, uuid, timestamp with time zone, jsonb)` ada. Definisi yang terpasang tidak memuat `PT409`. File `20270307000000_tenant_settings_conflict_http_409.sql` belum tercatat.
- `assign_tenant_academic_class_unit` dan `get_tenant_unmapped_academic_classes` tidak ada. File `20270308000000_academic_class_unit_admin_role_baseline.sql` belum tercatat.

## Katalog akses

Policy dan grant `SELECT` untuk `authenticated` berada pada tabel yang sama:

- `candidate_documents` — `candidate_documents_select_ppdb_admin`
- `candidates` — `candidates_select_ppdb_admin`
- `profiles` — `profiles_select_self_or_tenant_admin`
- `tenants` — `tenants_select_current_tenant`
- `user_profiles` — `user_profiles_select_own`

`authenticated` dapat mengeksekusi helper `SECURITY DEFINER` ini: `current_app_role()`, `current_tenant_id()`, `has_module_access(text)`, `is_tenant_admin()`. Tidak ada grant tabel untuk `anon` atau `PUBLIC` pada hitungan relasi `public` sesi ini. `service_role` memiliki grant operasional; jalur server yang memakai role itu tetap melewati RLS dan tidak diaudit oleh katalog ini.

Bucket: `erp4-private-finance-proofs` dan `ppdb-documents`. Keduanya `public = false` dan memiliki batas ukuran.

## 93 versi source yang belum tercatat

Urutan di bawah ini adalah selisih preflight. **Ini bukan daftar yang siap diterapkan.** Jangan menjalankan migrasi Production hanya untuk menyamakan jumlah ledger. Backup, diff DDL yang masih kosong, dan rehearsal pada salinan terisolasi tetap wajib.

1. `20261031104213_master_data_import_create_only.sql`
2. `20261031225438_master_data_audit_feed.sql`
3. `20261207000000_library_legacy_catalog_import.sql`
4. `20261208000000_hris_legacy_employees_import.sql`
5. `20261209000000_cooperative_tenant_business_day.sql`
6. `20261210000000_cooperative_supplier_import_status.sql`
7. `20261211000000_library_circulation_legacy_import.sql`
8. `20261212000000_cooperative_sale_idempotency_wallet.sql`
9. `20261213000000_marketplace_mutation_payload_guard.sql`
10. `20261214000000_donation_mutation_payload_guard.sql`
11. `20261215000000_laundry_mutation_payload_guard.sql`
12. `20261216000000_tahfidz_session_result_integrity.sql`
13. `20261217000000_tahfidz_target_tenant_business_date.sql`
14. `20261218000000_cbt_server_authoritative_deadline.sql`
15. `20261219000000_academic_request_idempotency_guard.sql`
16. `20261220000000_inventory_adjustment_payload_guard.sql`
17. `20261221000000_healthcare_request_idempotency_guard.sql`
18. `20261222000000_ga_inventory_event_payload_guard.sql`
19. `20261223000000_cbt_request_payload_guard.sql`
20. `20261224000000_lms_request_payload_guard.sql`
21. `20261225000000_lms_submission_grade_integrity.sql`
22. `20261226000000_lms_learning_record_integrity.sql`
23. `20261227000000_lms_progress_integrity.sql`
24. `20261228000000_boarding_attendance_active_students.sql`
25. `20261229000000_boarding_attendance_retry_after_status_change.sql`
26. `20261230000000_cooperative_financial_legacy_import.sql`
27. `20261231000000_cooperative_supplier_payload_idempotency.sql`
28. `20270101000000_profiles_user_directory_indexes.sql`
29. `20270102000000_guardian_accounts_and_invitations.sql`
30. `20270103000000_guardian_finance_access.sql`
31. `20270104000000_guardian_boarding_access.sql`
32. `20270105000000_communication_guardian_audience.sql`
33. `20270106000000_boarding_room_assignment_history.sql`
34. `20270107000000_tahfidz_roster_keyset_pagination.sql`
35. `20270108000000_tahfidz_dashboard_follow_up_summary.sql`
36. `20270109000000_boarding_room_history_baseline.sql`
37. `20270110000000_ppdb_candidate_finance_bills.sql`
38. `20270111000000_ppdb_document_access_audit.sql`
39. `20270112000000_admin_ppdb_candidate_create.sql`
40. `20270113000000_admin_ppdb_document_upload.sql`
41. `20270114000000_cbt_tenant_settings_import.sql`
42. `20270115000000_ppdb_admin_search_keyset.sql`
43. `20270116000000_private_library_digital_assets.sql`
44. `20270117000000_document_center_core.sql`
45. `20270118000000_crm_contact_management.sql`
46. `20270119000000_master_data_student_search_indexes.sql`
47. `20270120000000_communication_import_canonical_audience.sql`
48. `20270121000000_tenant_admin_bootstrap.sql`
49. `20270122000000_lms_learning_record_tenant_fk.sql`
50. `20270123000000_public_ppdb_idempotency.sql`
51. `20270124000000_finance_proof_upload_rate_limit.sql`
52. `20270125000000_finance_budget_plans.sql`
53. `20270126000000_tenant_enterprise_units.sql`
54. `20270127000000_fix_cbt_answer_object_limit.sql`
55. `20270128000000_finance_expense_unit_scope.sql`
56. `20270129000000_finance_budget_unit_scope.sql`
57. `20270130000000_master_data_unit_assignment.sql`
58. `20270131000000_finance_legacy_unit_assignment.sql`
59. `20270201000000_academic_unit_scope.sql`
60. `20270202000000_academic_class_unit_mapping.sql`
61. `20270203000000_boarding_unit_scope.sql`
62. `20270204000000_tahfidz_achievement_summary.sql`
63. `20270205000000_guardian_self_registration.sql`
64. `20270206000000_tahfidz_peer_review_moderation.sql`
65. `20270207000000_public_schema_migration_ownership.sql`
66. `20270208000000_guardian_pre_onboarding_candidate_finance.sql`
67. `20270209000000_harden_ppdb_trigger_search_path.sql`
68. `20270210000000_internalize_tenant_rls_helpers.sql`
69. `20270211000000_optimize_profile_rls_initplans.sql`
70. `20270212000000_optimize_core_tenant_query_indexes.sql`
71. `20270214120000_tenant_reference_relationships.sql`
72. `20270215000000_harden_reference_relationship_contract.sql`
73. `20270216000000_tenant_operational_choice_relationships.sql`
74. `20270217000000_index_tenant_choice_foreign_keys.sql`
75. `20270218000000_operational_relationships_and_naming_series.sql`
76. `20270219000000_naming_series_master_data_ids.sql`
77. `20270220000000_student_nis_source_idempotency.sql`
78. `20270221000000_enforce_auto_business_identifiers.sql`
79. `20270222000000_extend_naming_series_business_identifiers.sql`
80. `20270223000000_additional_operational_naming_series.sql`
81. `20270224000000_ga_business_identifier_update_guard.sql`
82. `20270225000000_restore_idempotency_for_generated_identifiers.sql`
83. `20270226000000_ppdb_onboarding_uses_tenant_nis_grade_code.sql`
84. `20270227000000_remove_redundant_document_number_index.sql`
85. `20270228000000_academic_record_cursor_indexes.sql`
86. `20270301000000_academic_student_roster_pagination.sql`
87. `20270302000000_academic_class_reference_pagination.sql`
88. `20270303000000_master_data_student_import_relationships.sql`
89. `20270304000000_student_room_assignment_reference_locks.sql`
90. `20270305000000_academic_schedule_idempotency_retry.sql`
91. `20270306000000_library_book_category_reference_writes.sql`
92. `20270307000000_tenant_settings_conflict_http_409.sql`
93. `20270308000000_academic_class_unit_admin_role_baseline.sql`
