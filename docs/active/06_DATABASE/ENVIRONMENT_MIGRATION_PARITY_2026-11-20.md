# Audit paritas migrasi Supabase — 20 November 2026

## Ringkasan

Pemeriksaan ini membandingkan file SQL pada main dengan metadata ledger dan katalog PostgreSQL pada VQE staging serta PTSAS Production. Tujuannya menentukan langkah rekonsiliasi yang aman; hasil ini bukan izin untuk menerapkan seluruh migrasi.

- Source main saat pembaruan: commit `6a2ce88ae3299150b9fc50c6576d5d10d82fc25f`, 163 file migrasi. PR #135 hanya memperbarui dokumentasi; isi migrasi sama dengan snapshot preflight `bbf0b9c`.
- VQE staging (vqemuyzveuirlkvdggjd): 150 entri ledger.
- PTSAS Production (ptsasgdvgrbdtgyqieie): 100 entri ledger, terakhir 20270316000000.
- Setelah password database VQE diperbarui, Supabase CLI `2.122.0` berhasil membuka koneksi melalui URL pooler pada `.env`. Dry-run ulang pada commit `6a2ce88` berhenti dengan `DbPushMissingLocalError` untuk enam versi remote-only; ini membuktikan koneksi/kredensial bekerja, bukan membuktikan migrasi siap diterapkan. Tidak ada migrasi yang diterapkan.
- Tidak ada migrasi atau perbaikan ledger yang dijalankan. Tidak ada baris operasional santri, wali, keuangan, akademik, atau modul lain yang dibaca.

## VQE staging

### Perbedaan ledger

| Kategori | Jumlah |
| --- | ---: |
| Versi/nama yang sama di source dan ledger | 140 |
| Entri VQE tanpa file source dengan versi sama | 6 |
| Versi sama, tetapi nama migrasi berbeda | 4 |
| File source yang belum tercatat dengan versi/nama yang sama | 19 |

CLI 2.122.0 mengembalikan `DbPushMissingLocalError` untuk enam versi remote-only:

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

### Pemeriksaan katalog baca-saja

- `quran_surahs` dan `tahfidz_target_bulk_write_requests` tersedia; RLS dan FORCE ROW LEVEL SECURITY aktif.
- Indeks halaman CBT assignments/exams dan leaderboard Tahfidz terlihat.
- Perbandingan `pg_proc.prosrc` dengan source migration terkini mencakup 13 fungsi Tahfidz/CBT, masing-masing satu overload. Isi 11 fungsi cocok setelah normalisasi whitespace: delapan fungsi CBT (dashboard, ringkasan paket soal, halaman soal/santri/tugas/ujian dan hitungan assignment), RPC pengaturan CBT, validasi katalog Surah, serta target Tahfidz satuan.
- Dua isi fungsi berbeda dari source:
  - `list_tahfidz_leaderboard` pada VQE belum mencakup metrik hari aktif dan ringkasan bulanan dari migration `20270401000000_tahfidz_monthly_leaderboard`.
  - `record_tahfidz_daily_targets_bulk` pada VQE belum menolak target Ziyadah dan Murojaah dengan lebih dari dua angka desimal. Migration koreksi `20270402000000_tahfidz_bulk_target_precision_guard` dari PR #132 menambahkan kedua pemeriksaan itu.
- Semua 13 fungsi tidak memberi hak `EXECUTE` kepada `anon` atau `authenticated`; fungsi aplikasi memberi hak kepada `service_role`. Fungsi validasi katalog adalah trigger helper dan tidak memberi grant tersebut. Hanya leaderboard memakai `SECURITY DEFINER`, dengan grant terbatas ke `service_role`.

Perbandingan isi fungsi ini tidak membuktikan kesetaraan seluruh signature, DDL, trigger, constraint, indeks, policy, atau efek data dengan source. Karena itu selisih ledger tetap perlu direkonsiliasi sebelum `db push`; keberadaan fungsi saja bukan alasan untuk melewati migrasi atau mengubah ledger.

### Selisih modul Komunikasi antara staging dan Production

