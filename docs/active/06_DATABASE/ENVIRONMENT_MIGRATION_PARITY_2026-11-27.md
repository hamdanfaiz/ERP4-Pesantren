# Rekonsiliasi metadata migrasi Supabase — 27 November 2026

**Source resmi yang diperiksa:** `main`, commit `a9e682a2dd20bbceaa17e3a9ca682afe98c39dfb`

**Staging:** VQE `vqemuyzveuirlkvdggjd`

**Production:** PTSAS `ptsasgdvgrbdtgyqieie`

## Metode dan batas pemeriksaan

- Source dihitung dari nama file dalam `supabase/migrations` pada commit di atas.
- Ledger staging dan Production dibaca melalui konektor Supabase baca-saja menggunakan operasi daftar migrasi; hasil hanya memuat pasangan `version` dan `name`.
- Status kedua proyek dilaporkan `ACTIVE_HEALTHY` oleh konektor.
- Tidak ada SQL tulis, DDL, migrasi, data aplikasi, Auth, Storage, atau pengaturan proyek yang dibaca atau diubah.
- Perbandingan ledger hanya membuktikan metadata versi/nama. Ini **tidak** membuktikan checksum SQL, DDL aktual, urutan aman untuk promosi, keberhasilan API, UAT, atau backup dan pemulihan Production.

## Ringkasan

| Lingkungan | Status proyek | Jumlah ledger | Pasangan source cocok persis | Source belum tercatat | Nama ledger kosong | Versi ekstra / nama berbeda |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| VQE staging | `ACTIVE_HEALTHY` | 170 | 170/170 | 0 | 0 | 0 |
| PTSAS Production | `ACTIVE_HEALTHY` | 100 | 97/100 | 70 | 3 | 0 |

Pada VQE, seluruh 170 versi dan nama cocok dengan source; entri terakhir adalah `20270408000000_alumni_tracer_study`.

Pada PTSAS, ledger berakhir di `20270316000000_communication_ops_runtime`. Tiga entri tanpa nama menggunakan versi yang memang ada di source. Tidak ditemukan versi ledger ekstra atau nama berbeda yang tidak kosong.

## Entri Production tanpa nama

| Versi ledger | Nama file di source |
| --- | --- |
| `20261205000000` | `data_api_default_privilege_hardening` |
| `20261206000000` | `ppdb_legacy_candidate_import` |
| `20270118000000` | `crm_contact_management` |

Metadata ini belum cukup untuk mengisi nama ledger secara aman. Sebelum perbaikan metadata, pemilik database perlu membandingkan efek SQL masing-masing versi dengan objek Production aktual dan bukti penerapan sebelumnya.

## 70 versi source yang tidak tercatat di ledger PTSAS

Daftar ini adalah selisih metadata untuk investigasi, **bukan daftar perintah migrasi**:

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
20270401000000_tahfidz_monthly_leaderboard
20270402000000_tahfidz_bulk_target_precision_guard
20270403000000_tahfidz_unique_memorization_leaderboard
20270404000000_tahfidz_unique_ayah_projection_indexes
20270404010000_crm_broadcast_idempotency
20270405000000_role_permission_fallback
20270406000000_alumni_community_events
20270407000000_hris_shift_scheduling
20270408000000_alumni_tracer_study
```

## Gerbang berikutnya

1. Pemilik database Production dan tim backend memetakan setiap versi yang hilang atau tanpa nama ke bukti perubahan DDL yang benar-benar ada di PTSAS.
2. Bandingkan definisi tabel/kolom, constraint, indeks, fungsi, trigger, policy RLS, grant, dan Storage dengan source serta VQE; jangan menyimpulkan paritas dari ledger saja.
3. Susun urutan promosi berdasarkan dependensi, dampak data, dan risiko. Rehearsal seluruh rencana pada target nonproduksi yang setara sebelum membahas penerapan Production.
4. Buktikan prosedur backup dan pemulihan pada Production melalui pemilik database/backend team.
5. Setelah deployment yang disetujui, ulangi pemeriksaan ledger dan katalog baca-saja, lalu uji runtime dan alur modul pada akun/tenant yang disetujui.

**Tindakan dalam pemeriksaan ini:** tidak ada perubahan Production maupun staging. Jangan menjalankan `db push` massal berdasarkan daftar selisih ini.

