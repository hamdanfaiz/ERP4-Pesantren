# Rekonsiliasi ledger Supabase — Production dan staging — 15 November 2026

## Cakupan dan sumber bukti

Snapshot baca-saja ini membandingkan ledger migrasi Supabase dengan file migrasi pada branch `codex/product-copy-cleanup-20261108`, commit `bf6b7ca625e6700001f5f000c1dd698ec36e0f10`. Branch itu adalah branch sumber PR #91; inventarisnya memuat **153 file migrasi**. Branch `main` saat snapshot masih `82082bf1c8fa806e420ae555ca38f0700694b9af` dan mempunyai 150 file. Tiga migrasi Tahfidz terbaru pada PR #91 menambah perbedaan antara inventaris main dan PR.

Ledger dibaca melalui Supabase MCP untuk:
- Production PTSAS: `ptsasgdvgrbdtgyqieie`
- Staging VQE: `vqemuyzveuirlkvdggjd`

Pemeriksaan ini hanya membaca nomor/nama migrasi. Tidak membaca row aplikasi atau DDL katalog, tidak mengubah database, dan tidak menjalankan `db push`, repair, atau penerapan migrasi. **Kecocokan ledger bukan bukti DDL aktual cocok dengan SQL source.**

## Ringkasan selisih

| Lingkungan | Entri ledger | File source | Versi source tidak tercatat | Versi ledger tanpa source bernomor sama | Nama berbeda pada versi sama | Nama ledger kosong |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Production PTSAS | 100 | 153 | 53 | 0 | 0 | 3 |
| Staging VQE | 150 | 153 | 9 | 6 | 4 | 0 |

Production memiliki 97 nama/versi yang sama; 3 versi lain tidak mengembalikan nama. Tidak ada nomor ledger Production yang tidak ada di source, tetapi terdapat celah versi dalam riwayat. Jangan menganggap celah itu berarti SQL belum diterapkan.

## Production PTSAS — versi source yang belum tercatat

Daftar berikut adalah selisih metadata terhadap source PR #91, **bukan perintah untuk menerapkan**:
- `20261207000000` — library_legacy_catalog_import
- `20261208000000` — hris_legacy_employees_import
- `20261210000000` — cooperative_supplier_import_status
- `20261211000000` — library_circulation_legacy_import
- `20261213000000` — marketplace_mutation_payload_guard
- `20261214000000` — donation_mutation_payload_guard
- `20261216000000` — tahfidz_session_result_integrity
- `20261217000000` — tahfidz_target_tenant_business_date
- `20261218000000` — cbt_server_authoritative_deadline
- `20261220000000` — inventory_adjustment_payload_guard
- `20261222000000` — ga_inventory_event_payload_guard
- `20261223000000` — cbt_request_payload_guard
- `20261224000000` — lms_request_payload_guard
- `20261225000000` — lms_submission_grade_integrity
- `20261226000000` — lms_learning_record_integrity
- `20261227000000` — lms_progress_integrity
- `20261228000000` — boarding_attendance_active_students
- `20261229000000` — boarding_attendance_retry_after_status_change
- `20261230000000` — cooperative_financial_legacy_import
- `20270101000000` — profiles_user_directory_indexes
- `20270104000000` — guardian_boarding_access
- `20270109000000` — boarding_room_history_baseline
- `20270111000000` — ppdb_document_access_audit
- `20270113000000` — admin_ppdb_document_upload
- `20270119000000` — master_data_student_search_indexes
- `20270120000000` — communication_import_canonical_audience
- `20270121000000` — tenant_admin_bootstrap
- `20270122000000` — lms_learning_record_tenant_fk
- `20270123000000` — public_ppdb_idempotency
- `20270127000000` — fix_cbt_answer_object_limit
- `20270131000000` — finance_legacy_unit_assignment
- `20270205000000` — guardian_self_registration
- `20270207000000` — public_schema_migration_ownership
- `20270208000000` — guardian_pre_onboarding_candidate_finance
- `20270209000000` — harden_ppdb_trigger_search_path
- `20270210000000` — internalize_tenant_rls_helpers
- `20270211000000` — optimize_profile_rls_initplans
- `20270212000000` — optimize_core_tenant_query_indexes
- `20270215000000` — harden_reference_relationship_contract
- `20270217000000` — index_tenant_choice_foreign_keys
- `20270220000000` — student_nis_source_idempotency
- `20270221000000` — enforce_auto_business_identifiers
- `20270224000000` — ga_business_identifier_update_guard
- `20270225000000` — restore_idempotency_for_generated_identifiers
- `20270226000000` — ppdb_onboarding_uses_tenant_nis_grade_code
- `20270227000000` — remove_redundant_document_number_index
- `20270303000000` — master_data_student_import_relationships
- `20270304000000` — student_room_assignment_reference_locks
- `20270307000000` — tenant_settings_conflict_http_409
- `20270320000000` — tahfidz_quran_surah_catalog
- `20270327000000` — tahfidz_persisted_leaderboard
- `20270328000000` — tahfidz_bulk_daily_target_write_api
- `20270329000000` — tahfidz_target_decimal_precision

