# Audit paritas migrasi Supabase — 20 November 2026

## Ringkasan

Pemeriksaan ini membandingkan file SQL pada main dengan metadata ledger dan katalog PostgreSQL pada VQE staging serta PTSAS Production. Tujuannya menentukan langkah rekonsiliasi yang aman; hasil ini bukan izin untuk menerapkan seluruh migrasi.

- Source main: commit 9a631a120d8cfdaf0e9e242aaa26350a430f1352, 163 file migrasi.
- VQE staging (vqemuyzveuirlkvdggjd): 150 entri ledger.
- PTSAS Production (ptsasgdvgrbdtgyqieie): 100 entri ledger, terakhir 20270316000000.
- Kredensial database VQE terbaru berhasil membuka koneksi. supabase db push --dry-run --skip-vault berhenti pada pemeriksaan ledger, sebelum menyusun daftar migrasi yang akan diterapkan.
- Tidak ada migrasi atau perbaikan ledger yang dijalankan. Tidak ada baris operasional santri, wali, keuangan, akademik, atau modul lain yang dibaca.

## VQE staging

### Perbedaan ledger

| Kategori | Jumlah |
| --- | ---: |
| Versi/nama yang sama di source dan ledger | 140 |
| Entri VQE tanpa file source dengan versi sama | 6 |
| Versi sama, tetapi nama migrasi berbeda | 4 |
| File source yang belum tercatat dengan versi/nama yang sama | 19 |

CLI 2.122.0 mengembalikan DbPushMissingLocalError untuk enam versi remote-only:

| Versi VQE | Nama ledger |
| --- | --- |
| 20261109145507 | tahfidz_quran_surah_catalog |
| 20261109145522 | tahfidz_persisted_leaderboard |
| 20261109145534 | tahfidz_bulk_daily_target_write_api |
| 20270317000000 | cbt_admin_student_roster_pages |
| 20270318000000 | cbt_admin_assignment_pages |
| 20270319000000 | cbt_admin_exam_pages |

Empat benturan nama:

| Versi | Nama ledger VQE | Nama source main |
| --- | --- | --- |
| 20270312000000 | tahfidz_target_decimal_precision | sample_nis_grade_codes |
| 20270314000000 | cbt_tenant_settings_write_api | education_boarding_operational_fill |
| 20270315000000 | cbt_admin_dashboard_summary | lms_dashboard_operational_fill |
| 20270316000000 | cbt_admin_question_keyset_pages | communication_ops_runtime |

Kemiripan nama menunjukkan kandidat relasi, bukan bukti bahwa SQL, efek data, atau objek aktif identik.

### Migrasi source yang belum tercatat

    20270215500000_sample_class_grade_labels
    20270309000000_academic_report_card
    20270310000000_academic_sample_catalog
    20270311000000_academic_sample_term
    20270313000000_education_boarding_operational_seed
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

### Pemeriksaan katalog baca-saja\n\n### Perbandingan definisi RPC terpilih\n\nPerbandingan baca-saja antara source migration terkini dan `pg_proc.prosrc` VQE untuk 13 fungsi Tahfidz/CBT menemukan:\n\n- **11 dari 13** isi fungsi cocok setelah normalisasi whitespace. Delapan fungsi CBT (dashboard, ringkasan paket soal, halaman soal/santri/tugas/ujian dan hitungan assignment) serta RPC pengaturan CBT, katalog Surah, dan target Tahfidz satuan cocok.\n- **2 dari 13** berbeda dari source saat ini:\n  - `list_tahfidz_leaderboard`: VQE belum memuat metrik hari aktif dan ringkasan bulanan pada source migration `20270401000000_tahfidz_monthly_leaderboard`.\n  - `record_tahfidz_daily_targets_bulk`: VQE belum menolak nilai halaman dengan lebih dari dua angka desimal untuk target Ziyadah dan Murojaah. Perbaikannya ada di `20270402000000_tahfidz_bulk_target_precision_guard` (PR #132).\n- Seluruh 13 fungsi punya satu overload. Hak `EXECUTE` tidak diberikan ke `anon` atau `authenticated`; fungsi aplikasi memberi hak ke `service_role`. Fungsi validasi katalog adalah trigger helper tanpa grant tersebut. Hanya leaderboard yang `SECURITY DEFINER`, dan grant-nya tetap terbatas ke `service_role`.\n\nIni membuktikan kecocokan isi untuk 11 fungsi yang diperiksa dan dua perbedaan perilaku yang spesifik. Ini tidak membuktikan seluruh DDL, trigger, indeks, policy, atau efek data pada database sama dengan source.\n

Katalog VQE menunjukkan objek berikut tersedia:

