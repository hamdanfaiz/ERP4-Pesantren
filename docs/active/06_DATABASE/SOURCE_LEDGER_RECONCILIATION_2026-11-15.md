# Rekonsiliasi source dan ledger Supabase — 15 November 2026

## Tujuan dan batas pemeriksaan

Dokumen ini membandingkan nama file migrasi pada source aplikasi `main` dengan metadata ledger dari dua proyek Supabase:

- **VQE staging:** `vqemuyzveuirlkvdggjd`
- **PTSAS Production:** `ptsasgdvgrbdtgyqieie`
- **Source aplikasi:** commit kode `b0e9a2ff294a68c4458676eada56c96aa2954635` (`main` kemudian menerima commit dokumentasi saja `ed7bdf02ab1e84d49e15532d6d63cf6a5537d5ea`).

> Pemeriksaan cloud hanya membaca daftar versi dan nama migrasi. Tidak ada baris data aplikasi yang dibaca, dan tidak ada skema, ledger, data, Auth, Storage, atau konfigurasi yang diubah.

> Perbandingan ledger **bukan** bukti bahwa DDL aktual sama dengan source, bahwa migrasi yang belum tercatat harus dijalankan, atau bahwa database aman untuk `db push`. Nama yang tidak sama juga tidak membuktikan definisi SQL berbeda atau setara. Penetapan ekuivalensi memerlukan pencocokan file SQL asal, DDL live, objek terkait, dan riwayat penerapannya oleh tim backend.

## Ringkasan inventaris

| Sumber | File/entri | Pasangan versi-nama persis | Source belum tercatat | Nama berbeda pada versi sama | Ledger-only |
| --- | ---: | ---: | ---: | ---: | ---: |
| Source `main` vs VQE | 153 file source / 150 entri VQE | 140 | 9 | 4 | 6 |
| Source `main` vs PTSAS | 153 file source / 100 entri PTSAS | 97 | 53 | 0 bernama; 3 tidak bernama | 0 |

Ledger PTSAS memiliki tiga versi yang juga ada pada source tetapi respons MCP tidak mengembalikan nama: `20261205000000`, `20261206000000`, dan `20270118000000`. Source memberi nama masing-masing `data_api_default_privilege_hardening`, `ppdb_legacy_candidate_import`, dan `crm_contact_management`. Ini hanya kecocokan nomor versi; isi yang diterapkan tetap perlu dibuktikan.

## VQE staging — source belum tercatat

| Versi source | Nama file migrasi |
| --- | --- |
| `20270215500000` | `sample_class_grade_labels` |
| `20270309000000` | `academic_report_card` |
| `20270310000000` | `academic_sample_catalog` |
| `20270311000000` | `academic_sample_term` |
| `20270313000000` | `education_boarding_operational_seed` |
| `20270320000000` | `tahfidz_quran_surah_catalog` |
| `20270328000000` | `tahfidz_bulk_daily_target_write_api` |
| `20270329000000` | `tahfidz_target_decimal_precision` |
| `20270401000000` | `tahfidz_monthly_leaderboard` |

## VQE staging — versi sama, nama berbeda

| Versi | Source saat ini | Nama pada ledger VQE |
| --- | --- | --- |
| `20270312000000` | `sample_nis_grade_codes` | `tahfidz_target_decimal_precision` |
| `20270314000000` | `education_boarding_operational_fill` | `cbt_tenant_settings_write_api` |
| `20270315000000` | `lms_dashboard_operational_fill` | `cbt_admin_dashboard_summary` |
| `20270316000000` | `communication_ops_runtime` | `cbt_admin_question_keyset_pages` |

Keempat konflik nama ini menghalangi penyamaan ledger otomatis. Jangan mengubah metadata versi atau menambahkan file no-op untuk melewati preflight. Tim harus mengidentifikasi commit/SQL yang benar-benar diterapkan dan membandingkan definisi objek live.

## VQE staging — entri yang tidak punya versi sama di source

