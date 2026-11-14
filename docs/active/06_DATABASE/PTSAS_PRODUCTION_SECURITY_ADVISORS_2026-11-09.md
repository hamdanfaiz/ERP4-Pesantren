# Temuan Advisor Keamanan dan Katalog Production — 9 November 2026

## Cakupan

Pemeriksaan baca-saja dilakukan pada Supabase PTSAS `ptsasgdvgrbdtgyqieie` melalui konektor `Supabase`. Yang diperiksa hanya katalog PostgreSQL, ekspresi policy, hak akses objek, definisi fungsi yang dapat dipanggil role `authenticated`, serta Supabase Advisors. Tidak ada baris operasional yang dibaca. Tidak ada perubahan skema, hak akses, konfigurasi Auth, atau data Production.

## Temuan akses database

- Schema `public` memuat **119 tabel**; 119/119 mempunyai RLS dan `FORCE ROW LEVEL SECURITY`.
- Terdapat **5 policy**, seluruhnya `PERMISSIVE SELECT` untuk `authenticated`:
  - `candidates` dan `candidate_documents`: tenant aktif, Admin, serta izin modul PPDB.
  - `profiles`: profil sendiri atau Admin tenant dengan izin modul pengguna.
  - `tenants`: hanya tenant aktif pengguna.
  - `user_profiles`: hanya profil sendiri.
- Inventaris grant tabel untuk `anon`, `PUBLIC`, dan `authenticated` hanya menemukan `SELECT` kepada `authenticated` pada 5 relasi tersebut. Tidak ditemukan grant tabel untuk `anon` atau `PUBLIC`.
- Advisor melaporkan 114 tabel RLS tanpa policy (tingkat INFO). Dalam konfigurasi grant yang terbaca, akses langsung tertutup untuk tabel-tabel itu. Rute backend tetap penting diaudit karena service key melewati RLS.

## Temuan fungsi dan Auth

1. **Fungsi SECURITY DEFINER di schema publik:** 42 fungsi bertipe `SECURITY DEFINER`; 4 fungsi dapat dieksekusi oleh `authenticated`, sementara tidak ada fungsi yang dapat dieksekusi oleh `anon`:
   - `current_app_role()`
   - `current_tenant_id()`
   - `has_module_access(text)`
   - `is_tenant_admin()`

   Definisi yang dibaca membatasi hasil berdasarkan `auth.uid()`, profil aktif, dan tenant aktif. Advisor tetap menandai callable RPC di schema publik. Source PR berisi migration [20270210000000_internalize_tenant_rls_helpers.sql](../../../supabase/migrations/20270210000000_internalize_tenant_rls_helpers.sql) yang memindahkan helper ke schema `private` dan mempersempit grant. Versi tersebut belum ada dalam ledger PTSAS. Tinjau kesetaraan DDL dan dependensi sebelum merencanakan perubahan; laporan ini tidak meminta penerapan langsung.

2. **Search path trigger PPDB belum dipatok:** Advisor menemukan `public.erp4_ppdb_update_updated_at_column()` menggunakan `search_path` yang dapat berubah. Source PR memiliki migration [20270209000000_harden_ppdb_trigger_search_path.sql](../../../supabase/migrations/20270209000000_harden_ppdb_trigger_search_path.sql) yang menetapkan `search_path = pg_catalog`; versinya belum ada pada ledger PTSAS.

3. **Perlindungan kata sandi bocor nonaktif:** Security Advisor meminta fitur pemeriksaan kata sandi bocor Supabase Auth diaktifkan. Ini pengaturan Authentication, bukan migration SQL; lakukan terpisah di staging lalu Production sesuai kontrol perubahan.

## Advisor kinerja dan kesehatan

- **182 foreign key** tanpa indeks penutup (INFO).
- **33 indeks** belum tercatat dipakai (INFO).
- **2 policy RLS** mendapat peringatan pemanggilan fungsi Auth berulang per baris: `profiles_select_self_or_tenant_admin` dan `user_profiles_select_own`.
- Advisor Health tidak mengembalikan temuan.
- Jangan menambah atau menghapus semua indeks sekaligus. Tim backend perlu menguji pola query dan dampak tulis dengan data sintetis representatif sebelum memutuskan indeks.

## Rekonsiliasi versi

Pada pemeriksaan terpisah tanggal yang sama, ledger Production berisi 47 versi; 140 versi/namanya pada source PR cocok dengan ledger staging VQE. Semua 47 versi Production ditemukan pada source. **93 versi source tidak tercatat pada ledger PTSAS**, dan nama ledger tidak dikembalikan untuk `20261205000000` serta `20261206000000`. Rincian lengkap: [status baca-saja Production](PTSAS_PRODUCTION_READ_ONLY_STATUS_2026-11-09.md).

Khusus dua migration yang relevan dengan temuan fungsi di atas—`20270209000000` dan `20270210000000`—keduanya termasuk dalam selisih tersebut. Selisih ledger tidak membuktikan DDL belum berubah; fungsi advisor dan definisinya menjadi bukti tambahan bahwa keadaan aktual perlu dibandingkan dengan SQL migrasi.

## Langkah tim backend

1. Ambil inventaris DDL/schema-only PTSAS dan cocokkan fungsi, schema, grant, policy, trigger, serta dependensinya terhadap dua migration yang disebutkan.
2. Periksa migration ledger dan sumber perubahan manual. Jangan menandai versi selesai atau menjalankan migration sebelum kesetaraan serta urutannya dibuktikan.
3. Jalankan migration yang dibutuhkan pada staging/rehearsal terisolasi, lalu uji policy/API tenant, Auth RPC, dan trigger PPDB.
4. Aktifkan leaked password protection pada staging, verifikasi dampak login/reset, lalu jadwalkan perubahan Production.
5. Jalankan backup/restore rehearsal dan catat persetujuan/change window sebelum perubahan Production.
6. Triage indeks dari beban representatif; jangan hapus indeks hanya karena Advisor menandainya unused pada periode observasi singkat.

**Status:** hasil ini merupakan bukti metadata baca-saja dan rekomendasi tindak lanjut; belum menjadi persetujuan perubahan Production atau pernyataan siap deploy.
