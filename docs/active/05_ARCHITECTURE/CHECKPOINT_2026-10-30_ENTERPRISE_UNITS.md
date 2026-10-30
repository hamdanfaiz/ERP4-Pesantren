# Checkpoint Manajemen Multi-Unit — 30 Oktober 2026

## Progres pengembangan

**Estimasi penyelesaian pengembangan tetap sekitar 73% (rentang kerja 70–75%).** Deployment dan UAT oleh tim backend/penerapan tidak dihitung dalam angka ini. Persentase belum dinaikkan karena implementasi ini menyediakan registri unit tenant, tetapi data operasional setiap modul belum memiliki kontrak `unit_id` dan belum diisolasi per unit.

## Yang ditambahkan

- Migration `20270126000000_tenant_enterprise_units.sql` menambahkan registri unit dengan `tenant_id` wajib, kode unik per tenant, batas panjang/karakter, FK komposit ke profil tenant, dan status nonaktif alih-alih penghapusan.
- Semua tabel unit, audit, dan kunci retry memakai RLS + FORCE RLS. Tidak ada hak akses tabel langsung bagi `anon` atau `authenticated`; server memanggil RPC dengan kredensial rahasia.
- RPC memeriksa tenant aktif, profil Admin aktif, role yang sesuai, dan izin `enterprise`. Mutasi memiliki kunci idempotensi, penguncian transaksi, dan event audit append-only. Kode unit duplikat dan ID unit lintas tenant ditolak.
- API `GET /api/enterprise/units/snapshot` dan `POST /api/enterprise/units/mutations` meminta autentikasi Supabase, mengambil tenant dari profil tepercaya, dan memerlukan `SUPABASE_ENTERPRISE_UNITS_RUNTIME_ENABLED=true` pada server.
- Halaman Manajemen Multi-Unit mendukung buat, ubah, aktif/nonaktifkan, pencarian, metrik ringkas, dan riwayat audit. Formulir tidak dapat diubah sebelum snapshot API berhasil.
- pgTAP menguji grant/RLS, role dan permission, tenant silang, create/update/status, kode unik, retry, serta penolakan payload tidak dikenal.

## Batas fitur dan cara aktivasi

- Fitur yang tersedia adalah **registri organisasi**, bukan pemisahan transaksi/data operasional per unit. Data modul lain tetap tenant-scoped sampai setiap domain menambahkan dan menguji `unit_id`, FK/indeks, aturan akses, dan alur lintas unitnya.
- Runtime tetap mati secara bawaan. Jangan mengaktifkan flag sebelum migration direview dan diterapkan pada environment uji, lalu seluruh pemeriksaan serta tes lolos.
- Migration hanya ditambahkan pada source code; tidak ada migration atau data yang diterapkan ke Supabase staging/Production.
- Data dummy Firestore tidak disalin. Unit contoh dapat dibuat manual setelah fitur tersedia pada environment uji.

## Validasi dan handoff

- Lulus lokal: `npm run test:supabase-runtime-no-firebase` (87 modul import frontend, 25 route Supabase dan 2 route fail-closed).
- Belum diverifikasi lokal: lint/build dan `supabase test db`. Instalasi dependency pada checkout ini gagal karena `package-lock.json` tidak sinkron (`@emnapi/wasi-threads@1.2.3` tidak tercatat); percobaan instalasi offline kemudian ditolak Windows dengan `EPERM`. Karena itu, tunggu hasil GitHub Actions untuk typecheck/build serta pgTAP sebelum menganggap perubahan tervalidasi penuh.
- Tool Supabase CLI lokal gagal sebelum menjalankan perintah karena tidak dapat membuat `C:\Users\VICTUS\.supabase\telemetry.json.tmp...` pada sandbox. Migration tidak dijalankan terhadap database live.
- Source ditujukan untuk branch PR #13 `codex/supabase-runtime-cutover-20261022`; CI pada head perubahan ini harus lulus typecheck/build dan pgTAP agar hasil dapat ditinjau tim backend sebagai terverifikasi.
- Status PR: #13 Open/Draft; PR #11 Open/Draft; PR #12 merged; PR #1–#10 closed tanpa merge karena stack lama digantikan jalur PR #13.

## Langkah tim backend

1. Review migration, fungsi RPC, dan pembatasan grant pada PR #13.
2. Jalankan `supabase test db` pada local Supabase dengan Docker dan pastikan tes baru lulus.
3. Review/migrate pada staging yang bisa di-reset atau dipulihkan; jangan mengaktifkan runtime flag produksi pada langkah ini.
4. Uji alur Admin/tenant dan error/retry sebelum menilai apakah modul boleh diaktifkan pada environment uji.
5. Rencanakan unit scoping per domain sebelum mengandalkan Manajemen Multi-Unit untuk memisahkan data operasional.
