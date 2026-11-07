# Audit indeks foreign key VQE — 6 November 2026

## Cakupan dan sumber

- Database: Supabase VQE staging `vqemuyzveuirlkvdggjd`.
- Sumber kode yang dibandingkan: HEAD PR #40 `368e5efc349427d84747d8b839a486d4014c3914`.
- Pemeriksaan hanya membaca katalog PostgreSQL dan temuan Advisor. Audit ini tidak membuat atau menghapus indeks dan tidak mengubah Production.

## Ringkasan hasil

- Katalog VQE memiliki 522 constraint foreign key pada schema `public`.
- Advisor melaporkan 258 foreign key tanpa indeks.
- Pencocokan constraint Advisor terhadap katalog menemukan seluruh 258 constraint masih ada dan kolom metadata-nya cocok.
- Katalog mengungkap 27 foreign key tambahan yang hanya mempunyai indeks parsial. Implementasi linter Supabase membandingkan awalan kolom FK dengan indeks valid, tetapi tidak mengecualikan indeks dengan `indpred`; indeks parsial tersebut tidak mencakup semua baris child untuk pemeriksaan FK. Karena itu audit full-row ini menghitung 285 FK yang belum memiliki indeks nonparsial dengan awalan kolom FK dalam urutan constraint.
- Advisor juga melaporkan 96 indeks tidak terpakai. Statistik staging saat ini kecil; jangan menghapus indeks berdasarkan hitungan `idx_scan` staging saja.
- Banyak tabel staging kosong atau berisi sangat sedikit baris; statistik ukuran staging tidak mewakili skala pelanggan.

