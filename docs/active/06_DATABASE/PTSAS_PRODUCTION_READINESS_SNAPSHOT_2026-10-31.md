# Snapshot Audit Staging VQE dan Target Production ERP4-Pesantren

## Ringkasan

- Source resmi: branch `main`, commit `edd5385fee4d10db64681de9cc08ee757130eb78` (sesudah PR #36). Source memiliki 110 migration; ledger VQE telah diverifikasi cocok setara 110/110.
- `supabase/config.toml` pada source menetapkan project ref `ptsasgdvgrbdtgyqieie`.
- `src/runtimeBackend.ts` mengarahkan runtime frontend ke Supabase-only. Firestore berisi data dummy dan tidak perlu disalin, sesuai keputusan pemilik proyek.
- Dashboard Supabase menampilkan project `ERP4-Pesantren`, ref `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`. Project ini harus diperlakukan sebagai Production, bukan staging.
- Project `vqemuyzveuirlkvdggjd` adalah staging ERP. Setelah PR #36 digabung, 110/110 versi migration source `main` tercatat di VQE tanpa versi hilang atau ekstra. Inventaris baca-saja menunjukkan 160 tabel public; 160/160 RLS aktif dan FORCE RLS; 159 tabel tenant-scoped (tabel root `tenants` dikecualikan); 5 policy public; 0 hak langsung `anon`; 0 grant tulis langsung `authenticated`; 4 bucket Storage, semuanya privat; tenants=0 dan auth.users=0. Skema siap untuk provisioning sintetis dan UAT; belum ada akun atau tenant yang dibuat.
- Integrasi GitHub pada PTSAS tetap menunjuk ke `hamdanfaiz/ERP4-Pesantren` dengan working directory `.`; `Deploy to production` tetap OFF. Paket Free tidak menyediakan preview branch otomatis. Check `Supabase Preview` lama pada PR #28 dilewati dan riwayat check-nya masih mengarah ke VQE; itu adalah hasil historis, bukan bukti deployment atau sinkronisasi schema PTSAS.

## Hasil query baca-saja Production dari snapshot terdahulu

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

PTSAS memiliki snapshot historis baca-saja: 119 tabel public dan 47 versi ledger (`20260603000000`–`20261206000000`), dengan metadata `name`/`statements` kosong pada dua entri terakhir. Snapshot Production ini belum diverifikasi ulang pada checkpoint ini karena konektor MCP menolak akses PTSAS. VQE terverifikasi penuh pada versi migration, tetapi hal itu tidak membuktikan ledger/schema Production setara atau aman menerima migration.

## Tindakan tim backend

1. **Gunakan `ptsasgdvgrbdtgyqieie` sebagai target kanonis aplikasi.** Pada konfigurasi hosting, verifikasi `SUPABASE_PROJECT_REF=ptsasgdvgrbdtgyqieie` dan URL API memiliki host `ptsasgdvgrbdtgyqieie.supabase.co`. Jangan mengirim key/password dalam tiket, chat, atau log.
2. **VQE adalah staging ERP** dan PTSAS adalah Production. Penerapan otomatis sudah aktif pada VQE dan tetap OFF pada PTSAS.
3. Gunakan VQE untuk provisioning tenant/Auth sintetis, uji login dan role/tenant, seluruh alur modul, Storage privat, backup/restore, serta uji pemasangan pelanggan. Rekonsiliasi Production dilakukan tim backend secara terpisah dan baca-saja sebelum menyusun rencana cutover.
4. Rekonsiliasi versi ledger PTSAS `20261205000000` dan `20261206000000` tanpa mengubah ledger Production. Karena VQE sudah memuat seluruh 110 migration, gunakan VQE untuk regression/UAT dan rehearsal perubahan baru. Jika riwayat SQL Production tidak dapat dibuktikan, jangan menyalin status migration atau menganggap schema Production sama dengan VQE.
5. Check Supabase Preview pada PR #28 adalah hasil historis. VQE kini menjadi staging yang disengaja; jangan mengaktifkan deployment otomatis pada PTSAS selama project tersebut berstatus Production.
6. Uji autentikasi, role/tenant, alur modul, Storage privat, backup/restore, dan instalasi customer-managed pada staging. Periksa feature flags pada environment hosting; nilai contoh di `.env.example` bukan bukti konfigurasi hosting yang sedang berjalan.
7. **Jangan** jalankan `db push`, `migration repair`, reset, atau migration manual pada Production untuk menghilangkan selisih hitungan. Jangan hapus project `vqe` sebelum semua resource di luar tabel publik diaudit.

## Batas bukti

Snapshot ini membuktikan kondisi katalog dan ledger yang terlihat ketika query dijalankan; bukan kesetaraan seluruh database dengan source, perilaku semua endpoint, konfigurasi secret hosting, login/UAT, atau backup/restore Production. Tidak ada migration atau perubahan data Production yang dilakukan oleh audit ini.


## Addendum status terkini — 31 Oktober 2026

- Angka 110/110 untuk VQE dan source `main` di bagian Ringkasan adalah snapshot saat checkpoint sebelumnya dibuat. Keadaan terbaru: `main` pada base PR #38 memiliki 110 migrasi sampai `20270207000000`, sedangkan VQE memiliki 112 sampai `20270209000000`; dua migrasi tambahan masih berada di PR #38 yang Draft. VQE kini lebih maju dua migrasi dari `main`.
- Konektor Supabase menolak akses baca PTSAS untuk pemeriksaan `get_project`, `list_migrations`, dan `list_tables`. Karena itu, catatan 119 tabel, 47 versi ledger, status integrasi, serta auto-deploy di dokumen ini adalah bukti historis saja dan belum diverifikasi ulang pada kondisi terkini. Tidak ada perubahan PTSAS yang dilakukan.
- Integrasi GitHub VQE sudah diputus; dashboard tetap memberi label `main / PRODUCTION`. Jangan menyimpulkan label itu sebagai status kesetaraan skema atau bukti deployment.
- VQE belum berisi tenant, akun Auth, profil, kandidat, atau tagihan; UAT manual belum berjalan. PR #38 tetap Draft sampai alur Wali dan isolasi tenant diuji.
