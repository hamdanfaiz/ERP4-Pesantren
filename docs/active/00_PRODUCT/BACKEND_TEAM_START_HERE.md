# Titik Mulai Tim Backend — ERP4 Pesantren

> **Checkpoint 31 Oktober 2026:** `main` pada base PR #38 (`e9e65e3e8b9d05d126a6150ce726f720722839c5`) memiliki 110 migration sampai `20270207000000`; PR #38 menambahkan lima migration, sementara VQE staging `vqemuyzveuirlkvdggjd` memiliki 115 sampai `20270212000000`. Source code commit `2ba3cdb362aba2a6fa8eaafdd60c5142ea0814f7` lulus CI 2/2 pada run [41168200484](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41168200484); head PR sesudahnya berisi pembaruan dokumentasi. PR tetap Draft/Open karena UAT UI Wali belum terbukti. Integrasi GitHub VQE terputus; PTSAS `ptsasgdvgrbdtgyqieie` tetap Production dan auto-deploy OFF.

Dokumen ini menyatakan keadaan yang terverifikasi untuk membantu tim melanjutkan pemeriksaan. Ini bukan pernyataan bahwa produk telah lulus UAT atau siap produksi.

## Keadaan lingkungan

| Lingkungan | Ref | Keadaan dan batas |
| --- | --- | --- |
| Staging ERP | `vqemuyzveuirlkvdggjd` | 115 migration diterapkan sampai `20270212000000`; tidak ada tenant, profil, kandidat, akun Auth, atau data uji persisten. Integrasi GitHub sudah terputus. Dashboard masih menampilkan label internal `main / PRODUCTION`; perlakukan VQE sebagai staging ERP sesuai keputusan pemilik. |
| Production ERP | `ptsasgdvgrbdtgyqieie` | Auto-deploy OFF. Konektor Codex saat ini menolak pembacaan project, ledger, dan katalog. Snapshot historis mencatat 119 tabel dan 47 entri ledger (dua tanpa metadata), tetapi belum diverifikasi ulang. Jangan deploy migration atau memperbaiki ledger sebelum rekonsiliasi baca-saja dan backup yang dapat dipulihkan. |

`main` dan VQE memang berbeda saat ini: VQE telah menerima lima migration dari PR #38 yang belum digabung. Jangan menyebut VQE setara dengan `main` sampai PR tersebut selesai atau migrasi staging direkonsiliasi. Tidak ada data Firestore yang perlu disalin.

## Tim dapat mulai sekarang

1. **Review PR #38:** periksa perubahan akses Wali terhadap tagihan PPDB sebelum onboarding, lima migration tambahan, RLS/grants, dan CI. PR masih Draft/Open karena UAT aplikasi Wali belum dilakukan. CI hijau belum menguji login melalui UI.
2. **Siapkan ulang UAT sintetis di VQE:** fixture sebelumnya sudah diuji dan dihapus setelah persetujuan pemilik; staging saat ini kosong. Siapkan konfigurasi server VQE di secret manager atau `.env` lokal yang diabaikan Git (jangan memakai `.env` Production), lalu buat tenant, akun Auth uji, profil Wali, kandidat, dan tagihan sintetis. Jangan gunakan akun/kredensial pelanggan atau PTSAS.
3. **Jalankan skenario UAT:** login Wali, lihat tagihan kandidat yang cocok, upload bukti ke bucket privat, tolak akses lintas-tenant atau kandidat yang tidak valid, onboarding kandidat, dan pastikan hubungan Wali–santri kanonis berfungsi. Catat bukti, hasil, dan commit yang diuji. Hapus fixture setelah UAT.
4. **Uji instalasi pelanggan:** ikuti runbook Docker/Compose pada VPS Linux dan VM on-premise bersih. Uji konfigurasi runtime, upgrade, backup serta restore database dan Storage. Catat hasil dan batas platform yang benar-benar diuji.
5. **Rekonsiliasi PTSAS secara baca-saja:** pastikan dashboard memilih ref `ptsasgdvgrbdtgyqieie`, lalu jalankan [skrip inventaris baca-saja](../06_DATABASE/PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION.sql) di SQL Editor. Skrip hanya membaca metadata ledger, katalog, grants, function, trigger, dan bucket; tidak membaca baris operasional dan menutup transaksi dengan `ROLLBACK`. Query-query di dalamnya sudah divalidasi sebagai SELECT pada VQE staging; skrip belum dijalankan pada PTSAS. Tim backend/operator dapat menyerahkan hasilnya kepada pengembang untuk dicocokkan dengan migration source. Auto-deploy harus tetap OFF.

