# Audit Advisor Supabase VQE — 8 November 2026

**Project:** staging VQE `vqemuyzveuirlkvdggjd`  
**Waktu observasi:** 8 November 2026, 21.01 WIB  
**Metode:** MCP Supabase dan query katalog baca-saja. Tidak membaca baris data operasional, membuat perubahan skema, mengubah konfigurasi, atau menyentuh Production PTSAS.

## Ringkasan

| Pemeriksaan | Temuan | Makna / tindakan |
| --- | ---: | --- |
| Migration ledger | 140/140 pasangan versi dan nama cocok dengan source lokal; tidak ada versi duplikat, source yang hilang, atau migration tambahan | Ledger staging selaras. Ini belum membuktikan seluruh DDL identik. |
| RLS tanpa policy | 162 tabel | Advisor memberi INFO. Query katalog menemukan 0 dari 162 tabel dengan grant langsung ke `PUBLIC`, `anon`, atau `authenticated`; ini konsisten dengan tabel service-only. Jangan menambahkan policy umum atau grant browser untuk menghilangkan INFO. |
| Perlindungan kata sandi bocor | 1 peringatan: nonaktif | Dokumentasi Supabase menyatakan fitur ini tersedia pada Pro ke atas. Pada paket yang tidak mendukungnya, set minimum panjang dan komposisi password sekuat yang tersedia; keputusan upgrade paket tetap milik operator. Tidak ada perubahan paket atau Auth. |
| Foreign key tanpa indeks | 258 | Jangan menambahkan indeks massal hanya dari Advisor. Ukur query modul pada workload representatif, lalu prioritaskan foreign key yang sering dipakai pada join, delete, atau update. |
| Indeks belum terpakai | 80 | Staging belum menunjukkan beban pelanggan; jangan menghapus massal. Evaluasi setelah periode observasi dan uji dampak penulisan. |
| Health Advisor | 0 temuan | Tidak ada lint health pada saat observasi; ini bukan pengganti backup/restore rehearsal. |

## Bukti dan batasan

- VQE mengembalikan 140 migration ledger rows. Perbandingan setempat terhadap 140 file `supabase/migrations` menghasilkan 140 pasangan versi/nama yang sama, tanpa duplikasi atau selisih.
- Advisor menandai 162 tabel RLS aktif tanpa policy. Query hanya membaca `pg_class`, `pg_policies`, dan ACL; hasilnya 0 tabel tanpa policy yang memberi privilege langsung kepada `PUBLIC`, `anon`, atau `authenticated`. Jalur API server yang memakai secret/service key tetap harus diuji terpisah karena hak istimewanya melewati RLS.
- Temuan Advisor indeks tidak menunjukkan dampak pada workload nyata. Tidak ada `DROP INDEX`, `CREATE INDEX`, atau perubahan SQL yang dilakukan.
- Konektor MCP untuk Production PTSAS masih menolak akses baca dalam sesi ini. Tidak ada perbandingan DDL Production, penerapan migration, atau perubahan Production.

## Langkah berikut

1. Setelah operator aktif, periksa Auth → Password settings pada VQE. Jika fitur leaked-password protection tidak tersedia pada paket saat ini, atur panjang minimum dan komposisi password sesuai opsi yang tersedia; jangan mengirim password lewat chat.
2. Tim backend menjalankan benchmark beban sintetis yang mendekati pesantren besar, mencatat p95/p99 serta query dominan, lalu meninjau 258 foreign key tanpa indeks berdasarkan bukti `EXPLAIN (ANALYZE, BUFFERS)`.
3. Jangan menghapus indeks yang belum terpakai sebelum ada periode workload dan review constraint/cascade.
4. Lakukan audit DDL, backup/restore, serta rehearsal migrasi Production terpisah. Data Advisor staging tidak memberi otorisasi untuk mengubah Production.

## Referensi

- [Supabase: Password security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase: RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Supabase: Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Supabase: Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
