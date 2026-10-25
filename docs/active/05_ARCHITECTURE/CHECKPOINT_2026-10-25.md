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

## Checkpoint: menghapus sisa Firestore dari helper asrama — 25 Oktober 2026

### Progres menuju go-live: 61/100

Skor tetap 61/100. Perubahan lokal belum masuk ke PR #13 dan belum diuji oleh CI pada SHA yang sama; hasil lokal membuktikan build dan pemeriksaan terarah saja, bukan kesiapan go-live.

- Helper struktur bersama kini tidak lagi memiliki dynamic import listener Firestore maupun transaksi alokasi/penghapusan kamar Firestore. Operasi penempatan hanya memakai API Supabase dan ditutup jika runtime Master Data atau Asrama belum aktif.
- Pemeriksaan baru menelusuri 98 modul frontend dari `src/main.tsx`, menolak paket Firebase dan adapter Firebase yang sudah dipensiunkan, serta telah ditambahkan ke workflow CI.
- Bukti lokal: `npm run lint`, `npm run build`, `npm run test:supabase-runtime-no-firebase`, `npm run test:legacy-firebase-gate`, `npm run test:legacy-firestore-tenant-scope`, `node scripts/test-production-dependencies.mjs`, dan `git diff --check` lulus. Build menampilkan peringatan ukuran chunk PDF sekitar 1,24 MB.
- Supabase Production tidak disentuh. Belum ada migrasi, perubahan database, atau data produksi yang ditulis.

Gerbang berikutnya: kirim perubahan ke PR #13, tunggu CI lulus pada commit yang sama, lanjutkan audit paritas PR #11 dan #12, lalu uji migrasi serta aplikasi pada staging terisolasi. Skor tetap berbasis bukti dan bukan ukuran linear pekerjaan yang tersisa.

## Pembaruan status setelah CI commit e3d91bc — 25 Oktober 2026

- Koreksi runtime Firebase telah masuk ke head PR #13 `e3d91bc4eb29bac2e59310e435394c98196ee211`. CI run `40188865422` lulus untuk kedua job, termasuk typecheck/build/Docker, guard frontend baru, seluruh migration/pgTAP Supabase lokal, API tenant, NIS serentak, Storage, dan backup/restore.
- Progres rilis tetap **61/100**. CI mengonfirmasi kualitas kode pada commit tersebut, tetapi belum menguji kredensial Admin di staging, rekonsiliasi/apply data, atau deployment di environment pelanggan.
- Perbaikan lanjutan berupa 62 assertion Tahfidz untuk setoran, halaqah, membership, target, batas tenant/role, idempotensi, RLS, dan hak RPC kini disiapkan dalam worktree. Supabase CLI/Docker tidak tersedia lokal; tes menunggu workflow CI setelah perubahan dikirim.

## Koreksi awal test Tahfidz — 25 Oktober 2026

### Progres menuju go-live: 61/100

Run `40189469182` menunjukkan frontend berhasil, tetapi job database gagal sebelum test Tahfidz berjalan. Log menunjuk sintaks kurang satu kurung pada sembilan ekspresi pgTAP yang membaca field hasil RPC; 62 assertion direncanakan, 0 dieksekusi. Tes database lain sebelum file tersebut lulus. Kesalahan sintaks telah diperbaiki, namun suite wajib diulang pada commit baru sebelum test Tahfidz dinyatakan lulus. Skor tidak naik.

## Koreksi fixture keanggotaan Tahfidz — 25 Oktober 2026

Run `40189751690` mengeksekusi 62 assertion pada test Tahfidz; 61 lulus. Assertion membership gagal karena Ustadz B diuji terhadap halaqah A, sehingga validasi hak ampu menolak lebih dahulu—hasil yang benar untuk fixture tersebut. Fixture kini menggunakan halaqah B yang diampu Ustadz B, sementara santri tetap terdaftar di halaqah A. Ini mengisolasi guard membership yang sedang diuji. Frontend kembali lulus; test pgTAP perlu dijalankan ulang. Skor tetap **61/100**.

## Checkpoint Portal Wali multi-santri — 25 Oktober 2026

### Progres menuju go-live: 63/100

Skor naik satu poin pada cakupan modul dan alur pengguna setelah Portal Wali dapat menampilkan progres setiap anak yang tertaut, bukan hanya anak pertama. Poin ini berlaku untuk alur yang sekarang terverifikasi pada kode dan CI; kesiapan rilis secara keseluruhan tetap rendah karena staging, migrasi, dan UAT belum dilakukan.

- Pada PR #13 head `67e8699c2955da0371c25fb1a9d3f063da402dec`, akun Wali dengan beberapa santri tertaut kini dapat memilih santri yang akan dilihat pada ringkasan dan riwayat Tahfidz.
- Daftar pilihan hanya berasal dari snapshot server yang sudah disaring berdasarkan relasi guardian–student aktif. Pilihan yang tidak lagi terdaftar diganti dengan santri pertama yang masih diizinkan; akun Santri tetap hanya melihat profilnya sendiri.
- Enam assertion sintetis memeriksa daftar kosong, pilihan awal, pilihan yang tetap sah, tautan yang dicabut, ID kosong, dan normalisasi ID. Typecheck, build, serta seluruh CI lulus pada commit yang sama.
- CI run `40190799618` sukses pada job frontend dan database. Tidak ada perubahan skema, migration, atau data Supabase Production.
- PR #13 tetap Open/Draft. Uji login Admin/Wali pada staging, rekonsiliasi/impor data, rotasi secret, serta UAT environment VPS/on-premise masih menahan go-live.

