# Checkpoint 6 November 2026 — PR #38–#40 dan migrasi staging

## Status pull request

- PR #38 (`0bc56b435aaf8d25a138bc28ef4d36d85d75f57b`) dan PR #39 (`28cbb95c3f42bef5e6483055be738924ce893059`) masih Draft/Open.
- PR #40 (`8d54f689b9b781f80028cbc9dc0e101bb3d3696b`) masih Draft/Open dan menjadi branch konsolidasi untuk peninjauan.
- Perbandingan GitHub membuktikan head PR #40 berada di depan head PR #38 dan #39 tanpa commit tertinggal dari keduanya (`behind_by: 0`). Karena itu perubahan #38 dan #39 sudah terkandung dalam riwayat source #40, bukan diabaikan.
- PR #38 dan #39 belum digabung ke `main`; keduanya tetap terbuka sampai PR konsolidasi diterima dan digabung. Status Draft/Open tidak sama dengan merged.

## Bukti pemeriksaan source

- Commit `8d54f689b9b781f80028cbc9dc0e101bb3d3696b` memperbaiki impor santri agar `grade_level_reference_id` tenant disimpan bersama label jenjang. Sebelumnya validasi menemukan ID referensi tetapi fungsi penyimpanan tidak menuliskannya.
- Tes pgTAP `master_data_student_import_relationships.test.sql` kini memiliki 22 assertion, termasuk pemeriksaan ID referensi yang tersimpan pada santri hasil impor.
- GitHub Actions run [#1156](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42166727627) lulus 3/3 job: pemasangan NPM untuk lingkungan pelanggan; build, tipe, guard runtime Firebase, dan smoke Docker; serta rehearsal migration, pgTAP, API/tenant, race NIS/Tahfidz, Storage, dan backup/restore pada Supabase lokal terisolasi.
- CI tidak menjalankan migrasi pada VQE atau Production dan tidak menggantikan UAT live.

## Status database

- Source repository memiliki 135 file migrasi. Ledger VQE `vqemuyzveuirlkvdggjd` memiliki 134 versi dan berakhir pada `20270302000000_academic_class_reference_pagination`.
- Migrasi source `20270303000000_master_data_student_import_relationships` adalah migrasi berikutnya yang menunggu penerapan ke VQE.
- File `.env` staging yang ditentukan berada di `erp4-pr40-uat-20261104/.env`. Pemeriksaan konfigurasi hanya memastikan `SUPABASE_PROJECT_REF` menunjuk ke VQE; `SUPABASE_DB_POOLER_URL` dan `SUPABASE_DB_URL` belum tersedia di file tersebut.
- Tidak ada migrasi yang diterapkan ke VQE pada checkpoint ini. Production PTSAS `ptsasgdvgrbdtgyqieie` tidak disentuh.

## Langkah berikutnya

1. Tambahkan URL Session Pooler khusus VQE ke variabel `SUPABASE_DB_POOLER_URL` di `.env` staging. Jangan menyalin nilai dari file `.env` dengan project ref berbeda dan jangan mengirim nilai kredensial lewat chat.
2. Jalankan preflight, periksa target VQE, kemudian `supabase db push --dry-run`. Hentikan bila target atau rencana DDL tidak sesuai.
3. Terapkan migrasi yang tertunda ke VQE saja; verifikasi ledger, fungsi, hak akses, dan relasi jenjang hasil impor.
4. Selesaikan UAT live dengan data sintetis untuk role/tenant, impor-ekspor, PPDB/NIS, Akademik, Tahfidz, Finance, Storage, dan tampilan responsif.
5. Rekonsiliasi schema dan ledger Production secara terpisah sebelum mempertimbangkan cutover. Merge dan deploy hosting tetap menunggu review backend serta gerbang staging.

