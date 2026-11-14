# Checkpoint Pengembangan ERP4 — 14 November 2026

## Addendum — proyek dilanjutkan kembali

Checkpoint ini merekam keadaan saat jeda diminta. Pengembangan kini dilanjutkan dari branch lokal `checkpoint/cbt-copy-cleanup-20261114`, yang berawal dari commit checkpoint `60af26a1345e33d842ebc472eddb2935fd1d10f0`.

Peninjauan copy CBT telah selesai untuk layar operasional normal: teks teknis Supabase/backend/tenant dihapus dari pesan simpan, sesi, pengaturan, pemantauan, tombol, dan penjelasan modul. Tab impor arsip tetap dikendalikan flag `legacyArchiveImportEnabled`, yang source saat ini set `false`; konten Firestore di dalamnya tidak ditampilkan pada penggunaan normal.

Setelah perubahan copy lanjutan, verifikasi lokal lulus: `npm run lint`, `npm run build`, `npm run test:cbt-settings-import` (12 kasus), `npm run test:user-messages` (10 assertion), `npm run test:cbt-dashboard` (24 assertion), dan `npm run test:cbt-calendar` (16 assertion). Build masih memberi peringatan dependensi Zod dan chunk `react-pdf` 1,46 MB. Pembaruan ini belum didorong ke branch PR #112; CI GitHub untuk perubahan tersebut belum dijalankan. Tidak ada data atau migrasi database yang diubah.

## Status

Pemilik meminta jeda pengembangan. Goal migrasi ERP4 Pesantren dari runtime Firebase menuju Supabase tetap aktif dan belum selesai. Tidak ada migrasi database atau perubahan Production pada sesi ini.

## Cabang dan bukti terakhir

- PR [#112](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/112) masih open dan mergeable. Implementasi CBT pada `c6aee56e2639a1c6154b668e0cf4b41b884ed2ef` lulus 3/3 job CI; setelahnya branch remote `codex/cbt-scale-main-20261113` menerima pembaruan dokumentasi saja sampai `bc90e3d5b9766c3d6e9f995719a511b4e18389f9`.
- PR [#116](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/116) masih draft. Migrasi leaderboard dipindah ke `20270327000000`; ketiga job CI lulus pada `5c68c95e0a6e5fe5bec85090b88fdf0ee6fd94af`.
- Audit source membuktikan enam file SQL migrasi dan enam suite pgTAP dari PR #96–#100/#102 identik dengan salinan di #112 setelah normalisasi line ending. Perbedaan UI/TypeScript stack lama belum seluruhnya diaudit. Jangan menggabungkan migrasi stack lama sekali lagi.
- UAT Admin VQE memeriksa 114 surah dan rentang ayat terikat katalog. Roster santri staging kosong; uji simpan-baca Tahfidz/CBT dan privasi leaderboard lintas role belum terbukti.
- Tidak ada DDL, data, atau Storage Production yang diubah. Pemeriksaan DDL Production dan bukti backup/restore tetap menjadi gerbang tim backend.

## Catatan pekerjaan pada saat checkpoint dibuat

Worktree PR #112: `C:\Users\VICTUS\Documents\Codex\2026-10-18\sa\erp4-pr112-merge-verify-20261114`

Ketika checkpoint awal dibuat, perubahan copy di `src/pages/SupabaseCBTManager.tsx` baru sebagian dan belum diuji. Status tersebut sudah diperbarui pada addendum di atas: copy operasional selesai direvisi dan tes lokal lulus. Perubahan tetap belum berada di GitHub sampai commit lanjutan didorong.

Perubahan yang telah diverifikasi lokal belum otomatis siap rilis; tunggu CI pada commit yang sama dan review branch PR #112 sebelum merge/deploy.

## Urutan lanjut saat dilanjutkan

1. Mulai dari branch lokal `checkpoint/cbt-copy-cleanup-20261114` di worktree PR #112; jangan menimpa atau membuang perubahan copy yang belum diuji.
2. Selesaikan peninjauan copy CBT, lalu verifikasi lint, build, unit tests, migration preflight, dan CI pada commit yang sama.
3. Audit parity UI/API terhadap PR #96–#100/#102. Sesudah #112 di-review/merge dan tidak ada fitur unik tertinggal, tutup PR anak sebagai superseded; jangan merge duplikat.
4. PR #116 memerlukan roster sintetis di VQE untuk memeriksa tampilan leaderboard, no-data state, dan pembatasan Admin/Ustadz/Santri/Wali. Jangan gunakan PTSAS Production untuk fixture.
5. Sebelum migrasi atau deploy Production, tim backend perlu memetakan versi ledger VQE/PTSAS ke DDL aktual serta menyediakan bukti backup dan restore yang dapat dipulihkan. Jangan menjalankan `db push` sekadar mengejar jumlah ledger.

## Sumber dokumen

- [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md)
- [OPEN_PR_MIGRATION_COLLISION_AUDIT_2026-11-14.md](../06_DATABASE/OPEN_PR_MIGRATION_COLLISION_AUDIT_2026-11-14.md)
- [PTSAS_PRODUCTION_RECONCILIATION_2026-11-14.md](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-14.md)
