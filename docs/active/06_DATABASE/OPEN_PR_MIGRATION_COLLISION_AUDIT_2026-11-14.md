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
| #112 | 20270321000000–20270326000000: seluruh rangkaian CBT admin | Versi awal sempat bertabrakan dengan #116; fungsi CBT juga bersinggungan dengan #96–#102 | **Nomor benturan dengan #116 telah diselesaikan di branch:** pertahankan CBT pada 21–26. Perbandingan langsung membuktikan keenam file SQL migrasi dan keenam suite pgTAP dari #96–#100/#102 identik setelah normalisasi line ending; jangan gabungkan stack itu sebagai migrasi kedua. Ledger VQE 17–19 tetap perlu pemetaan alias ke source/DDL. |
| #116 | `20270327000000` `tahfidz_monthly_leaderboard` (branch sekarang) | Nomor awal `20270321000000` berbenturan dengan #112; sudah dipindahkan ke 27 setelah urutan CBT | Urutan source bebas benturan terhadap #112. Tetap jalankan preflight/CI; jangan terapkan ke database sebelum ledger dan objek target direkonsiliasi. |

## Status kerja yang terverifikasi

- `main` saat audit memuat 150 file migrasi source; `main` memiliki migrasi 20270309000000–20270316000000 dengan nama seperti pada tabel.
- VQE staging memiliki catatan ledger versi 20270317000000–20270319000000 yang tidak ada di source `main` saat dibandingkan, sesuai laporan rekonsiliasi. Ini dapat mencerminkan migrasi dari jalur PR lama; perlu inspeksi DDL staging dan ledger sebelum mengubah nama atau isi file.
- PR #114 (katalog Quran/tab Tahfidz) dan #115 (pesan UI) tidak menambahkan migrasi. UAT Admin VQE sudah mengonfirmasi 10 tab, scrollbar horizontal, 114 surah, serta rentang ayat terikat pada katalog; tenant uji tidak memiliki santri sehingga simpan-baca setoran dan UAT ponsel belum terbukti.
- PR #112 kini memuat merge commit ke `main` terbaru dan penanganan diagnostik impor yang ramah pengguna. Ketiga job CI lulus pada head `c6aee56e2639a1c6154b668e0cf4b41b884ed2ef`. PR terbuka dan mergeable menurut metadata GitHub; tinjauan overlap CBT dengan #96–#102 masih diperlukan sebelum memutuskan merge/penutupan stack.
- Pemeriksaan source pada 14 November membandingkan enam pasangan migrasi `20270314000000`–`20270319000000` di PR #96–#100/#102 dengan `20270321000000`–`20270326000000` di #112. Seluruh pasangan SQL dan file pgTAP-nya sama setelah normalisasi line ending. Ini membuktikan migrasi/test terport ke #112, tetapi bukan kesetaraan semua perubahan UI/TypeScript. Pertahankan PR anak sampai #112 ditinjau/merged; setelahnya, tutup sebagai superseded bila tidak ada perubahan unik.
- PR #116 tetap draft. Migrasi leaderboard telah dipindahkan ke `20270327000000`; semua 3 job CI lulus pada head `5c68c95e0a6e5fe5bec85090b88fdf0ee6fd94af`. UAT role, perhitungan leaderboard live pada roster sintetis, serta keadaan tanpa catatan belum selesai.
- PR #118 (dokumen kesiapan) sudah digabung ke `main` pada 14 November 2026. Penggabungan ini hanya mengubah dokumentasi.

## Urutan aman untuk tim backend

1. Tetapkan satu source `main` sebagai dasar; kumpulkan SQL semua PR terbuka yang membawa migrasi dan ledger VQE.
2. Buat peta **versi → nama → checksum SQL → objek DDL**. Nomor yang sama dengan SQL berbeda adalah benturan, bukan alias yang aman.
3. Tentukan SQL kanonis yang belum ada di source. Jangan menghapus ledger atau menjalankan ulang DDL hanya untuk membuat versi tampak cocok.
4. Buat versi migrasi baru yang monoton dan tidak dipakai source maupun ledger, lalu perbarui preflight, pgTAP, checkpoint, dan semua cabang turunannya.
5. Rebase/susun ulang PR bertingkat setelah parent beres. Tinjau konflik kode dan hapus implementasi duplikat yang sudah masuk `main`.
6. Jalankan CI penuh dan rehearsal pada staging yang DDL-nya telah diperiksa. Untuk Production, lakukan langkah rilis hanya setelah backend menyelesaikan perbandingan DDL, backup, dan restore.

## Batas kesimpulan

Benturan versi membuktikan urutan PR/migrasi perlu diperbaiki; ini tidak dengan sendirinya membuktikan tabel atau fitur tertentu rusak. Benturan langsung #112/#116 sudah dihilangkan pada source melalui urutan #112 21–26 lalu #116 27. Audit ini tidak membaca baris data, tidak membuktikan backup/restore Production, tidak memvalidasi seluruh alur modul, dan tidak menerapkan perubahan database.


## PR #1–#11 yang ditutup

Pemeriksaan REST GitHub pada 14 November 2026 menunjukkan PR #1 sampai #11 berstatus **closed, not merged**. PR #13, “Supabase-only runtime cutover and customer-managed baseline”, kemudian digabung pada 30 Oktober 2026 dengan cakupan sangat luas (460 file). Jadi PR #1–#11 tidak boleh dianggap merged hanya karena ditutup, tetapi juga jangan dibuka atau digabung ulang sebagai satu rangkaian lama.

Source `main` saat ini menggunakan migrasi bernomor dan bernama lebih baru untuk banyak area fondasi tersebut (misalnya `tenant_profile_foundation`, `public_ppdb_runtime`, `ppdb_admin_workflows`, `master_data_onboarding`, dan `finance_runtime`). Sejumlah file dari PR awal memakai nomor 20260604–20260618 yang tidak lagi ada pada daftar source `main`. Ini mendukung bahwa cutover berikutnya telah mengganti atau menyerap sebagian besar jalur lama, tetapi **tidak membuktikan satu per satu seluruh logic unik PR #1–#11**.

Tindakan yang aman: pertahankan PR lama dalam keadaan tertutup; inventarisasi perubahan unik setiap PR lama terhadap source `main` dan PR #13, lalu port hanya logic yang benar-benar hilang ke PR baru dengan migrasi bernomor kanonis. Jangan menggabungkan branch lama atau menjalankan migrasinya tanpa review checksum/DDL dan pemeriksaan relasi ledger terlebih dahulu.
