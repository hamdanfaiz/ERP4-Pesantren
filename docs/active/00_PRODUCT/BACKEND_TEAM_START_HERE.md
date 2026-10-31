# Titik Mulai Tim Backend — ERP4 Pesantren

> **Checkpoint 31 Oktober 2026:** PR #38 head `af9db8378e91c62b682e44e994302abd24f026c2` sudah lulus CI 3/3 pada [run 41184875367](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41184875367). Perubahan terakhir memperjelas error Auth 429 baik dari respons SDK maupun exception. Lokal: test recovery, lint/typecheck, build, dan guard konfigurasi deployment lulus. VQE staging sehat dengan satu tenant dan satu profil Admin aktif; reset kata sandi masih terkena batas email bawaan. PTSAS `ptsasgdvgrbdtgyqieie` tetap Production dan tidak disentuh; konektor menolak pembacaan PTSAS, auto-deploy tetap OFF.

Dokumen ini menyatakan keadaan yang terverifikasi untuk membantu tim melanjutkan pemeriksaan. Ini bukan pernyataan bahwa produk telah lulus UAT atau siap produksi.

## Keadaan lingkungan

| Lingkungan | Ref | Keadaan dan batas |
| --- | --- | --- |
| Staging ERP | `vqemuyzveuirlkvdggjd` | Project berstatus `ACTIVE_HEALTHY`, 115 migration diterapkan sampai `20270212000000`. Tenant sintetis aktif dengan satu profil `admin:active`; kandidat, Wali, relasi, tagihan, dan permintaan Finance masih nol. Integrasi GitHub sudah terputus. Dashboard menampilkan label internal `main / PRODUCTION`; perlakukan VQE sebagai staging ERP sesuai keputusan pemilik. Auth mengembalikan 429 untuk email recovery karena batas email bawaan. |
| Production ERP | `ptsasgdvgrbdtgyqieie` | Auto-deploy OFF. Konektor Codex saat ini menolak pembacaan project, ledger, dan katalog. Snapshot historis mencatat 119 tabel dan 47 entri ledger (dua tanpa metadata), tetapi belum diverifikasi ulang. Jangan deploy migration atau memperbaiki ledger sebelum rekonsiliasi baca-saja dan backup yang dapat dipulihkan. |

`main` dan VQE memang berbeda saat ini: VQE telah menerima lima migration dari PR #38 yang belum digabung. Jangan menyebut VQE setara dengan `main` sampai PR tersebut selesai atau migrasi staging direkonsiliasi. Tidak ada data Firestore yang perlu disalin.

## Tim dapat mulai sekarang

1. **Review PR #38:** periksa perubahan akses Wali terhadap tagihan PPDB sebelum onboarding, lima migration tambahan, RLS/grants, dan CI. PR masih Draft/Open karena UAT aplikasi Wali belum dilakukan. CI hijau belum menguji login melalui UI.
2. **Lanjutkan UAT sintetis di VQE:** tenant dan profil Admin uji sudah ada; jangan membuat tenant atau akun Admin duplikat. Pulihkan akses Admin melalui satu email recovery setelah batas pengiriman pulih, atau konfigurasi SMTP khusus hanya pada VQE. Setelah Admin bisa masuk, buat profil Wali, kandidat, relasi, dan tagihan sintetis untuk skenario UAT. Jangan gunakan kredensial pelanggan atau PTSAS.
3. **Jalankan skenario UAT:** login Wali, lihat tagihan kandidat yang cocok, upload bukti ke bucket privat, tolak akses lintas-tenant atau kandidat yang tidak valid, onboarding kandidat, dan pastikan hubungan Wali–santri kanonis berfungsi. Catat bukti, hasil, dan commit yang diuji. Hapus fixture setelah UAT.
4. **Uji instalasi pelanggan:** ikuti runbook Docker/Compose pada VPS Linux dan VM on-premise bersih. Uji konfigurasi runtime, upgrade, backup serta restore database dan Storage. Catat hasil dan batas platform yang benar-benar diuji.
5. **Rekonsiliasi PTSAS secara baca-saja:** pastikan dashboard memilih ref `ptsasgdvgrbdtgyqieie`, lalu jalankan [skrip inventaris baca-saja](../06_DATABASE/PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION.sql) di SQL Editor. Skrip hanya membaca metadata ledger, katalog, grants, function, trigger, dan bucket; tidak membaca baris operasional dan menutup transaksi dengan `ROLLBACK`. Query-query di dalamnya sudah divalidasi sebagai SELECT pada VQE staging; skrip belum dijalankan pada PTSAS. Tim backend/operator dapat menyerahkan hasilnya kepada pengembang untuk dicocokkan dengan migration source. Auto-deploy harus tetap OFF.

