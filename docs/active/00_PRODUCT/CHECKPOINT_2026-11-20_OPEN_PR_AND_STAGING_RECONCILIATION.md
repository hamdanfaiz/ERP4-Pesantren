# Checkpoint PR terbuka dan staging — 20 November 2026

## Ringkasan

Audit ini memeriksa status PR GitHub, hubungan commit terhadap kandidat integrasi, CI pada head kandidat, dan metadata skema VQE secara baca-saja. Tidak ada perubahan pada database VQE atau PTSAS Production.

## Status PR

GitHub saat audit mencatat tujuh PR terbuka:

| PR | Status | Hubungan ke kandidat integrasi |
| --- | --- | --- |
| #122 | Draft, belum merged | Kandidat terpadu; head `d336f80c319de71f68d547d6bba7791f263e928c` |
| #91 | Open | Head PR merupakan ancestor kandidat #122 |
| #92 | Open | Head PR merupakan ancestor kandidat #122 |
| #112 | Open | Head PR merupakan ancestor kandidat #122 |
| #114 | Open | Head PR merupakan ancestor kandidat #122 |
| #115 | Open | Head PR merupakan ancestor kandidat #122 |
| #121 | Open | Head PR merupakan ancestor kandidat #122 |

Perbandingan commit GitHub untuk setiap head #91, #92, #112, #114, #115, dan #121 menunjukkan `ahead_by = 0` terhadap head #122: perubahan pada enam PR sumber sudah tercakup di kandidat integrasi. Jangan merge enam PR tersebut satu per satu; head PR lama memiliki basis dan urutan migrasi yang berbeda dari hasil integrasi. Pertahankan statusnya sampai keputusan konsolidasi #122 dibuat. Setelah kandidat konsolidasi benar-benar masuk `main`, tutup PR sumber sebagai superseded dengan keterangan yang merujuk pada merge tersebut.

PR #126 sudah merged ke `main` pada commit `37455550f0a78147f2b7447fe75c06558d990603`. Pembandingan GitHub menunjukkan commit `main` tersebut merupakan ancestor head #122; kandidat integrasi sudah mencakup koreksi katalog Surah dari #126.

PR #1–#11 sebelumnya ditutup sebagai superseded oleh jalur integrasi historis; jangan membuka atau merge ulang tanpa audit perubahan dan migrasinya.

## Kandidat integrasi dan CI

- PR #122: Draft, belum merged; head `d336f80c319de71f68d547d6bba7791f263e928c`.
- `main` saat audit: `37455550f0a78147f2b7447fe75c06558d990603`.
- Perbandingan `main...head #122`: kandidat berada 236 commit di depan dan 0 commit di belakang; source terbaru `main` sudah menjadi ancestor.
- GitHub Actions run [#1825](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44628124012) lulus 3/3 job pada head #122:
  - Migrations, API auth, dan pgTAP.
  - Frontend build dan Firebase bundle guard.
  - Instalasi NPM untuk environment pelanggan.

CI membuktikan pengujian otomatis pada lingkungan terisolasi. CI bukan bukti bahwa VQE atau PTSAS Production sudah menerima migrasi, dan bukan bukti UAT browser lintas role telah selesai.

## VQE staging — pemeriksaan baca-saja

- Ledger migrasi: 150 entri; source branch: 162 file SQL.
- Metadata masih berbeda: 18 versi source belum tercatat, 6 versi ledger tidak memiliki source dengan nomor versi sama, dan 4 versi memiliki nama source/ledger berbeda.
- VQE memiliki fungsi `list_tahfidz_leaderboard` berstatus `SECURITY DEFINER`, dengan `search_path=pg_catalog, public`. Definisi fungsi yang terbaca belum memuat output hari aktif Ziyadah yang ada pada source `20270401000000_tahfidz_monthly_leaderboard.sql`.
- Tabel operasional Tahfidz, CBT, dan sebagian Akademik sudah tampak pada katalog VQE. Pemeriksaan nama objek ini tidak membuktikan seluruh DDL, trigger, policy, indeks, atau data cocok dengan source.
- Tidak menjalankan `db push`, migration repair, penulisan Auth, atau operasi data.

Kesimpulan: staging belum boleh dianggap setara dengan source. Jangan mengubah ledger atau mengulang migrasi hanya untuk menyamakan nomor versi. Tim backend perlu menentukan pemetaan alias/benturan berdasarkan SQL sumber dan definisi objek aktual, lalu merencanakan migrasi forward-only dan rehearsal.

## Gerbang penyelesaian

1. Rekonsiliasi DDL/ledger VQE dan rehearsal staging oleh tim backend.
2. UAT simpan-baca pada modul rilis awal, termasuk validasi isolasi tenant dan role.
3. Verifikasi PTSAS Production oleh tim backend: perbandingan DDL, urutan rilis, serta bukti backup dan restore. Pemeriksaan Production tidak dilakukan dalam checkpoint ini.
4. Pastikan build Hostinger yang akan dipakai sesuai dengan commit kandidat yang disetujui.
5. Setelah gerbang yang disepakati lulus, gabungkan PR #122 ke `main`; lalu tutup PR sumber sebagai superseded. Jangan merge PR sumber yang lama satu per satu.


