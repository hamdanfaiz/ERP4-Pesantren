# Checkpoint PR #91 — Rekonsiliasi dan regresi — 15 November 2026

## Status kerja

- Worktree: `erp4-pr91-main-reconcile-20261114`
- Branch: `codex/pr91-main-reconcile-20261114`
- Rekonsiliasi PR #91 dengan `main` `82082bf1` telah didorong ke branch PR. Commit remote `07284469f2e09b8f521a5d52e90d3c437073f23f` memiliki tree yang sama dengan worktree lokal (`eaf09e6b6c57fe327084e50ecbac8fa7d44420fc`); graph-nya menggabungkan head lama PR `f66cbbd4` dan `main` `82082bf1`, tanpa konflik Git. PR tetap open, belum di-merge, dan GitHub menandai `mergeable: true`.
- Tidak ada migrasi yang diterapkan ke database. Production PTSAS tidak diubah; staging VQE tidak digunakan.
- Aturan repo saat ini menetapkan Production PTSAS sebagai satu-satunya proyek database yang boleh dipakai. Jangan sambungkan atau query VQE.

## Pembaruan metadata Production (15 November 2026)

Pembacaan MCP read-only untuk Production PTSAS memperoleh 100 migrasi ledger sampai `20270316000000`, dibandingkan 153 file migrasi source. Ada 53 versi source yang belum tercatat, tidak ada versi Production yang hilang dari source, dan tiga versi ledger tidak mengembalikan nama migrasi (`20261205000000`, `20261206000000`, `20270118000000`). Ini selisih metadata saja, bukan izin untuk menerapkan semua migrasi.

Katalog PostgreSQL menunjukkan 162 relasi `public`, semuanya RLS dan FORCE RLS aktif. Hanya lima tabel memiliki policy dan hak SELECT `authenticated`; `anon` tidak memiliki SELECT, dan `anon`/`authenticated` tidak memiliki hak tulis tabel. Advisor menandai empat fungsi SECURITY DEFINER di `public` yang bisa dipanggil `authenticated`, trigger PPDB dengan search path yang dapat berubah, perlindungan sandi bocor Auth yang nonaktif, satu indeks unik duplikat, 269 foreign key tanpa indeks penutup, dua policy auth-initplan, 89 indeks belum terpakai, dan tidak ada temuan health.

Source sudah memiliki migrasi terkait yang belum tercatat di Production: `20270209000000`, `20270210000000`, `20270211000000`, dan `20270227000000`. Tim backend harus mencocokkan DDL aktual, ledger tanpa nama, urutan dependensi, serta backup/restore sebelum perubahan Production. Rincian dan batas bukti dicatat dalam [PTSAS_PRODUCTION_ADVISOR_REVIEW_2026-11-15.md](../06_DATABASE/PTSAS_PRODUCTION_ADVISOR_REVIEW_2026-11-15.md). Tidak ada DDL atau baris data aplikasi yang dibaca dalam pemeriksaan ini.

## Perubahan lokal lanjutan

1. Versi migrasi aktif berjumlah 153 dan tidak ada versi duplikat.
   - Migrasi Quran kanonis menggunakan `20270320000000`.
   - Leaderboard, target massal, dan presisi target Tahfidz menggunakan `20270327000000`, `20270328000000`, dan `20270329000000`.
   - File Quran lama dipindahkan ke fixture histori uji; pemeriksaan alias tetap fail-closed melalui fingerprint SQL.
2. Memulihkan bagian Tahfidz yang hilang saat resolusi merge:
   - Leaderboard membaca agregat tersimpan dengan lingkup tenant/ustadz; cache tampilan juga diikat ke role dan izin Tahfidz aktif supaya hasil scope lama tidak terlihat saat hak akses berubah. Pilihan target massal ikut dibersihkan saat role/izin berubah.
   - Penetapan target massal dibatasi 250 santri dan memakai endpoint transaksi idempoten.
   - Rencana cetak Supabase menggunakan data santri, target aktif, dan maksimal lima setoran termuat; modal contoh lama hanya tampil di mode non-Supabase. Pemilihan cetak diikat ke identitas tenant/pengguna aktif agar pilihan lama tidak dirender saat lingkup akun berganti.
3. Memperbaiki gerbang submodul Asrama agar masing-masing tetap fail-closed sesuai flag-nya. Pesan UI tidak lagi menyebut konfigurasi operator/backend.
4. Menyesuaikan pemeriksaan sumber yang sebelumnya mengunci teks lama, bukan perilaku runtime sekarang.

## Verifikasi lokal

Lulus pada worktree ini:

- `node scripts/test-dashboard-cashflow.mjs`
- `node scripts/test-migration-preflight.mjs`
- `node scripts/test-api-route-auth-policy.mjs`
- `node scripts/test-master-data-no-browser-drafts.mjs`
- `node scripts/test-naming-series-catalog.mjs`
- `node scripts/test-private-api-schema.mjs`
- `node scripts/test-production-dependencies.mjs`
- `node scripts/test-supabase-test-environment.mjs`
- `node scripts/test-tahfidz-quran-catalog.mjs`
- `node scripts/test-tahfidz-leaderboard.mjs`
- `node scripts/test-tahfidz-bulk-targets.mjs`
- `node scripts/test-tahfidz-target-print.mjs`
- `node scripts/test-supabase-runtime-no-firebase.mjs`
- `node scripts/test-user-messages.mjs`
- `node scripts/test-customer-deployment-flags.mjs`
- `node scripts/test-package-test-ci-coverage.mjs`

