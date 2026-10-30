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

Snapshot dashboard baca-saja yang tercatat sebelumnya menemukan 119 tabel publik dan 47 versi migration pada PTSAS. Repository source `main` berisi 109 file migration. Angka tersebut berasal dari snapshot terdokumentasi, bukan pemeriksaan ulang ledger pada sesi ini. Sampai ledger dan definisi schema direkonsiliasi pada environment yang dapat dipulihkan, jangan menerapkan migration ke PTSAS Production secara otomatis.

## Cutover runtime ERP

Audit Supabase VQE yang kosong **tidak membuktikan** bahwa seluruh ERP telah lepas dari Firebase. Source `main` sudah memiliki runtime Supabase-only pada jalur aktif: CI PR #17 memverifikasi bahwa import graph frontend aktif tidak memuat Firebase dan server tidak memiliki jalur Firebase Admin/Firestore. Source layar legacy dan Firebase sebagai devDependency masih dipertahankan untuk kompatibilitas/typecheck; ini tidak dengan sendirinya berarti browser atau server aktif memakai Firebase.

Konfigurasi repository menargetkan PTSAS, tetapi nilai `VITE_SUPABASE_URL` dan `SUPABASE_URL` pada environment hosting belum diverifikasi. Uji login/UAT pada project tujuan juga belum dilakukan.

## Kesimpulan dan gerbang berikutnya

1. **Project Supabase lama VQE:** inventory yang dapat diperiksa kosong; tidak ada isi database Supabase yang terdeteksi untuk dipindahkan. Jangan menghapus VQE sebelum memastikan tidak ada consumer eksternal, Auth provider, Storage, secrets, atau deployment yang masih merujuk padanya.
2. **Integrasi GitHub → PTSAS:** kini menunjuk ke repo ERP yang benar; penerapan otomatis Production tetap dimatikan.
3. **Firebase → Supabase:** target aplikasi adalah PTSAS, tetapi validasi environment hosting, rekonsiliasi 109 file source dengan ledger PTSAS, staging/rehearsal, serta login/UAT masih harus dituntaskan.
4. Sediakan staging Supabase terisolasi yang dapat dipulihkan. Bandingkan nomor, nama, isi SQL, constraint, policy, dan efek migration pada staging terlebih dahulu. Jangan menyalin data dummy Firestore; gunakan fixture sintetis untuk membuktikan alur serta relasi.
5. Setelah rekonsiliasi, minta tim penerapan memvalidasi kedua variabel URL runtime pada environment mereka, lalu lakukan UAT dan smoke test. PTSAS Production tetap tidak menerima migration otomatis dari merge GitHub.
