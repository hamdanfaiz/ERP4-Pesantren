# Checkpoint rilis dan progres — 25 Oktober 2026

## Progres menuju go-live: sekitar 58%

Persentase ini adalah skor kesiapan rilis berbasis bukti, bukan jumlah fitur yang sudah ditulis atau jumlah commit. Skor dihitung dengan bobot tetap 100 poin. Poin hanya diperoleh bila ada artefak atau verifikasi yang mendukungnya; fitur yang belum diuji di lingkungan target tidak dihitung selesai. Nilai dapat naik maupun turun setelah audit atau pengujian baru.

| Jalur kerja | Bobot | Poin saat ini | Bukti dan hal yang masih menahan |
|---|---:|---:|---|
| Runtime Supabase dan cakupan modul | 25 | 18 | Banyak modul memiliki API/runtime Supabase; beberapa fitur masih tertahan/fail-closed dan belum semua perilaku dibuktikan terhadap target. |
| Identitas, tenant, dan keamanan | 15 | 10 | Pemeriksaan tenant/role, RLS, dan endpoint aman tersedia pada codebase; uji login dan isolasi pada staging belum selesai. |
| Migrasi dan rekonsiliasi data | 15 | 4 | Inventaris Firestore serta sebagian preview/importer tersedia; belum ada rekonsiliasi final atau penerapan data yang tervalidasi pada target. |
| Pengujian dan bukti CI | 15 | 10 | CI terbaru pada head remote #13 lulus memakai lockfile resmi: build, Docker, Supabase lokal/pgTAP, NIS serentak, API tenant, Finance Storage, dan backup/restore. Perubahan worktree lokal belum masuk run ini. |
| Instalasi dan portabilitas environment | 10 | 7 | Build image Docker, Compose, dan smoke test lulus pada head remote #13; VPS/on-premise pelanggan dan pemulihan lintas environment belum diuji. |
| Sumber kode, PR, dan operasi rilis | 20 | 9 | PR #13 memiliki CI hijau pada head remote yang tepat, tetapi masih Draft; PR lain masih terbuka/bertumpuk, base tertentu stale, serta review dan UAT belum tuntas. |
| **Total** | **100** | **58** | **Belum siap merge atau go-live.** |

## Keadaan checkpoint

- Jalur utama adalah PR #13, head 8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b, berbasis pada merge PR #12.
- PR #11 masih stack lama di atas PR #10 dan divergen dari #13. Perlu matriks parity fitur; jangan merge stack lama seluruhnya.
- Rerun CI `40163774289` pada head #13 `8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b` kini sukses pada kedua job. Run pertama memang gagal tanpa log; rerun menyelesaikan frontend dan database seluruhnya. Perubahan lokal yang belum didorong belum termasuk run ini.
- Perubahan lokal belum dikomit atau dipush. Tidak ada migrasi maupun penulisan data ke Supabase Production pada checkpoint ini.
- Koreksi pencarian menghapus pengiriman record dari browser ke endpoint AI yang masih ditutup; UI Header menampilkan respons layanan yang tidak tersedia. Setelah koreksi: npm run lint lulus, npm run build lulus, dan npm run test:master-data-pagination lulus. Build masih menampilkan peringatan chunk di atas 500 kB. Instalasi dependency memakai NPM tanpa lockfile, jadi hasil ini bukan reproduksi CI.

## Gerbang berikutnya

1. Tinjau seluruh perubahan lokal lalu jalankan CI dengan lockfile resmi pada commit yang sama setelah perubahan yang disetujui masuk PR #13.
2. Cocokkan seluruh fitur unik #11 dengan #13 pada endpoint, transaksi, role/tenant, UI, migration, dan tes.
3. Pertahankan seluruh suite database, NIS serentak, auth/isolasi tenant, Finance Storage, backup/restore, dan smoke Docker sebagai gerbang wajib setiap perubahan rilis.
4. Sediakan staging Supabase dan lakukan upgrade/reconciliation dry-run dengan backup terverifikasi sebelum menerapkan migrasi atau data.
5. Verifikasi Admin/Wali, matriks izin, UAT, secret rotation, dan deployment pada environment customer-managed.

Pada setiap checkpoint berikutnya, gunakan bobot 100 poin yang sama, catat perubahan poin dengan bukti baru, dan tulis gerbang yang masih terbuka. Persentase tidak boleh ditafsirkan sebagai kesiapan deploy bila ada gerbang kritis yang gagal.

## Checkpoint tambahan: audit akses Wali dan idempotensi asrama — 25 Oktober 2026

### Progres menuju go-live: 53% (53/100)