Semua 16 skrip `.mjs` di atas lulus. Selain itu, **39 dari 39 skrip uji TypeScript lulus** melalui `tsx`; cakupannya termasuk pagination, impor, aturan akses, akademik, CBT, wali, PPDB, keuangan, perpustakaan, alumni, Tahfidz, dan trusted-proxy. `test:trusted-proxy-hops` lulus setelah izin jaringan sesi dibuka; sebelumnya sandbox menolak loopback, tidak ada assertion aplikasi yang gagal.

Setelah pembaruan scope cache leaderboard, `node scripts/test-tahfidz-leaderboard.mjs` lulus (88 assertion pgTAP terdeteksi sesuai rencana tes), `npm run lint` (**tsc --noEmit**) lulus, dan `npm run build` lulus (3.513 modul). Pada 15 November, ketiga perintah `npm run lint`, `npm run build`, dan `npm run test:ci-coverage` diulang pada tree yang sama dengan commit remote; semuanya lulus. `test:ci-coverage` hanya memastikan 66 skrip paket dijadwalkan di workflow, bukan menjalankan 66 skrip tersebut.

Build Vite mentransformasi 3.513 modul dan menghasilkan frontend serta `dist/server.cjs`. Peringatan nonfatal: paket Zod memiliki anotasi `@__PURE__` yang diabaikan Rollup, dan beberapa chunk melebihi 500 kB (bundle PDF terbesar sekitar 1,46 MB); ini perlu ditinjau untuk performa pemuatan.

Dependensi lokal lengkap untuk pemeriksaan ini dengan menyalin paket dari worktree saudara yang memiliki resolusi versi sama pada seluruh 686 entri lockfile aktif. Perubahan berada di `node_modules` yang diabaikan Git; `package.json`, lockfile, `.env`, dan database tidak diubah.

GitHub Actions pada head PR sebelumnya (`f66cbbd4f1f002f4ed0909b2ffbabb7a81ae169b`) lulus pada run `1495`, 3/3 job, termasuk replay migrasi/pgTAP terisolasi, API/auth/tenant, konkurensi, Storage, backup/restore lokal, instalasi npm, build, dan smoke test Docker image. Itu bukan bukti CI untuk hasil merge terbaru. Run push `1701` untuk commit `07284469` tercatat gagal, tetapi API GitHub tidak mengembalikan job apa pun (`total_count: 0`) dan commit check hanya menampilkan Supabase Preview berstatus skipped. Karena tidak ada job/log/annotation, penyebab kegagalan belum dapat ditentukan; hasil ini tidak boleh dilaporkan sebagai tes aplikasi yang gagal maupun sebagai CI lulus. Build, typecheck, dan cakupan workflow terbaru telah diverifikasi lokal, sementara CI penuh pada exact head masih terbuka.

Belum terverifikasi:

- Uji pgTAP (`supabase test db`) memerlukan Supabase lokal/Docker dan belum dijalankan.
- Uji integrasi API yang melakukan loopback, Storage HTTP, login, dan browser belum seluruhnya dijalankan pada checkpoint ini.
- Pemeriksaan Production yang memerlukan DDL aktual dan bukti backup/restore menjadi pekerjaan tim backend; tidak dilakukan dari worktree ini. Advisor dan katalog metadata read-only sudah menghasilkan tindak lanjut terdokumentasi tanpa menulis ke Production.

## Urutan lanjut yang aman

1. Lanjutkan tinjauan diff merge #91 per modul; temuan Tahfidz yang telah ditangani dibatasi pada scope cache leaderboard dan reset pilihan target saat hak akses berubah.
2. Jalankan uji pgTAP serta uji loopback/API di lingkungan yang mengizinkan koneksi lokal; Docker hanya diperlukan untuk Supabase lokal/pgTAP, bukan untuk build, lint, atau unit test source.
3. Serahkan rekonsiliasi DDL aktual, 53 versi selisih, urutan migrasi, dan rehearsal pemulihan kepada tim backend sebelum perubahan Production.
4. Jalankan atau minta tim backend menjalankan workflow `Supabase database tests` untuk head remote `07284469f2e09b8f521a5d52e90d3c437073f23f`; pastikan ada tiga job nyata dengan hasil lulus sebelum menyatakan CI head ini hijau. PR #91 sudah didorong agar bisa ditinjau. Jangan gabungkan ke `main` atau menerapkan migrasi ke Production sebelum gate yang relevan selesai.

## Larangan dan batas checkpoint

- Jangan menghapus atau mengubah ledger database untuk membuat nomor tampak cocok.
- Jangan menjalankan `db push`, migration repair, atau perubahan cloud.
- Jangan menggunakan VQE; kebijakan repo saat ini hanya mengizinkan PTSAS Production.
- Jangan commit `.env`, secret, key PII, atau data pengguna.
- PR #91 belum dinyatakan selesai/siap merge: build/lint lulus, tetapi review diff, uji database/integrasi, dan gate Production tim backend masih tersisa.

