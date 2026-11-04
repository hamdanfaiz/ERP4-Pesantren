# Checkpoint ERP4 Pesantren — 5 November 2026

## Status kerja terkini

Pengembangan PR #40 untuk mengurangi batas roster Akademik dan memperketat relasi kelas Ustadz. Checkpoint ini aman dilanjutkan: Production tidak disentuh dan tidak ada fixture uji tersisa di VQE.

## Perubahan source

- Snapshot Akademik mengambil satu halaman santri, bukan memindai seluruh roster.
- Endpoint `/api/academic/students` menyediakan pencarian nama/NIS dan cursor tenant/aktor/role/unit yang tervalidasi.
- Pembatasan roster dan penilaian Ustadz menggunakan ID referensi kelas, bukan nama tampilan.
- UI menyediakan pencarian dan pemuatan halaman roster berikutnya.
- Migration dan pgTAP baru: `20270301000000_academic_student_roster_pagination.sql` dan `supabase/tests/academic_student_roster_pagination.test.sql`.
- Perubahan berada di branch lokal `codex/pr40-roster-pagination-20261105`, tepat satu commit di atas head PR #40 `90c17e8`. Cabang sumber checkpoint sebelumnya tetap tersedia sebagai cadangan. Belum di-push.

## Hasil uji source

Lulus setelah rebase ke head PR #40:

- `npm run lint`
- `npm run build`
- `npm run test:academic-roster-pagination`
- `npm run test:academic-record-pagination`
- `npm run test:academic-schedule-conflicts`
- `npm run test:academic-portal`
- `npm run test:migration-preflight`
- `npm run test:supabase-runtime-no-firebase`
- `git diff --check`

Build masih memberi peringatan ukuran chunk PDF sekitar 1,46 MB. Pengujian pgTAP belum dijalankan: Docker dan `psql` tidak tersedia di workstation. `npm run preflight:db-migrations:local` berhenti karena `psql` tidak ditemukan.

## Status VQE staging

- Project: `vqemuyzveuirlkvdggjd`.
- Migration `20270228000000_academic_record_cursor_indexes` dan `20270301000000_academic_student_roster_pagination` sudah diterapkan.
- Ledger diverifikasi menampilkan kedua versi source tersebut. Konektor awalnya memberi timestamp generik; dua baris yang baru dibuat kemudian diselaraskan ke versi source tanpa mengubah nama atau isi migration.
- RPC roster tersedia; hanya `service_role` yang boleh menjalankannya. `anon` dan `authenticated` ditolak.
- Trigger guard aktif dan keenam indeks Akademik yang diharapkan tersedia.
- Pemeriksaan baca-saja terakhir: 0 siswa, 0 catatan Akademik, dan 0 tenant fixture uji. SQL test 27 assertion belum dijalankan; payload gabungan terlalu besar untuk konektor SQL.
- Alias tenant-reference lama `20261101015832` masih perlu rekonsiliasi terpisah sesuai runbook.
- Production PTSAS `ptsasgdvgrbdtgyqieie` tidak disentuh.

## GitHub dan PR

- PR #40 masih Draft/Open. Head PR `90c17e83f51c4d4cfe479f17c7ec5009289fa525`; branch lokal hasil rebase `codex/pr40-roster-pagination-20261105`, satu commit di atas head.
- Fetch berhasil; commit roster merupakan fast-forward satu commit di atas head PR. Push belum dilakukan, sehingga CI untuk perubahan roster belum berjalan.
- PR #38 dan #39 masih Draft/Open. CI sebelumnya lulus, tetapi UAT visual belum selesai; belum layak di-merge.

## Urutan aman saat dilanjutkan

1. Jalankan CI dengan mendorong commit lokal sebagai fast-forward ke branch PR #40; pastikan job migration dan pgTAP roster lulus.
3. Uji UI Akademik dan batas role/unit di VQE; roster harus menelusuri halaman tanpa duplikasi atau data silang.
4. Rekonsiliasi alias migration lama mengikuti `MIGRATION_ORDERING_TENANT_REFERENCE.md`.
5. Perbarui PR #40 untuk tinjauan backend. Jangan merge sebelum CI, uji staging, dan UAT Admin lulus.
6. Production tetap menjadi langkah setelah gerbang staging serta penerimaan tim backend terpenuhi.
