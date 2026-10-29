# Checkpoint target Supabase ERP4-Pesantren — 30 Oktober 2026

## Target kode

- Target aplikasi adalah Supabase project ref `ptsasgdvgrbdtgyqieie` (`https://ptsasgdvgrbdtgyqieie.supabase.co`).
- `supabase/config.toml` pada PR #13 menggunakan ref ini. File `.env` lokal pada checkout kanonis juga menunjuk ke URL backend dan klien yang sama; file tersebut diabaikan Git. Tidak ada key atau password yang dicatat dalam dokumen ini.
- Runtime memakai variabel lingkungan, sehingga image tetap portabel untuk VPS, on-premise, dan lingkungan pelanggan. Checkout PR yang dipakai untuk pemeriksaan tidak memiliki `.env`; jangan mengisi rahasia dari chat atau menaruhnya di klien.
- Data Firestore dummy tidak disalin; data awal akan dibuat melalui formulir aplikasi.

## Bukti project live yang diperiksa

- Dashboard project `ERP4-Pesantren` menunjukkan status **Healthy**, region **ap-southeast-2 (Sydney)**, dan URL yang sesuai dengan target di atas.
- Dashboard memilih branch `main` berlabel **PRODUCTION**, menampilkan **No branches**, dan halaman overview menunjukkan **No backups**. Ini bertentangan dengan penyebutan proyek ini sebagai staging sebelumnya. Sampai pemilik/infra memastikan sebaliknya, perlakukan target ini sebagai Production.
- Database Migrations menampilkan **47 versi**: `20260603000000` serta versi harian `20261022000000` sampai `20261206000000`. Dua versi terakhir (`20261205000000`, `20261206000000`) tidak memiliki nama di dashboard. Tanggal terakhir juga berada setelah tanggal checkpoint; provenance/tanggalnya perlu dikonfirmasi.
- Source PR #13 memiliki **96 file migration**. Dengan hitungan ledger dashboard tersebut, ada **49 versi source yang belum tercatat** pada target. Ini perbandingan hitungan/versi, bukan bukti kompatibilitas schema atau izin untuk menerapkan migration.

## Verifikasi kode

- Pada commit `da7ea0f58e98cab4c5fce2e9155b5f8b5be93a3b`, GitHub Actions run [40967557475](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40967557475) lulus pada kedua job:
  - frontend, typecheck, Firebase runtime guard, build dan Docker customer-managed;
  - Supabase lokal, rehearsal migration sintetis, pgTAP, API auth/tenant, Storage, serta backup/restore sintetis.
- Uji CI tersebut tidak menulis migration atau data ke project Supabase target.
- PR #13 tetap **Open / Draft**. Tidak ada perubahan database, data, atau feature flag di target live.

## Gerbang sebelum migrasi live

1. Jangan menerapkan 49 migration langsung ke branch `main / PRODUCTION`. Target belum memiliki backup terjadwal atau branch yang dapat dipakai untuk rehearsal.
2. Siapkan project/branch staging yang benar-benar terpisah atau bukti backup dan pemulihan yang dapat diuji. Konfirmasi ref-nya sebelum menghubungkan runner.
3. Rekonsiliasi semua versi ledger terhadap file migration source, periksa dua entri tanpa nama, lalu jalankan rehearsal upgrade dan rollback pada salinan yang dapat dibuang.
4. Setelah hasil rehearsal ditinjau backend, lakukan UAT auth, role/tenant, modul, Storage, dan restore sebelum menyetujui perubahan pada Production.
5. Rotasi Supabase secret key dan password database yang pernah ditempel di percakapan sebelum go-live.

## Akses

Alur `codex mcp login supabase` untuk server project-scoped ke `ptsasgdvgrbdtgyqieie` selesai dengan pesan berhasil. Konektor Supabase bawaan yang tersedia di sesi ini tetap hanya mencantumkan project lain (`vqemuyzveuirlkvdggjd)); jangan gunakan konektor tersebut untuk membaca atau menulis target. Dashboard Supabase di browser memberi bukti baca-saja di atas.
