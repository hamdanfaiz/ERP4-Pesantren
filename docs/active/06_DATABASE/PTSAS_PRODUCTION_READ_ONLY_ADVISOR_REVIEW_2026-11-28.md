# Rekonsiliasi baca-saja PTSAS Production — 28 November 2026

## Ringkasan

Pemeriksaan menggunakan konektor Supabase baca-saja untuk project Production `ptsasgdvgrbdtgyqieie` dan VQE staging `vqemuyzveuirlkvdggjd`. Pemeriksaan hanya membaca ledger migrasi, katalog PostgreSQL, grant tabel, policy RLS, dan advisori. Tidak ada DDL, baris data aplikasi, atau konfigurasi yang diubah.

- Source `origin/main` yang tersedia di checkout audit memiliki **170 file migrasi**. Head lokal `origin/main`: `b5df6ebfa9ffda5fb5a8c1d750a21a19a9c003f3`; commit aplikasi terakhir yang disebut dalam handoff main: `5faadf0148651b6aa4dba97704c92213e549697c`.
- VQE memiliki **170/170 versi** yang cocok dengan source.
- PTSAS mencatat **100 versi**, seluruhnya ada di source; **70 versi source belum tercatat** di PTSAS. Tidak ada versi Production tambahan yang hanya ada di ledger Production.
- Tiga entri PTSAS tidak memiliki nama: `20261205000000`, `20261206000000`, `20270118000000`.
- Temuan ledger **tidak membuktikan kesamaan atau perbedaan DDL**. Jangan menutup selisih dengan `db push` massal atau memperbaiki ledger tanpa rekonsiliasi DDL dan prosedur migrasi yang ditinjau.

## Selisih versi migrasi

Production terbaru: `20270316000000 communication_ops_runtime`. VQE terbaru: `20270408000000 alumni_tracer_study`.

Berikut 70 migrasi yang ada pada source/VQE namun tidak tercatat di Production:

```text
20261207000000 library_legacy_catalog_import
20261208000000 hris_legacy_employees_import
20261210000000 cooperative_supplier_import_status
20261211000000 library_circulation_legacy_import
20261213000000 marketplace_mutation_payload_guard
20261214000000 donation_mutation_payload_guard
20261216000000 tahfidz_session_result_integrity
20261217000000 tahfidz_target_tenant_business_date
20261218000000 cbt_server_authoritative_deadline
20261220000000 inventory_adjustment_payload_guard
20261222000000 ga_inventory_event_payload_guard
20261223000000 cbt_request_payload_guard
20261224000000 lms_request_payload_guard
20261225000000 lms_submission_grade_integrity
20261226000000 lms_learning_record_integrity
20261227000000 lms_progress_integrity
20261228000000 boarding_attendance_active_students
20261229000000 boarding_attendance_retry_after_status_change
20261230000000 cooperative_financial_legacy_import
20270101000000 profiles_user_directory_indexes
20270104000000 guardian_boarding_access
20270109000000 boarding_room_history_baseline
20270111000000 ppdb_document_access_audit
20270113000000 admin_ppdb_document_upload
20270119000000 master_data_student_search_indexes
20270120000000 communication_import_canonical_audience
20270121000000 tenant_admin_bootstrap
20270122000000 lms_learning_record_tenant_fk
20270123000000 public_ppdb_idempotency
20270127000000 fix_cbt_answer_object_limit
20270131000000 finance_legacy_unit_assignment
20270205000000 guardian_self_registration
20270207000000 public_schema_migration_ownership
20270208000000 guardian_pre_onboarding_candidate_finance
20270209000000 harden_ppdb_trigger_search_path
20270210000000 internalize_tenant_rls_helpers
20270211000000 optimize_profile_rls_initplans
20270212000000 optimize_core_tenant_query_indexes
20270215000000 harden_reference_relationship_contract
20270217000000 index_tenant_choice_foreign_keys
20270220000000 student_nis_source_idempotency
20270221000000 enforce_auto_business_identifiers
20270224000000 ga_business_identifier_update_guard
20270225000000 restore_idempotency_for_generated_identifiers
20270226000000 ppdb_onboarding_uses_tenant_nis_grade_code
20270227000000 remove_redundant_document_number_index
20270303000000 master_data_student_import_relationships
20270304000000 student_room_assignment_reference_locks
20270307000000 tenant_settings_conflict_http_409
20270320000000 tahfidz_quran_surah_catalog
20270321000000 cbt_tenant_settings_write_api
20270322000000 cbt_admin_dashboard_summary
20270323000000 cbt_admin_question_keyset_pages
20270324000000 cbt_admin_student_roster_pages
20270325000000 cbt_admin_assignment_pages
20270326000000 cbt_admin_exam_pages
20270327000000 tahfidz_persisted_leaderboard
20270328000000 tahfidz_bulk_daily_target_write_api
20270329000000 tahfidz_target_decimal_precision
20270330000000 add_core_composite_fk_indexes
20270331000000 tahfidz_active_days_leaderboard
20270401000000 tahfidz_monthly_leaderboard
20270402000000 tahfidz_bulk_target_precision_guard
20270403000000 tahfidz_unique_memorization_leaderboard
20270404000000 tahfidz_unique_ayah_projection_indexes
20270404010000 crm_broadcast_idempotency
20270405000000 role_permission_fallback
20270406000000 alumni_community_events
20270407000000 hris_shift_scheduling
20270408000000 alumni_tracer_study
```

