# Checkpoint integrasi source dari main — 15 November 2026

## Tujuan dan batas

Catatan ini merekam rehearsal integrasi dari `main` commit `82082bf1c8fa806e420ae555ca38f0700694b9af`. Worktree berada di `sa/_tmp_integration_current_main_20261115`, pada branch review `codex/integration-current-main-20261115`. Branch tersebut sudah di-push ke GitHub pada commit `4595ad122b743f0f33e4d30e3afba1c72e9f67ff`; belum di-merge ke `main` dan tidak diterapkan ke Supabase Production maupun VQE.

Rehearsal menggabungkan source head PR #115, #91, #92, #121, #112, dan #114. Stack Tahfidz #91 → #92 → #121 tetap menjadi satu rantai migrasi; enam migrasi CBT #112 berada pada `20270321000000`–`20270326000000`, indeks #92 pada `20270330000000`, dan leaderboard #121 pada `20270331000000`. Source rehearsal memiliki 161 file migrasi. Preflight sintetis lulus dengan 114 migrasi pending terhadap fixture yang digunakan skrip; angka fixture ini bukan snapshot Production.

## Koreksi integrasi yang dibuat pada worktree

- Mempertahankan copy pengguna PR #115 saat menggabungkan source dan runtime PR lain.
- Memulihkan enam route CBT tenant-scoped dari PR #112 dan mempertahankan sanitasi error yang ada.
- Menambahkan pemeriksaan ketersediaan katalog Quran pada formulir setoran Tahfidz. Surah dan batas ayat selalu memakai daftar backend Supabase; fallback katalog eksternal dan masukan teks bebas pada formulir setoran dihapus. API menyimpan label Surah kanonis dan memvalidasi ulang rentang ayat sebelum transaksi.
- Menghapus route katalog Tahfidz duplikat yang lebih lama.
- Menyatukan permukaan container Asrama dengan token tema ERP, menambahkan import ikon yang dipakai halaman Asrama, serta menghapus argumen status backend yang tidak digunakan.
- Memisahkan nama perintah npm untuk dua suite pesan pengguna agar tidak saling menimpa.
- Menghapus kolom SMTP yang memberi kesan pengiriman email sudah siap; layar Pengaturan kini menampilkan status yang jelas. Keterangan SDM diringkas agar batas fitur disampaikan dalam bahasa pengguna, tanpa istilah fase/backend.

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
- Pemeriksaan lanjutan menemukan bahwa `test:user-messages:security` belum dijalankan oleh workflow CI. Workflow kini menjalankan suite tersebut; `npm run test:ci-coverage` lulus untuk semua 75 skrip tes paket dan `npm run test:user-messages:security` lulus dengan 14 skenario.
- `npm run test:customer-deployment-flags` lulus setelah ekspektasi CRM diselaraskan dengan pesan aktual dan layar email/SDM diperbaiki. `npm run lint` dan `npm run build` juga lulus ulang setelah perubahan UI ini.
- GitHub Actions run [#1762](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43664004230) lulus **3/3 job** pada commit `ca07d58e`: frontend build/runtime guard, migrasi/API/Auth/pgTAP pada Supabase lokal terisolasi, dan instalasi paket untuk environment pelanggan. Job database mencakup replay baseline historis sintetis, suite database, API/tenant, Storage, Dokumen Digital, dan backup-restore lokal. Ini bukan pemeriksaan atau restore Production.
- Run branch review [#1763](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/43669187408) lulus **3/3 job** pada commit `4595ad1`, termasuk job database/migrasi/API/pgTAP. Commit ini hanya memperbarui dokumentasi terhadap source code yang sudah lulus pada #1762.

Build masih mengeluarkan peringatan chunk `react-pdf` sekitar 1,46 MB dan komentar anotasi Zod yang tidak dapat ditafsirkan Rollup. Build selesai dengan kode keluar 0.

## Gerbang yang belum lulus atau belum dibuktikan

- `supabase` CLI dan Docker tidak tersedia lokal, sehingga replay emulator tidak bisa dijalankan di PC ini. GitHub Actions run #1762 telah menjalankan lingkungan Supabase lokal terisolasi dan seluruh job lulus.
- Run #1761 gagal pada pemeriksaan copy sebelum koreksi; seluruh koreksi sudah masuk commit `ca07d58e`, lalu run #1762 lulus. Run gabungan #1752 sebelumnya hanya mencakup stack #91 → #92 → #121, bukan #112/#114/#115.
- UAT browser gabungan pada akun Admin/Ustadz/Santri/Wali, seluruh modul, perangkat ponsel, dan jalur simpan-baca tetap diperlukan.
- Rekonsiliasi DDL Production, keputusan urutan migrasi terhadap ledger aktual, serta bukti backup dan restore Production adalah pekerjaan tim backend. Tidak ada migration push atau perubahan database yang dilakukan di checkpoint ini.
- PR yang menjadi sumber perubahan tetap perlu review backend sebelum merge.

## Langkah lanjut yang aman

1. Branch review gabungan sudah tersedia untuk tim backend di [GitHub](https://github.com/hamdanfaiz/ERP4-Pesantren/tree/codex/integration-current-main-20261115); CI #1763 lulus 3/3.
2. Minta review tim backend terhadap merge resolution CBT/Tahfidz dan daftar migrasi.
3. Jalankan UAT browser pada VQE staging untuk role dan modul yang diaktifkan; flag VQE saat ini belum mengaktifkan semua modul.
4. Tim backend menyelesaikan pemeriksaan DDL, backup, restore, dan urutan rilis Production sebelum menyetujui deploy.

## Checkpoint source lokal

Head integrasi awal sebelum perbaikan UI/copy dan cakupan CI: `b5c7e8c` (`docs: record current main integration checkpoint`). Head branch review sebelum pembaruan checkpoint ini: `4595ad1` (`docs: record green integration workflow`), diverifikasi CI #1763 lulus 3/3. Pembaruan checkpoint ini bersifat dokumentasi saja; ini bukan merge ke `main` atau status merge PR sumber.