Skor tidak berubah dari checkpoint sebelumnya. Koreksi kode dan assertion baru masih lokal; pgTAP belum dijalankan dan belum ada hasil CI baru. Karena itu belum ada bukti tambahan yang cukup untuk menaikkan skor kesiapan.

- Audit kode mengonfirmasi endpoint klaim undangan memakai UID dan email dari sesi Supabase server; sebelum aktivasi, server Auth memeriksa email sudah terkonfirmasi dan cocok dengan alamat undangan. Klaim SQL hanya dapat dipanggil `service_role`.
- Route Komunikasi, Finance, dan Asrama memeriksa status profil, tenant aktif, serta izin modul. Penggunaan Wali dibatasi oleh relasi akun Wali–santri kanonis; Finance juga memeriksa relasi itu sebelum bukti tagihan dapat diunggah atau dibaca.
- Koreksi lokal pada `20270104000000_guardian_boarding_access.sql` memastikan retry tiket fasilitas dengan kunci yang sama menolak perubahan `reporter_name_snapshot`. Tes `guardian_accounts.test.sql` kini merencanakan 30 assertion, termasuk pembuatan tiket, retry dengan payload berbeda, dan retry identik.
- Bukti lokal: `npm run lint`, `npm run build`, dan `npm run test:guardian-invitation-verification` lulus; uji undangan mencakup 7 skenario sintetis (1 diterima, 6 ditolak). Build tetap memberi peringatan chunk PDF tertunda sekitar 1,24 MB.
- pgTAP belum dijalankan karena Supabase CLI dan Docker tidak tersedia pada workspace. Perubahan belum di-commit atau dikirim; tidak ada migrasi maupun data produksi yang disentuh.

Gerbang berikutnya tetap menjalankan semua migrasi dan 30 assertion guardian pada Supabase lokal/CI, memperoleh CI hijau pada head PR #13, lalu melanjutkan matriks parity #11 → #13 dan pengujian staging. Persentase mencerminkan kesiapan berbasis bukti dan bukan izin deploy.
## Checkpoint lanjutan: gerbang Wali pada API lintas modul — 25 Oktober 2026

### Progres menuju go-live: 53% (53/100)

Skor tetap 53%. Tes integrasi baru memperluas cakupan kode, tetapi belum berjalan pada Supabase lokal dan belum ada CI hijau baru; bukti implementasi saja belum cukup untuk menambah poin kesiapan.

- Tes API tenant kini menyiapkan runtime Finance dan izin Asrama pada proses lokal terisolasi, lalu memeriksa empat penolakan: izin modul Finance dimatikan, izin Asrama dimatikan, serta masing-masing izin dinyalakan tanpa relasi akun Wali–santri kanonis. Semua skenario menuntut HTTP 403.
- `node --check scripts/test-api-auth-tenant.mjs` dan `git diff --check` lulus. Guard dependensi produksi mengonfirmasi Firebase hanya ada pada `devDependencies`; RBAC lulus 11 kasus; `npm run test:legacy-firebase-gate` membuktikan Firebase Admin hanya dapat diaktifkan pada development lokal.
- Pencarian bundle frontend tidak menemukan import/SDK Firestore. `dist/server.cjs` masih memuat nama dynamic import Firebase Admin untuk importer arsip; importer tetap jalur backend terpisah dan harus dilarang pada produksi oleh gate `LEGACY_FIREBASE_ADMIN_ENABLED`.
- Tes API baru belum dijalankan karena Supabase CLI tidak tersedia; Docker juga tidak tersedia untuk menjalankan stack lokal. Head PR #13 di GitHub masih Draft dan workflow terakhir tetap gagal tanpa job log/step.
- Flag runtime Supabase di `.env.example` masih `false`. Sesudah seluruh migration diterapkan dan diverifikasi pada database target, operator harus mengaktifkan flag frontend/backend yang sesuai secara serentak. Enam modul—Dokumen, Enterprise, ERP, CRM, Intelligence, dan Ecosystem—masih tampil sebagai placeholder dalam runtime Supabase.
- Tidak ada migrasi atau data Production yang diterapkan. Perubahan tetap lokal; skor kesiapan deploy tidak berubah.

Gerbang berikutnya: jalankan tes API lintas modul dan seluruh pgTAP pada Supabase lokal/CI, pulihkan CI PR #13, lalu lanjutkan pelengkapan modul yang masih placeholder dan uji konfigurasi deployment customer-managed.
## Checkpoint parity Master Data/Tahfidz PR #11 → #13 — 25 Oktober 2026