- quran_surahs dan tahfidz_target_bulk_write_requests ada, RLS dan FORCE ROW LEVEL SECURITY aktif, serta kolom dan constraint utama terlihat.
- Indeks halaman CBT assignments/exams dan leaderboard Tahfidz terlihat.
- Fungsi CBT yang diperiksa tersedia, tidak memakai SECURITY DEFINER, dan hanya memberi EXECUTE ke service_role.
- Fungsi leaderboard Tahfidz memakai SECURITY DEFINER, dengan EXECUTE hanya untuk service_role; definisi tetap perlu ditinjau sebagai fungsi berhak istimewa.
- Fungsi record_tahfidz_daily_targets_bulk pada VQE tidak memiliki dua validasi presisi desimal (ziyadah dan murojaah). Fungsi satu-target memiliki keduanya. Perbaikan maju sudah masuk main melalui PR #132, tetapi migrasinya 20270402000000 belum tercatat di VQE maupun Production.

Pemeriksaan ini memastikan keberadaan sejumlah objek dan kontrol akses katalog. Pemeriksaan ini belum membuktikan kesetaraan penuh definisi semua fungsi, trigger, constraint, indeks, policy, dan efek data dengan seluruh file source.

## PTSAS Production

### Posisi ledger

- Ledger berisi 100 migrasi, dari 20260603000000 sampai 20270316000000.
- Seluruh 100 versi/nama ledger yang dikembalikan cocok dengan source main.
- Tidak ditemukan entri Production yang versinya tidak ada di source atau benturan nama untuk versi yang sama.
- Ada 63 migrasi source setelah ledger Production yang belum tercatat.

### Migrasi source yang belum tercatat

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

Ledger Production juga mencatat migrasi katalog dan data contoh/operasional, antara lain:

- 20270310000000_academic_sample_catalog
- 20270311000000_academic_sample_term
- 20270312000000_sample_nis_grade_codes
- 20270313000000_education_boarding_operational_seed
- 20270314000000_education_boarding_operational_fill
- 20270315000000_lms_dashboard_operational_fill

Ledger membuktikan migrasi tersebut pernah dicatat, tetapi tidak membuktikan baris apa yang masih ada, tenant mana yang terdampak, atau apakah data dummy bertumpang tindih dengan data yang ditambahkan tim. Jangan mengulang, mengedit, atau membuat migrasi pembersihan umum berdasarkan nama saja.

## Dampak pada urutan rilis

1. Jangan jalankan db push di VQE sekarang. CLI berhenti sebelum menginventarisasi migrasi yang akan diterapkan karena versi remote-only.
2. Jangan jalankan migration repair massal. Untuk VQE, perlu dibuktikan asal alias, definisi aktif, hak eksekusi, constraint, indeks, trigger, policy, dan efek data per migrasi.
3. Pisahkan migrasi struktur dari seed/data contoh. VQE masih memiliki beberapa file katalog/seed source yang belum tercatat; Production sudah mencatat sebagian migrasi seed. Seed tidak boleh diterapkan atau dibersihkan secara luas tanpa menentukan tenant dan record yang dimaksud.
4. Lakukan rehearsal di database disposable, lalu siapkan baseline ledger VQE yang disepakati dan migrasi forward-only untuk ketidaksesuaian fungsi.
5. Production memerlukan rencana 63 migrasi yang eksplisit, pengelompokan DDL vs perubahan data, backup yang dapat dipulihkan, uji restore, urutan dan pemeriksaan pascamigrasi, serta jendela rilis. Tidak ada perubahan Production yang dilakukan pada audit ini.
6. Jalankan ulang UAT setelah staging konsisten: autentikasi/role/tenant, PPDB, Master Data/NIS, Akademik, Tahfidz, asrama, keuangan, dokumen/Storage, serta verifikasi backup/restore.

## Bukti dan batas

- supabase db push --dry-run --skip-vault memakai URL pooler VQE dari .env; password tidak dicetak.
- MCP Supabase hanya digunakan untuk metadata migration dan katalog PostgreSQL baca-saja.
- Tidak ada migration, repair, operasi data, upload, atau perubahan cloud yang dijalankan.
- CI PR #132 lulus pada migration/database tests, frontend/build, dan instalasi paket customer. PR #132 merged ke main pada commit 9a631a120d8cfdaf0e9e242aaa26350a430f1352.
- CI lokal/terisolasi membuktikan source dapat diuji pada baseline yang dikonfigurasi; itu tidak membuktikan kesetaraan live VQE atau pemulihan Production.
- Pemeriksaan ini belum membuktikan UAT seluruh modul, backup/restore cloud, migrasi Production, atau kesiapan deploy final.

