# Checkpoint ERP4 Pesantren — CI dan staging

**Tanggal:** 8 November 2026  
**Status:** produk belum dinyatakan siap deploy atau komersial.

## Status terukur terbaru — 23:56 WIB
- PR #90 sudah merged ke `main` pada `fd937f4876aa1069500694b9bc20ec70eef8ee14`.
- PR #91 tetap **Open/Draft**. Head kode yang diuji adalah `f50b8a7f900bbce541c4935ae2ef6028f916c1aa`; sesudahnya branch hanya menerima pembaruan dokumentasi checkpoint. CI [run #1419](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42501493603) lulus 3/3: migrasi/API/pgTAP, frontend build/runtime guard, dan instalasi NPM pelanggan. Supabase Preview dilewati karena PR tidak menggunakan Supabase Branch.
- CI #1417 sebelumnya menemukan masalah transfer source; branch diperbaiki sebelum #1419. Empat file UI yang dipulihkan sudah dicocokkan penuh dengan teks sumber lokal pada head terbaru.
- Pemeriksaan lokal `npm run lint`, `npm run build`, `npm run test:supabase-runtime-no-firebase`, dan `npm run test:rbac-permissions` lulus. Build menampilkan peringatan ukuran chunk PDF dan anotasi komentar dependency Zod.
- Source PR memakai komponen bersama `ERPTabs`; tab Dokumen Digital dan Tahfidz menggunakan gaya bersama serta gulir horizontal. Ini bukti source, bukan UAT visual dari build yang identitasnya cocok.

## Source dan CI

- `main` saat checkpoint: `c219bbb467e1d2db3385abcaa7b8b1ee14ef0ad9`.
- PR #86 (`fix: return HTTP 409 for stale tenant settings`) telah di-squash merge.
- CI kandidat PR diuji pada head `c34fed60a41c0e13e37e03281b650abffcd58fc7`: [run #42459060708](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42459060708). Build/runtime Docker, pemasangan NPM, dan migrations/API/pgTAP lulus. Supabase Preview dilewati. Belum ditemukan run terpisah setelah merge ke `main`.
- Perubahan memperbaiki konflik versi basi pada simpan Pengaturan Tenant: SQLSTATE `PT409` dipetakan ke HTTP 409. Tes SQL langsung dan API menguji simpan/baca, pemisahan tenant, role, penyaringan rahasia, sinkronisasi zona waktu, serta penolakan penimpaan data terbaru.

## Cakupan otomatis yang terbukti

CI menggunakan Supabase lokal terisolasi dan fixture sintetis. Log job database mencatat:

- Round-trip API, relasi, simpan-baca, idempotensi, pembatasan role dan isolasi tenant untuk Akademik, CBT, LMS, HRIS, Koperasi, CRM, komunikasi, Laundry, Donasi/Wakaf, Dokumen, Kesehatan, Tahfidz, Perpustakaan, fasilitas, Urusan Umum, katalog referensi, PPDB, dan Finance.
- Uji konkurensi NIS, slot pengajar Tahfidz, kapasitas kamar, status gedung, dan status tenant.
- Alur Storage sintetis untuk bukti Finance/dokumen PPDB, aset Perpustakaan, dan Dokumen Digital.
- Smoke test backup/restore lokal yang memulihkan satu record tenant sintetis.
- Build aplikasi, konfigurasi Docker pelanggan, smoke test image, guard runtime Supabase-only, autentikasi route API, serta instalasi dari lockfile NPM.

Ini bukan bukti bahwa setiap menu/form/tombol sudah diuji melalui browser. Uji lokal CI juga bukan UAT pada staging HTTP, bukan hosting calon pelanggan, dan bukan backup/restore Production.

## Supabase staging VQE

- Pemeriksaan MCP baca-saja pada 9 November 2026 pukul 00.03 WIB mengembalikan 140 migration ledger entries untuk `vqemuyzveuirlkvdggjd`.
- Daftar `supabase/migrations` pada branch PR `codex/product-copy-cleanup-20261108` juga berisi 140 file. Pasangan versi/nama cocok **140/140**; tidak ada versi yang hilang, tambahan, atau duplikat.
- Versi terakhir ledger `20270308000000_academic_class_unit_admin_role_baseline`.
- Ini hanya merekonsiliasi nama/versi ledger dengan source; bukan bukti DDL aktual identik atau alur modul lulus UAT. Pemeriksaan hanya membaca metadata; tidak ada perubahan database.

## Supabase Production PTSAS

- Proyek target Production: `ptsasgdvgrbdtgyqieie`.
- Konektor Supabase pada sesi ini masih mengembalikan `You do not have permission`; tidak ada perubahan pada Production.
- Snapshot yang sebelumnya dibagikan operator menyebut 47 entri ledger dan 119 tabel `public` dengan RLS + FORCE RLS. Angka ini bukan inventaris baru dan tidak membuktikan DDL aktual sama dengan source `main`.
- Sesuai pembagian kerja, tim backend perlu mengerjakan schema diff, pemeriksaan urutan migrasi, backup/restore rehearsal, dry-run dan UAT hosting. Jangan menyamakan hitungan ledger lalu menjalankan migrasi secara massal.

## Gerbang sebelum dinyatakan selesai

1. Jalankan preflight schema/ledger baca-saja terhadap VQE dari source `main` yang sama dengan kandidat rilis, lalu simpan hasilnya tanpa secret atau data pribadi.
2. Lakukan UAT browser pada staging: login Admin dan Wali, matriks role/tenant, alur CRUD dan relasi per modul, impor/ekspor, transaksi kritis, Storage, error/retry, dan tampilan responsif.
3. Uji clean install, upgrade, dan pemulihan image/config di VPS Linux serta satu environment on-premise representatif.
4. Tim backend membandingkan DDL Production, memeriksa urutan migration, dan membuktikan backup serta restore di target terisolasi. Production tetap tidak disentuh sampai ada change plan yang disetujui pemilik dan tim.
5. Catat hasil UAT serta batas operasional, lalu tetapkan harga, lisensi, support, dan klaim penawaran berdasarkan kemampuan yang sudah diterima.

Lihat [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md) untuk gerbang rilis lengkap dan [BACKEND_TEAM_START_HERE.md](BACKEND_TEAM_START_HERE.md) untuk handoff tim backend.