### Progres menuju go-live: 53% (53/100)

Skor tetap 53/100. Perbaikan route dan UI impor kini lolos pemeriksaan TypeScript dan build, tetapi belum dibuktikan dengan Supabase/Firestore lokal dan CI PR #13 masih gagal. Karena itu perubahan kode belum menambah poin kesiapan rilis.

- Audit detail menemukan PR #13 pada head remote belum mendaftarkan endpoint POST /api/master-data/structures/migrate dan POST /api/master-data/students/migrate, walaupun service klien dan fungsi importer tersedia.
- Worktree lokal kini memiliki endpoint tersebut. Route mewajibkan sesi dan profil Admin aktif, tenant aktif, dua flag operator (SUPABASE_MASTER_DATA_RUNTIME_ENABLED dan SUPABASE_MASTER_DATA_IMPORT_ENABLED), tenant legacy yang dipetakan di Supabase, batas 5.000 record, pembacaan tenant-scoped, dan token konfirmasi untuk apply.
- Panel pratinjau/impor Admin ditambahkan pada Master Data dan disembunyikan sampai flag UI VITE_SUPABASE_MASTER_DATA_IMPORT_ENABLED diaktifkan. Pratinjau tidak menulis; apply menampilkan konfirmasi eksplisit dan tidak menghapus record lama.
- Tes integrasi API diperluas untuk memastikan endpoint impor menolak anonymous (401) dan tetap tertutup saat flag dinonaktifkan (503). node --check, npm run lint, npm run build, dan git diff --check lulus. Tes API belum dijalankan karena Supabase CLI/Docker lokal tidak tersedia.
- Paritas inti Tahfidz ditemukan pada jalur Supabase-native: roster/snapshot, setoran idempotent, target, penugasan halaqah/anggota dengan request ledger, impor legacy, serta sesi Tahfidz. PR #13 menggunakan UID/profile Supabase; jembatan Firebase Auth PR #11 sengaja tidak dibawa ke runtime.
- Tidak ditemukan tabel atau RPC riwayat perubahan penempatan kamar pada migration #11 maupun padanannya di #13. Assignment kamar memang transaksional, tetapi klaim “riwayat penempatan” belum terbukti dan masih menjadi gap produk.
- Fitur Talaqqi, munaqasyah, laporan Wali, peer review, dan pencapaian Tahfidz belum memiliki runtime Supabase tersimpan; jangan tandai setara hanya karena UI legacy memiliki layar.
- Semua perubahan tetap lokal dan belum dikirim ke PR #13. Tidak ada migration atau data Supabase Production yang diterapkan.

Perubahan skor berikutnya hanya setelah tes API/pgTAP dijalankan, CI head target hijau, serta gap history penempatan dan fitur lanjutan diputuskan/ditutup. Persentase adalah skor kesiapan rilis berbasis bukti, bukan ukuran jumlah pekerjaan yang tersisa secara linear.
## Checkpoint: riwayat penempatan kamar — 25 Oktober 2026

### Progres menuju go-live: 53% (53/100)

Skor tidak berubah. Perbaikan backend dan UI telah dibuat secara lokal, tetapi tes pgTAP belum dapat dijalankan dan perubahan belum ada di PR #13. Implementasi lokal belum dihitung sebagai bukti kesiapan database atau CI.

- Migration 20270106000000_boarding_room_assignment_history.sql menambahkan tabel audit tenant-scoped, trigger untuk assignment awal/pindah/perubahan gedung/unassign, snapshot nama ruang/gedung, dan attribution aktor/sumber. Wrapper RPC memvalidasi Admin aktif pada tenant yang sama.
- Koreksi least-privilege mencabut seluruh hak `service_role` pada tabel riwayat lalu hanya memberi `SELECT` dan `INSERT`. pgTAP merencanakan 42 assertion, termasuk larangan mengubah, menghapus, dan mengosongkan tabel audit.
- API Admin membaca riwayat berdasarkan tenant sesi, dan detail Santri menampilkan timeline. Jalur CRUD, penempatan langsung, dan arsip mengirim UID Admin ke RPC terverifikasi.
- Penempatan awal melalui onboarding PPDB kini memakai wrapper yang menyimpan UID Admin dan sumber ppdb_onboarding. UI menyatakan bahwa riwayat baru tercatat sejak fitur diaktifkan, sehingga data lama tidak disalahartikan sebagai nihil.
- pgTAP menambahkan 42 assertion untuk histori, retry idempoten, okupansi, arsip, batas tenant/role, aktor, sumber PPDB, dan hak append-only. Pemeriksaan statis memastikan plan(42) cocok dengan 42 assertion; SQL belum dieksekusi.
- Verifikasi terbaru: `npm run lint`, `npm run build`, `npm run test:master-data-pagination`, `node --check scripts/test-api-auth-tenant.mjs`, pemeriksaan `git diff --check`, dan pencocokan statis `plan(42)` dengan 42 assertion lulus. Build masih memperingatkan chunk PDF 1,24 MB. 13 suite logika sintetis juga lulus pada validasi lokal sebelumnya; pgTAP belum dijalankan.
- Supabase CLI, Docker, dan psql tidak tersedia; konektor Supabase live menolak akses baca (`permission denied`). PR #13 masih Draft pada head yang sama dengan worktree (`8d9dc4c`); run terbaru `40163774289` gagal pada dua job sebelum langkah/log tersedia. PR #11 tetap bertumpuk di atas #10 dan divergen dari #13. Migration/pgTAP dan API auth tenant belum diuji terhadap database.
- Tidak ada commit/push, merge, migrasi Production, atau penulisan data Production. Perubahan riwayat kamar belum masuk PR remote.

