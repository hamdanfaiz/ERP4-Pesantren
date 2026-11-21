# Tinjauan Supabase Advisors — 22 November 2026

**Waktu snapshot:** 22 November 2026, sekitar 01.57 WIB (21 November 2026 18.57 UTC)  
**Source yang dibandingkan:** main, commit ec6783373a7d4d448ae854a98acca837985d1962  
**Target:** VQE staging vqemuyzveuirlkvdggjd dan PTSAS Production ptsasgdvgrbdtgyqieie

## Batas pemeriksaan

Advisors Supabase dibaca secara baca-saja untuk kategori keamanan dan performa. Pemeriksaan ini tidak membaca baris data aplikasi, mengubah SQL/DDL, ledger migrasi, konfigurasi Auth, Storage, atau data. Hasil advisor adalah sinyal untuk ditinjau, bukan bukti bahwa setiap temuan adalah celah atau bahwa perubahan tertentu aman diterapkan.

Status migrasi Production dibahas terpisah dalam [rekonsiliasi ledger 22 November](ENVIRONMENT_MIGRATION_PARITY_2026-11-22.md). Perbedaan ledger tidak boleh diperbaiki dengan menjalankan semua migrasi yang hilang sekaligus.

## Ringkasan temuan

| Proyek | Advisor | Jumlah | Prioritas |
| --- | --- | ---: | --- |
| VQE staging | RLS aktif tanpa policy | 176 (INFO) | Verifikasi grant dan jalur API; jangan menambah policy massal |
| VQE staging | Perlindungan kata sandi bocor nonaktif | 1 (WARN) | Aktifkan pada pengaturan Auth setelah konfirmasi pemilik |
| VQE staging | Foreign key tanpa indeks penutup | 262 (INFO) | Audit dan prioritaskan berdasarkan jalur query dan penghapusan |
| VQE staging | Inisialisasi fungsi RLS per baris | 1 (WARN) | Tinjau policy/profil query; konfirmasi apakah advisor masih relevan |
| VQE staging | Indeks belum terpakai | 98 (INFO) | Jangan hapus tanpa data beban kerja |
| PTSAS Production | RLS aktif tanpa policy | 157 (INFO) | Verifikasi grant dan jalur API; pola ini dapat sengaja fail-closed |
| PTSAS Production | search_path fungsi dapat berubah | 1 (WARN) | Tinjau fungsi PPDB dan migration hardening sumber |
| PTSAS Production | Fungsi SECURITY DEFINER dapat dipanggil authenticated | 4 (WARN) | Tinjau eksposur RPC dan fungsi helper sebelum promosi |
| PTSAS Production | Perlindungan kata sandi bocor nonaktif | 1 (WARN) | Pengaturan Auth yang harus diubah pemilik proyek |
| PTSAS Production | Foreign key tanpa indeks penutup | 269 (INFO) | Audit prioritas skala; jangan membuat ratusan indeks secara membabi buta |
| PTSAS Production | Inisialisasi fungsi RLS per baris | 2 (WARN) | Tinjau policy profil |
| PTSAS Production | Indeks belum terpakai | 89 (INFO) | Tunggu bukti workload sebelum menghapus |
| PTSAS Production | Indeks duplikat | 1 (WARN) | Periksa definisi, constraint, dan migration sebelum menghapus |

## Rincian dan cara menindaklanjuti

### Keamanan

1. **RLS aktif tanpa policy (INFO).** Ditemukan pada 176 tabel VQE dan 157 tabel Production. RLS tanpa policy biasanya menolak akses baris melalui policy, sehingga bukan alasan untuk membuka akses. Namun, tetap verifikasi GRANT, fungsi SECURITY DEFINER, endpoint server, dan akses Storage secara terpisah. Jangan membuat policy generik hanya untuk menghilangkan notifikasi.

2. **Kata sandi bocor (WARN).** Perlindungan pemeriksaan kata sandi terhadap daftar kredensial yang diketahui bocor nonaktif pada kedua proyek. Ini pengaturan Supabase Auth, bukan migrasi source. Pemilik proyek perlu mengaktifkannya pada pengaturan keamanan kata sandi Auth untuk masing-masing proyek, lalu menguji alur pendaftaran, perubahan kata sandi, dan reset pada staging.