Nama tiga migrasi yang kosong dapat dipetakan ke source/VQE: `20261205000000_data_api_default_privilege_hardening`, `20261206000000_ppdb_legacy_candidate_import`, dan `20270118000000_crm_contact_management`. Tim database tetap perlu membuktikan isi DDL aktual sebelum menyimpulkan bahwa ledger dapat direkonsiliasi aman.

## Katalog akses Production

Kueri katalog menghasilkan:

- `public`: **162 tabel**; 162 mengaktifkan RLS dan 162 mengaktifkan FORCE RLS.
- Lima tabel memiliki policy RLS: `candidate_documents`, `candidates`, `profiles`, `tenants`, `user_profiles`. Kelima policy bersifat SELECT dan ditujukan ke `authenticated`.
- Grant langsung yang ditemukan hanya SELECT untuk role `authenticated` pada lima tabel di atas. Tidak ditemukan grant tabel `anon` atau `PUBLIC` pada schema `public`.
- Hasil ini tidak menggantikan pemeriksaan endpoint server, RPC, hak sequence, Storage, atau behavior tenant.

## Advisor Production

Pengamatan Advisor bertanggal 27 November 2026 menemukan:

### Keamanan

- 1 fungsi dengan `search_path` mutable: `public.erp4_ppdb_update_updated_at_column()`.
- 4 helper `SECURITY DEFINER` dapat dieksekusi oleh `authenticated`: `current_app_role()`, `current_tenant_id()`, `has_module_access(text)`, dan `is_tenant_admin()`.
- Perlindungan kata sandi bocor Supabase Auth nonaktif.
- 157 tabel tanpa policy juga tercatat sebagai INFO. Karena tidak ditemukan grant langsung `anon`/`authenticated` selain lima SELECT di atas, tim harus meninjau kombinasi grant, policy, endpoint server, dan fungsi sebelum menilai dampaknya.

Source sudah memiliki migration untuk temuan database utama di atas:

- `20270209000000_harden_ppdb_trigger_search_path.sql`
- `20270210000000_internalize_tenant_rls_helpers.sql`
- `20270211000000_optimize_profile_rls_initplans.sql`

Ketiganya ada dalam 70 versi yang belum tercatat di Production. Jangan cherry-pick atau jalankan satu per satu sebelum urutan penuh dan preflight dinyatakan aman.

### Kinerja

- 2 policy RLS mendapat advisori initplan: `user_profiles_select_own` pada `public.user_profiles` dan `profiles_select_self_or_tenant_admin` pada `public.profiles`.
- Satu duplikasi indeks dilaporkan pada `public.document_records`: `document_records_tenant_document_number_uq` dan `document_records_tenant_number_normalized_uq`.
- 269 foreign key tanpa indeks penutup dan 89 indeks belum terpakai terlapor sebagai INFO; perlu analisis beban dan rancangan query sebelum perubahan indeks.

## Perbandingan staging

- VQE lulus kecocokan versi ledger source 170/170.
- Security Advisor VQE tidak melaporkan temuan database WARN; masih ada WARN untuk perlindungan kata sandi bocor Auth.
- Performance Advisor VQE memberi satu WARN pada policy `tahfidz_student_ayah_progress_owner_all`. Definisi policy di VQE sudah membungkus `current_setting(...)` dalam subquery SELECT, sesuai source migration `20270404000000_tahfidz_unique_ayah_projection_indexes.sql`. Perlakukan sebagai kemungkinan false positive Advisor sampai dievaluasi, jangan menambah migration duplikat tanpa bukti.
- Health Advisor VQE tidak mengembalikan temuan.

## Tindakan tim database sebelum promosi Production

1. Ambil/simpan snapshot Production dan buktikan restore berhasil pada salinan terisolasi.
2. Bandingkan DDL aktual Production dengan source, termasuk policy/grant, function/trigger, index, constraint, sequence, Storage, dan hak schema.
3. Klasifikasikan tiga versi ledger tanpa nama dan cocokkan isi DDL-nya dengan file source.
4. Tinjau semua 70 migrasi yang tertinggal menurut dependensi dan efek data; replay pada salinan Production, bukan langsung di database live.
5. Tinjau empat RPC helper `SECURITY DEFINER` dan `search_path` trigger terhadap migration source; aktifkan perlindungan kata sandi bocor pada Auth melalui pengaturan yang disetujui.
6. Setelah hasil restore, urutan migrasi, DDL parity, dan UAT disetujui, siapkan jendela rilis, backup baru, rollback plan, dan langkah promosi yang terukur.

## Batas pemeriksaan

Pemeriksaan ini baca-saja. Tidak ada data aplikasi yang dibaca, tidak ada migration/ledger/DDL/setting Production yang diubah, dan tidak ada klaim bahwa backup Production sudah berhasil dipulihkan atau bahwa Production sudah setara dengan VQE/source.
