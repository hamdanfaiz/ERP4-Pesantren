# Checkpoint ERP4 Pesantren — CI dan staging

**Tanggal:** 8 November 2026  
**Status:** produk belum dinyatakan siap deploy/go-live.  
**Status terukur terbaru — 8 November 2026, 22.16 WIB:** PR #90 sudah merged ke `main` pada `fd937f4876aa1069500694b9bc20ec70eef8ee14`. PR #91 tetap open/draft, head `28885d0e38d30f2c1c4d7ac7244e6b973dbba366`; normalisasi error kini juga menangani pola sintaks, tipe, operator, dan cached plan PostgreSQL, dengan assertion regresi. Uji regresi deployment, TypeScript, build, dan `git diff --check` lulus lokal pada isi kode yang sama. GitHub Actions [run #42493737722](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42493737722) masih berjalan; jangan anggap CI lulus sebelum seluruh job selesai.

## Status terbaru — sesudah normalisasi pesan API di PR #91

- `main` di GitHub: `fd937f4876aa1069500694b9bc20ec70eef8ee14`; PR #90 sudah merged. PR #91 tetap **open/draft**, head `28885d0e38d30f2c1c4d7ac7244e6b973dbba366`. Pesan error internal PostgreSQL disamarkan termasuk kasus sintaks, tipe, operator, dan cached plan; regression guard mencakup pola itu. Uji regresi deployment, TypeScript, build, dan pemeriksaan diff lulus lokal pada source yang sama. CI run #42493737722 masih berjalan.
- Pemeriksaan baca-saja VQE `vqemuyzveuirlkvdggjd` menunjukkan **140/140 versi dan nama migrasi** cocok dengan 140 file `supabase/migrations` pada source ini; versi terakhir `20270308000000_academic_class_unit_admin_role_baseline`. Ini hanya membuktikan kesamaan ledger versi/nama, bukan kesamaan seluruh DDL atau semua CRUD UI.
- Perubahan tab menyentuh Tahfidz, Asrama, Akademik, Keuangan, CBT, Komunikasi, Koperasi, Enterprise, HRIS, Kesehatan, dan Laundry. Pemeriksaan visual sebelumnya menunjukkan scrollbar Tahfidz berada di dalam frame dan container Asrama konsisten gelap pada desktop. Saat pemeriksaan lanjutan, port preview `4179` dan `4180` tidak sedang mendengarkan; source terbaru dan viewport ponsel belum diverifikasi melalui browser.
- UAT Admin VQE sebelumnya membuktikan login dan akses 25 modul; antrean Akademik pulih setelah migrasi. UI belum menguji pemetaan kelas karena fixture tidak memiliki kelas yang belum dipetakan.
- Konektor masih menolak pembacaan PTSAS Production. Tidak ada perubahan Production. UAT Wali, CRUD UI tiap modul, seluruh matriks role/tenant, Storage di hosting target, backup/restore Production, dan clean install/upgrade di VPS/on-premise masih terbuka.

Catatan PR #86 di bawah adalah snapshot sebelumnya; gunakan status PR #90 di bagian ini sebagai keadaan terbaru.

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

- Proyek `vqemuyzveuirlkvdggjd` terdeteksi `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- `list_migrations` menunjukkan 139 entri sampai `20270307000000_tenant_settings_conflict_http_409`.
- Query metadata baca-saja mengonfirmasi baris ledger versi/nama tersebut serta definisi `public.save_tenant_system_settings` yang memakai `PT409`.
- Pemeriksaan ini hanya membuktikan keberadaan migrasi/fungsi perubahan PR #86. Belum dilakukan UAT browser pada login Admin/Wali, seluruh role/tenant, simpan-baca seluruh modul, Storage dari hosting, dan tampilan responsif.

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
