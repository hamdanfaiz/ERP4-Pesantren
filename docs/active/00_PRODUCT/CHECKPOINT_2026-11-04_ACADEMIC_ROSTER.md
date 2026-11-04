# Checkpoint ERP4 Pesantren — 5 November 2026

## Status kerja terkini

Pengembangan PR #40 untuk mengurangi batas roster Akademik dan memperketat relasi kelas Ustadz. Checkpoint ini aman dilanjutkan: Production tidak disentuh dan tidak ada fixture uji tersisa di VQE.

## Perubahan source

- Snapshot Akademik mengambil satu halaman santri, bukan memindai seluruh roster.
- Endpoint `/api/academic/students` menyediakan pencarian nama/NIS dan cursor tenant/aktor/role/unit yang tervalidasi.
- Pembatasan roster dan penilaian Ustadz menggunakan ID referensi kelas, bukan nama tampilan.
- UI menyediakan pencarian dan pemuatan halaman roster berikutnya.
- Migration dan pgTAP baru: `20270301000000_academic_student_roster_pagination.sql` dan `supabase/tests/academic_student_roster_pagination.test.sql`.
- Perubahan berada di branch lokal `codex/pr40-roster-pagination-20261105`. Source PR #40 saat ini di `442ccde` memiliki tree yang sama dengan commit lokal terbaru (`bf402cb`); code pagination dan checkpoint sudah tersedia di GitHub.

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

- PR #40 masih Draft/Open. Head PR `442ccdecaa97ce05b84bd353077c0074df4d2e39`; tree-nya sama dengan branch lokal `codex/pr40-roster-pagination-20261105`.
- GitHub Actions belum mencatat run untuk head tersebut; hanya status Supabase Preview yang berakhir `skipped`. Tidak ada review submission atau inline review thread pada PR.
- PR #38 dan #39 masih Draft/Open. CI sebelumnya lulus, tetapi UAT visual belum selesai; belum layak di-merge.

## Urutan aman saat dilanjutkan

1. Minta tim menjalankan native Git push untuk memicu seluruh job CI pada head terbaru; job harus mencakup replay migration lokal dan 27 assertion pgTAP. Petunjuk tersedia di `PR40_CI_HANDOFF_2026-11-05.md`.
2. Jalankan UAT Admin di VQE untuk login, role/tenant, pencarian dan pagination roster, penilaian kelas, serta Data Induk.
3. Rekonsiliasi alias migration tenant-reference mengikuti `MIGRATION_ORDERING_TENANT_REFERENCE.md`, lalu ulangi preflight baca-saja.
4. Evaluasi batas 500 kelas dan scan konflik 5.000 jadwal dengan data sintetis berskala realistis.
5. Perbarui PR #40 untuk tinjauan backend. Jangan merge sebelum CI, uji staging, dan UAT Admin lulus.
6. Production tetap menjadi langkah setelah gerbang staging serta penerimaan tim backend terpenuhi.
