# Rekonsiliasi baca-saja Supabase PTSAS Production — 14 November 2026

## Tujuan dan batas pemeriksaan

Dokumen ini mencatat pembacaan metadata Production untuk membantu tim backend menyusun rencana rekonsiliasi yang dapat ditinjau. Pemeriksaan dilakukan pada proyek `ptsasgdvgrbdtgyqieie` melalui konektor Supabase baca-saja dan dibandingkan dengan sumber `main` pada commit `b0824476cb6d0207925283f15cb6f0d2714e54a3`.

Yang dibaca: daftar migrasi, katalog tabel/privilege/policy, definisi beberapa fungsi, dan advisor Supabase. Tidak ada baris data operasional atau isi berkas Storage yang dibaca. Tidak ada SQL perubahan, migration repair, `db push`, deploy, atau perubahan Production yang dilakukan.

## Ringkasan

| Pemeriksaan | Production PTSAS | Source `main` |
| --- | ---: | ---: |
| File migrasi | — | 150 |
| Baris ledger migrasi | 100 | — |
| Versi dan nama yang cocok | 97 | — |
| Versi source belum tercatat di ledger | 50 | — |
| Baris ledger dengan versi source tetapi nama kosong | 3 | — |
| Versi ledger tanpa file bernomor sama di source | 0 | — |
| Tabel schema `public` | 162 | — |
| Tabel dengan RLS aktif dan FORCE RLS | 162 / 162 | — |
| Tabel dengan policy | 5 | — |

Tiga versi ledger yang namanya kosong adalah `20261205000000`, `20261206000000`, dan `20270118000000`. Pemeriksaan ini mencocokkan nomor versi dan nama file, bukan membuktikan bahwa seluruh SQL file cocok dengan DDL yang saat ini terpasang.

Kepala ledger Production adalah `20270316000000` (`communication_ops_runtime`), sedangkan versi source tertua yang belum tercatat adalah `20261207000000`. Artinya, selisih terjadi di tengah urutan riwayat, bukan hanya sebagai migrasi baru di ekor. `db push` biasa tidak boleh digunakan sebelum setiap celah diurutkan dan direkonsiliasi.

## Katalog akses yang teramati

- Tidak ditemukan grant tabel kepada `PUBLIC` atau `anon`.
- Role `authenticated` memiliki privilege pada 5 tabel; kelimanya mempunyai policy.
- Role `service_role` memiliki privilege pada 157 tabel. Karena role ini melewati RLS, jalur backend yang menggunakannya wajib memvalidasi identitas, role, tenant, dan permission sebelum setiap operasi.
- Ada 5 policy `SELECT` pada tabel `candidate_documents`, `candidates`, `profiles`, `tenants`, dan `user_profiles`.
- Sebanyak 157 tabel RLS memiliki nol policy. Dengan grant yang teramati, akses langsung dari browser untuk tabel-tabel itu tertutup. Ini bukan bukti bahwa route backend aman; route server harus diaudit terpisah.

## Advisor Production

### Keamanan

- 4 helper `SECURITY DEFINER` pada schema `public` dapat dipanggil role `authenticated`: `current_app_role()`, `current_tenant_id()`, `has_module_access(text)`, dan `is_tenant_admin()`.
- Fungsi-fungsi tersebut beroperasi pada identitas pemanggil (`auth.uid()`), dan pemeriksaan definisi menunjukkan `anon` tidak dapat memanggilnya. Walau begitu, keberadaannya di schema `public` membuka RPC yang tidak diperlukan untuk operasi klien. Source `main` berisi migrasi `20270210000000_internalize_tenant_rls_helpers.sql` untuk memindahkannya ke schema privat.
- Fungsi trigger `erp4_ppdb_update_updated_at_column()` tidak mempunyai konfigurasi `search_path` tetap. Source memuat `20270209000000_harden_ppdb_trigger_search_path.sql` yang menguncinya ke `pg_catalog`.
- Perlindungan kata sandi bocor Supabase Auth dilaporkan nonaktif. Pengaturan ini perlu dikonfirmasi dan diaktifkan oleh operator Production melalui pengaturan Auth.
- 157 temuan INFO menyatakan RLS aktif tanpa policy. Dalam katalog saat ini temuan itu konsisten dengan grant browser yang tertutup; tetap verifikasi setiap route backend service-role.

### Kinerja

