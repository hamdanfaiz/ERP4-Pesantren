# Audit environment Supabase ERP: VQE staging dan PTSAS Production — 31 Oktober 2026

Dokumen ini mencatat bukti untuk membedakan perpindahan antarproyek Supabase dari cutover runtime ERP/Firebase. Tidak ada schema, baris database, Auth, Storage, atau migration PTSAS Production yang diubah. Pada 31 Oktober 2026, project VQE ditetapkan sebagai staging ERP dan integrasi GitHub-nya dihubungkan ke repo `hamdanfaiz/ERP4-Pesantren`; penerapan otomatis hanya berlaku pada VQE. Integrasi PTSAS tidak diubah.

## Hasil audit project sumber VQE

Project Supabase `vqemuyzveuirlkvdggjd` berstatus `ACTIVE_HEALTHY` pada saat dibaca. Inventaris baca-saja yang tersedia menunjukkan:

- 0 tabel pada schema `public`;
- 0 versi migration;
- 0 pengguna Supabase Auth;
- 0 bucket dan 0 objek Storage;
- 0 Edge Function; dan
- 0 routine pada schema `public`.

Dengan inventaris tersebut, tidak ada isi database Supabase yang terdeteksi untuk disalin dari VQE ke PTSAS. Pemeriksaan ini bukan audit lengkap untuk seluruh konfigurasi project: secrets, seluruh schema non-public, konfigurasi provider Auth, log, dan referensi deployment eksternal tidak diperiksa. Project VQE tetap aktif dan tidak dihapus atau dijeda. Sesuai persetujuan pemilik, VQE kini dipakai sebagai staging ERP: repository `hamdanfaiz/ERP4-Pesantren`, working directory `.`, branch `main`, dan `Deploy to production` aktif di project VQE. Supabase menamai branch internalnya `main / PRODUCTION`; untuk lingkungan ERP ini project tersebut tetap diperlakukan sebagai staging.

PR #35 (squash commit `92d1cda5f6ba1336d661108babb16f94c52ebdbd`) hanya memperbarui dokumentasi dan tidak mengubah `supabase/migrations`. Pembacaan VQE sesudah merge tersebut masih menunjukkan 0 migration, 0 tabel aplikasi pada `public`, 0 pengguna Auth, 0 bucket/objek Storage, dan 0 Edge Function; schema ERP belum diterapkan. PR #36 menambahkan migration metadata `20270207000000_public_schema_migration_ownership.sql` untuk memicu deployment berurutan pada staging VQE saja.

## Project tujuan PTSAS dan integrasi repository

Project tujuan Production ERP adalah `ptsasgdvgrbdtgyqieie`. Dashboard mengonfirmasi integrasi GitHub PTSAS tetap menunjuk ke `hamdanfaiz/ERP4-Pesantren`, working directory `.`, dan `Deploy to production` tetap **OFF**. Project ini berada pada branch `main / PRODUCTION`; preview branch otomatis tidak tersedia pada paket Free. Menghubungkan VQE sebagai staging tidak mengubah konfigurasi atau database PTSAS.

- `Deploy to production` tetap **OFF**.
- Dashboard menampilkan branch `main / PRODUCTION`; PTSAS bukan staging.
- Paket Free tidak menyediakan preview branch otomatis.
- Tidak ada migration atau penulisan data ke PTSAS dalam audit ini.

### Hasil ledger migration baca-saja, diverifikasi ulang 31 Oktober 2026

Query SELECT di SQL Editor PTSAS mengonfirmasi 119 tabel publik dan 47 versi pada `supabase_migrations.schema_migrations`. Versi awal adalah `20260603000000`, versi terakhir `20261206000000`. Dua entri terakhir, `20261205000000` dan `20261206000000`, tidak memiliki `name` maupun `statements` pada ledger.

Sebelum PR #36, source `main` berisi 109 file migration; file terakhirnya `20270206000000_tahfidz_peer_review_moderation.sql`. PR #36 menambahkan satu migration metadata, sehingga rantai yang akan diuji berjumlah 110 file. Sebanyak 62 versi source setelah batas ledger—dari `20261207000000_library_legacy_catalog_import.sql` sampai `20270206000000_tahfidz_peer_review_moderation.sql`—belum tercatat sebagai applied di PTSAS. Jumlah versi tidak membuktikan kesetaraan definisi schema; metadata dua entri terakhir juga perlu direkonstruksi dari bukti lain.

GitHub Actions run [41147695131](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41147695131) berhasil pada Supabase lokal sintetis. Run tersebut merehearsal upgrade dari batas ledger 47 versi, menerapkan seluruh migration source berikutnya, dan menjalankan pgTAP, transaksi serentak, API/tenant, Storage, serta backup/restore. Ini membuktikan urutan migration dapat dijalankan pada fixture lokal tersebut, tetapi tidak membuktikan schema Production bebas drift atau bahwa perubahan Production aman tanpa staging/backup yang dapat dipulihkan.

## Cutover runtime ERP

Audit Supabase VQE yang kosong **tidak membuktikan** bahwa seluruh ERP telah lepas dari Firebase. Source `main` sudah memiliki runtime Supabase-only pada jalur aktif: CI PR #17 dan run di atas memverifikasi bahwa import graph frontend aktif tidak memuat Firebase dan server tidak memiliki jalur Firebase Admin/Firestore. Source layar legacy dan Firebase sebagai devDependency masih dipertahankan untuk kompatibilitas/typecheck; ini tidak dengan sendirinya berarti browser atau server aktif memakai Firebase.

Konfigurasi repository menargetkan PTSAS, tetapi nilai `VITE_SUPABASE_URL` dan `SUPABASE_URL` pada environment hosting belum diverifikasi. Uji login/UAT pada project tujuan juga belum dilakukan.

## Kesimpulan dan gerbang berikutnya

1. **Project VQE:** ditetapkan sebagai staging ERP dan terhubung ke repo `hamdanfaiz/ERP4-Pesantren`, branch `main`, dengan penerapan migration otomatis hanya pada VQE. Merge PR #35 tidak mengubah migration, jadi inventory VQE tetap kosong. PR #36 perlu lulus CI dan digabung sebelum kita mengharapkan deployment schema.
2. **Project PTSAS:** tetap menjadi target Production, terhubung ke repo ERP, dan penerapan otomatis Production tetap **OFF**. Preview branch PTSAS tidak tersedia pada paket Free.
3. **Firebase → Supabase:** runtime jalur aktif telah lolos guard CI, tetapi validasi environment hosting, staging/rehearsal pada salinan target, rekonsiliasi ledger 47 versi dengan 109 file source, serta login/UAT masih harus dituntaskan.
4. Setelah PR #36 digabung, verifikasi seluruh 110 migration pada staging VQE dari repo `main`. Jangan menyalin data dummy Firestore; gunakan fixture sintetis untuk membuktikan alur serta relasi. Rehearsal CI lulus pada Supabase lokal, tetapi belum menjadi bukti bahwa VQE sudah menerima migration.
5. Setelah rekonsiliasi, minta tim penerapan memvalidasi kedua variabel URL runtime pada environment mereka, lalu lakukan UAT dan smoke test. PTSAS Production tetap tidak menerima migration otomatis dari merge GitHub.