## Konfigurasi staging dan status Auth

Preview lokal sudah memakai konfigurasi VQE pada `.env` yang diabaikan Git. Jangan menampilkan atau menyalin secret, kunci PII, maupun nilai Production. Pengiriman email Auth bawaan VQE mencapai `over_email_send_rate_limit`; email lama tidak dapat dipakai lagi. Untuk melanjutkan, tunggu jendela batas kirim pulih lalu lakukan satu permintaan recovery. Untuk beberapa putaran UAT, tim dapat mengonfigurasi SMTP khusus pada Authentication → Emails → SMTP Settings di proyek VQE. Simpan kredensial SMTP hanya di dashboard/secret manager, jangan di chat atau bundle klien.

Untuk alur UAT yang mencakup login Wali, tagihan, bukti, dan onboarding, konfigurasi server/browser mencakup `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_PPDB_TENANT_ID`, `PII_ENCRYPTION_KEY`, dan `PII_FINGERPRINT_KEY`. Buat kedua kunci PII secara acak dan independen, masing-masing 32 byte/64 karakter hex. Atur flag server dan pasangannya yang berawalan `VITE_` sesuai skenario PPDB, dokumen, finance bill, serta onboarding; semuanya harus tetap mati di Production sampai ada rencana rilis yang disetujui. Pendaftaran Wali memakai `SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED`; `PUBLIC_PPDB_ENABLED` hanya diperlukan jika UAT juga menguji pendaftaran calon santri publik. Kunci PII dan `SUPABASE_SECRET_KEY` tidak boleh masuk bundle klien.

## Gerbang sebelum PR #38 siap digabung

- UAT Wali PPDB dan isolasi tenant lulus dengan fixture sintetis.
- CI lulus 3/3 pada head source `af9db8378e91c62b682e44e994302abd24f026c2` ([run `41184875367`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41184875367)): instalasi NPM, frontend/build/Docker guard, migrasi, API Auth/tenant, pgTAP, dan backup/restore.
- Tim backend meninjau function/RPC, grants, RLS, Storage privat, dan dampak migration.
- Tidak ada migration Production yang diterapkan. Rekonsiliasi PTSAS, backup/restore, dan persetujuan change window adalah pekerjaan terpisah sebelum cutover.

## Batas yang diketahui

- Firebase tidak menjadi runtime aplikasi pada import graph aktif yang dijaga CI. Source legacy dan Firebase sebagai devDependency masih tersimpan; guard memeriksa agar keduanya tidak masuk runtime bundle.
- Tenant sintetis dan profil Admin aktif sudah diverifikasi langsung di VQE dengan kueri baca-saja. Profil Wali, kandidat, relasi, tagihan, dan permintaan Finance masih belum dibuat. Preview `http://localhost:4179` tampil, tetapi login dan alur Wali melalui UI belum terbukti karena recovery email dibatasi 429. Fixture baru dibuat setelah Admin berhasil masuk dan dihapus sesudah UAT.
- PTSAS belum dapat diaudit ulang melalui konektor; percobaan `get_project` terbaru ditolak akses. Snapshot Production di dokumen lama tetap historis. Tidak ada perubahan Production.
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