Katalog Production menunjukkan kelima tabel `communication_templates`, `communication_tickets`, `communication_ticket_events`, `communication_direct_messages`, dan `communication_direct_message_events`; semuanya mengaktifkan RLS dan FORCE RLS. Enam RPC dari migration `20270316000000_communication_ops_runtime` juga ditemukan. Pada VQE, pemeriksaan katalog baca-saja tidak menemukan satu pun dari lima tabel atau enam RPC tersebut.

Ini cocok dengan konflik ledger yang teridentifikasi: Production mencatat `20270316000000 | communication_ops_runtime`, sedangkan VQE mencatat versi sama sebagai `cbt_admin_question_keyset_pages`. Dengan demikian, modul Komunikasi adalah perbedaan skema spesifik yang terbukti: objeknya ada di Production dan belum ada di staging. Ini tidak berarti keseluruhan Production lebih baru atau setara; 63 migration source masih belum tercatat di Production.

### Dampak data pada migrasi source yang tertunda di VQE

Pemeriksaan SQL source menemukan operasi data tingkat migrasi berikut di antara file yang belum tercatat di VQE:

- `20270215500000_sample_class_grade_labels`: memperbarui label kelas pada record Master Data.
- `20270310000000_academic_sample_catalog` dan `20270311000000_academic_sample_term`: menambahkan mata pelajaran/katalog dan term/setting akademik contoh.
- `20270313000000_education_boarding_operational_seed`: menambah atau memperbarui contoh data lintas modul, termasuk gedung/kamar/santri, CBT, Tahfidz, LMS, perpustakaan, unit organisasi, izin, disiplin, dan kehadiran asrama.
- `20270320000000_tahfidz_quran_surah_catalog`: memasukkan katalog referensi Surah dan mengisi `surah_number` pada riwayat Tahfidz yang cocok berdasarkan nama Surah.

Empat migration sample/seed pertama tidak boleh diterapkan otomatis ke tenant staging yang sudah memiliki data. Katalog Surah merupakan referensi produk, tetapi backfill dan cakupan katalog perlu diperiksa sebelum replay. Source migration lain pada daftar pending berisi perubahan skema, fungsi, constraint, atau indeks; masing-masing tetap perlu uji urutan dan idempotensi. Tidak ada DML tersebut yang dijalankan saat audit.

### Advisori keamanan dan performa VQE (baca-saja, 20 November 2026)

