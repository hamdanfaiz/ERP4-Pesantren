# Checkpoint pengembangan — 26 November 2026

## Source dan PR

- PR #269 — Kegiatan Komunitas Alumni: terbuka, siap, mergeable; branch `feat/alumni-community-events-20261126`, remote head `b57f725d1270b1c280566c9c6f50d6868593b2f3`, base `main`.
- PR #270 — Jadwal Shift HRIS: terbuka, siap, mergeable; branch `feat/hris-shift-scheduling-20261126`, head `4801c1988af6c9666e00fb5165abe5d61bdfadc6`, base PR #269. Merge harus mengikuti urutan #269 lalu #270.
- PR #269 dan #270 sama-sama memiliki CI terakhir yang berhasil. PR #269 run #2520; PR #270 run #2527. UAT Admin VQE untuk kegiatan Alumni dan jadwal shift sudah dicatat di deskripsi PR masing-masing. Fixture UAT sintetis tetap berada di staging.
- Pekerjaan gerbang runtime kegiatan Alumni berada di `erp4-alumni-gate-20261126`, branch `feat/alumni-community-events-20261126`. Commit `f8c1fe9` masih lokal dan belum dipush; penyesuaian pemeriksaan runtime sedang dilanjutkan. Perubahan menambahkan flag server dan browser khusus, menyembunyikan tab Komunitas saat flag browser mati, menutup tiga API event sampai flag Alumni dan flag event sama-sama aktif, serta memperbarui Compose, `.env.example`, matriks runtime, dan tes kontrak.
- Worktree lokal `erp4-main-20261126` pada branch `docs/readiness-snapshot-20261126` masih memiliki perubahan belum commit pada `BACKEND_TEAM_START_HERE.md`, tes Alumni/preflight/runtime, `server.ts`, UI/API Alumni, serta file migrasi dan pgTAP Alumni yang belum dilacak. Perubahan ini dipertahankan apa adanya; jangan dibersihkan atau digabung otomatis karena beririsan dengan PR #269.

## Database

- Pemeriksaan ledger baca-saja saat checkpoint: PTSAS Production `ptsasgdvgrbdtgyqieie` memiliki 100 versi sampai `20270316000000`; VQE staging `vqemuyzveuirlkvdggjd` memiliki 169 versi sampai `20270407000000`.
- Semua 100 versi Production terdapat di ledger VQE; tidak ada versi Production yang hilang dari staging. Ada 69 versi tambahan di staging. Kecocokan ledger tidak membuktikan DDL Production sama dengan source.
- Migrasi #269 dan #270 sudah diterapkan hanya di VQE. Production tidak diubah. Rekonsiliasi DDL, peninjauan urutan promosi, dan bukti pemulihan Production tetap menjadi tindak lanjut tim backend.
- Jangan menerapkan gap 69 migrasi sekaligus atau mengaktifkan flag fitur baru di Production sebelum rencana Production ditinjau tim backend.

## Verifikasi dan keterbatasan

- Dependensi berhasil dipasang dari lockfile dengan `npm ci --ignore-scripts`; audit npm melaporkan 0 kerentanan.
- Lulus lokal: `npm run lint`, `npm run build`, `npm run test:customer-deployment-flags`, `npm run test:customer-compose-env`, `npm run test:alumni-workflow`, `npm run test:supabase-runtime-no-firebase`, `npm run test:api-route-auth-policy`, dan `node scripts/test-migration-preflight.mjs`.
- Smoke test `npm run test:runtime-config-http` lulus setelah port loopback lokal diizinkan. Tes ini juga memastikan secret server tidak dikirim ke browser.
- `npm run test:api:auth-tenant` belum berjalan sampai tuntas karena Supabase CLI dan Docker tidak terpasang pada PC ini. Tes API/pgTAP tetap perlu dibuktikan pada CI setelah push.
- `git diff --check` perlu dijalankan dengan `core.whitespace=cr-at-eol` karena checkout Windows memakai CRLF.
- Tidak ada perubahan Production, perubahan konfigurasi cloud, atau penggabungan PR pada checkpoint ini.

## Langkah saat melanjutkan

1. Pasang dependensi pada worktree Alumni melalui jaringan yang diizinkan, lalu jalankan lint, build, tes runtime config, API auth/tenant, dan tes workflow Alumni.
2. Tinjau diff gerbang Alumni, commit, lalu push branch PR #269. Pastikan CI baru lulus.
3. Rebase branch PR #270 ke head PR #269 yang baru, push pembaruan, dan pastikan seluruh CI tetap lulus.
4. Uji ulang preview PR #269/#270 dan feature gate pada staging VQE; jangan ubah Production.
5. Tentukan promosi kode setelah tim backend menyelaraskan rencana migrasi Production dan deployment hosting.