- 269 foreign key dilaporkan belum memiliki indeks yang mencakup kolom FK.
- 2 policy menggunakan pola Auth yang dievaluasi ulang per baris. Source `20270211000000_optimize_profile_rls_initplans.sql` menangani pola tersebut.
- Ada satu pasangan indeks duplikat pada `document_records`: `document_records_tenant_document_number_uq` dan `document_records_tenant_number_normalized_uq`. Source `20270227000000_remove_redundant_document_number_index.sql` menghapus indeks yang redundan.
- 89 indeks dinilai belum digunakan. Ini temuan INFO yang bergantung pada statistik workload/reset; jangan menghapus indeks hanya berdasarkan snapshot advisor.
- Source memiliki `20270217000000_index_tenant_choice_foreign_keys.sql`. Jumlah temuan 269 harus ditinjau per FK; jangan menganggap satu migrasi ini pasti menyelesaikan semuanya.
- Health Advisor tidak mengembalikan temuan pada snapshot ini.

Rujukan advisor: [Security Advisor Production](https://supabase.com/dashboard/project/ptsasgdvgrbdtgyqieie/advisors/security) dan [Performance Advisor Production](https://supabase.com/dashboard/project/ptsasgdvgrbdtgyqieie/advisors/performance). Perlindungan kata sandi bocor dapat ditinjau dari Supabase Dashboard → Authentication → Settings.

## Lima puluh versi source yang belum tercatat pada ledger Production

Daftar ini adalah selisih ledger, **bukan daftar migrasi yang siap dijalankan**. DDL aktual belum direkonsiliasi dan beberapa migrasi dapat mengubah data, menambah constraint/index, atau melakukan backfill.

1. `20261207000000_library_legacy_catalog_import.sql`
2. `20261208000000_hris_legacy_employees_import.sql`
3. `20261210000000_cooperative_supplier_import_status.sql`
4. `20261211000000_library_circulation_legacy_import.sql`
5. `20261213000000_marketplace_mutation_payload_guard.sql`
6. `20261214000000_donation_mutation_payload_guard.sql`
7. `20261216000000_tahfidz_session_result_integrity.sql`
8. `20261217000000_tahfidz_target_tenant_business_date.sql`
9. `20261218000000_cbt_server_authoritative_deadline.sql`
10. `20261220000000_inventory_adjustment_payload_guard.sql`
11. `20261222000000_ga_inventory_event_payload_guard.sql`
12. `20261223000000_cbt_request_payload_guard.sql`
13. `20261224000000_lms_request_payload_guard.sql`
14. `20261225000000_lms_submission_grade_integrity.sql`
15. `20261226000000_lms_learning_record_integrity.sql`
16. `20261227000000_lms_progress_integrity.sql`
17. `20261228000000_boarding_attendance_active_students.sql`
18. `20261229000000_boarding_attendance_retry_after_status_change.sql`
19. `20261230000000_cooperative_financial_legacy_import.sql`
20. `20270101000000_profiles_user_directory_indexes.sql`
21. `20270104000000_guardian_boarding_access.sql`
22. `20270109000000_boarding_room_history_baseline.sql`
23. `20270111000000_ppdb_document_access_audit.sql`
24. `20270113000000_admin_ppdb_document_upload.sql`
25. `20270119000000_master_data_student_search_indexes.sql`
26. `20270120000000_communication_import_canonical_audience.sql`
27. `20270121000000_tenant_admin_bootstrap.sql`
28. `20270122000000_lms_learning_record_tenant_fk.sql`
29. `20270123000000_public_ppdb_idempotency.sql`
30. `20270127000000_fix_cbt_answer_object_limit.sql`
31. `20270131000000_finance_legacy_unit_assignment.sql`
32. `20270205000000_guardian_self_registration.sql`
33. `20270207000000_public_schema_migration_ownership.sql`
34. `20270208000000_guardian_pre_onboarding_candidate_finance.sql`
35. `20270209000000_harden_ppdb_trigger_search_path.sql`
36. `20270210000000_internalize_tenant_rls_helpers.sql`
37. `20270211000000_optimize_profile_rls_initplans.sql`
38. `20270212000000_optimize_core_tenant_query_indexes.sql`
39. `20270215000000_harden_reference_relationship_contract.sql`
40. `20270217000000_index_tenant_choice_foreign_keys.sql`
41. `20270220000000_student_nis_source_idempotency.sql`
42. `20270221000000_enforce_auto_business_identifiers.sql`
43. `20270224000000_ga_business_identifier_update_guard.sql`
44. `20270225000000_restore_idempotency_for_generated_identifiers.sql`
45. `20270226000000_ppdb_onboarding_uses_tenant_nis_grade_code.sql`
46. `20270227000000_remove_redundant_document_number_index.sql`
47. `20270303000000_master_data_student_import_relationships.sql`
48. `20270304000000_student_room_assignment_reference_locks.sql`
49. `20270307000000_tenant_settings_conflict_http_409.sql`
50. `20270320000000_tahfidz_quran_surah_catalog.sql`

## Status staging VQE

Snapshot baca-saja pada staging `vqemuyzveuirlkvdggjd` dibandingkan dengan source commit `b0824476cb6d0207925283f15cb6f0d2714e54a3`:

- Ledger memuat 150 versi; source memuat 150 file.
- 140 versi dan nama cocok.
- 6 versi source belum ada pada ledger: `20270215500000_sample_class_grade_labels`, `20270309000000_academic_report_card`, `20270310000000_academic_sample_catalog`, `20270311000000_academic_sample_term`, `20270313000000_education_boarding_operational_seed`, dan `20270320000000_tahfidz_quran_surah_catalog`.
- 4 nama ledger pada versi yang sama berbeda dari nama file source: versi `20270312000000`, `20270314000000`, `20270315000000`, dan `20270316000000`.
- 6 versi ledger tidak mempunyai file source bernomor sama: tiga alias Tahfidz `20261109145507`, `20261109145522`, `20261109145534`, serta versi CBT `20270317000000`, `20270318000000`, `20270319000000`.
- Katalog staging memuat 169 tabel `public`, semuanya melaporkan RLS aktif. Health Advisor staging tidak mengembalikan temuan; Security Advisor menandai perlindungan kata sandi bocor nonaktif dan Performance Advisor memiliki temuan INFO.

Lihat juga [snapshot ledger VQE 13 November](VQE_STAGING_MIGRATION_LEDGER_DRIFT_2026-11-13.md). Snapshot Production ini tidak memperbaiki alias atau ledger staging.

## Urutan kerja yang disarankan bagi tim backend

1. **Bekukan basis sumber** pada commit `b0824476cb6d0207925283f15cb6f0d2714e54a3`; jangan menyelaraskan ledger dengan jumlah file saja.
2. **Simpan backup Production dan bukti pemulihan.** Pulihkan ke instance terisolasi dan buktikan aplikasi dapat di-boot serta schema dapat dipakai sebelum perubahan Production.
3. **Ambil schema-only dump Production** dan cocokkan tabel, kolom, constraint, index, trigger, function, policy, privilege, bucket, dan konfigurasi Auth dengan migrasi source. Jangan mengekspor row data untuk audit ini.
4. Untuk setiap 50 versi hilang, tandai satu per satu: belum diterapkan, telah diterapkan seluruhnya di luar ledger, atau diterapkan sebagian. Periksa juga tiga versi tanpa nama. Jangan membuat migration repair atau menjalankan `db push` sebelum bukti DDL dan dampak data tersedia.
5. **Rehearsal berurutan pada staging yang bersih atau salinan Production.** Rekonsiliasi ledger VQE dahulu; jangan menganggap staging saat ini cocok karena ada alias/mismatch. Jalankan preflight, replay, smoke test, lalu uji restore.
6. Siapkan batch deployment, jeda, dan prosedur rollback. Migrasi DDL yang belum diterapkan dan perubahan ledger perlu tinjauan manusia. Jalankan Production hanya setelah pemilik sistem menyetujui rencana dan backup restore terverifikasi.
7. Aktifkan perlindungan kata sandi bocor Auth, cek daftar schema yang terekspos ke Data API, dan tinjau ulang Security/Performance Advisor setelah batch.
8. Jalankan UAT login, isolasi tenant, hak per role, transaksi keuangan, dokumen/Storage, akademik, asrama, komunikasi, Tahfidz, dan alur PPDB. Catat bukti sukses/gagal per skenario.

## Kesimpulan operasional

Production **belum layak menerima `db push` otomatis** dari keadaan yang terlihat. Perbedaan 50 versi, tiga nama ledger kosong, dan temuan katalog yang cocok dengan migrasi source yang belum tercatat harus direkonsiliasi terhadap DDL aktual lebih dahulu. Dokumen ini hanya memberi bukti dan urutan kerja; tidak memberi otorisasi untuk mengubah PTSAS Production.

