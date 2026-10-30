# Checkpoint pengembangan RKAT — 30 Oktober 2026

## Progres proyek

**Penyelesaian pengembangan: sekitar 73% (rentang 70–75%).** Persentase ini tidak memasukkan deployment atau UAT oleh tim penerapan. Angka belum dinaikkan untuk RKAT karena build penuh dan tes database masih menunggu CI.

## Perubahan untuk ditinjau

- Menambahkan rencana dan alokasi anggaran RKAT dengan `tenant_id` wajib, audit pembuat/pemeriksa, status rancangan/disetujui/ditutup, serta jejak permintaan idempoten.
- Menambahkan RPC Supabase untuk snapshot dan mutasi. RPC memeriksa tenant dan profil Admin aktif, mengunci mutasi per tenant, menolak rentang periode bertabrakan, menolak perubahan setelah persetujuan, dan membatasi perubahan anggaran hanya melalui backend tepercaya.
- Realisasi anggaran hanya menjumlahkan pengeluaran berstatus disetujui yang memiliki entri pada `finance_ledger`; pengeluaran yang belum diposting tidak dihitung.
- Menambahkan halaman Keuangan & Anggaran untuk membuat dan mengubah rancangan, mengesahkan atau menutup anggaran, serta membandingkan alokasi dengan realisasi.
- Runtime RKAT dan Finance tetap nonaktif secara bawaan. Pengaktifan membutuhkan dua flag server; tidak ada data contoh atau perubahan Supabase live.
- Memperbarui tes guard runtime agar mengizinkan halaman RKAT hanya ketika endpoint API tetap tertutup kecuali kedua flag aktif. Memperbarui preflight agar menghitung migration baru.

## Bukti validasi lokal

- Lulus: `test:supabase-runtime-no-firebase`.
- Lulus: `test:customer-deployment-flags`.
- Lulus: `test-migration-preflight`.
- Lulus: typecheck terarah untuk `SupabaseFinanceBudgetManager.tsx` dan `supabaseFinanceBudget.ts`.
- Belum dijalankan: build aplikasi penuh dan pgTAP. Docker lokal tidak tersedia. Instalasi bersih npm juga terhambat lockfile PR yang tertinggal; CI menggunakan Bun dan menjadi gerbang build/database berikutnya.

## Tinjauan tim backend

- Migration baru: `supabase/migrations/20270125000000_finance_budget_plans.sql`.
- Tes database baru: `supabase/tests/finance_budget_plans.test.sql`.
- API dan halaman: `src/server/supabaseFinanceBudget.ts`, `server.ts`, `src/pages/SupabaseFinanceBudgetManager.tsx`, dan routing di `src/App.tsx`.
- Setelah commit didorong ke branch `codex/supabase-runtime-cutover-20261022`, cek hasil job frontend dan database pada PR #13. Jangan mengaktifkan flag atau menerapkan migration ke Production sebelum rehearsal dan tinjauan database.

## Status PR

PR #13 masih Open/Draft dan belum siap ditutup: pekerjaan ini menambah fitur baru yang belum mendapat hasil build penuh maupun pgTAP dari CI. Sesuai arahan, statusnya baru ditutup setelah perubahan yang menjadi cakupannya selesai ditinjau dan gerbang validasi lulus. Tidak ada merge, deployment, atau operasi tulis ke Supabase yang dilakukan pada checkpoint ini.