Skor bukan izin deploy. Gerbang berikutnya tetap staging yang benar, verifikasi autentikasi dan role/tenant, dry-run migrasi, pemulihan backup, serta uji instalasi pelanggan.

## Revalidasi PR dan akses staging — 25 Oktober 2026

### Progres menuju go-live: 63/100

Skor tetap 63/100 karena pemeriksaan ini memperbarui status kontrol dan PR, tetapi tidak menambah bukti autentikasi staging, rekonsiliasi data, atau UAT environment pelanggan.

- Revalidasi GitHub PR #1–#13: PR #12 sudah merged ke `main` pada `c8738185ff6e5080ae427ef0021ee25681036c40`; PR #1–#11 dan #13 masih Open/Draft.
- PR #11 tetap bertumpuk di atas PR #10: base `backend/supabase-finance-ui` pada `127c67ef2373eb8d5a654ae10f58c4b0fd1c304b`, head `backend/supabase-masterdata-structures-ui` pada `88f2686d34bbffb1aa1c7997b55cd015c424f85c`.
- PR #13 tetap jalur utama: base `main` pada merge PR #12, head `codex/supabase-runtime-cutover-20261022` pada `a972b8a079af68d4d71a3032c18c386f0bf7ae42`. PR #11 bukan leluhur #13 dan tidak boleh digabung sekaligus; bawa hanya kekurangan yang terbukti.
- GitHub Actions run `40191075189` pada head PR #13 tersebut sukses pada job frontend dan database. Hasilnya memverifikasi kode serta migrasi pada Supabase lokal sintetis, bukan database Production.
- Akses konektor Supabase ke target `ptsasgdvgrbdtgyqieie` masih ditolak. Daftar project konektor hanya menampilkan `vqemuyzveuirlkvdggjd`, project berbeda yang tidak dipakai sebagai target. Tidak ada migrasi atau penulisan Production.
- Pengujian multi-anak Portal Wali pada head `a972b8a` telah lolos CI; perubahan ini tidak mengubah status login staging atau kesiapan rilis.

Gerbang berikutnya adalah menyediakan akses baca ke project Supabase target atau staging terpisah, lalu menjalankan uji upgrade, dry-run migrasi/rekonsiliasi, autentikasi Admin/Wali, dan UAT. Jangan menaikkan persentase hanya karena branch mergeable atau CI lokal berhasil.

## Koreksi tanggal penempatan halaqah Tahfidz — 25 Oktober 2026

### Progres menuju go-live: 64/100

Skor naik satu poin dari 63/100 setelah koreksi roster dan batas akses berdasarkan masa berlaku penempatan lolos tes lokal dan kedua job CI pada commit yang sama. Poin ini mencakup validasi kode; belum membuktikan autentikasi atau data produksi.

- Snapshot Tahfidz kini memilih keanggotaan halaqah yang berstatus aktif dan mencakup tanggal bisnis tenant. Penempatan dengan tanggal mulai mendatang tidak muncul lebih awal, dan penempatan yang berakhir sebelum hari ini tidak lagi mengarahkan roster ke halaqah lama.
- Karena hak baca Ustadz Tahfidz mengikuti halaqah pada roster tenant, koreksi ini juga menghindari pemberian akses berbasis penempatan masa depan/kedaluwarsa.
- Tes sintetis memeriksa 7 fixture: mulai hari ini, mulai mendatang, berakhir hari ini, kedaluwarsa, status berakhir, serta tanggal mulai/akhir yang tidak valid. Pemeriksaan tanggal batas tetap inklusif sesuai aturan database.
- `npm run test:tahfidz-membership-date`, `npm run lint`, `npm run build`, dan `git diff --check` lulus lokal. Build masih menampilkan peringatan chunk PDF tertunda sekitar 1,24 MB.
- Commit PR #13 `ba327e8c5b5ca7e11dff00922fd53ff0d393f06a`; CI run `40192352964` sukses untuk job frontend dan database. Tes database menggunakan Supabase lokal sintetis.
- Tidak ada perubahan skema, migration, atau data Supabase Production. Target project `ptsasgdvgrbdtgyqieie` tetap tidak dapat diakses melalui konektor.

PR #13 tetap Open/Draft. Login Admin/Wali pada staging, rekonsiliasi dan uji migrasi data, rotasi secret, review, serta UAT VPS/on-premise masih menjadi release gate. Persentase kesiapan bukan izin deploy.


## Pagination riwayat Tahfidz tenant-aware — 25 Oktober 2026

### Progres menuju go-live: 65/100

Skor naik satu poin dari 64/100 setelah pembacaan riwayat Tahfidz tidak lagi terikat pada batas snapshot 5.000 catatan. Implementasi, tes kontrak, frontend, dan suite database lulus pada head PR yang sama. Ini membuktikan jalur kode di CI sintetis; belum membuktikan staging, data Production, atau UAT pelanggan.