| Versi ledger VQE | Nama pada ledger |
| --- | --- |
| `20261109145507` | `tahfidz_quran_surah_catalog` |
| `20261109145522` | `tahfidz_persisted_leaderboard` |
| `20261109145534` | `tahfidz_bulk_daily_target_write_api` |
| `20270317000000` | `cbt_admin_student_roster_pages` |
| `20270318000000` | `cbt_admin_assignment_pages` |
| `20270319000000` | `cbt_admin_exam_pages` |

Nama ledger saja tidak membuktikan kesetaraan. Pemeriksaan berikutnya mencocokkan metadata statement yang tersimpan terhadap SQL source setelah normalisasi dengan parser preflight repository. Hasilnya diringkas pada bagian **Pencocokan statement SQL** di bawah; pencocokan ini tetap bukan inspeksi DDL aktual.

## Pencocokan statement SQL — VQE staging (baca-saja, 15 November)

Kueri hanya mengambil `version`, `name`, `statements` dari ledger Supabase. Perbandingan memakai tokenizer/normalizer yang sama dengan skrip preflight source; tidak ada DDL atau baris data aplikasi yang dibaca.

| Versi ledger VQE | Source SQL pembanding | Statement | Hasil |
| --- | --- | ---: | --- |
| `20261109145507` — `tahfidz_quran_surah_catalog` | Fixture SQL tersimpan pada snapshot integrasi lokal | 18 | Cocok persis setelah normalisasi |
| `20261109145522` — `tahfidz_persisted_leaderboard` | Source historis pada snapshot branch `erp4-pr100-cbt-scale` | 7 | Cocok persis setelah normalisasi |
| `20261109145534` — `tahfidz_bulk_daily_target_write_api` | Source historis pada snapshot branch `erp4-pr100-cbt-scale` | 11 | Cocok persis setelah normalisasi |
| `20270312000000` — `tahfidz_target_decimal_precision` | Source `20270329000000_tahfidz_target_decimal_precision.sql` | 4 | Cocok persis setelah normalisasi |
| `20270314000000` — `cbt_tenant_settings_write_api` | `20270321000000_cbt_tenant_settings_write_api.sql` pada snapshot branch `erp4-pr112-merge-verify-20261114` | 6 | Cocok persis setelah normalisasi |
| `20270315000000` — `cbt_admin_dashboard_summary` | `20270322000000_cbt_admin_dashboard_summary.sql` | 7 | Cocok persis setelah normalisasi |
| `20270316000000` — `cbt_admin_question_keyset_pages` | `20270323000000_cbt_admin_question_keyset_pages.sql` | 13 | Cocok persis setelah normalisasi |
| `20270317000000` — `cbt_admin_student_roster_pages` | `20270324000000_cbt_admin_student_roster_pages.sql` | 10 | Cocok persis setelah normalisasi |
| `20270318000000` — `cbt_admin_assignment_pages` | `20270325000000_cbt_admin_assignment_pages.sql` | 13 | Cocok persis setelah normalisasi |
| `20270319000000` — `cbt_admin_exam_pages` | `20270326000000_cbt_admin_exam_pages.sql` | 7 | Cocok persis setelah normalisasi |

Hasil ini membantu mengidentifikasi asal SQL yang tercatat pada ledger, tetapi tidak mengesahkan DDL live maupun menjalankan migrasi repair. Enam migrasi CBT adalah snapshot branch PR #112 yang menomori ulang migrasi; setelah branch itu diintegrasikan, urutan final dan preflight `main` tetap harus dijalankan sebelum migrasi staging.

### Perbedaan source Tahfidz saat ini terhadap SQL staging

Perbandingan SQL pada metadata ledger dengan file `main` menemukan perbedaan statement berikut:

- Katalog Al-Qur’an: 18 statement ledger dibanding 20 source; 15 statement berurutan sama. Ini belum membuktikan DDL live berbeda.
- Leaderboard: 5 dari 7 statement metadata sama; file source berisi fungsi dan agregasi peserta yang lebih baru.
- Target harian massal: 10 dari 11 statement metadata sama; source menyertakan validasi presisi dua angka desimal.
- Presisi target desimal pada `20270312000000` cocok persis dengan file source `20270329000000`.

