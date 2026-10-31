# Audit environment Supabase ERP: VQE staging dan PTSAS Production — 31 Oktober 2026

Dokumen ini mencatat bukti untuk membedakan perpindahan antarproyek Supabase dari cutover runtime ERP/Firebase. Tidak ada schema, baris database, Auth, Storage, atau migration PTSAS Production yang diubah. Pada 31 Oktober 2026, project VQE ditetapkan sebagai staging ERP dan integrasi GitHub-nya dihubungkan ke repo `hamdanfaiz/ERP4-Pesantren`; penerapan otomatis hanya berlaku pada VQE. Integrasi PTSAS tidak diubah.

## Kondisi awal project VQE sebelum dipakai sebagai staging

Pada pemeriksaan awal sebelum deployment schema, project Supabase `vqemuyzveuirlkvdggjd` berstatus `ACTIVE_HEALTHY`. Inventaris baca-saja awal menunjukkan:

- 0 tabel pada schema `public`;
- 0 versi migration;
- 0 pengguna Supabase Auth;
- 0 bucket dan 0 objek Storage;
- 0 Edge Function; dan
- 0 routine pada schema `public`.

Dengan inventaris tersebut, tidak ada isi database Supabase yang terdeteksi untuk disalin dari VQE ke PTSAS. Pemeriksaan ini bukan audit lengkap untuk seluruh konfigurasi project: secrets, seluruh schema non-public, konfigurasi provider Auth, log, dan referensi deployment eksternal tidak diperiksa. Project VQE tetap aktif dan tidak dihapus atau dijeda. Sesuai persetujuan pemilik, VQE kini dipakai sebagai staging ERP: repository `hamdanfaiz/ERP4-Pesantren`, working directory `.`, branch `main`, dan `Deploy to production` aktif di project VQE. Supabase menamai branch internalnya `main / PRODUCTION`; untuk lingkungan ERP ini project tersebut tetap diperlakukan sebagai staging.

PR #35 (squash commit `92d1cda5f6ba1336d661108babb16f94c52ebdbd`) hanya memperbarui dokumentasi. Setelah integrasi VQE aktif, PR #36 digabung pada commit `edd5385fee4d10db64681de9cc08ee757130eb78` dan migration chain diterapkan. Verifikasi baca-saja setelah deployment mencocokkan 110 versi source `main` dengan 110 versi ledger VQE tanpa versi hilang atau tambahan; inventaris VQE menunjukkan 160 tabel `public`, seluruhnya RLS-enabled dan FORCE RLS, serta 4 bucket Storage privat. Tidak ada record Firestore yang disalin.

## Project tujuan PTSAS dan integrasi repository

Project tujuan Production ERP adalah `ptsasgdvgrbdtgyqieie`. Dashboard mengonfirmasi integrasi GitHub PTSAS tetap menunjuk ke `hamdanfaiz/ERP4-Pesantren`, working directory `.`, dan `Deploy to production` tetap **OFF**. Project ini berada pada branch `main / PRODUCTION`; preview branch otomatis tidak tersedia pada paket Free. Menghubungkan VQE sebagai staging tidak mengubah konfigurasi atau database PTSAS.

- `Deploy to production` tetap **OFF**.
- Dashboard menampilkan branch `main / PRODUCTION`; PTSAS bukan staging.
- Paket Free tidak menyediakan preview branch otomatis.
- Tidak ada migration atau penulisan data ke PTSAS dalam audit ini.

### Snapshot historis ledger migration PTSAS

Pada snapshot Production terdahulu, query SELECT di SQL Editor PTSAS mengonfirmasi 119 tabel publik dan 47 versi pada `supabase_migrations.schema_migrations`. Versi awal adalah `20260603000000`, versi terakhir `20261206000000`. Dua entri terakhir, `20261205000000` dan `20261206000000`, tidak memiliki `name` maupun `statements` pada ledger. Hasil tersebut belum diverifikasi ulang pada checkpoint ini.

Snapshot PTSAS terdahulu mencatat 119 tabel publik dan 47 versi ledger sampai `20261206000000`, termasuk dua versi terakhir tanpa metadata `name`/`statements`. Snapshot itu berasal dari pemeriksaan sebelumnya; akses MCP PTSAS saat checkpoint ini tetap ditolak, sehingga kondisi ledger Production dan kesetaraannya dengan source terkini belum diverifikasi ulang. Jangan menyimpulkan bahwa selisih dapat diterapkan otomatis.

GitHub Actions run [41147695131](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41147695131) berhasil pada Supabase lokal sintetis. Run tersebut merehearsal upgrade dari batas ledger 47 versi, menerapkan seluruh migration source berikutnya, dan menjalankan pgTAP, transaksi serentak, API/tenant, Storage, serta backup/restore. Ini membuktikan urutan migration dapat dijalankan pada fixture lokal tersebut, tetapi tidak membuktikan schema Production bebas drift atau bahwa perubahan Production aman tanpa staging/backup yang dapat dipulihkan.

