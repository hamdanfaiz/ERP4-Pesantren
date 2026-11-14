# Tinjauan Metadata Advisor Production PTSAS — 15 November 2026

## Cakupan dan batas pemeriksaan

- Proyek: Production PTSAS `ptsasgdvgrbdtgyqieie`.
- Dilakukan melalui MCP yang tersambung ke Production, pada 15 November 2026 sekitar 00.24 WIB.
- Hanya membaca advisor Supabase, ledger versi migrasi, dan metadata katalog PostgreSQL. Tidak membaca baris data pengguna, menjalankan DDL, mengubah konfigurasi Auth, atau menerapkan migrasi.
- Staging VQE tidak digunakan.

## Ringkasan bukti

| Area | Hasil saat diperiksa |
| --- | --- |
| Migrasi tercatat Production | 100; versi tertinggi `20270316000000` |
| File migrasi aktif pada source | 153 |
| Versi source yang belum tercatat Production | 53 |
| Versi Production yang tidak ditemukan pada source | 0 |
| Entri Production tanpa nama yang dikembalikan MCP | `20261205000000`, `20261206000000`, `20270118000000` |
| Relasi schema `public` | 162; semuanya RLS aktif dan `FORCE ROW LEVEL SECURITY` aktif |
| Tabel `public` yang memiliki policy | 5 |
| Tabel dengan izin SELECT untuk `authenticated` | 5, semuanya memiliki policy; izin SELECT `anon` = 0; izin tulis `anon`/`authenticated` = 0 |
| Advisor health | Tidak ada lint yang dikembalikan |

Lima tabel dengan SELECT `authenticated` adalah `candidate_documents`, `candidates`, `profiles`, `tenants`, dan `user_profiles`. Advisor `rls_enabled_no_policy` mencatat 157 tabel tanpa policy. Karena role `anon` tidak memiliki SELECT dan `authenticated` hanya memiliki SELECT pada lima tabel tersebut, temuan 157 tabel itu sendiri bukan bukti bahwa baris tabel dapat dibaca lewat Data API. Akses melalui server berprivilege tetap perlu ditinjau terpisah.

## Temuan yang perlu ditangani

### Prioritas keamanan

1. **Empat fungsi SECURITY DEFINER masih berada di schema `public` dan dapat dipanggil role `authenticated`:** `current_app_role()`, `current_tenant_id()`, `has_module_access(text)`, dan `is_tenant_admin()`. Advisor memperingatkan bahwa fungsi tersebut dapat dipanggil sebagai RPC.
   - Source memuat migrasi `20270210000000_internalize_tenant_rls_helpers.sql` untuk memindahkannya ke schema `private` dan mengatur hak `EXECUTE`.
   - Versi ini tidak tercatat di ledger Production.
   - Tim backend perlu meninjau DDL Production aktual dan kompatibilitas policy sebelum menjadwalkan migrasi. Jangan menonaktifkan fungsi tanpa memastikan policy yang bergantung padanya tetap bekerja.
2. **Search path trigger PPDB dapat berubah.** Advisor menandai `public.erp4_ppdb_update_updated_at_column()`.
   - Source memuat `20270209000000_harden_ppdb_trigger_search_path.sql` untuk mematok `search_path` ke `pg_catalog`.
   - Versi ini tidak tercatat di ledger Production.
3. **Perlindungan sandi bocor Supabase Auth belum aktif.** Ini pengaturan Auth yang perlu ditinjau dan diaktifkan oleh operator Production sesuai kebijakan organisasi; bukan migrasi SQL.

### Prioritas performa dan integritas

1. **Indeks unik duplikat** pada `public.document_records`: `document_records_tenant_document_number_uq` dan `document_records_tenant_number_normalized_uq`.
   - Source memuat `20270227000000_remove_redundant_document_number_index.sql` untuk menghapus indeks lama yang redundan.
   - Versi ini tidak tercatat di ledger Production. Pastikan definisi aktual dan kesamaan constraint/index telah diverifikasi sebelum menghapus apa pun.
2. Advisor melaporkan **269 foreign key tanpa indeks penutup**, **2 policy dengan auth initplan**, dan **89 indeks yang belum dipakai** pada statistik yang tersedia.
   - Jangan membuat atau menghapus ratusan indeks secara massal. Tinjau ukuran tabel, pola query, dan periode statistik sebelum menentukan tindakan.
   - Source memuat `20270211000000_optimize_profile_rls_initplans.sql` untuk dua policy profile yang disebut advisor; migrasi itu belum tercatat di Production.

## Rekonsiliasi urutan migrasi

Daftar 53 versi source yang tidak tercatat adalah hasil selisih versi, bukan rekomendasi untuk menjalankan semuanya. Migrasi berisi seed/import, penyesuaian bisnis, dan perubahan skema dengan dependensi berbeda. Jangan menjalankan `db push` atas seluruh selisih hanya untuk menyamakan jumlah ledger.

Empat versi yang berkaitan langsung dengan advisor di atas dan tidak tercatat di Production:

1. `20270209000000_harden_ppdb_trigger_search_path`
2. `20270210000000_internalize_tenant_rls_helpers`
3. `20270211000000_optimize_profile_rls_initplans`
4. `20270227000000_remove_redundant_document_number_index`

Urutan nomor saja belum membuktikan bahwa semuanya aman diterapkan. Tim backend perlu mencocokkan setiap DDL dengan schema Production aktual, menyelesaikan tiga entri ledger yang nama migrasinya belum dikembalikan MCP, meninjau dependensi/policy, dan membuktikan backup dapat dipulihkan sebelum perubahan Production.

## Langkah tindak lanjut untuk tim backend

1. Ambil snapshot katalog DDL dan ledger dari Production dengan prosedur baca-saja internal, lalu cocokkan tiga entri tanpa nama dan seluruh 53 versi yang belum tercatat dengan source yang akan dirilis.
2. Siapkan backup/restore rehearsal dan rencana rollback di luar sesi ini.
3. Uji migrasi yang relevan pada database PostgreSQL lokal terisolasi atau lingkungan uji resmi tim. Docker hanya diperlukan untuk menjalankan Supabase lokal; tidak diperlukan untuk pemeriksaan source atau pemeriksaan Node.
4. Setelah tinjauan dan persetujuan rilis backend, terapkan hanya migrasi yang telah disetujui dalam urutan dependensinya; verifikasi ulang advisor, akses role, dan alur yang memakai policy/RPC.
5. Aktifkan perlindungan sandi bocor melalui pengaturan Auth setelah penilaian dampak pengguna.

## Batas klaim

Temuan ini adalah snapshot metadata dan advisor pada waktu pemeriksaan. Ini **bukan** audit isi policy secara menyeluruh, bukti migrasi berhasil, uji jalur API, bukti backup/restore, atau izin untuk mengubah Production. Temuan juga tidak membuktikan bahwa setiap tabel aman melalui route server yang memakai kredensial istimewa.
