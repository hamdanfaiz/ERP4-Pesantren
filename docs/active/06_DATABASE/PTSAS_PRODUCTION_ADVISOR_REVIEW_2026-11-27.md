# Audit advisori Supabase Production dan staging — 27 November 2026

## Tujuan dan batas pemeriksaan

Snapshot ini membantu tim backend memilah temuan Supabase Advisor dari temuan yang memerlukan pemeriksaan lanjutan. Pemeriksaan hanya membaca metadata skema, definisi beberapa fungsi/indeks, ledger migrasi, dan advisori. Query SQL yang dijalankan hanya `SELECT`; tidak ada perubahan pada database, Auth, Storage, environment, atau Production.

**Source kode:** `main`, commit `ace8de9d3859280d3bbf883126e2ae1e5b4e1652`  
**Source kode aplikasi terakhir sebelum pembaruan dokumentasi:** `42d3d32ebd19ca07151e3b478382834574afb0b6`  
**Staging:** VQE `vqemuyzveuirlkvdggjd`  
**Production:** PTSAS `ptsasgdvgrbdtgyqieie`

Temuan Advisor adalah sinyal untuk ditinjau, bukan instruksi untuk langsung mengubah policy, indeks, atau fungsi.

## Ringkasan advisori yang terlihat

| Proyek | Keamanan | Performa | Kesehatan |
| --- | --- | --- | --- |
| VQE staging | 1 peringatan: perlindungan sandi bocor belum aktif; 182 temuan INFO untuk tabel ber-RLS tanpa policy | 1 peringatan RLS initplan pada proyeksi progres Tahfidz; 275 FK tanpa indeks dan 87 indeks tidak terpakai (INFO) | Tidak ada temuan |
| PTSAS Production | 1 fungsi dengan search path yang dapat berubah; 4 helper `SECURITY DEFINER` di schema publik yang dapat dipanggil `authenticated`; perlindungan sandi bocor belum aktif; 157 temuan INFO untuk tabel ber-RLS tanpa policy | 2 policy RLS initplan; 1 pasangan indeks ganda; 269 FK tanpa indeks dan 89 indeks tidak terpakai (INFO) | Tidak ada temuan |

Temuan RLS tanpa policy tidak otomatis berarti tabel terbuka. Policy yang tidak ada membuat RLS menolak baris, tetapi akses juga dipengaruhi oleh grant Data API dan akses server tepercaya. Pemeriksaan grant tabel dan pemetaan route server belum dilakukan dalam snapshot ini. Jangan menambahkan policy umum untuk menghilangkan linter.

Jumlah indeks tanpa pemakaian juga bukan alasan untuk langsung menghapusnya: statistik pemakaian bisa dipengaruhi beban kerja dan periode statistik. Indeks FK yang belum tercakup perlu diprioritaskan memakai bukti query plan dan beban baca/tulis.

## Temuan PTSAS yang diperiksa lebih lanjut

### 1. Helper authorization di schema publik

Advisor menemukan empat fungsi berikut dapat dipanggil role `authenticated` sebagai `SECURITY DEFINER` melalui Data API:

- `public.current_app_role()`
- `public.current_tenant_id()`
- `public.has_module_access(text)`
- `public.is_tenant_admin()`

Definisi aktual yang dibaca menetapkan `search_path = pg_catalog, public`. Setiap helper membaca profil aktif berdasarkan `auth.uid()` dan tenant aktif. Ini membatasi hasil kepada konteks pemanggil, tetapi schema publik tetap mengekspos fungsi RPC. Source memiliki migrasi [20270210000000_internalize_tenant_rls_helpers.sql](../../../supabase/migrations/20270210000000_internalize_tenant_rls_helpers.sql), yang memindahkannya ke schema `private`, membatasi grant, dan mempertahankan akses yang dibutuhkan policy RLS.

**Tindakan:** jangan jalankan migrasi ini terpisah sebelum membandingkan DDL PTSAS dan dependensi fungsi/policy. Migrasi tersebut harus masuk dalam rencana urutan yang direhearsal.

### 2. Search path trigger PPDB