- Snapshot awal mengirim maksimal 100 catatan terbaru. Riwayat selanjutnya memakai cursor keyset stabil berdasarkan `performed_at DESC, id DESC`, sehingga halaman berikutnya tidak mengandalkan offset dan tidak berhenti di 5.000 catatan.
- API memasang filter tenant di server. Ustadz dibatasi ke halaqah aktif yang diampu; Santri dan Wali dibatasi ke santri pada profil/tautan yang sudah diverifikasi server. Role tanpa cakupan yang sah mendapat hasil kosong.
- Tab Riwayat menyediakan tombol **Muat riwayat lebih lama**. Dashboard menandai angka hari/minggu/bulan sebagai batas bawah (`≥`) bila rentang tersebut belum sepenuhnya termuat; profil juga tidak lagi menyebut riwayat lama sebagai “belum ada setoran”.
- Tes sintetis memeriksa urutan dan batas halaman, presisi timestamp mikrodetik, cursor rusak/terlalu panjang, filter tenant, filter role, dan penolakan cakupan kosong/tidak valid. Tes lokal `npm run test:tahfidz-record-pagination` lulus.
- CI run [40193542972](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40193542972) sukses pada kedua job. Job frontend lulus typecheck, tes pagination, build, guard dependensi Firebase, dan Docker smoke test. Job database lulus rangkaian Supabase lokal, migrasi/pgTAP, NIS serentak, auth/isolasi tenant, Storage, dan backup/restore.
- Head PR #13: `8ee9ed2a258d28b69af40519e4c9ed573d0042e6`. PR masih Open/Draft. Tidak ada migrasi atau penulisan data Supabase Production.

Pagination ini mengatasi riwayat Tahfidz; snapshot roster, target, dan assignment masih memiliki batas pemindaian masing-masing dan perlu evaluasi skala terpisah. Staging yang benar, migrasi/rekonsiliasi data, login dan role UAT, rotasi secret, serta uji instalasi VPS/on-premise tetap menjadi release gate.


## Optimasi snapshot dan cakupan halaman Tahfidz — 25 Oktober 2026

### Progres menuju go-live: 66/100

Skor naik satu poin dari 65/100 setelah halaman riwayat Tahfidz tidak lagi memuat ulang snapshot seluruh tabel pada setiap permintaan. Cakupan tenant/role, filter tanggal bisnis, tes terarah, serta CI berhasil diverifikasi pada commit yang sama.

- API halaman riwayat memverifikasi actor/profile terlebih dahulu, lalu hanya membaca assignment halaqah aktif Ustadz atau tautan santri yang disahkan untuk Santri/Wali. Data dibatasi tenant di server; nama santri untuk riwayat Ustadz dimuat hanya untuk catatan di halaman yang diminta.
- Snapshot awal kini hanya mengambil membership yang mencakup tanggal bisnis tenant dan target yang berlaku pada tanggal itu. Riwayat penempatan/target yang kedaluwarsa tidak memenuhi pemindaian roster aktif.
- Tes dengan mock Supabase membuktikan permintaan riwayat Ustadz memakai filter tenant dan halaqah, tidak membaca tabel membership/target penuh, serta hanya mengambil identitas santri pada halaman. Tes snapshot memeriksa batas tanggal membership dan target.
- Tes pagination dan typecheck terisolasi lulus lokal. CI run [40194508286](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40194508286) lulus pada kedua job: typecheck, tes Tahfidz, build client/server, Docker smoke test, seluruh migrasi/pgTAP Supabase lokal, NIS serentak, auth/isolasi tenant, Storage, dan backup/restore.
- Head kode PR #13: `c2461726a60e540595ce7059a1cd37bf89af2b54`. Tidak ada migrasi atau data Supabase Production yang dijalankan.

Batas pemindaian snapshot roster santri/halaqah masih 5.000 baris dan halaman UI Tahfidz belum memiliki pagination roster sisi server. Ini tetap perlu dibereskan untuk tenant di atas batas tersebut. PR masih Open/Draft; staging, rekonsiliasi migrasi, Admin/Wali UAT, rotasi secret, dan uji pemasangan VPS/on-premise tetap release gate.

## Pengurangan beban snapshot roster Tahfidz — 25 Oktober 2026

### Progres menuju go-live: 67/100

Skor naik satu poin dari 66/100 setelah optimasi snapshot Tahfidz lolos tes dan CI pada SHA yang sama. Kenaikan ini mencatat pengurangan biaya pemrosesan dan payload pada jalur yang diuji; kesiapan tenant besar dan go-live tetap bergantung pada paginasi roster, staging, migrasi, autentikasi, dan UAT.

- Backend menghitung jumlah santri per halaqah dan membangun lookup halaqah dengan peta. Snapshot tidak lagi menggandakan objek identitas (ID, nama, NIS) santri pada setiap halaqah; hitungan Wali tetap berasal hanya dari anak yang tertaut.
- Uji sintetis mencakup dua halaqah, dua santri, jumlah anggota 2 dan 0, serta memastikan daftar identitas tidak disalin ke setiap halaqah.
- Verifikasi lokal lulus: tes pagination/snapshot Tahfidz, typecheck terarah untuk backend dan tes, transpile TSX halaman Tahfidz, serta `git diff --check`.
- CI run [40196046052](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40196046052) sukses pada kedua job di head `96df4d7b3fc9e8f2e24ea9cdfb6638720a31ec64`: typecheck, test frontend, build/Docker, migration/pgTAP Supabase lokal, isolasi tenant, Finance Storage, dan backup/restore.
- Tidak ada perubahan migration atau penulisan ke Supabase Production.

