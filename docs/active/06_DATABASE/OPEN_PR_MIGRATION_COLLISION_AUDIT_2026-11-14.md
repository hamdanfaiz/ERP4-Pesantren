# Audit benturan versi migrasi pada PR terbuka — 14 November 2026

## Ringkasan

Audit hanya membaca nama file migrasi pada `main`, file yang diubah tiap PR, status PR, dan ledger staging yang sudah direkap pada [rekonsiliasi Production 14 November](PTSAS_PRODUCTION_RECONCILIATION_2026-11-14.md). Tidak ada SQL dijalankan ke database, tidak ada data aplikasi dibaca, dan tidak ada perubahan skema atau data.

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
- PR #116 tetap draft; CI untuk commit terkini masih berjalan saat audit ini dibuat. UAT peran Admin/Ustadz/Santri/Wali juga belum selesai.
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