3. **Fungsi Production.** Advisor menandai public.erp4_ppdb_update_updated_at_column karena search_path yang dapat berubah. Empat RPC helper (current_app_role, current_tenant_id, has_module_access, is_tenant_admin) dapat dipanggil role authenticated sebagai fungsi SECURITY DEFINER. Ini tidak otomatis membuktikan eksploitasi, tetapi harus ditinjau dari sisi schema, search_path, grant EXECUTE, pemeriksaan aktor, dan data yang dikembalikan.

   Source memiliki migrasi hardening 20270209000000_harden_ppdb_trigger_search_path dan 20270210000000_internalize_tenant_rls_helpers; keduanya belum tercatat pada ledger Production dalam snapshot 22 November. Keberadaan file source bukan bukti bahwa DDL Production cocok atau aman untuk langsung dijalankan. Backend owner harus membandingkan definisi fungsi aktual dan semua pemanggil sebelum menyusun perubahan.

### Performa dan skala

4. **Foreign key tanpa indeks penutup.** Advisor menemukan 262 di VQE dan 269 di Production. Prioritaskan relasi yang dipakai untuk filter tenant, daftar modul bervolume tinggi, join, serta penghapusan/pembaruan parent. Periksa apakah indeks komposit yang sudah ada benar-benar menutup kolom FK; jangan membuat semua rekomendasi secara massal karena indeks menambah biaya tulis dan penyimpanan.

5. **Inisialisasi fungsi RLS.** Production menandai policy user_profiles_select_own dan profiles_select_self_or_tenant_admin; source punya 20270211000000_optimize_profile_rls_initplans, yang belum tercatat pada ledger Production. VQE menandai tahfidz_student_ayah_progress_owner_all; source terbaru membungkus pembacaan setting tenant dengan scalar subquery. Karena advisory masih muncul setelah ledger VQE cocok dengan source, periksa definisi policy aktual dan rencana query staging sebelum mengubahnya; temuan dapat memerlukan analisis tambahan.

6. **Indeks tak terpakai.** Angka 98 di VQE dan 89 di Production dapat terjadi ketika statistik belum menangkap beban kerja representatif. Jangan menghapus indeks hanya berdasarkan hitungan tersebut; ukur periode penggunaan yang sesuai dan periksa dampak ke constraint serta query terjadwal.

7. **Indeks duplikat.** Production menandai indeks pada public.document_records: document_records_tenant_document_number_uq dan document_records_tenant_number_normalized_uq. Source mempunyai 20270227000000_remove_redundant_document_number_index, belum tercatat di ledger Production. Sebelum perubahan, cocokkan definisi kedua indeks, constraint unik, duplikasi data, dan DDL aktual. Jangan menjalankan migrasi penghapusannya hanya karena advisor menyebut duplikat.

## Urutan kerja aman

1. Backend owner mengambil definisi aktual fungsi, policy, grant, trigger, dan indeks Production sebagai inventaris baca-saja, lalu membandingkannya dengan source.
2. Untuk setiap migration yang belum tercatat tetapi tampak terkait advisor, tentukan apakah efeknya belum ada, sudah diterapkan tanpa ledger, atau sudah tergantikan. Tulis rencana satu per satu beserta dampak dan rollback.
3. Aktifkan perlindungan kata sandi bocor melalui pengaturan Auth setelah pemilik proyek siap; uji di staging terlebih dahulu.
4. Prioritaskan indeks FK dari workload dan query nyata. Uji perubahan di VQE dan ukur query sebelum menyusun promosi.
5. Jangan menjalankan db push massal, perubahan Production, atau menghapus indeks sebelum inventaris DDL dan bukti pemulihan diperiksa.

## Tautan rujukan

- [Supabase database linter: foreign keys tanpa indeks](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Supabase database linter: fungsi Auth di policy RLS](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
- [Supabase database linter: indeks tak terpakai](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
- [Supabase database linter: RLS aktif tanpa policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Supabase database linter: indeks duplikat](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)
- [Supabase database linter: search_path fungsi](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [Supabase: perlindungan kata sandi](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