Batas pemindaian snapshot roster santri dan halaqah masih 5.000 baris; server-side pagination dan pencarian roster tetap menjadi pekerjaan skala selanjutnya. PR #13 tetap Open/Draft, dan release gate staging, rekonsiliasi data, uji login/role, rotasi secret, review, serta uji VPS/on-premise tetap terbuka.

## Pagination roster Tahfidz untuk tenant besar — 26 Oktober 2026

### Progres menuju go-live: 68/100

Skor naik satu poin dari 67/100 setelah roster dan pencarian Tahfidz beralih ke halaman keyset server-side dengan batas tenant/role, tes pgTAP, typecheck, build, serta pemeriksaan instalasi customer-managed lulus pada commit yang sama.

- Endpoint roster baru memuat paling banyak 100 santri per halaman, memakai cursor ID stabil, serta mendukung pencarian awalan nama/NIS tanpa memperlakukan `%`, `_`, atau `\\` sebagai wildcard. Ringkasan dashboard tetap menghitung jumlah santri, cakupan target, santri tanpa halaqah, dan isi halaqah secara tepat.
- RPC memeriksa profil aktif, tenant aktif, role, dan izin Tahfidz. Ustadz hanya melihat santri di halaqah yang diampu; Santri dan Wali dibatasi pada relasi santri yang sudah diverifikasi server. Hak eksekusi RPC hanya diberikan kepada `service_role`.
- UI memuat halaman roster berikutnya saat diperlukan. Nomor urut permintaan mencegah hasil pencarian lama menimpa hasil query baru atau mengubah status loading/error pencarian yang sedang aktif.
- Uji pgTAP dengan 20 assertion mencakup hak RPC, isolasi tenant/role, agregat ringkasan, pencarian literal, pagination cursor, dan penolakan izin Tahfidz nonaktif. Kesalahan assertion pgTAP yang ditemukan pada percobaan pertama sudah diperbaiki.
- CI run [40231699139](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40231699139) sukses pada kedua job di head `5e556ec9594ed267d4a5bd057cd6aee6a9909797`: typecheck, tes frontend, build, guard Firebase, image/Compose/Docker smoke test, migrasi dan pgTAP Supabase lokal, NIS serentak, API auth/isolasi tenant, Finance Storage, serta backup/restore.
- Tes logika Tahfidz dan transpile halaman juga lulus lokal. Perubahan tidak diterapkan ke Supabase Production. PR #13 masih Open/Draft.

Kenaikan ini membuktikan jalur roster Tahfidz pada database sintetis di CI, bukan kesiapan go-live. Migrasi dan rekonsiliasi data, staging, login Admin/Wali dan matriks izin, rotasi secret yang pernah dibagikan, UAT, review PR, serta uji pemasangan/pemulihan VPS dan on-premise tetap terbuka.

## Ketepatan jumlah santri per halaqah — 26 Oktober 2026

### Progres menuju go-live: 69/100

Skor naik satu poin dari 68/100 setelah kartu halaqah menggunakan hitungan pasti dari backend dan tombol **Lihat Semua** membuka roster dengan filter halaqah yang dipilih. Typecheck, build, dan suite CI pada commit yang sama lulus.

- Jumlah santri pada kartu tidak lagi menghitung hanya baris yang kebetulan sudah berada di halaman roster pertama. Daftar pratinjau menandai saat anggota halaqah belum seluruhnya dimuat.
- Tombol **Lihat Semua** berpindah ke roster dashboard dengan filter halaqah terkait; pengguna dapat melanjutkan pemuatan halaman santri sesuai pagination yang ada.
- CI run [40232490749](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40232490749) sukses pada kedua job di head 86b4a5d94dd336cae03b993db53cda06577f6ff6: typecheck, tes frontend, build, guard Firebase, Docker/Compose smoke test, migrasi dan pgTAP Supabase lokal, NIS serentak, auth/isolasi tenant, Finance Storage, dan backup/restore.
- Perubahan hanya ada di branch PR #13. Tidak ada migrasi atau penulisan data Supabase Production; PR #13 tetap Open/Draft.

Angka 69/100 mencerminkan satu koreksi UI yang diverifikasi, bukan kesiapan rilis. Migrasi dan rekonsiliasi data, staging, Admin/Wali UAT, rotasi secret, review PR, serta uji pemasangan/pemulihan VPS dan on-premise masih menjadi gerbang go-live.

## Dashboard Tahfidz: antrean tindak lanjut server-side — 26 Oktober 2026

### Progres menuju go-live: 70/100

Skor naik satu poin dari 69/100 setelah ringkasan “Perlu ditindaklanjuti” tidak lagi bergantung pada halaman roster/riwayat yang kebetulan dimuat. Backend menghitung cakupan lengkap per tenant dan role, lalu mengirim enam kasus dengan prioritas tertinggi beserta jumlah total yang tepat.

