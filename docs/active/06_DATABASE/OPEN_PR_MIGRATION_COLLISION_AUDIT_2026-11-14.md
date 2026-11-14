# Audit benturan versi migrasi pada PR terbuka — 14 November 2026

## Ringkasan

Audit hanya membaca nama file migrasi pada `main`, file yang diubah tiap PR, status PR, dan ledger staging yang sudah direkap pada [rekonsiliasi Production 14 November](PTSAS_PRODUCTION_RECONCILIATION_2026-11-14.md). Tidak ada SQL dijalankan ke database, tidak ada data aplikasi dibaca, dan tidak ada perubahan skema atau data.

## Tindak lanjut lokal PR #91 — 14 November 2026

Dalam rekonsiliasi lokal PR #91 terhadap `main`, versi bentrok diselesaikan tanpa mengubah database:

| Fitur | Source kanonis lokal | Catatan lineage |
| --- | --- | --- |
| Katalog Surah Tahfidz | `20270320000000_tahfidz_quran_surah_catalog.sql` | Menggunakan migrasi kanonis yang sudah ada di `main`; SQL lama staging tetap diverifikasi lewat fingerprint historis. |
| Leaderboard Tahfidz | `20270327000000_tahfidz_persisted_leaderboard.sql` | Dipisahkan dari versi Akademik `20270310000000`; alias ledger VQE lama tetap menunggu rekonsiliasi. |
| Target Tahfidz massal | `20270328000000_tahfidz_bulk_daily_target_write_api.sql` | Dipisahkan dari versi Akademik `20270311000000`; alias ledger VQE lama tetap menunggu rekonsiliasi. |
| Presisi target Tahfidz | `20270329000000_tahfidz_target_decimal_precision.sql` | Dipisahkan dari kode NIS Akademik `20270312000000`; migrasi ini belum tercatat pada snapshot ledger VQE. |

Tiga versi baru dipilih setelah rentang benturan yang tercatat untuk PR terbuka #92, #96–#102, #112, dan #116. Periksa ulang branch dan ledger staging sebelum promosi karena PR terbuka dapat berubah. File Quran lama dipindahkan dari direktori migrasi aktif ke fixture uji; migrasi source aktif tetap satu per versi.

Preflight tetap **menghentikan** penerapan sampai alias lama VQE (`20261109145507`, `20261109145522`, `20261109145534`) direkonsiliasi secara terkontrol. Fingerprint Quran membuktikan kecocokan dengan SQL lama yang tercatat, tetapi tidak menjalankan migration repair. Production PTSAS dan VQE tidak diubah pada tindak lanjut ini.

Ditemukan beberapa PR bertumpuk yang tidak aman digabung berurutan tanpa rekonsiliasi versi:

| PR / cabang kerja | Versi di PR | Migrasi berbeda yang sudah ada di `main` | Tindakan sebelum penggabungan |
| --- | --- | --- | --- |
| #91 | 20270309000000–20270312000000: Quran, leaderboard, target Tahfidz | 20270309000000 `academic_report_card`; 20270310000000 `academic_sample_catalog`; 20270311000000 `academic_sample_term`; 20270312000000 `sample_nis_grade_codes` | Jangan gabungkan branch besar ini apa adanya. Pilah perubahan yang belum ada di `main`; beri versi baru untuk migrasi unik yang benar-benar diperlukan. |
| #92 (berbasis #91) | 20270313000000 `add_core_composite_fk_indexes` | 20270313000000 `education_boarding_operational_seed` | Ganti versi migrasi indeks setelah memastikan versi baru tidak dipakai source maupun ledger VQE. |
| #96 | 20270314000000 `cbt_tenant_settings_write_api` | 20270314000000 `education_boarding_operational_fill` | Rekonsiliasi/memversi ulang sebelum dipindahkan ke jalur utama. |
| #97 | 20270315000000 `cbt_admin_dashboard_summary` | 20270315000000 `lms_dashboard_operational_fill` | Rekonsiliasi/memversi ulang sebelum dipindahkan ke jalur utama. |
| #98 | 20270316000000 `cbt_admin_question_keyset_pages` | 20270316000000 `communication_ops_runtime` | Rekonsiliasi/memversi ulang sebelum dipindahkan ke jalur utama. |
| #99, #100, #102 | 20270317000000–20270319000000: CBT roster, assignment, ujian | Tidak ada file dengan versi tersebut pada source `main` yang diperiksa; ledger VQE memiliki versi 17–19 tanpa file source yang cocok | Bandingkan DDL staging dan ledger dengan source sebelum memberi versi kanonis. Jangan menjalankan `db push` untuk “mengejar” ledger. |
| #112 | 20270321000000–20270326000000: seluruh rangkaian CBT admin | 20270321000000 bertabrakan dengan migrasi leaderboard Tahfidz di PR #116; beberapa fungsinya juga hadir pada PR #96–#102 | Tetapkan satu rangkaian CBT kanonis dan urutan versi yang bebas benturan; hindari menggabungkan dua jalur yang memuat implementasi tumpang tindih. |
| #116 | 20270321000000 `tahfidz_monthly_leaderboard` | Bertabrakan dengan 20270321000000 `cbt_tenant_settings_write_api` di PR #112 | Pilih versi akhir setelah rencana urutan CBT/Tahfidz disepakati; tes preflight dan dokumentasi harus diperbarui. |

