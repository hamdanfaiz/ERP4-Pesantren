# Tinjauan advisor Production PTSAS — 15 November 2026

## Cakupan dan batas

- Proyek: PTSAS Production `ptsasgdvgrbdtgyqieie`.
- Snapshot advisor dibaca melalui Supabase MCP pada 15 November 2026 sekitar 10:26 WIB. Fungsi SQL dan katalog dibaca dengan kueri SELECT.
- Yang diperiksa: metadata advisor, ledger migrasi, RLS/grant tabel, serta definisi dan hak EXECUTE lima fungsi yang ditandai advisor.
- Tidak membaca baris data aplikasi, menjalankan DDL/DML, mengubah pengaturan Auth, atau menerapkan migrasi.
- Source pembanding: branch integrasi `codex/integration-current-main-20261115`, commit kode `ca07d58e`, 161 file migrasi.

## Snapshot Production

| Area | Hasil |
| --- | --- |
| Ledger migrasi | 100 entri; versi tertinggi bernama `20270316000000` |
| Source aktif | 161 file migrasi |
| Pasangan versi/nama yang cocok persis | 97 |
| Nama source yang tidak tercatat dengan nama yang sama | 64; 3 memiliki versi ledger yang sama tetapi nama ledger tidak dikembalikan |
| Entri ledger tanpa nama | `20261205000000`, `20261206000000`, `20270118000000` |
| Tabel `public` | 162; seluruhnya RLS aktif dan `FORCE ROW LEVEL SECURITY` aktif |
| Policy `public` | 5 policy pada 5 tabel |
| Grant SELECT tabel untuk `anon` | 0 |
| Grant SELECT tabel untuk `authenticated` | 5 |
| Grant tulis tabel untuk `anon`/`authenticated` | 0 |
| Advisor health | Tidak ada lint yang dikembalikan |

Lima tabel dengan policy dan SELECT `authenticated`: `candidate_documents`, `candidates`, `profiles`, `tenants`, dan `user_profiles`. Advisor menandai 157 tabel RLS tanpa policy. Karena tabel tersebut tidak memberi SELECT ke `anon`/`authenticated`, temuan ini sendiri tidak membuktikan barisnya dapat dibaca melalui Data API. Jalur server yang memakai kredensial istimewa tetap perlu ditinjau terpisah.

Rekonsiliasi ledger lengkap dan daftar 64 source ada di [dokumen perbandingan source dengan ledger VQE/PTSAS](INTEGRATED_SOURCE_LEDGER_RECONCILIATION_2026-11-15.md). Selisih metadata tidak berarti migrasi itu pasti belum diterapkan pada skema.

## Temuan keamanan

### Fungsi pembantu tenant masih dapat dipanggil sebagai RPC

Advisor menandai empat fungsi `SECURITY DEFINER` di schema `public` yang dapat dieksekusi role `authenticated`: `current_app_role()`, `current_tenant_id()`, `has_module_access(text)`, dan `is_tenant_admin()`.

Definisi Production yang diperiksa bersifat `STABLE`, memakai `search_path = pg_catalog, public`, membatasi lookup profil ke `auth.uid()` yang aktif dan tenant aktif. Keluaran fungsi adalah role/tenant caller atau boolean akses modul/admin; definisi yang dibaca tidak memperlihatkan operasi tulis. Ini mengurangi risiko lintas pengguna, tetapi fungsi tetap muncul sebagai RPC pada schema API.

Source memiliki `20270210000000_internalize_tenant_rls_helpers.sql`, yang memindahkan fungsi ke schema `private` dan mempertahankan `EXECUTE` untuk `authenticated` agar policy tetap dapat memakainya. Migrasi itu tidak tercatat pada ledger Production. Tim backend perlu mencocokkan definisi policy/route, konfigurasi exposed schema, dan DDL aktual sebelum menerapkannya; jangan mencabut EXECUTE secara langsung karena RLS bergantung pada helper tersebut.