- Antrean menilai penempatan halaqah, target harian aktif, dan nilai D pada setoran terbaru. Nilai lama yang sudah digantikan setoran baru tidak memicu tindak lanjut. Pengurutan memprioritaskan jumlah sinyal, nilai D terbaru, lalu waktu dan ID sebagai pemecah seri yang stabil.
- RPC tetap memeriksa profil, tenant, role, dan izin Tahfidz; cakupan Ustadz, Santri, dan Wali mengikuti relasi yang sudah diverifikasi server. Fungsi tetap hanya dapat dipanggil `service_role`; indeks baru mempercepat pencarian nilai terakhir per santri.
- UI menampilkan jumlah antrean yang pasti serta menjelaskan bahwa roster reguler masih dimuat per halaman. Tidak ada klaim hitungan antrean parsial dari halaman yang kebetulan terbuka.
- Tes pgTAP bertambah menjadi 29 assertion dan mencakup tenant/role, isolasi lintas tenant, prioritas, nilai terbaru, serta tenant dengan tujuh kasus tindak lanjut: hitungan tetap tujuh sementara UI menerima enam baris teratas.
- Percobaan CI awal menolak akses lintas tenant dengan benar, tetapi assertion mengharapkan hasil kosong. Assertion diperbaiki untuk mengharapkan penolakan `42501`; CI akhir [run 40234152584](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40234152584) lulus pada kedua job di head `b1db77b1c158cc5fa3b30f51a30039c569136cdd`, mencakup typecheck, tes frontend Tahfidz, build, guard Firebase, Docker/Compose smoke test, migrasi/pgTAP Supabase lokal, NIS serentak, API auth/isolasi tenant, Finance Storage, dan backup/restore.
- Tidak ada migrasi atau data yang diterapkan ke Supabase Production. PR #13 masih Open/Draft.

Angka 70/100 mencatat satu peningkatan yang diuji di CI lokal sintetis, bukan kesiapan go-live. Migrasi dan rekonsiliasi data, staging, login Admin/Wali dan uji matriks izin, rotasi secret, UAT, review PR, serta uji pemasangan/pemulihan VPS dan on-premise masih menjadi gerbang rilis.

## Tindak lanjut Tahfidz dapat dibuka langsung — 26 Oktober 2026

### Progres menuju go-live: 71/100

Skor naik satu poin dari 70/100 setelah antrean risiko Dashboard dapat langsung membuka tindakan yang sesuai. Admin/SuperAdmin dapat membuka penempatan halaqah untuk santri yang belum memiliki halaqah; role yang diizinkan mengatur target dapat membuka formulir target untuk santri yang belum memilikinya.

- Formulir menerima pilihan santri dari baris tindak lanjut server-side, termasuk saat santri belum berada di halaman roster yang sedang dimuat. ID santri dan tenant tetap divalidasi ulang oleh API Supabase; pemeriksaan izin server tetap menjadi kontrol utama.
- Aksi hanya muncul bila role dapat melakukan operasi tersebut. Tombol bersifat terarah pada masalah yang ditemukan, dan form tetap dapat dibatalkan tanpa mempertahankan pilihan santri lama.
- CI [run 40235009744](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40235009744) sukses pada kedua job di head e0605f2c55aab46e61c185e48c3bc73815a96362: typecheck, tes frontend Tahfidz dan guard Firebase, build, Docker/Compose smoke test, migrasi/pgTAP Supabase lokal, NIS serentak, API auth/isolasi tenant, Finance Storage, dan backup/restore.
- Perubahan masih berada di PR #13 yang Open/Draft. Tidak ada migrasi atau data yang diterapkan ke Supabase Production.

Angka 71/100 mencatat alur tindak lanjut yang telah dibangun dan diverifikasi di CI sintetis; belum membuktikan proses login/data pada tenant pelanggan. Rekonsiliasi serta penerapan migrasi/data, staging, login Admin/Wali dan uji matriks izin, rotasi secret, UAT, review PR, serta uji pemasangan/pemulihan VPS dan on-premise tetap menjadi gerbang rilis.


## Pencarian santri untuk alur kerja Tahfidz — 26 Oktober 2026

### Progres menuju go-live: 72/100

Skor naik satu poin dari 71/100 setelah pencatatan setoran, penetapan target harian, dan penempatan halaqah dapat mencari santri lewat API tenant tanpa memuat roster satu halaman demi satu halaman.

- Pemilih santri kini mencari berdasarkan awalan nama atau NIS, menunda permintaan saat pengguna masih mengetik, membatasi hasil pada halaman backend, memuat hasil lanjutan dengan kursor, serta mencegah respons pencarian lama menggantikan kueri terbaru.
- Alur setoran hanya menawarkan santri dengan halaqah aktif. Penetapan target dan penempatan halaqah tetap dapat memilih santri tanpa halaqah. Semua hasil tetap mengikuti role dan tenant yang diverifikasi API Supabase; UI tidak menjadi batas keamanan.
- CI pada head `40f551122b6f596f1d07e8d18db623ac8073ec7f`, [run 40235931014](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40235931014), sukses pada kedua job: typecheck, pemeriksaan RBAC dan cakupan tenant, build client/server, Docker customer-managed, seluruh migrasi/pgTAP Supabase lokal, NIS serentak, API auth/isolasi tenant, Finance Storage, serta backup/restore.
- Tidak ada migrasi atau data yang diterapkan ke Supabase Production. PR #13 tetap Open/Draft.

