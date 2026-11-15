# Checkpoint integrasi source dari main — 15 November 2026

## Tujuan dan batas

Catatan ini merekam rehearsal integrasi dari `main` commit `82082bf1c8fa806e420ae555ca38f0700694b9af`. Worktree berada di `sa/_tmp_integration_current_main_20261115`, pada branch review `codex/integration-current-main-20261115`. Branch tersebut sudah di-push ke GitHub untuk ditinjau tim; belum di-merge ke `main` dan tidak diterapkan ke Supabase Production maupun VQE. Commit kode terakhir pada branch ini adalah `ca07d58e`; commit setelahnya hanya memperbarui dokumen.

Rehearsal menggabungkan source head PR #115, #91, #92, #121, #112, dan #114. Stack Tahfidz #91 → #92 → #121 tetap menjadi satu rantai migrasi; enam migrasi CBT #112 berada pada `20270321000000`–`20270326000000`, indeks #92 pada `20270330000000`, dan leaderboard #121 pada `20270331000000`. Source rehearsal memiliki 161 file migrasi. Rekonsiliasi read-only lengkap terhadap ledger VQE dan PTSAS Production ada di [dokumen rekonsiliasi terpadu](../06_DATABASE/INTEGRATED_SOURCE_LEDGER_RECONCILIATION_2026-11-15.md). Snapshot advisor Production terbaru ada di [tinjauan advisor PTSAS](../06_DATABASE/PTSAS_PRODUCTION_ADVISOR_REVIEW_2026-11-15.md). Preflight sintetis lulus dengan 114 migrasi pending terhadap fixture yang digunakan skrip; angka fixture ini bukan snapshot Production.

## Koreksi integrasi yang dibuat pada worktree

- Mempertahankan copy pengguna PR #115 saat menggabungkan source dan runtime PR lain.
- Memulihkan enam route CBT tenant-scoped dari PR #112 dan mempertahankan sanitasi error yang ada.
- Menambahkan pemeriksaan ketersediaan katalog Quran pada formulir setoran Tahfidz. Surah dan batas ayat selalu memakai daftar backend Supabase; fallback katalog eksternal dan masukan teks bebas pada formulir setoran dihapus. API menyimpan label Surah kanonis dan memvalidasi ulang rentang ayat sebelum transaksi.
- Menghapus route katalog Tahfidz duplikat yang lebih lama.
- Menyatukan permukaan container Asrama dengan token tema ERP, menambahkan import ikon yang dipakai halaman Asrama, serta menghapus argumen status backend yang tidak digunakan.
- Memisahkan nama perintah npm untuk dua suite pesan pengguna agar tidak saling menimpa.
- Menghapus kolom SMTP yang memberi kesan pengiriman email sudah siap; layar Pengaturan kini menampilkan status yang jelas. Keterangan SDM diringkas agar batas fitur disampaikan dalam bahasa pengguna, tanpa istilah fase/backend.

## Pemeriksaan lokal pada worktree

Lulus:

