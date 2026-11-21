# Revalidasi ledger migrasi Supabase — 21 November 2026

## Ringkasan baca-saja

Sumber dibandingkan terhadap metadata ledger kedua proyek melalui konektor Supabase dan tree source GitHub `main` pada commit `32565c547a37a8449ed92e0a362e661c3b8ef37b`. Pemeriksaan hanya membaca pasangan versi/nama migrasi; tidak membaca baris aplikasi, tidak membandingkan checksum SQL, dan tidak menjalankan DDL.

| Target | Entri ledger | File source | Hasil pasangan versi/nama |
| --- | ---: | ---: | --- |
| VQE staging `vqemuyzveuirlkvdggjd` | 165 | 165 | 165/165 cocok; tidak ada source-only, live-only, atau perbedaan nama |
| PTSAS Production `ptsasgdvgrbdtgyqieie` | 100 | 165 | 65 versi source tidak tercatat; tidak ada versi Production-only |

Ledger PTSAS mencapai `20270316000000`. Tiga entri Production tidak menyertakan nama, meskipun versi tersebut ada pada source:

- `20261205000000` — source: `data_api_default_privilege_hardening`
- `20261206000000` — source: `ppdb_legacy_candidate_import`
- `20270118000000` — source: `crm_contact_management`

## 65 versi source yang tidak tercatat di ledger PTSAS

`Tidak tercatat` tidak membuktikan bahwa SQL belum pernah dijalankan. Sebagian DDL mungkin sudah diterapkan di luar migration ledger; karena itu daftar ini bukan daftar siap-`db push` dan bukan persetujuan untuk mengeksekusi migrasi.

| Versi | Nama source |
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

## Urutan pemeriksaan tim backend

1. Jadikan commit source di atas baseline. Rekonsiliasi setiap entri tanpa nama dan cari kemungkinan DDL manual/ledger drift.
2. Bandingkan DDL Production aktual dengan hasil replay source dalam database terisolasi, termasuk policy/grant RLS, function, trigger, constraint, indeks, tipe, dan Storage.
3. Kelompokkan migrasi menurut dependensi dan DML/backfill; tinjau efek data per tenant, lock, durasi, dan urutan.
4. Buktikan backup Production dapat dipulihkan ke lingkungan terisolasi dan rekonsiliasikan jumlah/constraint setelah restore.
5. Baru susun release plan terpilih, rehearsal lengkap, dan UAT pascaperubahan. Jangan menerapkan seluruh 65 versi hanya untuk menyamakan hitungan.

## Batas dan perubahan

- Pemeriksaan ini tidak membuktikan kesetaraan DDL, keberhasilan setiap fitur, backup/restore, atau kesiapan UAT.
- Tidak ada migrasi, perbaikan ledger, data, atau konfigurasi yang diubah di VQE maupun PTSAS.
- Perubahan Production dan persetujuan urutan migrasi tetap menjadi pekerjaan operator/backend owner yang berwenang.

## Hasil Supabase Advisors baca-saja — 21 November 2026

Pemeriksaan Advisors hanya membaca metadata/configuration yang dilaporkan Supabase. Tidak membaca baris aplikasi dan tidak mengubah policy, function, index, Auth setting, atau data. Snapshot advisories bukan bukti bahwa seluruh DDL Production cocok dengan source.

| Temuan | VQE staging | PTSAS Production |
| --- | ---: | ---: |
| RLS aktif tanpa policy (INFO) | 174 tabel | 157 tabel |
| Password bocor belum dicegah (WARN) | 1 setting Auth | 1 setting Auth |
| Foreign key tanpa indeks penutup (INFO) | 261 | 269 |
| Policy RLS dengan initplan (WARN) | 1 (`tahfidz_student_ayah_progress`) | 2 (`profiles`, `user_profiles`) |
| Indeks belum digunakan (INFO) | 97 | 89 |
| Indeks duplikat (WARN) | 0 | 1 pada `document_records` |

PTSAS juga melaporkan satu function dengan `search_path` mutable: `public.erp4_ppdb_update_updated_at_column()`, dan empat `SECURITY DEFINER` pada schema `public` yang masih dapat dipanggil oleh role `authenticated` melalui Data API: `current_app_role()`, `current_tenant_id()`, `has_module_access(text)`, serta `is_tenant_admin()`.

### Interpretasi dan tindak lanjut

- `RLS Enabled No Policy` umumnya berarti akses langsung ditolak oleh RLS. Ini bisa disengaja untuk tabel yang hanya boleh dipakai API server/RPC; jangan menambahkan policy atau grant publik secara massal. Backend perlu memastikan grants, schema exposure, dan otorisasi setiap endpoint cocok dengan pola service-only.
- Function PTSAS yang dapat dieksekusi cocok dengan gap migrasi `20270210000000_internalize_tenant_rls_helpers`: source memindahkan helper dari schema Data API `public` ke schema `private`. Function trigger dan default privilege terkait ditangani oleh `20261205000000_data_api_default_privilege_hardening`; `search_path` helper PPDB dipatok oleh `20270209000000_harden_ppdb_trigger_search_path`. Karena keadaan katalog aktual belum dibandingkan penuh, tinjau definisi/grant Production sebelum memilih migrasi atau repair.
- Indeks duplikat `document_records_tenant_document_number_uq` dan `document_records_tenant_number_normalized_uq` tercakup pada migrasi source `20270227000000_remove_redundant_document_number_index`. Pastikan definisi kedua indeks dan constraint aktual Production sebelum menghapus salah satunya.
- Temuan indeks foreign key adalah sinyal untuk review kinerja, bukan instruksi membuat 261/269 indeks sekaligus. Cocokkan kolom FK dengan indeks komposit yang sudah ada, pola query nyata, `EXPLAIN`, ukuran tabel, lock, dan biaya tulis. Migration `20270330000000_add_core_composite_fk_indexes` hanya mencakup kelompok relasi inti.
- Temuan initplan di Production pada `profiles`/`user_profiles` cocok dengan optimasi source `20270211000000_optimize_profile_rls_initplans`. Advisor VQE masih menandai policy `tahfidz_student_ayah_progress_owner_all`, tetapi pembacaan katalog live 2026-11-21 menunjukkan ekspresi `USING` dan `WITH CHECK` sudah membungkus `current_setting(...)` dalam subkueri, sesuai migrasi `20270404000000_tahfidz_unique_ayah_projection_indexes`. Perlakukan ini sebagai temuan yang belum terkonfirmasi terhadap definisi aktual; jangan menerapkan ulang perubahan policy sebelum tim backend memeriksa query plan. PR #194 menambahkan tes regresi untuk pola tersebut.
- Indeks yang belum digunakan bisa terjadi karena workload masih kecil atau baru; jangan menghapusnya sebelum ada observasi workload representatif.
- Pengaturan Auth “Leaked Password Protection” perlu ditinjau dan diaktifkan oleh operator pada tiap environment bersama kebijakan kata sandi dan pengujian signup/reset. Ini pengaturan Auth, bukan migrasi database.

Tindak lanjut yang mengubah Production tetap mengikuti runbook: bandingkan definisi aktual terlebih dahulu, susun perubahan maju yang sempit, rehearsal dan backup/restore, lalu persetujuan backend owner. Advisories sendiri tidak memberi persetujuan untuk mengubah Production.
