# Checkpoint Manajemen Multi-Unit — 30 Oktober 2026

## Progres pengembangan

**Estimasi penyelesaian pengembangan tetap sekitar 73% (rentang kerja 70–75%).** Deployment hosting dan UAT tidak dihitung dalam angka ini. Unit scoping kini tersedia pada pengeluaran/ledger baru serta RKAT baru; tagihan, Akademik, Asrama, domain lain, dan record lama masih membutuhkan isolasi atau pemetaan unit.

## Yang ditambahkan

- Migration `20270126000000_tenant_enterprise_units.sql` menambahkan registri unit dengan `tenant_id` wajib, kode unik per tenant, batas panjang/karakter, FK komposit ke profil tenant, dan status nonaktif alih-alih penghapusan.
- Semua tabel unit, audit, dan kunci retry memakai RLS + FORCE RLS. Tidak ada hak akses tabel langsung bagi `anon` atau `authenticated`; server memanggil RPC dengan kredensial rahasia.
- RPC memeriksa tenant aktif, profil Admin aktif, role yang sesuai, dan izin `enterprise`. Mutasi memiliki kunci idempotensi, penguncian transaksi, dan event audit append-only. Kode unit duplikat dan ID unit lintas tenant ditolak.
- API `GET /api/enterprise/units/snapshot` dan `POST /api/enterprise/units/mutations` meminta autentikasi Supabase, mengambil tenant dari profil tepercaya, dan memerlukan `SUPABASE_ENTERPRISE_UNITS_RUNTIME_ENABLED=true` pada server.
- Halaman Manajemen Multi-Unit mendukung buat, ubah, aktif/nonaktifkan, pencarian, metrik ringkas, dan riwayat audit. Formulir tidak dapat diubah sebelum snapshot API berhasil.
- pgTAP menguji grant/RLS, role dan permission, tenant silang, create/update/status, kode unik, retry, serta penolakan payload tidak dikenal.
- Migration `20270128000000_finance_expense_unit_scope.sql` menambah `profiles.organization_unit_id` serta `unit_id` pada pengeluaran dan ledger dengan FK komposit tenant/unit dan indeks pencarian.
- Pengelola dapat menetapkan Ustadz ke unit aktif milik tenant; Finance mengambil unit Ustadz dari profil tepercaya, sedangkan Admin memilih unit aktif. Persetujuan pengeluaran menyalin unit ke ledger; RPC pengeluaran lama tanpa unit dicabut.

## Batas fitur dan cara aktivasi

- Fitur ini menggabungkan **registri organisasi**, unit scoping untuk pengeluaran Finance baru dan ledger hasil persetujuan, serta RKAT baru per unit. Tagihan, Akademik, Asrama, dan domain lain belum dipisahkan per unit. Baris pengeluaran/ledger lama tetap tanpa unit (`NULL`) sampai rekonsiliasi; rencana RKAT lama juga memerlukan pemetaan eksplisit. Unit tidak ditebak dari nama atau departemen.
- Runtime tetap mati secara bawaan. Jangan mengaktifkan flag sebelum migration direview dan diterapkan pada environment uji, lalu seluruh pemeriksaan serta tes lolos.
- Migration hanya ditambahkan pada source code; tidak ada migration atau data yang diterapkan ke Supabase staging/Production.
- Data dummy Firestore tidak disalin. Unit contoh dapat dibuat manual setelah fitur tersedia pada environment uji.

## Validasi dan handoff

- Lulus lokal: `npm run test:supabase-runtime-no-firebase` (87 modul import frontend, 25 route Supabase dan 2 route fail-closed).
- GitHub Actions [run 40994025913](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40994025913) lulus 2/2 job pada head RKAT terkini `6ba1fdb8bfcfcd5834c9063c4cd7d37953c08c56`. CI menjalankan typecheck/build/Docker, rehearsal migrasi lokal, 1.130 assertion pgTAP termasuk tes pengeluaran dan RKAT per unit, API auth/tenant, Storage, serta backup/restore sintetis.
- Tool Supabase CLI lokal gagal sebelum menjalankan perintah karena tidak dapat membuat `C:\Users\VICTUS\.supabase\telemetry.json.tmp...` pada sandbox. Migration tidak dijalankan terhadap database live.
- Source berada pada branch PR #13 `codex/supabase-runtime-cutover-20261022`; head saat checkpoint `6ba1fdb8bfcfcd5834c9063c4cd7d37953c08c56`. PR #13 tetap Open/Draft.
- Status PR: #1–#11 Open/Draft; #12 merged; #13 Open/Draft. PR #1, #2, #4, dan #6 berbasis `main`; #3 serta #5–#11 masih memakai cabang fitur bertingkat. Tidak ada PR #1–#11 yang sudah merged atau closed pada saat audit ini.

## Langkah tim backend

1. Tinjau migration `20270128000000_finance_expense_unit_scope.sql` dan `20270129000000_finance_budget_unit_scope.sql`, RPC, serta tes pgTAP pada PR #13.
2. Petakan pemilik unit untuk akun Ustadz dan data operasional; baris Finance lama tetap tidak dipetakan otomatis.
3. Rehearsal migration pada staging yang dapat dipulihkan; runtime flag tetap mati selama pemeriksaan.
4. Uji Admin/Ustadz lintas unit, retry, persetujuan, dan laporan pada environment uji.
5. Lanjutkan unit scoping ke tagihan, Akademik, Asrama, serta record lama sebelum mengandalkan isolasi operasional penuh.
