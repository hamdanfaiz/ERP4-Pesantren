# Rekonsiliasi ledger migrasi VQE — 20 November 2026

## Ringkasan

Snapshot baca-saja ini membandingkan ledger Supabase staging VQE dengan file migration pada source `main` setelah PR #130 merged.

- Project staging: `vqemuyzveuirlkvdggjd`.
- Commit `main`: `3ca67fc0e0adfa0b71f98c8b31a0ccca85f981b6`.
- Ledger VQE: **150 versi**, terakhir `20270319000000` (`cbt_admin_exam_pages`).
- Source `main`: **162 file**, terakhir `20270401000000_tahfidz_monthly_leaderboard.sql`.
- Tidak ada record aplikasi yang dibaca. Tidak ada migration, repair, atau perubahan database yang dijalankan.
- PTSAS Production (`ptsasgdvgrbdtgyqieie`) tidak diperiksa atau diubah dalam snapshot ini.

Perbedaan versi bukan bukti DDL hilang atau identik. Jangan jalankan `db push`, `migration repair`, atau SQL manual pada ledger sebelum lineage dan efek SQL tiap versi dibuktikan.

## Source yang belum tercatat dengan versi yang sama di VQE

| Versi source | File migration |
| --- | --- |
| `20270215500000` | `sample_class_grade_labels` |
| `20270309000000` | `academic_report_card` |
| `20270310000000` | `academic_sample_catalog` |
| `20270311000000` | `academic_sample_term` |
| `20270313000000` | `education_boarding_operational_seed` |
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

## Versi VQE yang tidak memiliki file source dengan nomor sama

| Versi VQE | Nama ledger | Kandidat source terkait berdasarkan nama saja |
| --- | --- | --- |
| `20261109145507` | `tahfidz_quran_surah_catalog` | `20270320000000_tahfidz_quran_surah_catalog` |
| `20261109145522` | `tahfidz_persisted_leaderboard` | `20270327000000_tahfidz_persisted_leaderboard` |
| `20261109145534` | `tahfidz_bulk_daily_target_write_api` | `20270328000000_tahfidz_bulk_daily_target_write_api` |
| `20270317000000` | `cbt_admin_student_roster_pages` | `20270324000000_cbt_admin_student_roster_pages` |
| `20270318000000` | `cbt_admin_assignment_pages` | `20270325000000_cbt_admin_assignment_pages` |
| `20270319000000` | `cbt_admin_exam_pages` | `20270326000000_cbt_admin_exam_pages` |

Nama serupa belum membuktikan SQL file dan objek yang live setara. Minta source/commit asal dan bandingkan fungsi, indeks, grants, policy, constraint, serta efek data yang relevan.

## Nomor versi yang memiliki nama berbeda

| Versi | Nama pada ledger VQE | File source bernomor sama |
| --- | --- | --- |
| `20270312000000` | `tahfidz_target_decimal_precision` | `sample_nis_grade_codes` |
| `20270314000000` | `cbt_tenant_settings_write_api` | `education_boarding_operational_fill` |
| `20270315000000` | `cbt_admin_dashboard_summary` | `lms_dashboard_operational_fill` |
| `20270316000000` | `cbt_admin_question_keyset_pages` | `communication_ops_runtime` |

Karena Supabase CLI melacak versi timestamp, bukan kesetaraan SQL, filename yang memakai timestamp yang sama dapat membuat migrasi source terlewati oleh `db push`. Jangan menganggap nama ledger yang berbeda sebagai alias yang aman sebelum memverifikasi provenance dan DDL.

## Status dry-run dan hambatan

URL di `.env` telah lolos pemeriksaan struktur dan menunjuk ref VQE serta Session Pooler. Dry-run CLI belum mencapai database: `npx` gagal mengambil paket `supabase` dari `registry.npmjs.org` dengan `ENOTFOUND`. Tidak ada perubahan pada staging. Dry-run saat tersedia hanya memetakan versi yang menurut CLI belum tercatat; ia tidak membuktikan SQL dari versi alias telah menghasilkan DDL yang sama.

## Urutan tindakan tim backend

1. Sediakan Supabase CLI versi yang dipatok secara lokal atau pulihkan akses jaringan paket; jangan menyalin secret/password ke command history atau laporan.
2. Jalankan `db push --dry-run` terhadap VQE saja, simpan output yang sudah disanitasi, dan jangan menghapus `--dry-run`.
3. Telusuri asal dan hash isi SQL migrasi Tahfidz/CBT yang memakai alias atau timestamp bertabrakan. Cocokkan dengan katalog DDL VQE—fungsi, indeks, constraint, grants, policy, dan efek data—sebelum mengubah history.
4. Tinjau lima migrasi akademik/operasional yang tertinggal untuk memastikan seed/katalog yang dibuat memang dikehendaki pada staging.
5. Rehearse perubahan pada database disposable dan buktikan backup/restore sebelum menerapkan perubahan staging.
6. Setelah staging konsisten, lakukan rekonsiliasi PTSAS Production secara mandiri. Ledger VQE bukan baseline Production dan tidak memberi persetujuan untuk `db push` Production.