Implementasi linter yang diperiksa: [Supabase Splinter SQL](https://github.com/supabase/splinter/blob/main/splinter.sql). Dokumentasi: [Postgres indexes](https://supabase.com/docs/guides/database/postgres/indexes) dan [database migrations](https://supabase.com/docs/guides/deployment/database-migrations).

## 27 constraint yang hanya tercakup oleh indeks parsial

| Tabel | Kolom FK (urutan) | Indeks parsial | Predikat | Baris staging |
|---|---|---|---|---:|
| academic_records | tenant_id,student_id | academic_records_tenant_student_idx | (deleted_at IS NULL) | 0 |
| academic_records | tenant_id,teacher_user_id | academic_records_tenant_teacher_idx | (deleted_at IS NULL) | 0 |
| academic_records | tenant_id,organization_unit_id | academic_records_tenant_unit_kind_time_idx | (deleted_at IS NULL) | 0 |
| candidates | tenant_id,created_by_user_id | candidates_tenant_created_by_idx | (created_by_user_id IS NOT NULL) | 5 |
| candidates | tenant_id,organization_unit_id | candidates_tenant_unit_onboarding_idx | (organization_unit_id IS NOT NULL) | 5 |
| donations | tenant_id,campaign_id | donations_tenant_campaign_idx | (status = 'confirmed'::text) | 0 |
| donations | tenant_id,donor_id | donations_tenant_donor_idx | (status = 'confirmed'::text) | 0 |
| finance_bills | tenant_id,candidate_id | finance_bills_tenant_candidate_idx | (candidate_id IS NOT NULL) | 0 |
| finance_bills | tenant_id,organization_unit_id | finance_bills_tenant_unit_date_idx | (organization_unit_id IS NOT NULL) | 0 |
| guardian_account_invitations | tenant_id,guardian_id | guardian_account_invitations_one_pending_per_guardian_idx | (status = 'pending'::text) | 0 |
| hris_employees | tenant_id,organization_unit_id | hris_employees_tenant_unit_idx | (organization_unit_id IS NOT NULL) | 0 |
| library_circulations | tenant_id,book_id | library_circulations_active_book_idx | (status = 'active'::text) | 0 |
| lms_learning_record_requests | tenant_id,comment_id | lms_learning_record_requests_comment_idx | (comment_id IS NOT NULL) | 0 |
| lms_learning_record_requests | tenant_id,note_id | lms_learning_record_requests_note_idx | (note_id IS NOT NULL) | 0 |
| master_data_records | tenant_id,organization_unit_id | master_data_records_tenant_unit_class_idx | (category = 'Kelas'::text) | 6 |
| profiles | tenant_id,organization_unit_id | profiles_tenant_organization_unit_idx | (organization_unit_id IS NOT NULL) | 11 |
| student_room_assignment_history | tenant_id,building_id,building_category | student_room_history_building_fk_idx | (building_id IS NOT NULL) | 4 |
| student_room_assignment_history | tenant_id,changed_by | student_room_history_changed_by_fk_idx | (changed_by IS NOT NULL) | 4 |
| student_room_assignment_history | tenant_id,previous_building_id,previous_building_category | student_room_history_previous_building_fk_idx | (previous_building_id IS NOT NULL) | 4 |
| student_room_assignment_history | tenant_id,previous_room_id,previous_room_category | student_room_history_previous_room_fk_idx | (previous_room_id IS NOT NULL) | 4 |
| student_room_assignment_history | tenant_id,room_id,room_category | student_room_history_room_fk_idx | (room_id IS NOT NULL) | 4 |
| students | tenant_id,organization_unit_id | students_tenant_unit_grade_idx | (organization_unit_id IS NOT NULL) | 4 |
| tahfidz_sessions | tenant_id,teacher_user_id | tahfidz_sessions_teacher_schedule_idx | (status = 'scheduled'::text) | 0 |
| tahfidz_targets | tenant_id,student_id | tahfidz_targets_one_active_per_student_uq | (status = 'active'::text) | 0 |
| tenant_naming_series | tenant_id,created_by_user_id | tenant_naming_series_created_by_fk_idx | (created_by_user_id IS NOT NULL) | 105 |
| tenant_naming_series | tenant_id,updated_by_user_id | tenant_naming_series_updated_by_fk_idx | (updated_by_user_id IS NOT NULL) | 105 |
| tenant_reference_items | tenant_id,organization_unit_id | tenant_reference_items_unit_idx | (organization_unit_id IS NOT NULL) | 410 |

Indeks pada kolom FK yang hanya mencakup subset baris tidak menjamin pencarian child row untuk semua nilai pada saat parent diperbarui atau dihapus. Indeks parsial yang ada tetap dapat berguna untuk query tertentu; temuan ini bukan alasan untuk menghapusnya.

## Rekomendasi untuk tim backend

1. Prioritaskan FK pada tabel dengan volume tinggi, retensi panjang, operasi koreksi/hapus parent, atau pola join yang dominan. Gunakan data produksi/benchmark pelanggan, bukan statistik VQE yang hampir kosong.
2. Rancang indeks nonparsial yang memulai key columns dengan urutan kolom FK. Periksa duplikasi dan gabungkan hanya bila satu indeks composite benar-benar melayani awalan FK serta query runtime.
3. Uji dampak terhadap ukuran, laju tulis, query latency, dan operasi delete/update parent menggunakan data sintetis berskala besar.
4. Untuk database pelanggan yang sudah besar, rencanakan indeks online dan jendela perubahan. `CREATE INDEX` biasa dapat mengunci penulisan; `CREATE INDEX CONCURRENTLY` mengurangi lock penulisan tetapi membutuhkan jalur deployment yang mendukung statement di luar transaksi.
5. Periksa jalur CI/CD sebelum memakai `CONCURRENTLY`: Supabase GitHub integration menjalankan migration dalam transaksi dan tidak menghormati directive no-transaction. Untuk instalasi self-hosted, berikan runbook yang eksplisit dan verifikasi ledger setelah proses.
6. Tambahkan pemeriksaan regresi yang menghitung indeks penuh per FK; jangan mengandalkan Advisor saja karena pemeriksaan partial-index coverage di linter tidak menandai 27 kasus di atas.
7. Jangan menghapus 96 indeks yang berstatus tidak terpakai sebelum ada statistik representatif setelah beban operasi dan tinjauan query plan.

## Status

- Tidak ada indeks yang dibuat atau dihapus di VQE.
- Tidak ada DDL atau perubahan data pada Production.
- Temuan ini adalah pekerjaan optimasi/validasi sebelum klaim skala besar; bukan bukti bahwa query fungsional saat ini gagal.