Gerbang berikutnya: jalankan migration dan pgTAP di Supabase lokal/CI, pastikan CI pada head PR #13 hijau, lalu review pemetaan database/actor sebelum memperbarui status kesiapan.

## Validasi susulan checkpoint — 25 Oktober 2026

### Progres menuju go-live: 53/100

Skor tetap 53/100. Lima suite logika lokal berhasil dijalankan ulang setelah koreksi PPDB dan riwayat kamar: verifikasi undangan Wali (7 skenario), RBAC (11 kasus), Master Data pagination/PII minimization, pratinjau impor PPDB (9 kasus), serta idempotensi ID mutasi (8 assertion). Assertion pgTAP `boarding_room_assignment_history.test.sql` tetap cocok dengan `plan(42)`; kecocokan statis bukan pengganti eksekusi SQL. `git diff --check` juga lulus.

Poin kesiapan belum bertambah karena tes baru berjalan di lingkungan lokal, bukan database/CI target. Migration dan pgTAP belum dieksekusi; CI PR #13 masih gagal tanpa log langkah yang dapat diperiksa; perubahan tetap lokal dan tidak ada operasi ke Supabase Production. Gerbang berikutnya tetap mendapatkan eksekusi pgTAP dan CI hijau pada head PR yang sama.

## Checkpoint CI head PR #13 — 25 Oktober 2026

### Progres menuju go-live: 58/100

Skor bertambah 5 poin setelah CI berhasil pada commit remote yang menjadi baseline PR #13. Perubahan bobot: Pengujian dan bukti CI 7→10/15; Instalasi dan portabilitas environment 6→7/10; Sumber kode, PR, dan operasi rilis 8→9/20. Jalur kerja lain tetap. Kenaikan ini tidak menandakan perubahan lokal telah tervalidasi.

- Rerun workflow GitHub Actions `40163774289` pada SHA `8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b` berakhir `success` untuk kedua job. Frontend lulus typecheck, pemeriksaan dependency Firebase, build, runtime production, Docker build/Compose, dan smoke test. Database lulus Supabase lokal, seluruh migration/pgTAP, NIS serentak, importer logic, auth/tenant isolation, Finance Storage, dan backup/restore.
- Run ini menguji head remote PR #13, bukan perubahan lokal worktree. Secara khusus migration dan 42 assertion riwayat penempatan kamar, serta perubahan lokal lain yang belum didorong, belum termasuk bukti CI tersebut.
- PR #13 masih Open/Draft; belum ada review/approval. PR #11 masih stack lama yang divergen. Supabase Production belum disentuh.

Gerbang berikutnya: review perubahan worktree terhadap head PR, dorong perubahan yang disetujui ke cabang PR #13 sesuai otorisasi pengguna, lalu tunggu CI baru pada SHA perubahan tersebut. Skor kesiapan hanya naik lagi jika hasil CI baru dan bukti staging/migrasi mengonfirmasi perubahan itu.
Validasi lokal setelah rerun CI: `npm run lint`, `npm run build`, `node scripts/test-production-dependencies.mjs`, dan `npm run test:legacy-firebase-gate` lulus. Lima suite lokal (undangan Wali, RBAC, Master Data pagination, PPDB import preview, dan ID mutasi) juga lulus. Build tetap memberi peringatan chunk PDF tertunda sekitar 1,24 MB. Skor tetap 58/100 sampai CI pada commit perubahan worktree yang sama lulus; bukti lokal tidak menggantikan pgTAP atau target staging.