Versi ledger tanpa nama: `20261205000000`, `20261206000000`, `20270118000000`.

## Staging VQE — versi source yang belum tercatat

- `20270215500000` — sample_class_grade_labels
- `20270309000000` — academic_report_card
- `20270310000000` — academic_sample_catalog
- `20270311000000` — academic_sample_term
- `20270313000000` — education_boarding_operational_seed
- `20270320000000` — tahfidz_quran_surah_catalog
- `20270327000000` — tahfidz_persisted_leaderboard
- `20270328000000` — tahfidz_bulk_daily_target_write_api
- `20270329000000` — tahfidz_target_decimal_precision

## Staging VQE — versi ledger yang tidak memiliki file bernomor sama di source

- `20261109145507` — tahfidz_quran_surah_catalog
- `20261109145522` — tahfidz_persisted_leaderboard
- `20261109145534` — tahfidz_bulk_daily_target_write_api
- `20270317000000` — cbt_admin_student_roster_pages
- `20270318000000` — cbt_admin_assignment_pages
- `20270319000000` — cbt_admin_exam_pages

Tiga entri Tahfidz memakai nomor alias lama; ledger tidak membuktikan bahwa SQL-nya identik dengan versi source yang lebih baru. Tiga entri CBT berada setelah urutan source dan perlu ditelusuri ke commit/SQL asal.

## Staging VQE — nomor sama, nama berbeda

| Versi | Nama di ledger VQE | Nama file source PR #91 |
| --- | --- | --- |
| `20270312000000` | `tahfidz_target_decimal_precision` | `sample_nis_grade_codes` |
| `20270314000000` | `cbt_tenant_settings_write_api` | `education_boarding_operational_fill` |
| `20270315000000` | `cbt_admin_dashboard_summary` | `lms_dashboard_operational_fill` |
| `20270316000000` | `cbt_admin_question_keyset_pages` | `communication_ops_runtime` |

Perbedaan nama dapat berasal dari riwayat branch yang berbeda atau migrasi yang diubah versinya. Nomor/nama saja tidak cukup untuk menyatakan salah satu DDL telah atau belum diterapkan.

## Urutan tindakan yang diperlukan

1. Bekukan source pembanding pada commit `bf6b7ca625e6700001f5f000c1dd698ec36e0f10`; jangan membandingkan terhadap branch lokal yang berbeda atau `main` lama tanpa mencatat SHA.
2. Tim backend mengambil schema-only snapshot yang disetujui untuk masing-masing lingkungan dan membandingkan tabel, kolom, constraint, index, trigger, function, policy, privilege, extension, Storage bucket/policy, serta Auth config.
3. Untuk setiap celah, alias, dan nama berbeda, tentukan provenance file/commit dan bandingkan definisi SQL terhadap DDL terpasang. Tandai status per versi: belum diterapkan, diterapkan seluruhnya di luar ledger, diterapkan sebagian, atau alias yang terbukti identik.
4. Simpan backup, pulihkan ke instance terisolasi, lalu buktikan aplikasi dan migrasi berjalan pada salinan. Rehearsal dilakukan terpisah untuk VQE dan PTSAS.
5. Jalankan preflight dan workflow CI pada exact source SHA setelah rekonsiliasi. Pastikan job nyata selesai; workflow yang skipped atau menghasilkan 0 job bukan bukti lulus.
6. Baru susun batch perubahan Production dengan urutan dependensi, dampak data, langkah verifikasi, jeda/rollback, dan persetujuan pemilik sistem. Jangan menyamakan ledger dengan `migration repair` tanpa bukti DDL.

## Kesimpulan

Staging dan Production sama-sama berbeda dari ledger source PR #91, tetapi dengan pola yang berbeda. VQE **tidak dapat dianggap sebagai salinan schema Production atau staging rehearsal yang setara** hanya karena jumlah migrasinya dekat dengan source. Production tetap memerlukan rekonsiliasi DDL, backup/restore yang terbukti, serta tinjauan urutan migrasi oleh tim backend sebelum penerapan.

