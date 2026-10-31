# Titik Mulai Tim Backend — ERP4 Pesantren

> **Checkpoint 31 Oktober 2026:** source resmi branch `main`, commit `edd5385fee4d10db64681de9cc08ee757130eb78`, berisi 110 migration. VQE `vqemuyzveuirlkvdggjd` adalah staging yang disetujui dan sudah menerapkan 110/110 versi migration tanpa selisih set. PTSAS `ptsasgdvgrbdtgyqieie` tetap Production, GitHub auto-deploy **OFF**, dan tidak disentuh. Data Firestore dummy tidak perlu disalin. CI PR #36 lulus [2/2 job](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41153976106).

**Tujuan dokumen:** memberi tim backend langkah konkret untuk melanjutkan pengujian dan menyiapkan rilis. Status ini tidak menyatakan aplikasi siap produksi atau sudah lulus UAT.

## Fakta lingkungan

| Lingkungan | Ref | Status dan batas |
| --- | --- | --- |
| Staging ERP | `vqemuyzveuirlkvdggjd` | Schema 110/110 migration sudah diterapkan. 160 tabel public, seluruhnya RLS-enabled dan FORCE RLS; 159 tabel tenant-scoped; 4 bucket Storage privat. Belum ada tenant maupun user Auth. Gunakan untuk data sintetis dan UAT. |
| Production ERP | `ptsasgdvgrbdtgyqieie` | Auto-deploy tetap OFF. Snapshot lama menunjukkan 119 tabel dan 47 versi ledger, dua tanpa metadata. Konektor baca Codex menolak project ini pada checkpoint terakhir; tim harus memverifikasi ulang lewat akses resmi. Jangan menerapkan migration sebelum rekonsiliasi dan backup yang dapat dipulihkan. |

Kondisi VQE membuktikan deployment skema staging berhasil; hal itu tidak membuktikan Production sama, login berfungsi, atau seluruh alur bisnis diterima pengguna.

## Langkah tim berikutnya

### 1. Provisioning sintetis dan pemeriksaan konfigurasi staging

1. Catat commit aplikasi dan migration yang diuji; keduanya harus berasal dari `main` yang sama.
2. Buat tenant uji melalui jalur provisioning yang disepakati dan akun sintetis untuk setiap role. Jangan menambahkan data asli.
3. Periksa environment aplikasi menunjuk ke VQE. Pastikan publishable key hanya dipakai di klien; secret/service-role dan kunci PII berada di secret manager/server saja.
4. Verifikasi migration ledger, tabel, function/RPC, index, constraint, grants, RLS, Storage policy, dan bucket privat di staging.

**Keluaran:** catatan ref/commit, ringkasan inventaris, serta tenant dan akun sintetis yang dapat digunakan UAT.

### 2. UAT Auth, role, tenant, dan modul kritis

Uji login, undangan/pembuatan akun, pemulihan akun, penonaktifan sesi, serta matriks role × permission. Buktikan pengguna satu tenant tidak dapat membaca atau mengubah tenant lain melalui UI, API, RPC, dan Storage.

Uji alur PPDB → onboarding santri/NIS, asrama/kamar, keuangan dan pencatatan pembayaran manual, Tahfidz, komunikasi, dokumen privat, serta retry/idempotensi. Pastikan fitur yang belum siap tetap fail-closed. PPOB/payment gateway berada di luar rilis awal.

**Keluaran:** bukti uji per alur, isu dengan tingkat dampak dan commit perbaikan, serta persetujuan UAT dari perwakilan pengguna.

### 3. Backup, pemulihan, dan portabilitas pemasangan

Lakukan backup lalu restore database **dan Storage** staging ke environment uji kedua. Buktikan relasi, file, dan kunci enkripsi tetap dapat digunakan. Jalankan clean install, upgrade, dan restore pada Linux VPS serta VM on-premise representatif. Catat kebutuhan DNS/TLS, reverse proxy, SMTP, volume persisten, resource minimum, dan akses jaringan.

**Keluaran:** runbook install/upgrade/backup/restore serta bukti restore dan smoke test di tiap environment.

### 4. Rekonsiliasi Production

1. Gunakan akses baca-saja yang disediakan operator untuk membaca ledger serta katalog PTSAS.
2. Cocokkan tiap versi ledger dengan source migration dan definisi schema. Dua baris ledger terakhir sebelumnya tidak memiliki metadata `name` maupun `statements`; jangan menandainya applied atau mengubah ledger tanpa bukti.
3. Simpan backup Production yang dapat dipulihkan sebelum menyusun rencana perubahan.
4. Minta tim deployment meninjau rencana, jadwal, verifikasi pascapenerapan, dan pemulihan. Biarkan auto-deploy OFF hingga persetujuan change window.

**Keluaran:** rekonsiliasi yang dapat diaudit dan rencana penerapan yang disetujui. Tidak ada perintah `db push`, `migration repair`, reset, atau perubahan Production hanya untuk menyamakan jumlah migration.

## Tanggung jawab

| Pekerjaan | Pemilik |
| --- | --- |
| Source aplikasi, perbaikan, commit/PR dan CI | Pengembang aplikasi |
| Akses Supabase, provisioning staging, backup, inventaris | Tim backend |
| UAT, uji hosting VPS/on-premise, operasi dan runbook | Tim backend/penerapan dan perwakilan pesantren |
| Rekonsiliasi serta deployment Production | Tim backend/penerapan setelah gerbang rilis disetujui |

## Status checkpoint

- Deployment migration ke VQE staging: **110/110 (100%)**.
- CI PR #36: **2/2 job lulus**.
- Kesiapan keseluruhan fitur tidak dihitung ulang dari checkpoint schema ini.
- UAT login dan matriks role/tenant, simulasi instalasi pelanggan, backup/restore staging yang dijalankan tim, serta rekonsiliasi Production masih harus dikerjakan.
- PPOB/payment gateway tidak termasuk rilis awal.

Dokumen terkait: [Audit cutover Supabase](../06_DATABASE/SUPABASE_PROJECT_REF_CUTOVER_AUDIT_2026-10-31.md), [snapshot Production](../06_DATABASE/PTSAS_PRODUCTION_READINESS_SNAPSHOT_2026-10-31.md), dan [kesiapan komersial](COMMERCIAL_READINESS.md).
