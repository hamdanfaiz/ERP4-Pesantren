# Checkpoint Pengembangan ERP4 — 14 November 2026

## Addendum — proyek dilanjutkan kembali

Checkpoint ini merekam keadaan saat jeda diminta. Pengembangan kini dilanjutkan dari branch lokal `checkpoint/cbt-copy-cleanup-20261114`, yang berawal dari commit checkpoint `60af26a1345e33d842ebc472eddb2935fd1d10f0`.

Peninjauan copy CBT telah selesai untuk layar operasional normal: teks teknis Supabase/backend/tenant dihapus dari pesan simpan, sesi, pengaturan, pemantauan, tombol, dan penjelasan modul. Tab impor arsip tetap dikendalikan flag `legacyArchiveImportEnabled`, yang source saat ini set `false`; konten Firestore di dalamnya tidak ditampilkan pada penggunaan normal.

Setelah perubahan copy lanjutan, verifikasi lokal lulus: `npm run lint`, `npm run build`, `npm run test:cbt-settings-import` (12 kasus), `npm run test:user-messages` (10 assertion), `npm run test:cbt-dashboard` (24 assertion), dan `npm run test:cbt-calendar` (16 assertion). Build masih memberi peringatan dependensi Zod dan chunk `react-pdf` 1,46 MB. Kode dan dokumen checkpoint tercatat di branch PR #112 pada head `6ab7b741141fd87425e0f17678b7afef9e255743`; tiga job CI utama lulus, sementara Supabase Preview dilewati karena PR tidak terhubung ke Supabase Branch. Tidak ada data atau migrasi database yang diubah.

Audit paritas CBT mendapati stack paging menambahkan indikator dasbor dan aksi cepat. Jalur impor arsip tetap tersembunyi oleh `legacyArchiveImportEnabled = false`, sama seperti stack sebelumnya. Papan peringkat Tahfidz berbasis catatan Ziyadah dikerjakan terpisah di PR #116; fiturnya menghitung data tersimpan dan membatasi Ustadz ke halaqah yang ditugaskan, tetapi role UAT belum dilakukan.

## Status saat checkpoint awal dibuat

Pemilik meminta jeda pengembangan ketika checkpoint awal dibuat. Goal migrasi ERP4 Pesantren dari runtime Firebase menuju Supabase tetap aktif dan belum selesai. Pada saat itu tidak ada migrasi database atau perubahan Production. Pengembangan telah dilanjutkan.

## Cabang dan bukti terakhir

- PR [#112](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/112) masih open dan mergeable. Head terbaru `6ab7b741141fd87425e0f17678b7afef9e255743` lulus 3/3 job CI utama; branch memuat perapihan copy CBT dan dokumen checkpoint.
- PR [#116](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/116) masih draft. Migrasi leaderboard dipindah ke `20270327000000`; ketiga job CI lulus pada `5c68c95e0a6e5fe5bec85090b88fdf0ee6fd94af`.
- Audit source membuktikan enam file SQL migrasi dan enam suite pgTAP dari PR #96–#100/#102 identik dengan salinan di #112 setelah normalisasi line ending. Perbedaan UI/TypeScript stack lama belum seluruhnya diaudit. Jangan menggabungkan migrasi stack lama sekali lagi.
- UAT Admin VQE memeriksa 114 surah dan rentang ayat terikat katalog. Roster santri staging kosong; uji simpan-baca Tahfidz/CBT dan privasi leaderboard lintas role belum terbukti.
- Tidak ada DDL, data, atau Storage Production yang diubah. Pemeriksaan DDL Production dan bukti backup/restore tetap menjadi gerbang tim backend.

## Catatan pekerjaan pada saat checkpoint dibuat

Worktree PR #112: `C:\Users\VICTUS\Documents\Codex\2026-10-18\sa\erp4-pr112-merge-verify-20261114`

Ketika checkpoint awal dibuat, perubahan copy di `src/pages/SupabaseCBTManager.tsx` baru sebagian dan belum diuji. Status tersebut sudah diperbarui pada addendum di atas: copy operasional selesai direvisi, tes lokal lulus, dan hasilnya telah ditambahkan ke branch PR #112. Riwayat commit lokal berbeda dari commit yang dibuat melalui konektor GitHub, tetapi isi file di branch PR sudah diperbarui.

Perubahan ini belum siap merge/deploy hanya berdasarkan tes lokal. CI pada head PR sudah lulus; review backend atas paritas UI/TypeScript dan pemetaan rilis Production masih diperlukan.

## Urutan lanjut saat dilanjutkan

1. Branch PR #112 telah diperbarui dan CI utamanya lulus. Pertahankan PR terbuka untuk review backend; jangan merge sebelum review UI/TypeScript dan mapping rilis selesai.
2. Tinjau PR #116 dan gunakan roster/role sintetis di VQE untuk memeriksa leaderboard, keadaan tanpa catatan, serta batas Admin/Ustadz/Santri/Wali. Jangan gunakan PTSAS Production untuk fixture.
3. Setelah semua fitur unik dari PR #96–#100/#102 terverifikasi berada di stack CBT baru, tutup PR anak sebagai superseded; jangan merge migrasi duplikat.
4. Sebelum migrasi atau deploy Production, tim backend perlu memetakan versi ledger VQE/PTSAS ke DDL aktual serta menyediakan bukti backup dan restore yang dapat dipulihkan. Jangan menjalankan `db push` sekadar mengejar jumlah ledger.

## Sumber dokumen

- [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md)
- [OPEN_PR_MIGRATION_COLLISION_AUDIT_2026-11-14.md](../06_DATABASE/OPEN_PR_MIGRATION_COLLISION_AUDIT_2026-11-14.md)
- [PTSAS_PRODUCTION_RECONCILIATION_2026-11-14.md](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-14.md)
