# Audit Advisor Supabase VQE — 9 November 2026

**Project:** staging VQE `vqemuyzveuirlkvdggjd`  
**Waktu observasi terbaru:** 9 November 2026, sekitar 00.07 WIB  
**Metode:** Supabase MCP; advisor dan query katalog baca-saja. Tidak membaca baris data operasional, mengubah skema/config/Auth, atau menyentuh Production PTSAS.

## Ringkasan

| Pemeriksaan | Temuan terbaru | Makna / tindakan |
| --- | ---: | --- |
| Migration ledger | **140/140** pasangan versi/nama cocok dengan 140 file di branch PR `codex/product-copy-cleanup-20261108`; tidak ada duplikasi, tambahan, atau versi hilang. Terakhir `20270308000000_academic_class_unit_admin_role_baseline`. | Ledger versi/nama selaras. Ini tidak membuktikan DDL aktual identik. |
| RLS / FORCE RLS | **167/167** tabel public mengaktifkan RLS dan FORCE RLS. Advisor memberi INFO untuk **162** tabel tanpa policy. | 162 tabel tersebut tidak memiliki policy RLS. Pemeriksaan ACL di bawah menemukan tidak ada grant langsung ke `PUBLIC` atau `anon`; jangan menambahkan policy/grant luas untuk menghilangkan INFO. |
| Grant langsung bagi `authenticated` | **5 tabel SELECT saja**; tidak ditemukan grant INSERT/UPDATE/DELETE. | Lima tabel memiliki policy baca tenant/role yang tercantum di bawah. Semua API server yang memakai secret/service role tetap perlu dites terpisah karena privilege server berbeda dari browser. |
| Perlindungan kata sandi bocor | 1 peringatan security: nonaktif. | Operator perlu meninjau Auth → Password settings dan opsi paket yang tersedia. Tidak ada perubahan Auth/paket. |
| Foreign key tanpa indeks | 258 | Advisor belum menunjukkan dampak workload. Jangan menambah indeks massal; prioritaskan setelah benchmark dan review query dominan. |
| Indeks belum terpakai | 80 | Staging belum mewakili beban pelanggan. Jangan menghapus massal; evaluasi setelah periode observasi. |
| Health Advisor | 0 temuan | Ini bukan bukti backup/restore berhasil. |

## Rincian policy SELECT

Query katalog menemukan hak SELECT langsung bagi role `authenticated` pada lima tabel, dengan policy berikut:

| Tabel | Pembatasan policy |
| --- | --- |
| `candidate_documents` | Tenant aktif, Admin tenant, dan akses modul PPDB |
| `candidates` | Tenant aktif, Admin tenant, dan akses modul PPDB |
| `profiles` | Profil sendiri, atau Admin tenant dengan akses modul pengguna |
| `tenants` | Hanya tenant pengguna saat ini |
| `user_profiles` | Hanya profil dengan id sama dengan `auth.uid()` |

Tidak ditemukan baris grant langsung ke `PUBLIC` atau `anon`. Semua tabel memiliki RLS + FORCE RLS. Ini metadata privilege/policy; bukan bukti semua route backend mematuhi batas yang sama.

## Bukti dan batasan

- Daftar migration MCP VQE dan nama file migration GitHub branch dibandingkan langsung pada 9 November; pasangan versi/nama cocok 140/140.
- Katalog PostgreSQL membaca jumlah tabel, RLS/FORCE RLS, `pg_policies`, serta `information_schema.table_privileges`. Hasil saat ini: 167 tabel, semuanya RLS/FORCE; 162 tanpa policy; 5 grant SELECT untuk `authenticated` seperti tabel di atas.
- Advisor performance menghasilkan 258 foreign key tanpa indeks dan 80 unused indexes. Tidak ada `CREATE INDEX`, `DROP INDEX`, atau perubahan SQL dilakukan.
- Peringatan perlindungan kata sandi bocor perlu ditinjau operator. Tidak ada perubahan pengaturan Auth.
- Konektor Production PTSAS tidak memberi akses baca pada sesi ini. Tidak ada pemeriksaan DDL, migration, atau perubahan Production.

## Langkah berikut

1. Tim backend menguji role/tenant API dan lima policy SELECT pada staging dengan akun sintetis, termasuk penolakan lintas tenant.
2. Operator meninjau pengaturan password Auth VQE dan mengaktifkan perlindungan kata sandi bocor jika opsi tersedia pada paket.
3. Tim backend menjalankan benchmark sintetis untuk workload pesantren besar, lalu meninjau foreign key tanpa indeks berdasarkan query dan `EXPLAIN (ANALYZE, BUFFERS)`.
4. Jangan menghapus indeks sebelum ada periode workload dan review constraint/cascade.
5. Lakukan verifikasi DDL, backup/restore, dan rehearsal migrasi Production secara terpisah. Advisor staging tidak memberi otorisasi untuk mengubah Production.

## Referensi

- [Supabase: Password security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase: RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Supabase: Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Supabase: Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
