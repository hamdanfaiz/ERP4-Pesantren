# Audit perpindahan Supabase VQE ke PTSAS — 31 Oktober 2026

Dokumen ini mencatat bukti baca-saja untuk membedakan perpindahan antarproyek Supabase dari cutover runtime ERP/Firebase. Tidak ada schema, baris database, Auth, Storage, migration, atau konfigurasi deployment Production yang diubah dalam audit ini.

## Hasil audit project sumber VQE

Project Supabase `vqemuyzveuirlkvdggjd` berstatus `ACTIVE_HEALTHY` pada saat dibaca. Inventaris baca-saja yang tersedia menunjukkan:

- 0 tabel pada schema `public`;
- 0 versi migration;
- 0 pengguna Supabase Auth;
- 0 bucket dan 0 objek Storage;
- 0 Edge Function; dan
- 0 routine pada schema `public`.

Dengan inventaris tersebut, tidak ada isi database Supabase yang terdeteksi untuk disalin dari VQE ke PTSAS. Pemeriksaan ini bukan audit lengkap untuk seluruh konfigurasi project: secrets, seluruh schema non-public, konfigurasi provider Auth, log, dan referensi deployment eksternal tidak diperiksa. Project VQE masih aktif dan tidak dihapus atau dijeda.

## Project tujuan PTSAS dan integrasi repository

Project tujuan ERP adalah `ptsasgdvgrbdtgyqieie`. Pada dashboard Supabase, pengaturan GitHub sebelumnya menunjuk ke repository yang salah. Pengaturan kini menunjuk ke `hamdanfaiz/ERP4-Pesantren`, working directory `.`, dan tetap tersimpan setelah halaman dimuat ulang.

- `Deploy to production` tetap **OFF**.
- Dashboard menampilkan branch `main / PRODUCTION`; PTSAS bukan staging.
- Paket Free tidak menyediakan preview branch otomatis.
- Tidak ada migration atau penulisan data ke PTSAS dalam audit ini.

### Hasil ledger migration baca-saja, diverifikasi ulang 31 Oktober 2026

Query SELECT di SQL Editor PTSAS mengonfirmasi 119 tabel publik dan 47 versi pada `supabase_migrations.schema_migrations`. Versi awal adalah `20260603000000`, versi terakhir `20261206000000`. Dua entri terakhir, `20261205000000` dan `20261206000000`, tidak memiliki `name` maupun `statements` pada ledger.

Source `main` berisi 109 file migration; file terakhir yang tercatat di source adalah `20270206000000_tahfidz_peer_review_moderation.sql`. Sebanyak 62 versi source setelah batas ledger—dari `20261207000000_library_legacy_catalog_import.sql` sampai `20270206000000_tahfidz_peer_review_moderation.sql`—belum tercatat sebagai applied di PTSAS. Jumlah versi tidak membuktikan kesetaraan definisi schema; metadata dua entri terakhir juga perlu direkonstruksi dari bukti lain.

GitHub Actions run [41147695131](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41147695131) berhasil pada Supabase lokal sintetis. Run tersebut merehearsal upgrade dari batas ledger 47 versi, menerapkan seluruh migration source berikutnya, dan menjalankan pgTAP, transaksi serentak, API/tenant, Storage, serta backup/restore. Ini membuktikan urutan migration dapat dijalankan pada fixture lokal tersebut, tetapi tidak membuktikan schema Production bebas drift atau bahwa perubahan Production aman tanpa staging/backup yang dapat dipulihkan.

## Cutover runtime ERP

Audit Supabase VQE yang kosong **tidak membuktikan** bahwa seluruh ERP telah lepas dari Firebase. Source `main` sudah memiliki runtime Supabase-only pada jalur aktif: CI PR #17 dan run di atas memverifikasi bahwa import graph frontend aktif tidak memuat Firebase dan server tidak memiliki jalur Firebase Admin/Firestore. Source layar legacy dan Firebase sebagai devDependency masih dipertahankan untuk kompatibilitas/typecheck; ini tidak dengan sendirinya berarti browser atau server aktif memakai Firebase.

Konfigurasi repository menargetkan PTSAS, tetapi nilai `VITE_SUPABASE_URL` dan `SUPABASE_URL` pada environment hosting belum diverifikasi. Uji login/UAT pada project tujuan juga belum dilakukan.

## Kesimpulan dan gerbang berikutnya

1. **Project Supabase lama VQE:** inventory yang dapat diperiksa kosong; tidak ada isi database Supabase yang terdeteksi untuk dipindahkan. Jangan menghapus VQE sebelum memastikan tidak ada consumer eksternal, Auth provider, Storage, secrets, atau deployment yang masih merujuk padanya.
2. **Integrasi GitHub → PTSAS:** kini menunjuk ke repo ERP yang benar; penerapan otomatis Production tetap dimatikan.
3. **Firebase → Supabase:** runtime jalur aktif telah lolos guard CI, tetapi validasi environment hosting, staging/rehearsal pada salinan target, rekonsiliasi ledger 47 versi dengan 109 file source, serta login/UAT masih harus dituntaskan.
4. Sediakan staging Supabase terisolasi yang dapat dipulihkan. Bandingkan nomor, nama, isi SQL, constraint, policy, dan efek migration pada staging terlebih dahulu. Jangan menyalin data dummy Firestore; gunakan fixture sintetis untuk membuktikan alur serta relasi.
5. Setelah rekonsiliasi, minta tim penerapan memvalidasi kedua variabel URL runtime pada environment mereka, lalu lakukan UAT dan smoke test. PTSAS Production tetap tidak menerima migration otomatis dari merge GitHub.
