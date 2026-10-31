# Titik Mulai Tim Backend — ERP4 Pesantren

> **Checkpoint 31 Oktober 2026:** branch `main` pada base PR #38 adalah `e9e65e3e8b9d05d126a6150ce726f720722839c5` dengan 110 migration sampai `20270207000000`. PR #38 Draft/Open membawa lima migration tambahan; VQE staging `vqemuyzveuirlkvdggjd` sudah memiliki 115 migration sampai `20270212000000`. CI PR #38 lulus 2/2 job pada run [41166754714](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41166754714). Integrasi GitHub VQE sudah terputus. PTSAS `ptsasgdvgrbdtgyqieie` tetap Production dan auto-deploy OFF; pembacaan live saat ini ditolak oleh konektor.

Dokumen ini menyatakan keadaan yang terverifikasi untuk membantu tim melanjutkan pemeriksaan. Ini bukan pernyataan bahwa produk telah lulus UAT atau siap produksi.

## Keadaan lingkungan

| Lingkungan | Ref | Keadaan dan batas |
| --- | --- | --- |
| Staging ERP | `vqemuyzveuirlkvdggjd` | 115 migration diterapkan sampai `20270212000000`; tidak ada tenant, profil, kandidat, akun Auth, atau data uji persisten. Integrasi GitHub sudah terputus. Dashboard masih menampilkan label internal `main / PRODUCTION`; perlakukan VQE sebagai staging ERP sesuai keputusan pemilik. |
| Production ERP | `ptsasgdvgrbdtgyqieie` | Auto-deploy OFF. Konektor Codex saat ini menolak pembacaan project, ledger, dan katalog. Snapshot historis mencatat 119 tabel dan 47 entri ledger (dua tanpa metadata), tetapi belum diverifikasi ulang. Jangan deploy migration atau memperbaiki ledger sebelum rekonsiliasi baca-saja dan backup yang dapat dipulihkan. |

`main` dan VQE memang berbeda saat ini: VQE telah menerima lima migration dari PR #38 yang belum digabung. Jangan menyebut VQE setara dengan `main` sampai PR tersebut selesai atau migrasi staging direkonsiliasi. Tidak ada data Firestore yang perlu disalin.

## Tim dapat mulai sekarang

1. **Review PR #38:** periksa perubahan akses Wali terhadap tagihan PPDB sebelum onboarding, lima migration tambahan, RLS/grants, dan CI. PR masih Draft/Open karena UAT aplikasi Wali belum dilakukan. CI hijau belum menguji login melalui UI.
2. **Siapkan UAT sintetis di VQE:** setelah pemilik menyetujui fixture disposable, buat tenant dan akun Auth uji melalui jalur provisioning resmi, lalu hubungkan profil Wali, kandidat, dan tagihan sintetis. Jangan gunakan email/password pelanggan. Jangan lakukan ini di PTSAS.
3. **Jalankan skenario UAT:** login Wali, lihat tagihan kandidat yang cocok, upload bukti ke bucket privat, tolak akses lintas-tenant atau kandidat yang tidak valid, onboarding kandidat, dan pastikan hubungan Wali–santri kanonis berfungsi. Catat bukti, hasil, dan commit yang diuji. Hapus fixture setelah UAT.
4. **Uji instalasi pelanggan:** ikuti runbook Docker/Compose pada VPS Linux dan VM on-premise bersih. Uji konfigurasi runtime, upgrade, backup serta restore database dan Storage. Catat hasil dan batas platform yang benar-benar diuji.
5. **Rekonsiliasi PTSAS secara baca-saja:** pastikan dashboard memilih ref `ptsasgdvgrbdtgyqieie`, lalu jalankan [skrip inventaris baca-saja](../06_DATABASE/PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION.sql) di SQL Editor. Skrip hanya membaca metadata ledger, katalog, grants, function, trigger, dan bucket; tidak membaca baris operasional dan menutup transaksi dengan `ROLLBACK`. Tim backend/operator dapat menyerahkan hasilnya kepada pengembang untuk dicocokkan dengan migration source. Auto-deploy harus tetap OFF.

## Gerbang sebelum PR #38 siap digabung

- UAT Wali PPDB dan isolasi tenant lulus dengan fixture sintetis.
- Seluruh CI hijau pada head terbaru PR; perubahan setelah run `41166754714` memerlukan pemeriksaan hasil CI yang baru.
- Tim backend meninjau function/RPC, grants, RLS, Storage privat, dan dampak migration.
- Tidak ada migration Production yang diterapkan. Rekonsiliasi PTSAS, backup/restore, dan persetujuan change window adalah pekerjaan terpisah sebelum cutover.

## Batas yang diketahui

- Firebase tidak menjadi runtime aplikasi pada import graph aktif yang dijaga CI. Source legacy dan Firebase sebagai devDependency masih tersimpan; guard memeriksa agar keduanya tidak masuk runtime bundle.
- VQE tidak memiliki tenant atau akun uji persisten saat checkpoint dibuat. Login dan alur UI Wali belum terbukti.
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

Dokumen terkait: [checkpoint staging PR #38](../06_DATABASE/CHECKPOINT_GUARDIAN_PPDB_STAGING_2026-10-31.md), [audit cutover Supabase](../06_DATABASE/SUPABASE_PROJECT_REF_CUTOVER_AUDIT_2026-10-31.md), [snapshot Production](../06_DATABASE/PTSAS_PRODUCTION_READINESS_SNAPSHOT_2026-10-31.md), dan [kesiapan komersial](COMMERCIAL_READINESS.md).