## Cutover runtime ERP

Audit Supabase VQE yang kosong **tidak membuktikan** bahwa seluruh ERP telah lepas dari Firebase. Source `main` sudah memiliki runtime Supabase-only pada jalur aktif: CI PR #17 dan run di atas memverifikasi bahwa import graph frontend aktif tidak memuat Firebase dan server tidak memiliki jalur Firebase Admin/Firestore. Source layar legacy dan Firebase sebagai devDependency masih dipertahankan untuk kompatibilitas/typecheck; ini tidak dengan sendirinya berarti browser atau server aktif memakai Firebase.

Konfigurasi repository menargetkan PTSAS, tetapi nilai `VITE_SUPABASE_URL` dan `SUPABASE_URL` pada environment hosting belum diverifikasi. Uji login/UAT pada project tujuan juga belum dilakukan.

## Kesimpulan dan gerbang berikutnya

1. **Project VQE:** staging sudah menerima seluruh 110 migration source `main`; perbandingan set versi source-ledger menunjukkan tidak ada yang hilang atau ekstra. Inventaris saat verifikasi: 160 tabel publik, 160/160 RLS-enabled, 160/160 FORCE RLS, 159 tabel ber-`tenant_id` (tabel root `tenants` dikecualikan), 5 policy publik, 0 grant langsung ke `anon`, dan 0 hak tulis langsung bagi `authenticated`. Empat bucket Storage privat sudah ada. Belum ada tenant atau pengguna Auth, sesuai staging kosong; login/UAT masih perlu dilakukan.
2. **Project PTSAS:** tetap menjadi target Production, terhubung ke repo ERP, dan penerapan otomatis Production tetap **OFF**. Preview branch PTSAS tidak tersedia pada paket Free.
3. **Firebase → Supabase:** runtime jalur aktif telah lolos guard CI dan jalur Firebase Admin/Firestore server sudah dihapus. Validasi environment hosting, provisioning tenant/Auth, login/UAT, dan uji instalasi pelanggan belum dilakukan.
4. CI PR #36 lulus pada [run 41153976106](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41153976106), 2/2 job. Rehearsal lokal sintetis, pgTAP, pemeriksaan API/tenant, transaksi serentak NIS dan Tahfidz, Storage, backup/restore, serta smoke Docker/Compose berhasil. Ini bukti CI, bukan pengganti UAT oleh pengguna.
5. Setelah rekonsiliasi, minta tim penerapan memvalidasi kedua variabel URL runtime pada environment mereka, lalu lakukan UAT dan smoke test. PTSAS Production tetap tidak menerima migration otomatis dari merge GitHub.


## Addendum status terkini — 31 Oktober 2026

Bagian yang lebih lama dalam dokumen ini menggambarkan keadaan sebelum VQE ditetapkan sebagai staging dan integrasi repository-nya kemudian diputus. Gunakan addendum ini untuk keadaan sekarang:

- VQE `vqemuyzveuirlkvdggjd` merupakan staging ERP sesuai keputusan pemilik. Database mencatat 115 migration sampai `20270212000000`; lima migration tersebut berasal dari PR #38 yang masih Draft/Open dan belum ada di `main` (base `e9e65e3e8b9d05d126a6150ce726f720722839c5`, 110 migration sampai `20270207000000`).
- Integrasi GitHub pada project VQE telah terputus. Dashboard masih menampilkan label branch internal `main / PRODUCTION`; label itu bukan status integrasi repo maupun penetapan VQE sebagai Production ERP.
- CI PR #38 pada run [41166754714](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41166754714) lulus 2/2 job. PR tetap Draft/Open sampai UAT UI Wali PPDB, upload bukti, onboarding, dan isolasi tenant dilakukan.
- VQE kosong dari tenant, profil, kandidat, akun Auth, dan record uji persisten pada checkpoint ini. Belum ada login/UAT UI yang terbukti. Jangan membuat fixture tanpa persetujuan eksplisit dan gunakan data sintetis saja.
- PTSAS `ptsasgdvgrbdtgyqieie` tetap Production, auto-deploy OFF, dan tidak disentuh. Permintaan baca terbaru melalui konektor untuk project, migration ledger, dan katalog ditolak; angka katalog/ledger dalam bagian sebelumnya adalah snapshot historis, bukan bukti keadaan live saat ini.
- Tidak ada data Firestore dummy yang disalin dan tidak ada perubahan pada database PTSAS. Integrasi repo VQE yang terputus tidak mengubah data database staging.

