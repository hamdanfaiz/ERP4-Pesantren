# Checkpoint integrasi source dari main — 15 November 2026

## Tujuan dan batas

Catatan ini merekam rehearsal integrasi lokal dari `main` commit `82082bf1c8fa806e420ae555ca38f0700694b9af`. Worktree berada di `sa/_tmp_integration_current_main_20261115`; perubahan belum di-push, belum di-merge ke `main`, dan tidak diterapkan ke Supabase Production maupun VQE.

Rehearsal menggabungkan source head PR #115, #91, #92, #121, #112, dan #114. Stack Tahfidz #91 → #92 → #121 tetap menjadi satu rantai migrasi; enam migrasi CBT #112 berada pada `20270321000000`–`20270326000000`, indeks #92 pada `20270330000000`, dan leaderboard #121 pada `20270331000000`. Source rehearsal memiliki 161 file migrasi. Preflight sintetis lulus dengan 114 migrasi pending terhadap fixture yang digunakan skrip; angka fixture ini bukan snapshot Production.

## Koreksi integrasi yang dibuat pada worktree

- Mempertahankan copy pengguna PR #115 saat menggabungkan source dan runtime PR lain.
- Memulihkan enam route CBT tenant-scoped dari PR #112 dan mempertahankan sanitasi error yang ada.
- Menambahkan pemeriksaan ketersediaan katalog Quran pada formulir setoran Tahfidz. Surah dan batas ayat selalu memakai daftar backend Supabase; fallback katalog eksternal dan masukan teks bebas pada formulir setoran dihapus. API menyimpan label Surah kanonis dan memvalidasi ulang rentang ayat sebelum transaksi.
- Menghapus route katalog Tahfidz duplikat yang lebih lama.
- Menyatukan permukaan container Asrama dengan token tema ERP, menambahkan import ikon yang dipakai halaman Asrama, serta menghapus argumen status backend yang tidak digunakan.
- Memisahkan nama perintah npm untuk dua suite pesan pengguna agar tidak saling menimpa.

## Pemeriksaan lokal pada worktree

Lulus:

- `npm ci` menggunakan `package-lock.json` dan cache lokal.
- `npm run lint`.
- `npm run build` untuk frontend dan server.
- `npm run test:migration-preflight`.
- `npm run test:api-route-auth-policy` — 220 route privat memerlukan autentikasi, 9 route publik eksplisit dan 3 route deny-only diizinkan.
- `npm run test:supabase-runtime-no-firebase`.
- `npm run test:supabase-quran-catalog` dan `npm run test:tahfidz-quran-catalog` — katalog 114 Surah/6.236 ayat dan formulir berbasis referensi.
- Suite CBT: pengaturan tulis, dasbor, halaman pertanyaan, roster santri, penugasan, dan daftar ujian.
- Suite pesan pengguna dan `npm run test:customer-compose-env`.

Build masih mengeluarkan peringatan chunk `react-pdf` sekitar 1,46 MB dan komentar anotasi Zod yang tidak dapat ditafsirkan Rollup. Build selesai dengan kode keluar 0.

## Gerbang yang belum lulus atau belum dibuktikan

- `npm run test:api:auth-tenant` berhenti sebelum menjalankan suite: `spawnSync supabase ENOENT`. Perintah `supabase` dan `docker` tidak tersedia pada PATH lingkungan ini. Ini bukan hasil gagal assertion; emulator belum dimulai.
- GitHub CI untuk gabungan seluruh head PR pada worktree ini belum berjalan. CI hijau yang tersedia terpisah per PR; run gabungan #1752 hanya mencakup stack #91 → #92 → #121, bukan #112/#114/#115.
- UAT browser gabungan pada akun Admin/Ustadz/Santri/Wali, seluruh modul, perangkat ponsel, dan jalur simpan-baca tetap diperlukan.
- Rekonsiliasi DDL Production, keputusan urutan migrasi terhadap ledger aktual, serta bukti backup dan restore Production adalah pekerjaan tim backend. Tidak ada migration push atau perubahan database yang dilakukan di checkpoint ini.
- PR yang menjadi sumber perubahan tetap perlu review backend sebelum merge.

## Langkah lanjut yang aman

1. Push worktree ini ke branch review terpisah agar GitHub menjalankan CI gabungan; jangan menulis ke `main` atau database Production.
2. Minta review tim backend terhadap merge resolution CBT/Tahfidz dan daftar migrasi.
3. Jalankan Supabase CLI + Docker Emulator/pgTAP dan UAT browser pada VQE staging setelah alat lokal tersedia.
4. Tim backend menyelesaikan pemeriksaan DDL, backup, restore, dan urutan rilis Production sebelum menyetujui deploy.

## Checkpoint source lokal

Head rehearsal setelah merge dan koreksi Tahfidz: `6717797` (`test: integrate canonical Quran catalog entry`). Head ini adalah commit worktree lokal sementara, bukan branch remote atau status merge PR.
