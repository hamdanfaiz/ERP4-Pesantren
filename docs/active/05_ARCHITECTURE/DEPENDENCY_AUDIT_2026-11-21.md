# Audit dependensi dan halaman CBT legacy — 21 November 2026

## Perubahan

- Menghapus `react-quill-new` dan `xlsx`, yang hanya dipakai oleh `src/pages/CBTManagerLegacy.tsx`.
- Menghapus halaman CBT lama tersebut. Halaman itu tidak dirutekan aplikasi, memakai Firebase, dan tidak dapat menjadi bagian build runtime Supabase.
- Mempertahankan CBT aktif pada `src/pages/SupabaseCBTManager.tsx`, termasuk bank soal, builder, paket, jadwal, ujian, pemantauan, hasil, pengaturan, serta impor arsip melalui API server.
- Menyelaraskan `package.json`, `package-lock.json`, `bun.lock`, dan pemeriksaan tab panjang dalam `scripts/test-customer-deployment-flags.mjs`.

## Bukti pemeriksaan lokal

- `npm ci --ignore-scripts --no-audit` — lulus dari lockfile bersih.
- `npm audit --package-lock-only --audit-level=low` — 0 kerentanan.
- `bun install --frozen-lockfile --lockfile-only` — lulus dengan Bun 1.4.4.
- `npm run lint` dan `npm run build` — lulus.
- `npm run test:ci-coverage`, `npm run test:customer-deployment-flags`, dan `npm run test:supabase-runtime-no-firebase` — lulus.
- Tes CBT kalender, dashboard, paket, pemantauan, paginasi bank soal, daftar santri, penugasan, ujian, penulisan pengaturan, dan pratinjau impor pengaturan — lulus.

Build tetap memberi peringatan ukuran chunk PDF.js sekitar 1,46 MB, selain peringatan komentar `@__PURE__` dari Zod. Peringatan tersebut tidak berasal dari perubahan ini dan tidak menggagalkan build.

## Batas verifikasi

Pemeriksaan ini menilai kode, dependency, build, dan tes otomatis yang disebut di atas. Ini bukan UAT browser untuk seluruh modul, bukan verifikasi Production, dan tidak mengubah proyek Supabase mana pun. Pemeriksaan pemasangan penuh dengan Bun pada mesin ini tertahan oleh akses direktori sementara Windows; CI tetap harus melewati langkah standar `bun install --frozen-lockfile` sebelum merge.
