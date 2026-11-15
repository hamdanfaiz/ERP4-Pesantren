# Checkpoint Pengembangan — 15 November 2026

## Perubahan dalam checkpoint ini

- Permukaan kartu, form, teks, batas, dan status hover pada seluruh submodul Asrama mengikuti token Design System untuk mode terang dan gelap.
- Peringkat setoran Tahfidz dipulihkan pada dashboard operasional. Skor dihitung dari setoran Ziyadah tersimpan per bulan pesantren; jumlah setoran, ayat, dan hari aktif menjadi dasar urutan.
- Hanya Admin, SuperAdmin, dan Ustadz yang dapat membaca peringkat. Ustadz hanya melihat santri dan setoran dari halaqah yang sedang diampunya. Output tidak menyertakan NIS.
- Pembacaan memakai endpoint terautentikasi `/api/tahfidz/leaderboard` dan SQL function server-only. Migration baru bernomor `20270401000000`, setelah migration PR terbuka tertinggi yang diketahui (`20270331000000`).
- UI peringkat memiliki status memuat, gagal dengan tombol coba lagi, kosong, lima hasil awal, dan pemuatan hingga 20 hasil.
- Copy antarmuka modul aktif tidak menampilkan nama penyedia database, istilah tenant, atau roster. Kesalahan API internal disamarkan sebelum mencapai layar pengguna.

## Verifikasi source lokal

- `npm run build` — lulus. Peringatan Rollup Zod dan ukuran bundle PDF sudah ada, tidak menggagalkan build.
- `npm run lint` — lulus (`tsc --noEmit`).
- `npm run test:tahfidz-leaderboard` — lulus; memeriksa aturan data/role dan memastikan rencana pgTAP berisi 93 assertion.
- `npm run test:migration-preflight` — lulus; memeriksa sumber 151 migration serta rekonsiliasi versi yang tercatat.
- `npm run test:supabase-runtime-no-firebase` — lulus; 164 modul, pemetaan rute, dependensi, dan kebijakan penyimpanan browser.
- `npm run test:api-route-auth-policy` — lulus; 213 route privat membutuhkan autentikasi.
- `git diff --check` — lulus.
- GitHub Actions run #1789 pada commit cbab5840ed15787c14a4964a74887c22bbee0dd6 lulus 3/3 job, termasuk replay migrasi pada basis sintetis, otorisasi API, dan seluruh suite pgTAP; rencana uji leaderboard memuat 93 assertion. Supabase CLI belum tersedia di komputer lokal.

## Perubahan cloud dan publikasi

- Migration baru belum diterapkan ke VQE staging maupun PTSAS Production. Tidak ada data atau skema live yang diubah.
- **Diperbarui 15 November 2026:** Hostinger preview sementara tersambung ke repo `hamdanfaiz/ERP4-Pesantren`, branch `main`, dengan auto-deploy aktif. Deployment `ed7bdf02ab1e84d49e15532d6d63cf6a5537d5ea` pernah terverifikasi Completed / Current. Setelah itu beberapa commit dokumentasi ditambahkan ke `main`; status deployment sesudah commit tersebut belum diperiksa. Source aplikasi tetap `b0e9a2ff294a68c4458676eada56c96aa2954635`. Ini hanya preview VQE, bukan domain produksi `erp4-pesantren.tlusur.com`.
- Pemeriksaan baca-saja setelah memuat ulang preview Admin UAT: istilah provider/backend tidak tampak pada layar yang diperiksa; kontainer Asrama tampil gelap dan enam tab dapat digulir. Pemeriksaan tidak melakukan tindakan tulis.
- **Diperbarui 15 November 2026:** flag `SUPABASE_ACADEMIC_RUNTIME_ENABLED=true` ditambahkan pada konfigurasi Hostinger preview VQE; redeploy konfigurasi selesai. Akademik kini memuat tampilan dan kondisi kosong tanpa pesan kegagalan. Tenant staging belum memiliki kelas, mata pelajaran, jadwal, jurnal, atau penilaian; UAT simpan-baca belum terbukti.
- Akses tulis MCP Production tidak tersedia pada pemeriksaan terakhir. Rilis database perlu menunggu rehearsal dan akses tulis yang sah; jangan menjalankan `db push` terhadap Production hanya berdasarkan build lokal.
- Inventaris baca-saja terbaru menemukan ketidaksesuaian source/ledger pada VQE dan PTSAS. Rincian 9 versi source belum tercatat di VQE, 4 benturan nama versi, 6 versi VQE di luar source, serta 53 versi source belum tercatat di PTSAS ada di [rekonsiliasi source dan ledger 15 November](../06_DATABASE/SOURCE_LEDGER_RECONCILIATION_2026-11-15.md). Ini metadata saja, bukan kesimpulan tentang DDL live.

