# Snapshot Baca-Saja PTSAS dan VQE — 23 November 2026

Snapshot ini memperbarui bukti katalog dan ledger setelah PR #232 masuk ke `main`. Semua pemeriksaan Supabase di bawah hanya membaca metadata; tidak membaca isi baris aplikasi, menjalankan migrasi, mengubah konfigurasi, atau menulis data.

## Source code

- `main`: `014a41808c4e72212665275cee7092220e6b6208` (PR #232).
- GitHub tidak menampilkan PR terbuka saat pemeriksaan ini.
- Source memiliki 167 file migrasi SQL. PR #232 memperbaiki sanitasi pesan konflik database pada API; tidak mengubah migrasi atau konfigurasi Supabase.
- CI PR #232 lulus sebelum merge. Pemeriksaan workflow untuk merge commit tersendiri belum mengembalikan run; ini tidak membatalkan hasil CI pada PR.

## Ledger migrasi — baca metadata saja

| Lingkungan | Entri ledger | Nama kosong | Versi source belum tercatat | Versi extra / nama berbeda |
|---|---:|---:|---:|---:|
| VQE staging `vqemuyzveuirlkvdggjd` | 167 | 0 | 0 | 0 |
| PTSAS Production `ptsasgdvgrbdtgyqieie` | 100 | 3 | 67 | 0 |

Versi Production yang nama migrasinya kosong: `20261205000000`, `20261206000000`, dan `20270118000000`. Untuk 97 entri Production yang memiliki nama, versi dan nama cocok dengan source; tidak ditemukan versi Production yang tidak ada pada source.

Ledger VQE cocok dengan manifest source pada commit di atas untuk seluruh 167 pasangan versi/nama. Ledger bukan checksum SQL: hasil ini **tidak membuktikan DDL Production sama dengan source**, tidak mengungkap migration mana yang sudah dijalankan manual, dan bukan izin untuk menjalankan 67 migrasi sekaligus. Tetap lakukan rekonsiliasi objek dan urutan rollout satu per satu sebelum promosi.

## Hak akses tabel — katalog PostgreSQL

| Lingkungan | Tabel dasar `public` | RLS aktif | FORCE RLS | SELECT `anon` | SELECT `authenticated` |
|---|---:|---:|---:|---:|---:|
| VQE staging | 182 | 182 | 182 | 0 | 5 |
| PTSAS Production | 162 | 162 | 162 | 0 | 5 |

Pada kedua lingkungan, lima tabel yang menerima SELECT langsung dari `authenticated` adalah `candidate_documents`, `candidates`, `profiles`, `tenants`, dan `user_profiles`. Masing-masing memiliki satu policy SELECT dan tidak memberi grant INSERT, UPDATE, atau DELETE ke `authenticated`. Tidak ada grant SELECT tabel dasar kepada `anon`.

VQE memiliki 176 tabel dengan RLS aktif tanpa policy; Production memiliki 157. Advisor menandainya sebagai INFO. Katalog menunjukkan tabel tersebut tidak dapat dibaca langsung oleh `anon` atau `authenticated`; jalur API server tetap perlu menjaga autentikasi, role, dan tenant, dan harus diuji melalui source/pgTAP serta UAT. Jangan menambahkan policy umum hanya untuk menghilangkan INFO tersebut.

## Perbedaan metadata fungsi keamanan

| Pemeriksaan | VQE staging | PTSAS Production |
|---|---|---|
| Helper tenant/role | Berada di schema internal `private`, SECURITY DEFINER dengan `search_path=pg_catalog, public`; tidak dapat dieksekusi `anon`, dapat dieksekusi `authenticated` untuk kebijakan RLS | Masih berada di `public`, SECURITY DEFINER dengan `search_path=pg_catalog, public`; tidak dapat dieksekusi `anon`, dapat dieksekusi `authenticated` |
| Trigger `erp4_ppdb_update_updated_at_column` | `search_path=pg_catalog`, bukan SECURITY DEFINER, tidak dapat dieksekusi `anon`/`authenticated` | Belum memiliki setting `search_path`, bukan SECURITY DEFINER, tidak dapat dieksekusi `anon`/`authenticated` |

Temuan advisor Production tentang helper yang masih di `public` dan search path trigger sesuai dengan perbedaan katalog. Source memiliki migrasi `20270209000000_harden_ppdb_trigger_search_path` dan `20270210000000_internalize_tenant_rls_helpers`, tetapi keduanya termasuk dalam gap ledger Production. Terapkan hanya sebagai bagian rencana migrasi forward-only setelah DDL aktual, dependency policy, urutan, serta restore rehearsal direkonsiliasi.

Advisor Auth juga menyatakan **leaked password protection belum aktif** pada VQE dan PTSAS. Tidak ada perubahan Auth pada checkpoint ini; pemilik proyek perlu mengaktifkannya di pengaturan Password Security setelah mempertimbangkan alur pemulihan kata sandi.

## Batas pemeriksaan dan langkah tim

- Tidak membaca baris data aplikasi, identitas pengguna, isi file Storage, atau secret.
- Tidak menjalankan DDL/migrasi, tidak membuat atau menghapus akun/fixture, dan tidak mengubah flag/Auth/Storage.
- DDL lengkap PTSAS, bukti backup dan restore Production, identitas commit hosting aktif, serta UAT simpan-baca lintas modul/role/tenant belum terbukti oleh snapshot ini.
- Tim backend: cocokkan definisi tabel, kolom, constraint, index, trigger, policy, fungsi, dan grants Production dengan source; jelaskan setiap perbedaan ledger; lakukan dry-run/rehearsal dan restore yang terbukti sebelum rollout bertahap.
- Jangan menjalankan `db push` massal ke PTSAS berdasarkan selisih jumlah ledger.
- Untuk UAT UI, minta pengguna mengirim satu error yang dapat direproduksi: modul, tab, aksi, dan pesan/screenshot tanpa identitas santri.

Status Production tetap tidak berubah.