### Pemeriksaan objek Tahfidz VQE yang tersedia

Pemeriksaan katalog database baca-saja mengonfirmasi:

- Tabel terkait Tahfidz dan `quran_surahs` yang diperiksa mengaktifkan RLS dan `FORCE ROW LEVEL SECURITY`.
- `quran_surahs` memiliki primary key nomor surah, batas nomor 1–114, cek jumlah ayat, dan nama Latin unik. `tahfidz_records.surah_number` bertipe `smallint`, dapat kosong, dan memiliki foreign key ke katalog dengan `ON DELETE RESTRICT`.
- Trigger insert/update referensi Surah aktif; badan fungsi `validate_tahfidz_quran_reference()` cocok persis dengan file source main setelah normalisasi.
- Badan fungsi VQE `list_tahfidz_leaderboard()` berbeda dari file main: versi source menghitung jumlah seluruh peserta agar UI dapat menampilkan total di luar halaman.
- Badan fungsi VQE `record_tahfidz_daily_targets_bulk()` berbeda dari file main dan belum memeriksa presisi maksimal dua angka desimal di tingkat database. Pemeriksaan API tetap harus dipertahankan, tetapi fungsi database perlu diselaraskan sebelum fitur massal diaktifkan.
- Kedua fungsi tersebut memakai `search_path` yang dipatok. Pemeriksaan ini tidak menjalankan RPC dengan data tenant dan bukan uji simpan-baca.

Temuan saat ini menunjukkan objek katalog utama telah tersedia dan validatornya sejalan dengan source, sementara dua fungsi Tahfidz belum sejalan. Jangan mengubah alias ledger berdasarkan nama saja. Setelah urutan branch PR dan versi migrasi disepakati, lakukan rehearsal perubahan fungsi yang masih tertinggal pada VQE; pastikan pgTAP, preflight, dan alur aplikasi lulus sebelum mengaktifkan fitur. Tidak ada perubahan database pada pemeriksaan ini.

## PTSAS Production — versi source yang belum tercatat

| Versi source | Nama file migrasi |
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
| `20270328000000` | `tahfidz_bulk_daily_target_write_api` |
| `20270329000000` | `tahfidz_target_decimal_precision` |
| `20270401000000` | `tahfidz_monthly_leaderboard` |

## Urutan kerja yang aman

1. Pertahankan source `main` sebagai baseline kode; jangan menyamakan ledger dengan mengubah nomor atau nama migrasi secara spekulatif.
2. Tim backend mencari provenance setiap entri VQE yang tidak ada pada source, setiap benturan versi, dan migrasi Production yang tidak tercatat. Bandingkan SQL/commit asal dengan objek yang benar-benar ada di database.
3. Inventarisasi efek samping data pada migrasi seed/import dan periksa objek turunan: tabel/kolom, fungsi, trigger, constraint, indeks, grant, policy RLS, serta storage policy.
4. Tentukan rencana migrasi baru yang eksplisit: file source kanonis, migrasi yang memang sudah terwakili, urutan dependency, migrasi yang perlu diganti dengan migrasi koreksi baru, dan migrasi yang tidak boleh dijalankan.
5. Rehearsal pada database staging yang punya baseline dan salinan data/struktur yang disetujui; jalankan seluruh pgTAP dan alur API terkait. Jangan menjalankan `db push` atau `migration repair` Production dari inventaris ini.
6. Setelah parity source, staging, dan Production terbukti, tim backend dapat menjalankan UAT serta rilis dengan backup yang dapat dipulihkan dan prosedur rollback.

## Status

Dokumen ini memperbarui snapshot sebelumnya [`VQE_STAGING_MIGRATION_LEDGER_DRIFT_2026-11-13.md`](VQE_STAGING_MIGRATION_LEDGER_DRIFT_2026-11-13.md) untuk source `main` pada 15 November. Ini adalah **rekonsiliasi metadata**, bukan audit DDL, uji restore cloud, atau persetujuan rilis. Perbedaan yang tercatat tetap merupakan gerbang bagi tim backend.