## Gerbang berikutnya

1. Rehearsal migrasi 20270401000000 pada VQE setelah urutan PR #112/#121/#92 direkonsiliasi; jangan menganggap migrasi otomatis hadir di VQE atau Production.
2. Rekonsiliasi PR aktif dengan `main` sebelum merge; PR #122 saat ini Draft dan divergen, sedangkan PR komponen berbagi sebagian file/migrasi.
3. UAT browser Admin/Ustadz dengan data sintetis terkontrol untuk peringkat, isolasi halaqah, tindakan simpan-baca, dan penanganan kegagalan API pada preview.
4. Tim backend menuntaskan pemeriksaan DDL Production serta bukti backup/restore sebelum menyatakan siap deploy.


## Addendum pengembangan Tahfidz dan sinkronisasi — 15 November 2026

- Pekerjaan dilanjutkan dari `origin/main` `1a7881dbac68aaaa3ec6fb4ca35ca579f2a0f3c2` pada branch fitur terpisah; perubahan ini belum didorong atau digabung ketika addendum ditulis.
- Tahfidz kini menyiapkan penerapan target harian massal yang atomik untuk 1–250 santri. SQL menjalankan aturan target kanonis per santri dalam satu transaksi, mengikat role, pesantren, keanggotaan halaqah, dan kunci idempotensi. Jika satu santri tidak berhak atau tidak valid, seluruh batch batal.
- Nilai target dengan pecahan lebih dari dua angka ditolak pada API dan database; angka notasi ilmiah kecil tidak dapat melewati pemeriksaan presisi.
- Fitur massal sengaja **nonaktif secara bawaan** melalui `SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED` (server) dan `VITE_SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED` (UI). Aktifkan kedua flag hanya setelah migration yang tepat telah diterapkan dan diverifikasi pada environment terkait.
- Copy yang tampil untuk pemesanan fasilitas, UKS, LMS, serta konfirmasi penyimpanan data induk memakai istilah operasional yang mudah dipahami, tanpa detail penyedia database atau backend.
- Verifikasi lokal setelah perubahan: build dan TypeScript lulus; tes target Tahfidz massal, presisi, leaderboard, kontrak konfigurasi runtime, fail-closed deployment flags, routing/auth API, schema privat, migration preflight, serta cakupan CI lulus. Tes pgTAP penuh belum dapat dijalankan lokal karena Supabase CLI dan Docker tidak tersedia; hasil GitHub Actions pada commit baru masih harus diperiksa.
- Pemeriksaan baca-saja VQE pada 15 November menemukan ledger `20261109145534` untuk `tahfidz_bulk_daily_target_write_api` dan `20270312000000` untuk `tahfidz_target_decimal_precision`. RPC serta tabel ledger batch ada, tetapi hash sumber fungsi live berbeda dari file source yang sedang disiapkan. Perbedaan hash hanya membuktikan teks fungsi tidak identik, bukan apakah perilakunya setara. Jangan jalankan ulang atau menerapkan migration ke VQE sebelum DDL dibandingkan.
- Konektor menolak kueri metadata PTSAS Production pada sesi ini. Tidak ada perubahan database VQE maupun Production; keadaan DDL Production untuk fitur ini belum terbukti.

### Syarat sebelum mengaktifkan fitur massal

1. Tim backend membandingkan definisi fungsi, tabel, constraint, RLS, grant, serta ledger VQE/Production terhadap dua file migration source.
2. Jalankan migration dan pgTAP pada staging yang rekonsiliasinya sudah jelas, kemudian uji route aplikasi dengan Admin/Ustadz serta tenant sintetis.
3. Aktifkan dua flag hanya pada environment yang database-nya sudah lulus pemeriksaan; biarkan keduanya `false` pada Production sampai syarat itu terpenuhi.
4. Setelah feature branch didorong, tunggu workflow database GitHub menjalankan seluruh suite pada commit yang sama. Build lokal tidak menggantikan replay pgTAP di CI.