`public.erp4_ppdb_update_updated_at_column()` saat ini tidak mempunyai konfigurasi search path tetap. Isi yang dibaca hanya mengisi `NEW.updated_at = NOW()` dan mengembalikan row. Source memiliki migrasi [20270209000000_harden_ppdb_trigger_search_path.sql](../../../supabase/migrations/20270209000000_harden_ppdb_trigger_search_path.sql) yang mengunci search path ke `pg_catalog`.

### 3. Policy RLS initplan

Advisor menandai policy pada `public.user_profiles` dan `public.profiles` karena konteks auth dievaluasi berulang saat memindai baris. Source memiliki migrasi [20270211000000_optimize_profile_rls_initplans.sql](../../../supabase/migrations/20270211000000_optimize_profile_rls_initplans.sql), yang mengevaluasi fungsi auth/helper melalui subquery statement-level. Pastikan helper private dari migrasi sebelumnya tersedia dan policy produksi cocok sebelum menjalankannya.

Pada VQE, satu temuan serupa terlihat pada `public.tahfidz_student_ayah_progress`. Temuan ini perlu ditinjau terpisah karena policy tersebut tidak termasuk perubahan optimasi profil di atas.

### 4. Indeks ganda nomor dokumen

Dua indeks unik PTSAS pada `public.document_records` memiliki definisi identik:

```sql
(tenant_id, lower(btrim(document_number)))
```

Source memiliki migrasi [20270227000000_remove_redundant_document_number_index.sql](../../../supabase/migrations/20270227000000_remove_redundant_document_number_index.sql), yang mempertahankan satu indeks dan menghapus duplikat. Definisi aktual kedua indeks telah dibandingkan baca-saja; keduanya sama. Tetap validasi dependensi dan jalur rollback sebelum perubahan Production.

### 5. Perlindungan sandi bocor

Advisor melaporkan perlindungan sandi yang pernah bocor belum aktif pada VQE dan PTSAS. Ini adalah pengaturan Supabase Auth, bukan migrasi database. Pemilik proyek perlu mengaktifkannya di kedua proyek setelah meninjau dampak kebijakan sandi bagi pengguna.

## Ledger migrasi Production

Pembacaan terkini mencatat:

- VQE: 170 dari 170 versi source, nama cocok.
- PTSAS: 100 entri; 70 versi source belum tercatat, 3 nama ledger kosong, tidak ditemukan versi ekstra.
- Ledger PTSAS berakhir pada `20270316000000_communication_ops_runtime`.

Daftar lengkap perbedaan 70 versi terdapat di [ENVIRONMENT_MIGRATION_PARITY_2026-11-27.md](./ENVIRONMENT_MIGRATION_PARITY_2026-11-27.md). Daftar tersebut adalah bahan rekonsiliasi, bukan urutan perintah untuk menjalankan `db push`.

## Urutan kerja yang disarankan untuk tim backend

1. Rekonsiliasi ledger dengan DDL aktual PTSAS: tabel/kolom, constraint, indeks, fungsi, trigger, policy RLS, grant, dan konfigurasi schema yang diekspos Data API.
2. Tandai tiap versi sebagai belum diterapkan, sudah diterapkan dengan metadata tertinggal, atau sudah tercakup oleh perubahan lain. Jangan mengisi nama kosong atau memperbaiki ledger hanya dari nama file.
3. Susun urutan berdasarkan dependensi. Empat migrasi yang disebut di atas saling terkait, khususnya perpindahan helper sebelum optimasi policy; jangan menganggapnya boleh dijalankan acak.
4. Rehearsal rencana lengkap pada database nonproduction yang sesuai dengan DDL PTSAS, lalu jalankan suite migrasi/API/RLS.
5. Buktikan backup dan restore Production melalui prosedur organisasi sebelum perubahan DDL.
6. Setelah persetujuan pemilik database, terapkan batch terukur; verifikasi ledger, Advisori, grant, RLS, dan smoke test aplikasi.

**Status akhir snapshot:** migrasi Production belum dinyatakan aman untuk diterapkan. Tidak ada migrasi atau pengaturan Auth yang diubah oleh pemeriksaan ini.
