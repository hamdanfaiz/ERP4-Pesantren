# Serah terima pemeriksaan PR #40 — 5 November 2026

## Status saat ini

- Repo: `hamdanfaiz/ERP4-Pesantren`.
- PR: [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40).
- Branch: `codex/menu-owner-placement-20261101`.
- Source aplikasi yang terakhir diuji: `944801e8590026a0629994f9db50f427e81abe72`. Setelah pemeriksaan itu, PR menerima commit dokumentasi saja; lihat header PR untuk HEAD terbaru sebelum menjalankan CI.
- PR masih Draft/Open dan belum layak digabung. GitHub belum mengembalikan status mergeability yang pasti (`mergeable_state=unknown`); perbandingan branch menunjukkan 190 commit ahead dan 0 behind dari `main`.
- Tidak ada workflow run GitHub Actions untuk head terbaru. Satu check-run `Supabase Preview` berstatus `skipped` karena branch tidak diasosiasikan dengan Supabase Branch; check ini bukan hasil build atau tes aplikasi.
- `.github/workflows/supabase-db-tests.yml` tersedia pada `main` dan memiliki pemicu `pull_request` untuk base `main`. Konektor tidak dapat membaca pengaturan Actions tingkat repo; tim perlu memeriksa apakah Actions/workflow diaktifkan serta event push memicu run. Run #1135 menguji commit lama dan tidak membuktikan head saat ini.

## Bukti build dan tes lokal

Pada source yang sama dengan head terakhir, lulus:

- `npm run lint`
- `npm run build`
- 39/39 skrip `test:*` non-database/API

Dua skrip yang memerlukan loopback lokal (`test:trusted-proxy-hops` dan `test:runtime-config-http`) awalnya ditolak sandbox dengan `EACCES`; keduanya lulus setelah diulang dengan izin koneksi loopback. Build masih memberi peringatan anotasi Rollup pada Zod dan ukuran chunk `react-pdf` sekitar 1,46 MB.

Tes integrasi database/API belum dijalankan pada head terbaru:

- `test:db` (pgTAP seluruh migration, termasuk picker kelas dan tenant sintetis 501 kelas)
- `test:db:nis-race`
- `test:db:tahfidz-session-race`
- `test:api:auth-tenant`
- `test:api:finance-storage`
- `test:api:library-storage`
- `test:db:backup-restore`

Jalankan di runner CI yang menyediakan Supabase/Postgres terisolasi. Jangan memakai database Production sebagai target pengujian.

## Rekonsiliasi staging VQE

- Target staging yang disetujui: `vqemuyzveuirlkvdggjd`. Production PTSAS `ptsasgdvgrbdtgyqieie` tidak disentuh.
- Pemeriksaan baca-saja terbaru: VQE berisi 133 migration, sedangkan source berisi 134. Migration `20270302000000_academic_class_reference_pagination.sql` belum tercatat pada VQE.
- Ledger VQE juga memiliki nama/timestamp lama `20261101015832_tenant_reference_relationships` yang tidak sama dengan migration file di repo. Jangan menjalankan ulang migration terkait atau memperbaiki ledger dengan SQL manual.
- Migration picker kelas menambah indeks partial dan mengganti/membuat fungsi keyset `SECURITY INVOKER`; ia tidak menyalin atau menghapus data. Namun, rekonsiliasi ledger harus dilakukan dulu agar file migration yang sudah pernah diterapkan tidak dijalankan ulang.
- Supabase MCP `apply_migration` sebelumnya dapat mencatat versi berbeda dari nama file. Gunakan Supabase CLI yang dipin sesuai workflow repo (`2.84.2`) dari checkout terisolasi yang secara eksplisit ditautkan ke VQE. Awali dengan `supabase migration list` dan `supabase db push --dry-run`; cocokkan setiap versi yang akan dijalankan dengan file. Gunakan `supabase migration repair` hanya untuk koreksi ledger setelah operator memeriksa versi tepat. Jangan gunakan konfigurasi default `supabase/config.toml` sebagai alasan untuk menarget Production.
- Kredensial staging harus disediakan tim melalui `.env` lokal atau secret CI; jangan ditempelkan ke chat atau browser.

## Tindakan tim backend

1. Periksa mengapa Actions tidak membuat run untuk head `944801e`. Lihat tab **Actions**, pastikan workflow diaktifkan dan event `pull_request` diizinkan, lalu jalankan ulang CI dari push terautentikasi tim. Native push sebelumnya juga belum menghasilkan run, jadi jangan menganggap commit kosong otomatis menyelesaikan masalah.
2. Jalankan seluruh tujuh tes integrasi dalam job CI terisolasi. Simpan tautan run dan hasil tiap job pada PR.
3. Sediakan runner/akses staging VQE, audit ledger terlebih dahulu, lalu rehearsal migration `20270302000000` menggunakan target VQE yang eksplisit. Verifikasi indeks dan fungsi sesudahnya, serta jalankan pgTAP terkait.
4. Selesaikan UAT Admin staging untuk login, tenant/role, Data Induk, Naming Series, pagination, impor/ekspor, dan modul yang terdampak.
5. Minta tinjauan tim atas perubahan dan bukti. Pertahankan PR Draft sampai CI, database, dan UAT lulus. Production baru dipertimbangkan setelah staging diterima; tidak ada langkah dalam panduan ini yang menerapkan migration ke Production.

## Perubahan UI yang ikut pada PR

Dokumen Digital memakai `ERPTabs` yang sama dengan modul lain. Tab dipindahkan ke luar bingkai panel dan diberi ikon agar bentuk serta penempatannya konsisten; filter dan daftar dokumen tetap di panel konten.