- `npm ci` menggunakan `package-lock.json` dan cache lokal.
- `npm run lint`.
- `npm run build` untuk frontend dan server.
- `npm run test:migration-preflight`.
- `npm run test:api-route-auth-policy` — 220 route privat memerlukan autentikasi, 9 route publik eksplisit dan 3 route deny-only diizinkan.
- `npm run test:supabase-runtime-no-firebase`.
- `npm run test:supabase-quran-catalog` dan `npm run test:tahfidz-quran-catalog` — katalog 114 Surah/6.236 ayat dan formulir berbasis referensi.
- Suite CBT: pengaturan tulis, dasbor, halaman pertanyaan, roster santri, penugasan, dan daftar ujian.
- Suite pesan pengguna dan `npm run test:customer-compose-env`.
- Pemeriksaan lanjutan menemukan bahwa `test:user-messages:security` belum dijalankan oleh workflow CI. Workflow kini menjalankan suite tersebut; `npm run test:ci-coverage` lulus untuk semua 75 skrip tes paket dan `npm run test:user-messages:security` lulus dengan 14 skenario.
- `npm run test:customer-deployment-flags` lulus setelah ekspektasi CRM diselaraskan dengan pesan aktual dan layar email/SDM diperbaiki. `npm run lint` dan `npm run build` juga lulus ulang setelah perubahan UI ini.
- GitHub Actions run [#1762](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43664004230) lulus **3/3 job** pada commit `ca07d58e`: frontend build/runtime guard, migrasi/API/Auth/pgTAP pada Supabase lokal terisolasi, dan instalasi paket untuk environment pelanggan. Job database mencakup replay baseline historis sintetis, suite database, API/tenant, Storage, Dokumen Digital, dan backup-restore lokal. Ini bukan pemeriksaan atau restore Production.
- Run branch review [#1763](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43669187408) lulus **3/3 job** pada commit `4595ad1`, termasuk job database/migrasi/API/pgTAP. Commit ini hanya memperbarui dokumentasi terhadap source code yang sudah lulus pada #1762.

Build masih mengeluarkan peringatan chunk `react-pdf` sekitar 1,46 MB dan komentar anotasi Zod yang tidak dapat ditafsirkan Rollup. Build selesai dengan kode keluar 0.

## Gerbang yang belum lulus atau belum dibuktikan

- `supabase` CLI dan Docker tidak tersedia lokal, sehingga replay emulator tidak bisa dijalankan di PC ini. GitHub Actions run #1762 telah menjalankan lingkungan Supabase lokal terisolasi dan seluruh job lulus.
- Run #1761 gagal pada pemeriksaan copy sebelum koreksi; seluruh koreksi sudah masuk commit `ca07d58e`, lalu run #1762 lulus. Run gabungan #1752 sebelumnya hanya mencakup stack #91 → #92 → #121, bukan #112/#114/#115.
- UAT browser gabungan pada akun Admin/Ustadz/Santri/Wali, seluruh modul, perangkat ponsel, dan jalur simpan-baca tetap diperlukan.
- Rekonsiliasi DDL Production, keputusan urutan migrasi terhadap ledger aktual, serta bukti backup dan restore Production adalah pekerjaan tim backend. Tidak ada migration push atau perubahan database yang dilakukan di checkpoint ini.
- PR yang menjadi sumber perubahan tetap perlu review backend sebelum merge.

## Rekonsiliasi metadata migrasi VQE staging — 15 November 2026

Pemeriksaan baca-saja Supabase MCP pada project staging `vqemuyzveuirlkvdggjd` menemukan 150 entri migration ledger. Branch source berisi 161 file migrasi. Perbandingan nama dan versi menemukan 140 pasangan yang cocok persis, 10 nama migrasi yang tercatat di VQE pada versi berbeda, dan 11 nama source yang tidak ada di ledger VQE. Ini hanya membandingkan metadata; belum membuktikan DDL aktual atau kesetaraan SQL.

Sepuluh nama yang versinya berbeda:

| File source branch | Versi/nama yang tercatat di VQE |
| --- | --- |
| `20270320000000_tahfidz_quran_surah_catalog` | `20261109145507_tahfidz_quran_surah_catalog` |
| `20270321000000_cbt_tenant_settings_write_api` | `20270314000000_cbt_tenant_settings_write_api` |
| `20270322000000_cbt_admin_dashboard_summary` | `20270315000000_cbt_admin_dashboard_summary` |
| `20270323000000_cbt_admin_question_keyset_pages` | `20270316000000_cbt_admin_question_keyset_pages` |
| `20270324000000_cbt_admin_student_roster_pages` | `20270317000000_cbt_admin_student_roster_pages` |
| `20270325000000_cbt_admin_assignment_pages` | `20270318000000_cbt_admin_assignment_pages` |
| `20270326000000_cbt_admin_exam_pages` | `20270319000000_cbt_admin_exam_pages` |
| `20270327000000_tahfidz_persisted_leaderboard` | `20261109145522_tahfidz_persisted_leaderboard` |
| `20270328000000_tahfidz_bulk_daily_target_write_api` | `20261109145534_tahfidz_bulk_daily_target_write_api` |
| `20270329000000_tahfidz_target_decimal_precision` | `20270312000000_tahfidz_target_decimal_precision` |

Sebelas nama source yang belum tercatat di VQE:

`20270215500000_sample_class_grade_labels`, `20270309000000_academic_report_card`, `20270310000000_academic_sample_catalog`, `20270311000000_academic_sample_term`, `20270312000000_sample_nis_grade_codes`, `20270313000000_education_boarding_operational_seed`, `20270314000000_education_boarding_operational_fill`, `20270315000000_lms_dashboard_operational_fill`, `20270316000000_communication_ops_runtime`, `20270330000000_add_core_composite_fk_indexes`, dan `20270331000000_tahfidz_active_days_leaderboard`.

Ada empat benturan versi dengan nama berbeda antara source dan ledger VQE: versi `20270312000000` adalah `sample_nis_grade_codes` di source tetapi `tahfidz_target_decimal_precision` di VQE; versi `20270314000000` adalah `education_boarding_operational_fill` vs `cbt_tenant_settings_write_api`; versi `20270315000000` adalah `lms_dashboard_operational_fill` vs `cbt_admin_dashboard_summary`; dan versi `20270316000000` adalah `communication_ops_runtime` vs `cbt_admin_question_keyset_pages`. Nama saja tidak membuktikan bahwa dua file berisi SQL yang setara.

Beberapa file source yang belum tercatat melakukan `UPDATE` atau `INSERT` pada referensi kelas, pengaturan/semester akademik, penempatan asrama, identitas NIS, atau aktivitas LMS; file lain menambah tabel, indeks, dan RPC. Karena itu jangan menjalankan `db push` atau `migration repair` otomatis. Tim backend perlu membandingkan isi SQL dan DDL objek aktual VQE untuk setiap pasangan/versi tersebut, menentukan migrasi forward-only yang diperlukan, lalu menguji pada staging. Production tidak diperiksa atau diubah dalam langkah ini.

Pemeriksaan katalog baca-saja atas 37 objek utama yang dideklarasikan oleh migrasi Akademik, Komunikasi, indeks FK, dan leaderboard Tahfidz menemukan 36 objek belum ada di VQE. RPC leaderboard lama memang ada, tetapi definisinya tidak memuat ranking `ziyadah_active_days` dan respons `ziyadahActiveDays` dari source terbaru. Ini mengonfirmasi bahwa staging belum menyamai sebagian DDL source; hasilnya hanya berlaku untuk objek yang diperiksa, bukan diff DDL lengkap.

## Status PR lama dan jalur integrasi

GitHub menunjukkan PR #1–#11 berstatus closed dan `merged=false`. Ini disengaja: deskripsi PR #13 yang sudah merged secara eksplisit menyatakan #1–#11 ditutup sebagai *superseded*, bukan digabung satu per satu. PR #12 dan #13 serta PR #38–#40, #101, dan #106 berstatus merged. PR lama #1–#11 tidak perlu dibuka kembali atau digabung terpisah; hal itu berisiko membawa ulang migrasi dan implementasi lama.

Enam PR source yang masih open saat audit adalah #91, #92, #112, #114, #115, dan #121. Branch review integrasi pada tautan di bawah menggabungkan head enam PR itu untuk ditinjau sebagai satu kandidat; branch tersebut belum di-merge ke `main`. CI #1762 dan #1763 lulus 3/3 pada source terakhir sebelum audit dokumentasi ini.

## Langkah lanjut yang aman

1. Branch review gabungan sudah tersedia untuk tim backend di [GitHub](https://github.com/hamdanfaiz/ERP4-Pesantren/tree/codex/integration-current-main-20261115); CI #1763 lulus 3/3.
2. Tim backend meninjau rekonsiliasi VQE di atas sebelum menerapkan migrasi apa pun; migrasi belum disinkronkan ke staging.
3. Setelah staging dan flag modul siap, jalankan UAT browser untuk role/modul yang diaktifkan dan alur simpan-baca.
4. Tim backend menyelesaikan pemeriksaan DDL, backup, restore, dan urutan rilis Production sebelum menyetujui deploy.

## Checkpoint source lokal

Head integrasi awal sebelum perbaikan UI/copy dan cakupan CI: `b5c7e8c` (`docs: record current main integration checkpoint`). Source code terakhir yang diverifikasi pada branch review: `ca07d58e` (Actions #1762 lulus 3/3); pembaruan setelahnya hanya dokumentasi. Ini bukan merge ke `main` atau status merge PR sumber.

