# Checkpoint Pengembangan — 15 November 2026

## Perubahan dalam checkpoint ini

- Permukaan kartu, form, teks, batas, dan status hover pada seluruh submodul Asrama mengikuti token Design System untuk mode terang dan gelap.
- Peringkat setoran Tahfidz dipulihkan pada dashboard operasional. Skor dihitung dari setoran Ziyadah tersimpan per bulan pesantren; jumlah setoran, ayat, dan hari aktif menjadi dasar urutan.
- Hanya Admin, SuperAdmin, dan Ustadz yang dapat membaca peringkat. Ustadz hanya melihat santri dan setoran dari halaqah yang sedang diampunya. Output tidak menyertakan NIS.
- Pembacaan memakai endpoint terautentikasi `/api/tahfidz/leaderboard` dan SQL function server-only. Migration baru bernomor `20270401000000`, setelah migration PR terbuka tertinggi yang diketahui (`20270331000000`).
- UI peringkat memiliki status memuat, gagal dengan tombol coba lagi, kosong, lima hasil awal, dan pemuatan hingga 20 hasil.
- Copy antarmuka modul aktif tidak menampilkan nama penyedia database, istilah tenant, atau roster. Kesalahan API internal disamarkan sebelum mencapai layar pengguna.

## Verifikasi source lokal

- `npm run build` — lulus. Peringatan Rollup Zod dan ukuran bundle PDF sudah ada, tidak menggagalkan build.
- `npm run lint` — lulus (`tsc --noEmit`).
- `npm run test:tahfidz-leaderboard` — lulus; memeriksa aturan data/role dan memastikan rencana pgTAP berisi 93 assertion.
- `npm run test:migration-preflight` — lulus; memeriksa sumber 151 migration serta rekonsiliasi versi yang tercatat.
- `npm run test:supabase-runtime-no-firebase` — lulus; 164 modul, pemetaan rute, dependensi, dan kebijakan penyimpanan browser.
- `npm run test:api-route-auth-policy` — lulus; 213 route privat membutuhkan autentikasi.
- `git diff --check` — lulus.
- GitHub Actions run #1789 pada commit cbab5840ed15787c14a4964a74887c22bbee0dd6 lulus 3/3 job, termasuk replay migrasi pada basis sintetis, otorisasi API, dan seluruh suite pgTAP; rencana uji leaderboard memuat 93 assertion. Supabase CLI belum tersedia di komputer lokal.

## Perubahan cloud dan publikasi

- Migration baru belum diterapkan ke VQE staging maupun PTSAS Production. Tidak ada data atau skema live yang diubah.
- Snapshot Hostinger yang terakhir diperiksa masih memakai commit `82082bf1c8fa806e420ae555ca38f0700694b9af`; dashboard menunjukkan Git provider belum tersambung dan auto-deploy mati. Karena itu tampilan domain sementara belum mencerminkan source `main` terkini.
- Akses tulis MCP Production tidak tersedia pada pemeriksaan terakhir. Rilis database perlu menunggu rehearsal dan akses tulis yang sah; jangan menjalankan `db push` terhadap Production hanya berdasarkan build lokal.

## Gerbang berikutnya

1. Rehearsal migrasi 20270401000000 pada VQE setelah urutan PR #112/#121/#92 direkonsiliasi; jangan menganggap migrasi otomatis hadir di VQE atau Production.
2. Sambungkan kembali deployment Hostinger ke repo/branch source resmi dan terbitkan build yang sama dengan commit CI.
3. UAT browser dengan Admin dan Ustadz untuk memeriksa peringkat, isolasi halaqah, tampilan Asrama, dan copy antarmuka.
4. Tim backend menuntaskan pemeriksaan DDL Production serta bukti backup/restore sebelum menyatakan siap deploy.
