# Serah terima pemeriksaan PR #40 — 5 November 2026

## Status saat ini

- Repo: `hamdanfaiz/ERP4-Pesantren`.
- PR: [#40 — Relasi tenant dan penomoran otomatis](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40), branch `codex/menu-owner-placement-20261101`.
- Source PR terakhir yang diuji penuh secara lokal: `989b0571a6b08a9069f09a6f8a05a56cc0202c81`. PR tetap Draft/Open.
- Pada head `989b057`, `npm run lint`, `npm run build`, dan 39/39 skrip `test:*` non-database/API lulus pada checkout bersih dengan lockfile yang cocok. Build memberi peringatan anotasi Rollup pada Zod dan chunk `react-pdf` sekitar 1,46 MB.
- Pemeriksaan GitHub untuk head tersebut menemukan satu check `Supabase Preview` berstatus `skipped` karena branch tidak terhubung ke Supabase Branch; belum ada workflow Actions untuk source head ini. Run Actions #1135 sukses pada commit lama `79d516880fb0c957d672cc4db8d9725f7f294ba3`, jadi bukan bukti head terbaru.
- Workflow `.github/workflows/supabase-db-tests.yml` memiliki pemicu `pull_request` ke `main`. Tim perlu memeriksa pengaturan Actions/event pada repo dan menyediakan bukti workflow untuk head terbaru.

## Bukti build dan tes lokal

Validasi dilakukan pada worktree terisolasi `erp4-pr40-head-20261105`, tepat di head `989b057`:

- `npm run lint` — lulus.
- `npm run build` — lulus.
- 39/39 skrip tes non-database/API — lulus, termasuk guard Supabase-only dan pemeriksaan Master Data, PPDB, Akademik, Tahfidz, serta tenant.

Tujuh tes integrasi database/API belum dijalankan pada head terbaru:

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

1. Periksa mengapa Actions tidak membuat run untuk HEAD PR `b59ca9b`. Lihat tab **Actions**, pastikan workflow diaktifkan dan event `pull_request` diizinkan, lalu jalankan CI dari push terautentikasi tim. Native push sebelumnya juga belum menghasilkan run, jadi jangan menganggap commit kosong otomatis menyelesaikan masalah.
2. Jalankan seluruh tujuh tes integrasi dalam job CI terisolasi. Simpan tautan run dan hasil tiap job pada PR.
3. Sediakan runner/akses staging VQE, audit ledger terlebih dahulu, lalu rehearsal migration `20270302000000` menggunakan target VQE yang eksplisit. Verifikasi indeks dan fungsi sesudahnya, serta jalankan pgTAP terkait.
4. Selesaikan UAT Admin staging untuk login, tenant/role, Data Induk, Naming Series, pagination, impor/ekspor, dan modul yang terdampak.
5. Minta tinjauan tim atas perubahan dan bukti. Pertahankan PR Draft sampai CI, database, dan UAT lulus. Production baru dipertimbangkan setelah staging diterima; tidak ada langkah dalam panduan ini yang menerapkan migration ke Production.

## Perubahan UI yang ikut pada PR

Pada source head `944801e`, Dokumen Digital sudah memakai `ERPTabs` bersama, menampilkan ikon, dan menempatkan tab di luar panel konten. Laporan pengguna pada 5 November 2026 menyatakan gaya tab masih belum sesuai standar. Commit `4d8df2e` menghapus margin `mb-4` tambahan agar jarak mengikuti `space-y-6` pada container halaman. Verifikasi visual pada aplikasi berjalan masih terbuka untuk membandingkan wadah, ukuran, dan keadaan aktif/nonaktif dengan modul acuan; jangan tandai pekerjaan UI selesai sebelum render dibandingkan.