## Konfigurasi staging yang masih dibutuhkan

Salin `.env.example` ke `.env` lokal yang diabaikan Git atau gunakan secret manager khusus VQE. Ambil URL, publishable key, dan secret key dari proyek VQE; jangan memakai atau menyalin nilai PTSAS Production dan jangan mengirim nilainya melalui chat.

Untuk alur UAT yang mencakup login Wali, tagihan, bukti, dan onboarding, konfigurasi server/browser mencakup `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_PPDB_TENANT_ID`, `PII_ENCRYPTION_KEY`, dan `PII_FINGERPRINT_KEY`. Buat kedua kunci PII secara acak dan independen, masing-masing 32 byte/64 karakter hex. Atur flag server dan pasangannya yang berawalan `VITE_` sesuai skenario PPDB, dokumen, finance bill, serta onboarding; semuanya harus tetap mati di Production sampai ada rencana rilis yang disetujui. Pendaftaran Wali memakai `SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED`; `PUBLIC_PPDB_ENABLED` hanya diperlukan jika UAT juga menguji pendaftaran calon santri publik. Kunci PII dan `SUPABASE_SECRET_KEY` tidak boleh masuk bundle klien.

## Gerbang sebelum PR #38 siap digabung

- UAT Wali PPDB dan isolasi tenant lulus dengan fixture sintetis.
- CI lulus pada commit source kode `2ba3cdb362aba2a6fa8eaafdd60c5142ea0814f7` (run `41168200484`); perubahan kode setelah commit itu memerlukan CI baru. Head PR setelah commit kode berisi dokumentasi saja.
- Tim backend meninjau function/RPC, grants, RLS, Storage privat, dan dampak migration.
- Tidak ada migration Production yang diterapkan. Rekonsiliasi PTSAS, backup/restore, dan persetujuan change window adalah pekerjaan terpisah sebelum cutover.

## Batas yang diketahui

- Firebase tidak menjadi runtime aplikasi pada import graph aktif yang dijaga CI. Source legacy dan Firebase sebagai devDependency masih tersimpan; guard memeriksa agar keduanya tidak masuk runtime bundle.
- Fixture UAT VQE sudah dibersihkan; saat ini tidak ada tenant/akun uji persisten. Preview lokal memuat halaman ERP melalui `http://localhost:4179` dengan URL dan publishable key VQE saja, tetapi worktree tidak punya secret server VQE maupun tenant sintetis sehingga login, tagihan Wali, upload, onboarding, dan isolasi tenant lewat UI belum terbukti.
- PTSAS belum dapat diaudit ulang melalui konektor. Snapshot Production yang tercantum di dokumen lama bersifat historis.
- PPOB/payment gateway dikeluarkan dari rilis awal.
- Persentase penyelesaian keseluruhan tidak dihitung dari kemajuan schema atau CI saja.

## Kepemilikan pekerjaan

| Pekerjaan | Pemilik |
| --- | --- |
| Source aplikasi, perbaikan, PR dan CI | Pengembang aplikasi |
| Provisioning sintetis, akses staging, inventaris, backup | Tim backend |
| UAT fungsi pesantren dan persetujuan hasil | Tim backend dan perwakilan pesantren |
| Instalasi VPS/on-premise, operasi, runbook | Tim backend/penerapan |
| Rekonsiliasi serta deployment PTSAS Production | Tim backend/penerapan setelah rencana disetujui |

Dokumen terkait: [temuan redirect Auth Production](PRODUCTION_AUTH_REDIRECT_CHECKPOINT_2026-10-31.md), [checkpoint staging PR #38](../06_DATABASE/CHECKPOINT_GUARDIAN_PPDB_STAGING_2026-10-31.md), [audit cutover Supabase](../06_DATABASE/SUPABASE_PROJECT_REF_CUTOVER_AUDIT_2026-10-31.md), [snapshot Production](../06_DATABASE/PTSAS_PRODUCTION_READINESS_SNAPSHOT_2026-10-31.md), dan [kesiapan komersial](COMMERCIAL_READINESS.md).
