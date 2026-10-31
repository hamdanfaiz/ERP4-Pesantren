# Snapshot Audit Target Supabase ERP4-Pesantren — 31 Oktober 2026

## Ringkasan

- Source resmi yang diperiksa: branch `main`, commit `02e1d85286b23861475cdf0dcf1023260ec3266d`.
- `supabase/config.toml` pada source menetapkan project ref `ptsasgdvgrbdtgyqieie`.
- `src/runtimeBackend.ts` mengarahkan runtime frontend ke Supabase-only. Firestore berisi data dummy dan tidak perlu disalin, sesuai keputusan pemilik proyek.
- Dashboard Supabase menampilkan project `ERP4-Pesantren`, ref `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`. Project ini harus diperlakukan sebagai Production, bukan staging.
- Konektor Supabase menampilkan project lama `vqemuyzveuirlkvdggjd` sebagai `ACTIVE_HEALTHY`, tetapi mengembalikan 0 tabel `public` dan 0 migrasi. Audit layanan sebelumnya juga tidak menemukan Auth users, bucket/objek Storage, Edge Functions, atau routine publik. Integrasi GitHub VQE telah diputus pada 31 Oktober 2026; project tetap aktif dan belum dihapus.
- Integrasi GitHub pada PTSAS tetap menunjuk ke `hamdanfaiz/ERP4-Pesantren` dengan working directory `.`; `Deploy to production` tetap OFF. Paket Free tidak menyediakan preview branch otomatis. Check `Supabase Preview` lama pada PR #28 dilewati dan riwayat check-nya masih mengarah ke VQE; itu adalah hasil historis, bukan bukti deployment atau sinkronisasi schema PTSAS.

## Hasil query baca-saja pada project target

Snapshot dibaca melalui SQL Editor dashboard menggunakan query katalog di dalam transaksi `READ ONLY`. Query tidak membaca record operasional, tidak mengubah database, dan tidak menerapkan migration.

| Pemeriksaan | Hasil |
| --- | ---: |
| Tabel schema `public` | 119 |
| Tabel dengan RLS aktif | 119/119 |
| Tabel dengan FORCE RLS | 119/119 |
| Tabel dengan kolom `tenant_id` | 118/119; tabel root `tenants` tidak memerlukan `tenant_id` |
| Foreign key publik | 337 |
| Foreign key berpasangan tenant | 243 |
| Policy tabel publik | 5 |
| Hak tabel `anon`/PUBLIC | 0 |
| Bucket Storage | 2; keduanya privat |
| Bucket Storage publik | 0 |
| Versi pada migration ledger | 47, dari `20260603000000` sampai `20261206000000` |
| Baris ledger tanpa `name`/statement | 2: `20261205000000` dan `20261206000000` |

Source di branch `main` berisi 109 file migration. Perbedaan jumlah ledger dan file source **bukan bukti bahwa semua migration yang belum tercatat aman untuk dijalankan**. Dua entri tanpa metadata juga menghalangi pembuktian penuh atas provenance dan kesetaraan SQL. Tabel `tenants` adalah root tenant; foreign key dan kebijakan tetap perlu direkonsiliasi terhadap source sebelum rilis.

## Tindakan tim backend

1. **Gunakan `ptsasgdvgrbdtgyqieie` sebagai target kanonis aplikasi.** Pada konfigurasi hosting, verifikasi `SUPABASE_PROJECT_REF=ptsasgdvgrbdtgyqieie` dan URL API memiliki host `ptsasgdvgrbdtgyqieie.supabase.co`. Jangan mengirim key/password dalam tiket, chat, atau log.
2. **Siapkan staging yang terpisah dari project Production `ptsas`**, dengan baseline/backup yang dapat dipulihkan. Buktikan prosedur restore pada staging.
3. Di staging, jalankan preflight read-only dari checkout `main` dan cocokkan seluruh 109 file migration terhadap ledger serta katalog aktual: tabel, constraint, indeks, fungsi/RPC, default privileges, RLS, grants, Storage, dan versi API.
4. Rekonsiliasi sumber migration `20261205000000` dan `20261206000000` tanpa mengubah ledger Production. Jika riwayat SQL tidak dapat dibuktikan, siapkan staging baru yang dibangun dari seluruh source, lalu jalankan suite dan UAT sintetis.
5. Arahkan atau konfirmasi check Supabase Preview agar tidak lagi mengarah ke `vqe`. Gunakan project/branch staging yang terpisah; jangan aktifkan preview branch pada `ptsas` selama project tersebut berstatus Production.
6. Uji autentikasi, role/tenant, alur modul, Storage privat, backup/restore, dan instalasi customer-managed pada staging. Periksa feature flags pada environment hosting; nilai contoh di `.env.example` bukan bukti konfigurasi hosting yang sedang berjalan.
7. **Jangan** jalankan `db push`, `migration repair`, reset, atau migration manual pada Production untuk menghilangkan selisih hitungan. Jangan hapus project `vqe` sebelum semua resource di luar tabel publik diaudit.

## Batas bukti

Snapshot ini membuktikan kondisi katalog dan ledger yang terlihat ketika query dijalankan; bukan kesetaraan seluruh database dengan source, perilaku semua endpoint, konfigurasi secret hosting, login/UAT, atau backup/restore Production. Tidak ada migration atau perubahan data Production yang dilakukan oleh audit ini.