## Status kerja yang terverifikasi

- `main` saat audit memuat 150 file migrasi source; `main` memiliki migrasi 20270309000000–20270316000000 dengan nama seperti pada tabel.
- VQE staging memiliki catatan ledger versi 20270317000000–20270319000000 yang tidak ada di source `main` saat dibandingkan, sesuai laporan rekonsiliasi. Ini dapat mencerminkan migrasi dari jalur PR lama; perlu inspeksi DDL staging dan ledger sebelum mengubah nama atau isi file.
- PR #114 (katalog Quran/tab Tahfidz) dan #115 (pesan UI) tidak menambahkan migrasi. CI hijau, tetapi catatan PR menyatakan UAT visual/browser masih belum dikonfirmasi.
- PR #116 tetap draft; CI pada head `6495bd00203ad4ca667069946e492b84d58e1612` sudah lulus pada run [#1653](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43501516746). UAT peran Admin/Ustadz/Santri/Wali juga belum selesai.
- PR #118 (dokumen kesiapan) sudah digabung ke `main` pada 14 November 2026. Penggabungan ini hanya mengubah dokumentasi.

## Urutan aman untuk tim backend

1. Tetapkan satu source `main` sebagai dasar; kumpulkan SQL semua PR terbuka yang membawa migrasi dan ledger VQE.
2. Buat peta **versi → nama → checksum SQL → objek DDL**. Nomor yang sama dengan SQL berbeda adalah benturan, bukan alias yang aman.
3. Tentukan SQL kanonis yang belum ada di source. Jangan menghapus ledger atau menjalankan ulang DDL hanya untuk membuat versi tampak cocok.
4. Buat versi migrasi baru yang monoton dan tidak dipakai source maupun ledger, lalu perbarui preflight, pgTAP, checkpoint, dan semua cabang turunannya.
5. Rebase/susun ulang PR bertingkat setelah parent beres. Tinjau konflik kode dan hapus implementasi duplikat yang sudah masuk `main`.
6. Jalankan CI penuh dan rehearsal pada staging yang DDL-nya telah diperiksa. Untuk Production, lakukan langkah rilis hanya setelah backend menyelesaikan perbandingan DDL, backup, dan restore.

## Batas kesimpulan

Benturan versi membuktikan urutan PR/migrasi perlu diperbaiki; ini tidak dengan sendirinya membuktikan tabel atau fitur tertentu rusak. Audit ini tidak membaca baris data, tidak membuktikan backup/restore Production, tidak memvalidasi seluruh alur modul, dan tidak menerapkan perubahan database.


## PR #1–#11 yang ditutup

Pemeriksaan REST GitHub pada 14 November 2026 menunjukkan PR #1 sampai #11 berstatus **closed, not merged**. PR #13, “Supabase-only runtime cutover and customer-managed baseline”, kemudian digabung pada 30 Oktober 2026 dengan cakupan sangat luas (460 file). Jadi PR #1–#11 tidak boleh dianggap merged hanya karena ditutup, tetapi juga jangan dibuka atau digabung ulang sebagai satu rangkaian lama.

Source `main` saat ini menggunakan migrasi bernomor dan bernama lebih baru untuk banyak area fondasi tersebut (misalnya `tenant_profile_foundation`, `public_ppdb_runtime`, `ppdb_admin_workflows`, `master_data_onboarding`, dan `finance_runtime`). Sejumlah file dari PR awal memakai nomor 20260604–20260618 yang tidak lagi ada pada daftar source `main`. Ini mendukung bahwa cutover berikutnya telah mengganti atau menyerap sebagian besar jalur lama, tetapi **tidak membuktikan satu per satu seluruh logic unik PR #1–#11**.

Tindakan yang aman: pertahankan PR lama dalam keadaan tertutup; inventarisasi perubahan unik setiap PR lama terhadap source `main` dan PR #13, lalu port hanya logic yang benar-benar hilang ke PR baru dengan migrasi bernomor kanonis. Jangan menggabungkan branch lama atau menjalankan migrasinya tanpa review checksum/DDL dan pemeriksaan relasi ledger terlebih dahulu.