Nilai 72/100 mencerminkan peningkatan alur inti untuk roster pesantren besar yang sudah diverifikasi di CI sintetis; belum membuktikan beban pada data tenant nyata. Rekonsiliasi dan penerapan migrasi/data, staging, login Admin/Wali dan UAT role, rotasi secret yang pernah dibagikan, benchmark skala, review PR, serta pemasangan/pemulihan di VPS dan on-premise tetap menjadi release gate.

## Paginasi jadwal Talaqqi dan Munaqasyah — 26 Oktober 2026

### Progres menuju go-live: 73/100

Skor naik satu poin dari 72/100 setelah halaman jadwal sesi Tahfidz berhenti membaca seluruh riwayat sekaligus dan beralih ke keyset pagination yang tetap dibatasi tenant serta role.

- API hanya mengirim 100 sesi per halaman, mengurutkan dengan pasangan waktu jadwal dan ID, serta memberikan cursor yang tervalidasi untuk permintaan berikutnya. Filter tenant, jenis sesi, halaqah Ustadz, dan tautan santri/Wali diterapkan pada query server.
- UI menyediakan tombol **Muat sesi berikutnya**, menggabungkan hasil tanpa duplikasi, dan membuang respons lama ketika role, tenant, atau jenis halaman berubah. Identitas santri untuk halaman yang tidak ada di roster awal diambil terbatas berdasarkan ID sesi pada halaman itu dan tenant aktif.
- Tes sintetis memeriksa ukuran halaman 100, cursor timestamp/ID, filter role dan tenant, tidak menggunakan offset, serta nama santri dari halaman lanjutan. CI pada head `cae31669c902146253e25086fd77ae5b18be21bc`, [run 40237298777](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40237298777), sukses pada kedua job: typecheck, tes pagination, build client/server, guard Firebase, Docker customer-managed, migrasi dan pgTAP Supabase lokal, NIS serentak, API auth/isolasi tenant, Finance Storage, serta backup/restore.
- Perubahan hanya berada di branch PR #13. Tidak ada migrasi atau data yang ditulis ke Supabase Production.

Skor 73/100 mencatat kesiapan baca jadwal Tahfidz bertumbuh seiring riwayat data; belum membuktikan beban produksi pada tenant besar. Rekonsiliasi dan migrasi data, staging, login Admin/Wali serta UAT role, rotasi secret, benchmark tenant besar, review PR, dan uji pemasangan/pemulihan VPS maupun on-premise tetap menjadi release gate.

## Integritas transaksi jadwal Talaqqi dan Munaqasyah — 26 Oktober 2026

### Progres menuju go-live: 74/100

Skor naik satu poin dari 73/100 setelah jalur tulis untuk sesi Talaqqi dan Munaqasyah serta perebutan slot Ustadz diuji dengan transaksi nyata pada Supabase lokal yang terisolasi.

- Suite pgTAP baru memeriksa 24 kondisi, termasuk pembuatan jadwal, retry idempoten, penolakan perubahan payload dengan kunci idempotensi yang sama, bentrok jadwal Ustadz, jadwal berurutan tanpa jeda, penyelesaian ujian dengan nilai, pembatalan, batas role, dan hak pemanggilan fungsi.
- Uji konkurensi mengirim dua permintaan yang bertabrakan pada slot Ustadz yang sama. Tepat satu transaksi berhasil; transaksi lainnya menerima penolakan konflik yang konsisten. Pembersihan fixture juga menghapus wallet sintetis lebih dahulu agar tidak melanggar relasi data.
- CI pada head `723ef1657ad53566e15d640051c17880478cda5c`, [run 40238243861](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40238243861), sukses pada kedua job. Job database menyelesaikan migrasi/pgTAP, uji NIS serentak, uji slot Tahfidz serentak, API auth/isolasi tenant, Finance Storage, dan backup/pemulihan lokal.
- Perubahan berada di branch PR #13. Pengujian hanya menggunakan Supabase lokal dan data sintetis; tidak ada migrasi atau penulisan ke Supabase Production.

Nilai 74/100 membuktikan integritas transaksi jadwal pada pengujian lokal, bukan kesiapan menyeluruh untuk go-live. Rekonsiliasi dan migrasi data, staging, login Admin/Wali dan UAT izin, rotasi secret, benchmark skala besar, review PR, serta uji pemasangan dan pemulihan pada VPS maupun on-premise tetap menjadi gerbang rilis.

## Baseline migrasi Supabase Production — 26 Oktober 2026

### Progres menuju go-live: tetap 74/100

Angka tidak berubah karena pemeriksaan ini menemukan kondisi target, tetapi belum mengurangi selisih migrasi atau membuktikan upgrade pada staging.

