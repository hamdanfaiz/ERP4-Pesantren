# Checkpoint Manajemen Multi-Unit — 30 Oktober 2026

## Progres pengembangan

**Estimasi penyelesaian pengembangan tetap sekitar 73% (rentang kerja 70–75%).** Deployment hosting dan UAT tidak dihitung dalam angka ini. Kolom dan pewarisan unit untuk tagihan kandidat/santri sudah ada; perbaikan saat ini menambahkan filter laporan Finance Admin per unit. Akademik, Asrama, domain operasional lain, serta record lama tertentu masih memerlukan cakupan atau pemetaan unit.

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

- Fitur ini menggabungkan **registri organisasi**, unit pada pengeluaran/ledger baru, RKAT baru per unit, dan unit pada tagihan yang diwarisi dari kandidat/santri tertaut. Tagihan lama tetap tanpa unit sampai kandidat/santri dipetakan; pengeluaran/ledger lama dan rencana RKAT lama memerlukan pemetaan eksplisit. Unit tidak ditebak dari nama atau departemen. Akademik, Asrama, dan domain operasional lain masih belum memiliki cakupan unit menyeluruh.
- Runtime tetap mati secara bawaan. Jangan mengaktifkan flag sebelum migration direview dan diterapkan pada environment uji, lalu seluruh pemeriksaan serta tes lolos.
- Migration hanya ditambahkan pada source code; tidak ada migration atau data yang diterapkan ke Supabase staging/Production.
- Data dummy Firestore tidak disalin. Unit contoh dapat dibuat manual setelah fitur tersedia pada environment uji.

## Validasi dan handoff

- Lulus lokal: `npm run test:supabase-runtime-no-firebase` (87 modul import frontend, 25 route Supabase dan 2 route fail-closed).
- GitHub Actions [run 41001191872](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41001191872) lulus 2/2 job pada head Finance `2b93f96da3571a828fd63e70d0fe765ebaa154f8`. CI menjalankan typecheck/build/Docker, rehearsal migrasi lokal, 53 file pgTAP / 1.195 assertion, API auth/tenant, filter unit Finance, Storage, serta backup/restore sintetis.
- Tool Supabase CLI lokal gagal sebelum menjalankan perintah karena tidak dapat membuat `C:\Users\VICTUS\.supabase\telemetry.json.tmp...` pada sandbox. Migration tidak dijalankan terhadap database live.
- Source berada pada branch PR #13 `codex/supabase-runtime-cutover-20261022`; head saat checkpoint `2b93f96da3571a828fd63e70d0fe765ebaa154f8`. PR #13 tetap Open/Draft.
- Status PR: #1–#11 Open/Draft; #12 merged; #13 Open/Draft. PR #1, #2, #4, dan #6 berbasis `main`; #3 serta #5–#11 masih memakai cabang fitur bertingkat. Tidak ada PR #1–#11 yang sudah merged atau closed pada saat audit ini.

## Langkah tim backend

1. Tinjau migration `20270128000000_finance_expense_unit_scope.sql` dan `20270129000000_finance_budget_unit_scope.sql`, RPC, serta tes pgTAP pada PR #13.
2. Petakan pemilik unit untuk akun Ustadz dan data operasional; baris Finance lama tetap tidak dipetakan otomatis.
3. Rehearsal migration pada staging yang dapat dipulihkan; runtime flag tetap mati selama pemeriksaan.
4. Uji Admin/Ustadz lintas unit, retry, persetujuan, dan laporan pada environment uji.
5. Lanjutkan unit scoping ke Akademik, Asrama, serta domain operasional lain; rekonsiliasi tagihan, pengeluaran, ledger, dan RKAT lama yang belum terpetakan sebelum mengandalkan laporan per unit secara penuh.

## Koreksi cakupan Finance — 30 Oktober 2026

- Migration `20270130000000_master_data_unit_assignment.sql` sudah menambahkan `organization_unit_id` pada `finance_bills`, FK tenant/unit, pewarisan unit dari kandidat/santri saat pembuatan atau penautan, dan pemeriksaan agar unit tagihan konsisten. Tes `master_data_unit_assignment.test.sql` mencakup pewarisan pada tagihan terkait kandidat/santri.
- Tagihan lama tidak diisi dengan tebakan. Saat Admin memetakan kandidat/santri, trigger menyelaraskan unit ke tagihan terkait; tagihan yang tidak punya hubungan terpetakan tetap perlu rekonsiliasi eksplisit.
- Perbaikan UI Admin menambahkan filter unit pada daftar tagihan, pengeluaran, buku besar, kartu total, dan ekspor CSV. Data tanpa unit tetap dapat dipilih melalui filter “Belum dipetakan”; unit yang tidak lagi aktif tetap tampil dengan penanda, agar transaksi lama tidak tersembunyi. Pemeriksaan helper filter ada di workflow CI terbaru pada head PR #13.
- Pengeluaran/ledger lama memiliki alur pemetaan Finance eksplisit; RKAT lama memiliki alur pemetaan tersendiri. Ini bukan bukti bahwa data staging telah dimigrasikan atau semua unit sudah terisi.
