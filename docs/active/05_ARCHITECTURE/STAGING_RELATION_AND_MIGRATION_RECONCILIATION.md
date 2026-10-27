# Audit Relasi Data Staging dan Rekonsiliasi Migration

Tanggal pemeriksaan: 27 Oktober 2026  
Project: staging Supabase `ptsasgdvgrbdtgyqieie`  
Cakupan: pemeriksaan katalog dan agregat baca-saja. Tidak ada record Firestore yang disalin; tidak ada schema, migration, atau row Supabase yang diubah.

## Ringkasan

- Katalog staging berisi 119 tabel `public`, semuanya mengaktifkan RLS. Sebanyak 118 tabel memiliki `tenant_id`; `tenants` adalah root tenant.
- Pemeriksaan struktur sebelumnya menemukan 485 foreign key antar-tabel tenant dan seluruh pasangan FK mencakup `tenant_id` pada kedua sisi.
- Dua belas pemeriksaan agregat relasi terhadap record yang sudah ada menghasilkan 0 pelanggaran: relasi wali-santri, dokumen-kandidat, referensi onboarding bila terisi, pemilik reservasi NIS, serta dompet-kartu santri.
- Hasil 0 pelanggaran **bukan bukti seluruh alur teruji**. Sampel staging belum menghubungkan kandidat PPDB dengan santri/wali dan belum memiliki transaksi operasional pada beberapa modul.
- Migration ledger tidak cocok dengan direktori source. Jangan menjalankan `migration repair` atau `db push` sebelum kondisi schema dan dua entri ledger kosong direkonsiliasi serta backup staging dipastikan.

## Agregat record yang dibaca

Query hanya mengembalikan jumlah, status agregat, dan hasil pemeriksaan; tidak membaca nama, email, NIK/NISN, atau isi PII.

| Entitas | Jumlah |
|---|---:|
| Tenant / profil | 1 / 1 |
| Santri / wali / relasi wali-santri | 50 / 50 / 50 |
| Kandidat PPDB / checklist dokumen / identity claims | 50 / 50 / 250 |
| Halaqah / keanggotaan / setoran Tahfidz | 40 / 0 / 0 |
| Reservasi NIS | 0 |
| Tagihan / ledger Finance | 0 / 0 |
| Produk koperasi / dompet santri | 6 / 15 |

### Hasil relasi dan batas bukti

- Seluruh 50 relasi `guardian_students` menunjuk wali dan santri pada tenant yang sama.
- Seluruh 50 checklist dokumen menunjuk kandidat pada tenant yang sama.
- Tidak ditemukan referensi lintas tenant atau referensi hilang pada `nis_reservations` dan `cooperative_wallets`; hasil tersebut terbatas karena reservasi NIS masih 0.
- Tidak ditemukan saldo dompet negatif atau lebih dari satu dompet untuk santri yang sama.
- Terdapat 50 kandidat, termasuk 8 berstatus tahap `Accepted`, tetapi 0 kandidat memiliki `master_student_id`/`master_guardian_id` dan 0 berstatus onboarding selesai. Sebanyak 50 santri dan 50 wali pada staging belum memiliki `source_candidate_id`. Karena itu, data staging saat ini tidak membuktikan transisi PPDB → Master Data.
- Halaqah sudah ada, tetapi membership dan setoran Tahfidz kosong; tagihan dan ledger Finance juga kosong. Alur modul tersebut perlu dibuktikan dengan fixture CI yang sudah tersedia atau data sintetis baru yang dibuat langsung untuk uji—tanpa mengimpor Firestore.

## Rekonsiliasi migration

`supabase_migrations.schema_migrations` memiliki kolom `version`, `name`, dan `statements`. Ledger yang dibaca berisi 47 versi sampai `20261206000000`. Source PR #13 saat pemeriksaan berisi 96 berkas migration. Sebanyak 49 versi source mulai `20261207000000_library_legacy_catalog_import.sql` sampai `20270124000000_finance_proof_upload_rate_limit.sql` tidak tercatat pada ledger staging.

Dua versi terakhir yang tercatat, `20261205000000` dan `20261206000000`, memiliki `name = NULL` dan `statements` kosong. Ini adalah kondisi sejarah yang tidak lengkap, tetapi **tidak membuktikan** SQL-nya belum berjalan. Sebagai contoh, tabel `ppdb_legacy_import_batches` ada di katalog staging, namun pemeriksaan katalog saja tidak membuktikan semua efek migration `20261206000000` telah benar. Jangan tandai versi sebagai applied hanya berdasarkan nama tabel atau agar daftar terlihat sinkron.

Supabase menjelaskan bahwa `db push` membandingkan source lokal dengan `supabase_migrations.schema_migrations` dan hanya menjalankan versi yang belum tercatat. `migration repair` hanya memperbarui tracking, bukan menjalankan SQL. Rujukan: [Database Migrations — Supabase](https://supabase.com/docs/guides/deployment/database-migrations) dan [supabase db push](https://supabase.com/docs/reference/cli/supabase-db-push).

### Urutan tindakan aman untuk tim backend

1. Gunakan commit source PR #13 yang telah ditinjau; pastikan target CLI hanya project staging `ptsasgdvgrbdtgyqieie`.
2. Dari jaringan dan mesin yang memiliki Supabase CLI serta kredensial project, jalankan `supabase migration list` dan `supabase db push --dry-run`. Jangan memasukkan access token, secret key, atau password ke chat/repository.
3. Bandingkan schema staging dengan hasil database lokal bersih yang dibangun dari semua migration source. Periksa khusus seluruh efek `20261205000000` dan `20261206000000`, lalu catat tiap perbedaan schema, function, trigger, grant, policy, dan storage.
4. Ambil/konfirmasi backup staging yang dapat dipulihkan. Jika histori perlu dikoreksi, lakukan `migration repair` **hanya** untuk versi yang efek SQL-nya telah diverifikasi; jangan mengubah status 49 versi pending menjadi applied.
5. Terapkan migration satu per satu di staging setelah diff dan rencana pemulihan ditinjau. Tidak ada impor Firestore atau seed otomatis dalam langkah ini.
6. Setelah migration, ulangi pemeriksaan RLS/FK, lalu buat record uji sintetis melalui alur aplikasi: PPDB diterima → onboarding transaksional → relasi wali-santri dan identitas → reservasi NIS → alur Tahfidz/Finance. Verifikasi retry idempoten, penolakan duplikasi, role, dan tenant.

## Akses dan gerbang saat ini

- Koneksi MCP staging yang tersedia pada sesi ini hanya menyediakan pembacaan katalog, migration ledger, dan SQL baca-saja; tidak tersedia operasi `apply_migration` untuk project tersebut.
- Konektor Supabase yang dapat melakukan operasi terkelola hanya menampilkan project `vqemuyzveuirlkvdggjd`, bukan target staging. Worktree ini tidak memiliki Supabase CLI, `.env`/`.env.local`, atau link CLI lokal, sehingga saya tidak dapat menjalankan `db push --dry-run` ke target.
- CI GitHub pada commit kode `8f8dda2` lulus untuk build, Docker/Compose, migration/API/pgTAP, dan rangkaian database sintetis. Itu membuktikan source pada database uji yang bersih, bukan kondisi schema atau runtime staging.
- PR #13 tetap Draft. Estimasi saat ini **73% kematangan fitur / 46% kesiapan go-live**; keduanya estimasi dan tidak dinaikkan oleh pemeriksaan baca-saja.