- Query baca-saja pada project `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`, membuktikan 47 dari 47 versi awal repository sudah tercatat sampai `20261206000000`. Repository PR #13 berisi 80 migration file sampai `20270108000000`; 33 versi berikutnya masih pending.
- Tujuh migrasi terbaru menambah akun/undangan Wali dan akses Finance/Asrama, audiens komunikasi Wali, riwayat penempatan kamar, paginasi roster Tahfidz, dan ringkasan tindak lanjut. Rinciannya tercatat pada [preflight migrasi Production](../06_DATABASE/PRODUCTION_MIGRATION_PREFLIGHT_2026-10-25.md).
- Pemeriksaan memakai `SELECT` pada metadata saja. Tidak ada perubahan database. Konektor Supabase pada sesi ini hanya melihat project lain, sehingga jangan menggunakannya sebagai pengganti target.
- Langkah aman selanjutnya: lakukan rehearsal 33 migrasi pada staging yang representatif, pulihkan backup di environment terpisah, lalu verifikasi hasil sebelum menjadwalkan upgrade Production.

## Snapshot penempatan kamar saat cutover — 26 Oktober 2026

### Progres menuju go-live: 75/100

Skor naik satu poin dari 74/100 setelah kondisi asrama yang sudah ada memperoleh snapshot awal yang jujur saat migrasi, dengan verifikasi CI pada migration dan kontrak tampilannya.

- Migration `20270109000000_boarding_room_history_baseline.sql` mencatat satu kondisi kamar/gedung bagi setiap santri yang masih memiliki penempatan saat cutover. Event sebelum snapshot tetap dipertahankan; satu indeks unik menjaga satu snapshot per santri. Snapshot tidak mengarang aktor dan tidak mengklaim merekonstruksi perpindahan lama. Pemanggilan ulang aman dan fungsi backfill tidak dapat dipanggil `service_role`.
- UI menampilkan label **Kondisi saat cutover** serta menjelaskan bahwa riwayat sebelum tanggal snapshot tidak tersedia. Tipe API/server mencakup event dan sumber baru.
- CI run `40240448804` sukses di kedua job pada commit kode `de3ae340d0c11bc8bc927c33314884daee21f648`. Cakupan mencakup typecheck, build client/server, Docker/Compose smoke test, seluruh migration dan pgTAP (52 assertion untuk riwayat kamar), NIS/Tahfidz concurrency, API auth/isolasi tenant, Finance Storage, dan backup/restore lokal.
- Tes lokal `npm run lint` tidak dapat dimulai karena dependensi proyek belum terpasang (`tsc` tidak tersedia); typecheck dan build yang sama berhasil pada CI. Tidak ada migrasi atau data yang ditulis ke Supabase Production.

Skor 75/100 mencerminkan implementasi dan CI sintetis. Baseline Production terakhir yang dibaca menunjukkan 47 migrasi hingga `20261206000000`; dengan migration baru ini, status Production harus dibaca ulang sebelum upgrade. Staging representatif, backup/restore yang diuji, rekonsiliasi dan impor data, login Admin/Wali, UAT izin, rotasi secret, benchmark pesantren besar, review PR, serta uji pemasangan/pemulihan VPS dan on-premise tetap menjadi gerbang rilis. PR #13 masih Open/Draft dan belum siap deploy.

## Preflight ledger migration yang dapat diulang — 26 Oktober 2026

### Progres menuju go-live: 76/100

Skor naik satu poin dari 75/100 setelah tim mendapat alat pemeriksaan yang dapat mengungkap selisih migration target tanpa mengubah database.

- `scripts/preflight-supabase-migrations.mjs` membandingkan seluruh 81 file repository dengan versi pada `supabase_migrations.schema_migrations`. Pemeriksaan memakai `BEGIN READ ONLY`, `PGOPTIONS=default_transaction_read_only=on`, dan mewajibkan SSL untuk host jarak jauh. Kredensial hanya diteruskan ke `psql` lewat environment dan tidak dicetak.
- Preflight menghentikan rencana bila ledger memuat versi yang tidak ada di source, duplikat, atau terdapat migration lama yang belum tercatat setelah versi yang lebih baru. Mode lokal membaca DB_URL dari `supabase status`; runbook operator tersedia di [MIGRATION_PREFLIGHT_RUNBOOK.md](../06_DATABASE/MIGRATION_PREFLIGHT_RUNBOOK.md).
- CI run `40241264730` sukses di kedua job pada commit kode `36e67a278055a9b5720cd9c54789a197e533eafb`. Preflight lokal menemukan ledger dan repository selaras; seluruh migration/pgTAP, concurrency NIS/Tahfidz, API tenant, Finance Storage, backup/restore, typecheck/build, dan Docker juga lulus.
- Tidak ada query atau penulisan ke Supabase Production pada tahap ini. Baseline live yang tercatat sebelumnya perlu dibaca ulang sebelum rehearsal; keberhasilan lokal bukan bukti status Production atau uji upgrade data nyata.

Skor 76/100 tetap bukan izin deploy. PR #13 masih Draft; staging representatif, backup/restore terpisah, rekonsiliasi/impor Firebase, login Admin/Wali dan UAT izin, rotasi secret, benchmark skala besar, review PR, serta uji pemasangan/pemulihan VPS dan on-premise tetap menjadi gerbang rilis.


