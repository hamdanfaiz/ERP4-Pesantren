# Arsip Checkpoint Pasca-Merge PR #122 — 20 November 2026

> Snapshot ini dibuat sebelum PR #148–#151. Untuk status terkini, gunakan [kesiapan komersial](COMMERCIAL_READINESS.md), yang mencatat `main` pada `a611bb8` dan hasil pemeriksaan Supabase terbaru.

## Source code

- Branch kanonis: `main`
- Commit saat checkpoint: `9a58536669b967c16cb796335bc571a34391d0d5` — merge PR #122.
- PR #122 menggabungkan integrasi ERP4 Supabase lintas modul. GitHub melaporkan tidak ada PR terbuka setelah konsolidasi ketujuh PR yang sebelumnya terbuka.

## Status PR yang dikonsolidasikan

- PR #122: merged ke `main`.
- PR #91, #112, #114, dan #115: GitHub menandai merged setelah commit kandidat konsolidasi masuk ke `main`.
- PR #92 dan #121: ditutup sebagai superseded karena bertumpuk pada branch sumber lain. Head commit keduanya terbukti menjadi ancestor dari merge PR #122, sehingga perubahan ada di `main`; keduanya tidak di-merge ulang secara terpisah.

## Bukti verifikasi kode

GitHub Actions run [#1827](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44631337717) lulus 3/3 job pada head kandidat sebelum merge:

1. Migrasi, API/auth, isolasi tenant/role, pgTAP, Storage, Dokumen Digital, dan backup/restore sintetis pada Supabase lokal terisolasi.
2. Build frontend, typecheck, dan guard runtime tanpa Firebase.
3. Instalasi NPM serta smoke test image deployment pelanggan.

CI tersebut memverifikasi source kandidat. Tidak ada run baru pada merge commit yang terlihat saat checkpoint ini dibuat; CI juga tidak membuktikan UAT live atau kesesuaian DDL staging/Production.

## Batas operasi

Penggabungan PR hanya memasukkan source ke GitHub. Tidak ada migrasi, repair ledger, perubahan Auth, atau penulisan data ke Supabase VQE maupun PTSAS Production yang dilakukan selama merge.

## Bukti staging baca-saja terakhir

Audit VQE sebelumnya mencatat 150 entri ledger dan 162 file migrasi source: 18 versi source belum tercatat, 6 versi ledger tidak memiliki file source dengan nomor yang sama, dan 4 versi memiliki nama berbeda. Katalog juga menunjukkan ketidakcocokan objek Akademik/Komunikasi, indeks foreign key yang belum ada, serta respons leaderboard Tahfidz yang belum setara dengan source terbaru. Temuan ini adalah metadata dan inventaris objek baca-saja; belum merupakan diff DDL penuh.

Audit metadata PTSAS Production sebelumnya mencatat 100 entri ledger dengan versi tertinggi `20270316000000`. Ini bukan bukti kecocokan DDL, urutan migrasi, backup, atau restore. Tidak ada perubahan Production.

## Gerbang rilis yang tersisa

Tim backend perlu menyelesaikan dan mencatat bukti berikut sebelum mengaktifkan migrasi/deploy pelanggan:

- Rekonsiliasi DDL dan ledger VQE/Production terhadap source; petakan alias dan benturan versi tanpa menjalankan ulang migrasi berdasarkan hitungan saja.
- Rehearsal migrasi forward-only pada staging yang cocok dengan source.
- UAT simpan-baca serta isolasi tenant/role pada modul rilis awal.
- Backup dan restore yang berhasil pada lingkungan sasaran.
- Konfirmasi build Hosting berasal dari commit `main` yang disetujui.

Status PR bersih tidak sama dengan status database atau kesiapan go-live.