- Security Advisor melaporkan `auth_leaked_password_protection` berstatus `WARN` (nonaktif). Organisasi VQE berada pada paket Free; dokumentasi Supabase menyatakan fitur pemeriksaan kata sandi bocor tersedia pada Pro atau lebih tinggi. Tidak ada perubahan paket atau pengaturan Auth yang dilakukan. Lihat [dokumentasi keamanan kata sandi Supabase](https://supabase.com/docs/guides/auth/password-security).
- Security Advisor juga mencatat 164 tabel dengan RLS aktif tanpa policy (`INFO`). Pemeriksaan grant menunjukkan akses tabel langsung untuk `authenticated` hanya SELECT pada lima tabel: `candidate_documents`, `candidates`, `profiles`, `tenants`, dan `user_profiles`. Masing-masing memiliki satu policy SELECT; policy membatasi akses dengan tenant aktif, profil sendiri, role Admin, serta izin modul yang sesuai. Tidak ditemukan grant tabel untuk `PUBLIC` atau `anon`. Temuan tanpa policy pada tabel operasional lain perlu dibaca bersama model server-only dan kerahasiaan `service_role`; jangan menambahkan grant klien umum.
- Performance Advisor mencatat 260 foreign key tanpa indeks penutup dan 82 indeks yang belum pernah digunakan (`INFO`). Migration source `20270330000000_add_core_composite_fk_indexes` berisi 13 indeks inti yang belum ada di katalog VQE. Ini kandidat perbaikan performa, bukan alasan untuk membuat seluruh indeks secara otomatis. Migration memakai `CREATE INDEX` biasa dan perlu menilai ukuran tabel serta dampak lock sebelum penerapan.
- Health Advisor tidak mengembalikan temuan.

Temuan ini khusus staging VQE. Tidak ada DDL, pengaturan Auth, data operasional, atau Production yang diubah/dibaca dalam pemeriksaan advisori ini.

## PTSAS Production

### Kesenjangan katalog Surah Tahfidz

- VQE memiliki 114 baris katalog Surah yang unik (nomor 1–114) dan setiap baris memiliki jumlah ayat. Fungsi validator referensinya ada dan isinya cocok dengan source.
- Di PTSAS Production, katalog `public.quran_surahs` dan fungsi `public.validate_tahfidz_quran_reference()` belum ada.
- Source migration `20270320000000_tahfidz_quran_surah_catalog` belum tercatat di ledger Production. Ini bukti skema/fitur katalog Tahfidz belum dipasang di Production; tidak membuktikan kondisi seluruh modul.

Pemeriksaan 13 RPC Tahfidz/CBT terpilih di Production menemukan hanya `record_tahfidz_daily_target` (satu overload, SECURITY INVOKER, EXECUTE hanya untuk `service_role`). Dua belas RPC lain yang dibandingkan tidak ditemukan, termasuk RPC pengaturan/halaman CBT, validator katalog Surah, leaderboard, dan target massal. Ini membuktikan sebagian API database yang dipakai source belum tersedia di Production; bukan audit lengkap seluruh fungsi atau rute API.

### Posisi ledger

- Ledger berisi 100 migrasi, dari 20260603000000 sampai 20270316000000.
- 97 dari 100 entri memiliki pasangan versi dan nama yang sama persis dengan source main.
- Tiga entri ledger memiliki `name = NULL`: versi `20261205000000`, `20261206000000`, dan `20270118000000`. Versinya ditemukan pada source, tetapi nama historis ledger tidak tersedia sehingga kecocokan nama/provenance belum dapat dibuktikan.
- Tidak ditemukan versi Production yang tidak memiliki file source dengan versi sama. Ini tidak membuktikan kesetaraan DDL atau efek migrasi.
- Ada 63 versi migration source yang belum tercatat pada ledger Production; versi tersebut tersebar di antara migrasi yang sudah tercatat, bukan hanya berada di bagian akhir.

| Versi dengan `name = NULL` | Nama file source pada versi yang sama |
| --- | --- |
| `20261205000000` | `data_api_default_privilege_hardening` |
| `20261206000000` | `ppdb_legacy_candidate_import` |
| `20270118000000` | `crm_contact_management` |

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
5. Production memerlukan rencana eksplisit untuk 63 migrasi source yang belum tercatat, pengelompokan DDL vs perubahan data, rekonsiliasi tiga nama ledger `NULL`, backup yang dapat dipulihkan, uji restore, urutan dan pemeriksaan pascamigrasi, serta jendela rilis. Tidak ada perubahan Production yang dilakukan pada audit ini.
6. Jalankan ulang UAT setelah staging konsisten: autentikasi/role/tenant, PPDB, Master Data/NIS, Akademik, Tahfidz, asrama, keuangan, dokumen/Storage, serta verifikasi backup/restore.

## Bukti dan batas

- supabase db push --dry-run --skip-vault memakai URL pooler VQE dari .env; password tidak dicetak. Dry-run terbaru terhubung tetapi berhenti pada enam versi remote-only, sebelum menghitung rencana migrasi yang akan diterapkan.
- MCP Supabase hanya digunakan untuk metadata migration dan katalog PostgreSQL baca-saja.
- Tidak ada migration, repair, operasi data, upload, atau perubahan cloud yang dijalankan.
- CI PR #132 lulus pada migration/database tests, frontend/build, dan instalasi paket customer. PR #132 merged ke main pada commit 9a631a120d8cfdaf0e9e242aaa26350a430f1352.
- CI lokal/terisolasi membuktikan source dapat diuji pada baseline yang dikonfigurasi; itu tidak membuktikan kesetaraan live VQE atau pemulihan Production.
- Pemeriksaan ini belum membuktikan UAT seluruh modul, backup/restore cloud, migrasi Production, atau kesiapan deploy final.
## Revalidasi baca-saja setelah rotasi kredensial VQE — 20 November 2026

Source preflight telah diperbarui melalui PR #137 dan digabung ke `main` pada commit `dea089d31a1c82971c7ed9293da107210da8c70b`. Setelah password database VQE diganti, koneksi pooler pada `.env` lokal berhasil dipakai untuk satu transaksi `BEGIN READ ONLY` yang hanya membaca `supabase_migrations.schema_migrations`. Password tidak dicetak atau disimpan di laporan.

| Pemeriksaan VQE | Hasil |
| --- | ---: |
| Migrasi sumber di main | 163 |
| Entri ledger VQE | 150 |
| Versi ledger terbaru | `20270329000000` |
| Alias dengan nama dan SQL yang cocok | 10 |
| Alias ledger lama yang masih menunggu repair | 10 |
| Versi remote tanpa source | 0 |
| Ketidakcocokan nama atau SQL | 0 |
| Migrasi source belum tercatat | 13 |
| Migrasi source yang out of order | 9 |
| Lolos gerbang staging | Tidak |

Koneksi langsung setelah rotasi membuktikan kredensial pooler saat ini dapat membaca ledger. Ini belum sama dengan menjalankan ulang `supabase db push --dry-run` memakai CLI. Tidak ada migration repair, DDL, atau perubahan data yang diterapkan.

Sepuluh alias yang SQL-nya cocok berdasarkan source dan ledger VQE:

| Versi ledger VQE | Versi source | Nama |
| --- | --- | --- |
| 20261109145507 | 20270320000000 | `tahfidz_quran_surah_catalog` |
| 20261109145522 | 20270327000000 | `tahfidz_persisted_leaderboard` |
| 20261109145534 | 20270328000000 | `tahfidz_bulk_daily_target_write_api` |
| 20270312000000 | 20270329000000 | `tahfidz_target_decimal_precision` |
| 20270314000000 | 20270321000000 | `cbt_tenant_settings_write_api` |
| 20270315000000 | 20270322000000 | `cbt_admin_dashboard_summary` |
| 20270316000000 | 20270323000000 | `cbt_admin_question_keyset_pages` |
| 20270317000000 | 20270324000000 | `cbt_admin_student_roster_pages` |
| 20270318000000 | 20270325000000 | `cbt_admin_assignment_pages` |
| 20270319000000 | 20270326000000 | `cbt_admin_exam_pages` |

Sembilan migrasi source tertunda yang berada sebelum versi ledger terbaru adalah `20270215500000_sample_class_grade_labels`, `20270309000000_academic_report_card`, `20270310000000_academic_sample_catalog`, `20270311000000_academic_sample_term`, `20270312000000_sample_nis_grade_codes`, `20270313000000_education_boarding_operational_seed`, `20270314000000_education_boarding_operational_fill`, `20270315000000_lms_dashboard_operational_fill`, dan `20270316000000_communication_ops_runtime`. Empat migrasi lain yang belum tercatat berada setelah versi ledger terbaru.

### Temuan seed pada ledger Production

Pemeriksaan baca-saja PTSAS menunjukkan ledger mencatat migrasi `20270310000000` sampai `20270316000000` dengan nama source kanonis:

- `academic_sample_catalog`, `academic_sample_term`, dan `sample_nis_grade_codes`;
- `education_boarding_operational_seed` dan `education_boarding_operational_fill`;
- `lms_dashboard_operational_fill`;
- `communication_ops_runtime`.

File source untuk migrasi tersebut berisi DML seed contoh pada katalog akademik, semester, NIS, asrama, CBT, Tahfidz, LMS, perpustakaan, dan komunikasi. Beberapa memakai pilihan Admin per tenant dan UUID permintaan tetap. Ledger mengonfirmasi migrasi berstatus terapan; laporan ini **tidak** membaca baris operasional atau menghitung berapa record yang terdampak. Tidak ada perubahan atau penghapusan data Production.

Karena migrasi tersebut sudah tercatat di Production, isi file migrasi historis tidak boleh diedit untuk menghapus seed. Setiap koreksi harus berupa migration baru yang forward-only dan memiliki kriteria record yang sangat spesifik; jangan menghapus record sampel sebelum pemilik data memastikan record tersebut aman dihapus.

Pada VQE, beberapa migration seed yang sama masih tertunda. Jangan menjalankan `db push` ke VQE sebelum alias direkonsiliasi dan dampak data seed ditinjau terhadap fixture yang sudah dimasukkan tim. Urutan aman berikutnya: tinjau daftar pending, putuskan kebijakan data contoh, susun skrip repair ledger beserta verifikasi sebelum/sesudah, lalu lakukan rehearsal staging. Production tetap dilarang menerima migrasi sampai urutan dan dampak data ini dinyatakan jelas.