## Konfirmasi ulang ledger Production — 26 Oktober 2026

### Progres menuju go-live: tetap 76/100

Kueri baca-saja pada SQL Editor project `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`, mengonfirmasi ledger langsung sebelum menyiapkan rehearsal. Skor tidak berubah karena pemeriksaan ini memperbarui fakta target, tetapi belum menjalankan rehearsal atau mengurangi risiko upgrade.

- `supabase_migrations.schema_migrations` memuat 47 versi, dari `20260603000000` sampai `20261206000000`. Seluruh 47 versi cocok dengan file repository; tidak ada versi Production yang tidak dikenal atau hilang dari source.
- Head repository PR #13 `a2de822fdc835e5661c9f61071a59fbf373bd87e` memiliki 81 file migration sampai `20270109000000`. Ada 34 migration repository setelah baseline Production, mulai `20261207000000` hingga `20270109000000`.
- Pembandingan daftar dilakukan hanya terhadap nama versi; query di dashboard hanya `SELECT` metadata. Tidak ada perubahan skema, migration, atau data Production.
- Alat preflight lokal/CI tetap hanya membaca ledger dan melaporkan versi pending. Langkah berikutnya ialah mendapatkan staging yang mewakili skema dan data, memulihkan backup ke lingkungan terpisah, lalu rehearsal seluruh 34 migration di sana.

PR #13 tetap Open/Draft dan belum siap deploy. Konfirmasi ini bukan persetujuan menjalankan migration Production.


## Audit statis untuk rehearsal migrasi — 26 Oktober 2026

### Progres menuju go-live: tetap 76/100

Peninjauan source terhadap 34 migration yang tertunda menemukan beberapa pemeriksaan khusus data dan lock yang harus masuk rehearsal. Ini belum merupakan bukti upgrade sukses pada snapshot staging, sehingga skor tidak berubah.

- Risiko yang perlu dibuktikan pada data representatif: duplikasi ISBN setelah normalisasi; hasil ujian Tahfidz lama yang gagal constraint; nilai/jenis ledger Koperasi yang tidak cocok aturan baru; pemetaan akun Wali yang ambigu; waktu dan lock saat membangun indeks; serta jumlah snapshot kamar hasil cutover.
- SQL prapemeriksaan dan langkah sebelum/sesudah migration tercatat di [checklist rehearsal Production](../06_DATABASE/PRODUCTION_MIGRATION_REHEARSAL_CHECKLIST_2026-10-26.md). Query pemeriksaan dari checklist tidak dijalankan pada data Production.
- Berikutnya: pulihkan backup ke staging terisolasi, jalankan pemeriksaan, rehearsal 34 migration, ukur lock/durasi, jalankan suite integrasi pada skema upgrade, lalu verifikasi restore.

PR #13 tetap Open/Draft. Production tidak berubah dan belum siap menerima migration.


## Rekonsiliasi migrasi dan gerbang backup — 26 Oktober 2026

### Progres menuju go-live: tetap 76/100

Skor tidak berubah: dokumentasi kini lebih akurat, tetapi belum ada baseline Production yang dapat dipulihkan, rehearsal staging, atau rekonsiliasi data. Status ini tetap berbasis bukti dan bukan izin deploy.

- Head PR #13 adalah `91fe846d22550a402c30cb2c16fb2ab06d0e1903`. CI run `40242110749` sukses pada kedua job di head tersebut, termasuk build, pemeriksaan migrasi, integrasi tenant/role, transaksi NIS/Tahfidz, Finance Storage, dan backup/restore lokal berbasis data sintetis.
- Audit source memperbarui status: preview/apply PPDB, katalog dan riwayat sirkulasi Perpustakaan, katalog Koperasi, serta jalur preview/apply finansial Koperasi sudah ada di codebase dengan flag terpisah. Tidak ada bukti bahwa data arsip telah diterapkan. Profil/Auth, aset digital Storage, serta sumber CBT masih memerlukan rekonsiliasi atau jalur migrasi.
- Dashboard Supabase project `ptsasgdvgrbdtgyqieie` menunjukkan paket Free tidak menyediakan backup project terjadwal. Tanpa baseline restore, 34 migration yang belum tercatat di Production belum boleh direhearsal di target Production.
- Rincian terbaru dan syarat per importer tercatat pada [inventaris migrasi Firestore](../06_DATABASE/FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md); checklist rehearsal tetap di [PRODUCTION_MIGRATION_REHEARSAL_CHECKLIST_2026-10-26.md](../06_DATABASE/PRODUCTION_MIGRATION_REHEARSAL_CHECKLIST_2026-10-26.md).
- Langkah berikutnya: tim backend menyediakan staging terisolasi dan backup yang berhasil dipulihkan; setelah itu jalankan pemeriksaan data khusus, rehearsal 34 migration, seluruh suite pada skema hasil upgrade, dan uji pemulihan ulang. Tidak ada perubahan Supabase Production pada checkpoint ini.

PR #13 masih Open/Draft. Go-live ditahan sampai rehearsal, migrasi dan rekonsiliasi data, login/UAT role, rotasi secret, review PR, serta uji pemasangan dan pemulihan environment customer-managed selesai.
