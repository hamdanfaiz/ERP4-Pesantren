# Titik Mulai Tim Backend — ERP4 Pesantren

**Diperbarui:** 31 Oktober 2026  
**Status:** siap dipakai sebagai urutan kerja; tidak menyatakan aplikasi siap produksi.

## Tim dapat mulai sekarang

Mulai dari **Fase 1: menyiapkan staging dan membaca keadaan database**. Tim tidak perlu menunggu seluruh sisa pengembangan atau memulai dari PR lama. Gunakan branch `main` sebagai sumber kode resmi.

## Baseline yang harus dipakai

- Baseline kode aplikasi yang diverifikasi untuk panduan ini berasal dari commit `8f64c4b729bf6548ef6bb441c609a1382e66b91d`; PR #20 hanya memperbarui dokumentasi. Saat mulai bekerja, checkout branch `main` terbaru dan catat SHA aktual yang digunakan.
- PR #13 adalah baseline cutover Supabase; PR #17 menghapus Firebase Admin dan jalur Firestore server; PR #18 memperbarui status kesiapan; PR #19 menambahkan panduan kickoff tim backend dan PR #20 menyelaraskan acuan checkpoint. Semuanya sudah merged.
- PR #1–#11 ditutup tanpa merge langsung karena implementasinya digantikan/dipetakan ke baseline cutover. Jangan cherry-pick atau memakai branch tersebut sebagai dasar deployment.
- Data Firestore pemilik adalah dummy dan tidak perlu disalin. Gunakan fixture sintetis untuk staging.
- Project Supabase `ptsasgdvgrbdtgyqieie` tercatat sebagai `main / PRODUCTION`. Jangan gunakan project itu untuk rehearsal.

## Fase 1 — staging dan inventaris baca-saja (mulai sekarang)

1. Siapkan project Supabase staging yang terpisah dari Production, atau environment staging mandiri yang dapat dipulihkan.
2. Checkout `main` dan catat commit yang dipakai. Pastikan migrasi dibaca dari commit yang sama dengan source aplikasi yang akan diuji.
3. Baca ledger migrasi dan katalog database tanpa menulis. Dari snapshot sebelumnya, ledger memiliki 47 versi sedangkan source `main` memiliki 109 file migration; metadata `name` dan `statements` untuk `20261205000000` serta `20261206000000` kosong. Angka ini adalah baseline historis dan harus dibaca ulang.
4. Jalankan `npm run preflight:db-migrations` dari root repo hanya setelah URL menunjuk ke staging yang benar. Simpan ringkasan hasilnya tanpa URL atau credential.
5. Pastikan ada backup staging dan bukti pemulihan sebelum rehearsal.

**Hambatan akses yang perlu ditangani:** pada percobaan terakhir, konektor MCP menolak permintaan baca ke target (`You do not have permission`), sedangkan koneksi langsung hanya berhasil mencapai pemeriksaan TLS lalu gagal memvalidasi rantai sertifikat (`SELF_SIGNED_CERT_IN_CHAIN`). Jangan mematikan verifikasi sertifikat. Tim dapat memakai jaringan/sertifikat tepercaya atau mengambil ledger dan katalog lewat SQL Editor dengan query baca-saja.

**Keluaran Fase 1:** ref staging yang terkonfirmasi, commit source, ringkasan ledger-vs-source, inventaris skema/RLS/Storage, dan bukti backup/restore staging.

**Jangan lakukan di fase ini:** menerapkan migration, mengubah feature flag Production, menyalin data ke Production, atau membagikan secret melalui chat/tiket.

## Fase 2 — rekonsiliasi source dan ledger

- Cocokkan seluruh versi ledger dengan berkas migration pada commit yang akan diuji, termasuk nama dan isi SQL jika metadata tersedia.
- Jelaskan setiap perbedaan dan dua baris metadata kosong pada baseline sebelumnya. Jangan menandai migration sebagai sudah diterapkan tanpa bukti schema yang sesuai.
- Tinjau urutan dependency, RLS/FORCE RLS, grant, foreign key tenant, function/RPC, Storage bucket/policy, indeks, dan extension.
- Buat rencana migration tertulis yang hanya menyebut perubahan yang terbukti belum ada pada staging.

**Keluaran Fase 2:** daftar selisih yang sudah dijelaskan dan rencana migration dengan urutan, risiko, validasi, serta cara pemulihan.

## Fase 3 — rehearsal pada staging

- Pulihkan backup/snapshot staging sesuai prosedur.
- Terapkan rencana migration hanya di staging. Jalankan CI/test yang relevan dari commit yang sama dan isi data sintetis melalui alur aplikasi.
- Verifikasi isolasi tenant dan matriks role/permission, Auth, PPDB, Master Data/NIS, transaksi asrama dan keuangan, Tahfidz, Storage, retry/idempotensi, serta log/error.
- Aktifkan flag hanya untuk irisan yang sudah lulus pemeriksaan dan catat hasil per domain. Biarkan fitur yang belum siap tetap fail-closed.

**Keluaran Fase 3:** laporan hasil rehearsal, daftar masalah beserta commit perbaikannya, dan bukti bahwa backup dapat dipulihkan.

## Fase 4 — penerimaan operasional oleh tim

- Lakukan UAT login, role/tenant, modul kritis, upload/download, dan pemulihan.
- Uji clean install, upgrade, backup, dan restore pada target VPS/on-premise yang disepakati. Pastikan konfigurasi runtime dan secret terpisah dari image aplikasi.
- Rotasi secret yang pernah dibagikan dan simpan nilai baru melalui secret manager. Jangan menaruh secret pada repo atau dokumen ini.

**Keluaran Fase 4:** hasil UAT yang ditandatangani, runbook instalasi/upgrade/restore, dan daftar sisa masalah yang disetujui untuk rilis atau ditutup.

## Fase 5 — rilis Production

Fase ini dikerjakan tim penerapan setelah fase 1–4 lulus. Sebelum perubahan, pastikan ulang project/ref Production, simpan backup yang dapat dipulihkan, gunakan migration dari commit rilis yang sama dengan aplikasi, dan dokumentasikan hasil pascapenerapan. Tidak ada perubahan Production yang dilakukan dalam checkpoint ini.

## Pembagian tanggung jawab

| Pekerjaan | Pemilik utama |
| --- | --- |
| Source code, perbaikan temuan, commit/PR, dan bukti CI | Codex / pengembang aplikasi |
| Menyediakan staging, izin akses baca-saja, backup, serta inventaris database | Tim backend |
| Rehearsal database, Auth/UAT, pengujian environment pelanggan, dan runbook operasi | Tim backend/penerapan |
| Perubahan database Production dan deploy hosting | Tim penerapan, setelah gerbang rilis lulus |

Untuk daftar gerbang komersial lengkap, lihat [COMMERCIAL_READINESS.md](../00_PRODUCT/COMMERCIAL_READINESS.md).