### Search path trigger PPDB belum dipatok

Advisor menandai `public.erp4_ppdb_update_updated_at_column()`. Fungsi ini bukan `SECURITY DEFINER`, ACL-nya hanya mencantumkan owner `postgres`, dan definisi yang dibaca hanya mengisi `NEW.updated_at` dengan waktu saat ini. Namun `proconfig` kosong, sehingga belum ada `search_path` fungsi yang dipatok.

Source mempunyai `20270209000000_harden_ppdb_trigger_search_path.sql` untuk mengatur `search_path = pg_catalog`. Versi itu tidak tercatat pada ledger Production. Verifikasi trigger yang merujuk ke fungsi dan terapkan perubahan forward-only setelah pemetaan urutan migrasi.

### Perlindungan sandi bocor belum aktif

Advisor Auth memberi peringatan bahwa perlindungan terhadap sandi yang diketahui bocor belum diaktifkan. Ini pengaturan Auth, bukan migrasi SQL; pemilik Production perlu meninjau kebijakan dan dampak pengguna lalu mengaktifkannya melalui pengaturan Supabase Auth.

## Temuan performa

- **269 foreign key tanpa indeks penutup** (INFO). Migrasi indeks `20270330000000_add_core_composite_fk_indexes.sql` di source hanya menangani indeks terpilih; jangan menganggapnya menutup semua temuan. Pilih indeks menurut pola query, volume data, dan biaya tulis.
- **2 policy dengan evaluasi auth per baris** (WARN): `user_profiles_select_own` dan `profiles_select_self_or_tenant_admin`. Source `20270211000000_optimize_profile_rls_initplans.sql` membungkus ekspresi auth/helper dengan subquery agar dihitung sekali per statement; versi ini belum tercatat pada ledger Production.
- **89 indeks belum terlihat digunakan** (INFO). Statistik penggunaan mungkin belum mewakili beban normal; jangan menghapus indeks hanya dari lint ini.
- **Satu pasangan indeks unik identik** pada `public.document_records`: `document_records_tenant_document_number_uq` dan `document_records_tenant_number_normalized_uq`. Source memiliki `20270227000000_remove_redundant_document_number_index.sql`; versi ini belum tercatat pada ledger Production. Pastikan definisi dan constraint aktual identik serta cek dependensi sebelum penghapusan.

## Langkah penanganan untuk tim backend

1. Cocokkan seluruh versi source yang tidak ada pada ledger dengan definisi DDL Production aktual; tandai tiap migrasi `sudah setara`, `belum diterapkan`, `digantikan`, atau `perlu forward migration`. Jangan jalankan semua selisih sekaligus.
2. Prioritaskan verifikasi empat migrasi advisor yang relevan: `20270209000000_harden_ppdb_trigger_search_path`, `20270210000000_internalize_tenant_rls_helpers`, `20270211000000_optimize_profile_rls_initplans`, dan `20270227000000_remove_redundant_document_number_index`.
3. Untuk helper tenant, uji policy yang memanggilnya serta konfigurasi Data API schema sebelum/sesudah internalisasi; pastikan route server tetap menegakkan identitas, role, izin modul, dan tenant.
4. Tinjau sampel beban dan ukuran tabel sebelum menambah indeks dari temuan foreign key, dan kumpulkan statistik representatif sebelum menonaktifkan indeks yang belum terpakai.
5. Tinjau dan aktifkan perlindungan sandi bocor melalui pengaturan Auth Production.
6. Tim backend tetap menjalankan prosedur backup/restore, rehearsal staging, dan persetujuan jendela rilis. Snapshot ini bukan bukti pemulihan Production dan bukan izin untuk mengubahnya.

## Batas klaim

Snapshot advisor dan metadata ini tidak membuktikan kesetaraan DDL lengkap, perilaku seluruh route, UAT semua role/modul, atau kemampuan memulihkan backup. Tidak ada perubahan cloud pada pemeriksaan ini.