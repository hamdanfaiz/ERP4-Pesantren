# Revalidasi environment Supabase — 20 November 2026

## Status repositori dan pemeriksaan

- `main` berada pada commit `33ffb1696ef3af22a1e1856c180bad72a68c75c6`, sesudah PR #154 digabung. PR #153 dan #154 telah digabung; pemeriksaan PR terbuka terakhir tidak menemukan PR yang masih terbuka.
- CI PR #154 lulus 3/3 pada runner terisolasi: pemasangan paket, build frontend dan penjagaan Firebase, validasi migrasi/API/tenant, pgTAP, Storage, serta uji backup/restore lokal. Pemeriksaan Supabase Preview dilewati karena branch preview tidak dibuat. Hasil ini bukan bukti UAT live atau restore cloud.
- Pemeriksaan Production yang dilakukan hanya membaca metadata migration dan katalog PostgreSQL. Tidak ada data operasional yang dibaca dan tidak ada perubahan database.

## Rekonsiliasi ledger PTSAS Production

Ledger baca-saja Production dibandingkan dengan 163 nama file migrasi di source saat ini:

| Pemeriksaan | Hasil |
| --- | ---: |
| File migrasi source | 163 |
| Entri ledger Production | 100 |
| Source yang cocok dengan versi dan nama ledger | 97 |
| Entri ledger dengan nama `NULL` tetapi versi ada di source | 3 |
| Versi ledger tanpa file source | 0 |
| File source yang belum tercatat di ledger | 63 |

Tiga versi yang nama ledger-nya `NULL` adalah `20261205000000`, `20261206000000`, dan `20270118000000`. Versi tersebut cocok dengan file source, tetapi nama/provenance historisnya tidak bisa dibuktikan dari nilai ledger yang tersedia.

63 migrasi yang belum tercatat tersebar di dalam rentang ledger, bukan hanya di bagian akhir. Beberapa file memiliki DML seed/backfill, sehingga daftar versi ini tidak boleh diperlakukan sebagai perintah untuk menjalankan semua migrasi secara massal. Rencana rekonsiliasi, urutan, dan pemeriksaan efek DML tetap diperlukan sebelum tim backend melakukan cutover.

## VQE staging: direct CLI dry-run — 20 November 2026

Sesudah pemilik proyek menyalin hostname Session pooler persis dari Dashboard VQE dan memperbarui password database lokal, koneksi CLI berhasil. Pemeriksaan ini memastikan `SUPABASE_PROJECT_REF` mengarah ke VQE dan hostname pada URL pooler cocok dengan hostname yang diberikan.

Perintah `supabase db push --dry-run --include-all --skip-vault` berhasil dengan exit code 0 dan hasil:

```json
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date."}
```

Ini membuktikan kredensial pooler yang tersimpan lokal saat pemeriksaan dapat terautentikasi dan seluruh 163 migrasi source yang ada pada checkout ini sudah tercatat/selaras menurut perencanaan CLI. Tidak ada migrasi, seed, role, atau perubahan database yang diterapkan. Kegagalan DNS pada percobaan sebelumnya terjadi sebelum autentikasi; setelah hostname yang sama disalin ulang dari dialog Connect, DNS dan koneksi berhasil. Penyebab perubahan hasil DNS tidak disimpulkan.

## Batas bukti dan langkah berikutnya

- PTSAS Production: belum dilakukan perbandingan DDL lengkap, pemeriksaan policy RLS menyeluruh, backup/restore cloud, atau UAT login dan modul. Ini tugas tim backend sesuai pembagian kerja.
- VQE: direct CLI dry-run masih menunggu hostname pooler yang benar; tidak ada migrasi yang diterapkan.
- Tahap berikutnya setelah hostname diperbaiki: jalankan dry-run VQE, telaah versi pending dan efek DML terhadap fixture, lalu verifikasi backend/UAT staging. Setelah staging lolos, siapkan paket migrasi Production berurutan untuk ditinjau dan dijalankan oleh tim backend.
- Production tidak diubah pada pemeriksaan ini.

## Riwayat snapshot lama

Dokumen [audit paritas migrasi environment](ENVIRONMENT_MIGRATION_PARITY_2026-11-20.md) berisi snapshot dan temuan historis dari beberapa tanggal pada file yang sama. Bagian yang menyebut status “setelah PR #146” bukan status terbaru; gunakan ringkasan revalidasi ini untuk status per 20 November 2026.
