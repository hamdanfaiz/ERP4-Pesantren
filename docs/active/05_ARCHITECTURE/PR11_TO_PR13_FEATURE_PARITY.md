# Matriks Paritas Fitur PR #11 → PR #13

## Status branch

Pemeriksaan GitHub pada 26 Oktober 2026 menunjukkan PR #11 masih Open/Draft, head `88f2686d34bbffb1aa1c7997b55cd015c424f85c`, dengan base branch `backend/supabase-finance-ui` pada `127c67ef2373eb8d5a654ae10f58c4b0fd1c304b`. PR #12 telah merged ke `main` pada `c8738185ff6e5080ae427ef0021ee25681036c40`. PR #13 masih Open/Draft pada head `4a66a402bb62af556e00ff7df9b9e0494b0470c6`, berbasis pada `main` di commit tersebut.

GitHub membandingkan kedua head sebagai `diverged`: PR #13 424 commit di depan dan 235 commit di belakang, dengan merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`. Jangan menggabungkan seluruh PR #11 ke PR #13. Migrasi PR #11 bertanggal `20260606000000`–`20260618000000` adalah bagian dari lineage lamanya dan tidak boleh ditambahkan ke lineage PR #13 secara mekanis.

## Matriks fitur

| Area PR #11 | Bukti pada PR #13 | Status paritas | Keputusan |
|---|---|---|---|
| Master Data struktur: daftar, ubah, hapus, impor legacy | `src/server/supabaseOnboarding.ts`; route `/api/master-data/structures*`; migration tenant runtime; `MasterDataManager` memanggil API tenant. | Padanan Supabase-native tersedia dan tercakup oleh CI. Ini tidak membuktikan migrasi data target. | Jangan port file atau migration lama. Pertahankan kontrak #13 dan jalankan rekonsiliasi pada staging. |
| Data Santri, enkripsi PII, NIS unik, arsip, impor legacy | `src/server/supabaseOnboarding.ts`; `/api/master-data/students*`; `nis_reservations`; test/API race NIS pada CI. | Padanan tersedia; transaksi dan race NIS tercakup CI sintetis. | Tidak perlu menggabungkan implementasi PR #11. Uji tetap perlu pada staging dan login akhir. |
| Penempatan kamar dan riwayat | `/api/boarding/students/:studentId/room`, riwayat asrama, migration `20270106000000_boarding_room_assignment_history.sql` dan `20270109000000_boarding_room_history_baseline.sql`. | Padanan lebih baru tersedia; tidak membuktikan sejarah sebelum baseline dapat direkonstruksi. | Pertahankan snapshot baseline sebagai baseline, bukan riwayat perpindahan lama. |
| Tahfidz: roster, setoran, target, halaqah/anggota, impor | `src/server/supabaseTahfidz.ts`, `src/pages/TahfidzManager.tsx`, `src/pages/SupabaseTahfidzSessions.tsx`; API paginasi dan sesi; migration Tahfidz hingga `20270108000000`; uji paginasi, tanggal tenant, race, dan pgTAP di CI. | Alur inti memiliki padanan Supabase-native dan diuji dengan data sintetis. | Jangan port jembatan Firebase Auth PR #11. Pertahankan Supabase Auth/profile dan lanjutkan UAT tenant. |
| Identitas Tahfidz melalui Firebase UID | PR #11 memakai bridge Firebase Auth/profile. PR #13 memakai sesi Supabase Auth, profil `user_profiles`/`profiles`, serta guard Firebase yang melarang SDK Firebase dalam bundle aktif. | Sengaja diganti oleh arsitektur cutover; bukan fitur yang harus dipertahankan. | Jangan aktifkan bridge lama. Firebase Admin hanya dipakai untuk pembacaan arsip migrasi yang dipagari. |
| Pendaftaran publik PPDB dan perubahan tahap/nilai | `src/server/supabasePublicPpdb.ts`, `src/server/supabasePpdb.ts`, route `/api/public/ppdb/*` dan `/api/ppdb/candidates*`, `SupabasePpdbManager`. | Pendaftaran publik, penilaian, tahap, dan onboarding memiliki padanan. | Pertahankan alur ini dan uji ujung ke ujung pada staging. |
| Pembuatan kandidat manual oleh Admin dan perubahan batch | PR #13 menyediakan modal Admin, endpoint `POST /api/ppdb/candidates`, validasi server, enkripsi NIK/NISN, RPC batch transaksional, dan retry idempoten. Form manual membuat satu kandidat; UI CSV UTF-8 mendukung batch 1–100 setelah pratinjau duplikasi, tanpa mengembalikan NIK/NISN ke browser. | Uji parser CSV, pgTAP, API role/tenant, dan CI run `40260536432` pada commit kode `9754b9c` lulus. Offline capture belum tersedia; UAT/staging belum dilakukan. | Pertahankan transaksi identitas dan jalur CSV online; jangan membuka tulis langsung dari browser. Putuskan apakah mode offline memang diperlukan sebelum mendesain antrean lokal untuk data PII. |
| Berkas dokumen calon santri | Pendaftaran publik memvalidasi berkas lalu mengunggahnya ke bucket privat `ppdb-documents`; path disimpan pada `candidate_documents`. PR #13 menyediakan endpoint unduh dan unggah Admin tenant-scoped, pemeriksaan role/modul, validasi path/MIME/ukuran, audit akses, dan kontrol lampiran pada detail kandidat. Retry idempoten dan tidak ada penggantian diam-diam. | pgTAP dan HTTP regression untuk unggah/unduh Admin serta penolakan akses langsung browser lulus pada CI run `40260536432`. Rehearsal staging dan UAT belum dilakukan. | Pertahankan bucket privat dan akses melalui backend; jangan membuka bucket untuk browser. Feature flag tetap mati sampai migration dan rehearsal staging lulus. |
| Tagihan dan pembayaran PPDB kandidat, penolakan, impor tagihan | PR #13 menyediakan pembuatan invoice pendaftaran/uang pangkal melalui `POST /api/ppdb/candidates/:candidateId/bills`, mencatatnya pada Finance, dan menautkan invoice ke santri saat onboarding; bukti bayar/verifikasi memakai alur Finance yang ada. | Uji pgTAP/API pada CI run `40260536432` lulus. Snapshot Firestore kanonis yang diperiksa pada 26 Oktober berisi 0 dokumen `financeBillings`; tidak ada arsip tagihan untuk snapshot itu. Pembayaran mandiri keluarga sebelum onboarding belum tersedia; rehearsal staging belum dilakukan. | Tidak perlu impor arsip dari snapshot saat ini. Jika sumber berubah, jalankan hitung/preview baru. Tetapkan desain pembayaran sebelum onboarding sebagai gap produk terpisah. Jangan merge migration Finance lama dari #11. |
| Portabilitas VPS/on-premise | PR #11 menambah dokumen portabilitas. PR #13 menyediakan `docs/guides/CUSTOMER_MANAGED_DEPLOYMENT.md`, Docker/Compose, dan CI smoke test. | Padanan dokumentasi dan instalasi tersedia; uji pemulihan di environment pelanggan belum ada. | Uji instalasi/backup/restore pada VM bersih sebelum komersialisasi. |

## Bukti dan batas

- CI PR #13 pada head checkpoint `b17517d834e6f01eddb0f2df16b3f1378a24edae` sukses pada kedua job di run [`40245870815`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40245870815). CI menguji database lokal terisolasi dengan data sintetis, bukan target Supabase Production.
- Head PR #13 berikutnya `ed7a5600d71308206003e6d23cbba525d2d4252b` juga sukses pada kedua job di run [`40246580443`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40246580443); run tersebut mencakup uji regresi preflight ledger.
- Target Supabase Production memiliki 47 migration tercatat sampai `20261206000000`; source PR #13 memiliki 81 file migration dan 34 pending. Paket Free tidak menyediakan backup project terjadwal. Karena itu migration maupun gap fitur yang memerlukan perubahan schema belum boleh diuji dengan menulis ke Production.
- Matriks ini membuktikan pemeriksaan source dan check run yang disebutkan, bukan paritas perilaku penuh, hasil UAT, rekonsiliasi arsip, atau kesiapan deploy.
- Run CI [`40260536432`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40260536432) pada kode commit `9754b9cb2f4c4771ee126b7752fe07f9b8c4c808` lulus pada kedua job. CI terbaru untuk commit dokumentasi `4a66a402bb62af556e00ff7df9b9e0494b0470c6` juga lulus pada kedua job di run [`40260937224`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40260937224).

## Gerbang penutupan PR #11

1. Tentukan kebutuhan Admin untuk mendaftarkan pendaftar offline.
2. Rehearsal staging untuk unggah/unduh dokumen privat Admin dan UAT kandidat offline/CSV. Jalur unggah dan unduh publik/Admin tetap melalui backend; bucket tidak diberi akses browser umum. Tagihan kandidat sudah memiliki kontrak source, tetapi keputusan alur pembayaran sebelum onboarding dan impor arsip masih terbuka.
3. Tambahkan uji pgTAP dan API role/tenant untuk setiap kontrak baru; jalankan seluruh CI.
4. Rehearsal migration dan impor pada salinan Supabase yang dapat dipulihkan, lalu UAT dengan akun Admin dan Wali.
5. Setelah pemilik PR menyetujui matriks dan semua fitur yang dibutuhkan memiliki keputusan, baru tutup PR #11. Jangan merge branch lama secara utuh.


## Rekonsiliasi gap PPDB terkini — 26 Oktober 2026

Pernyataan audit yang lebih lama bahwa pembuatan/batch Admin, unggah dokumen privat, dan pembuatan invoice belum tersedia sudah disupersesi oleh source PR #13 dan CI terbaru. Kandidat dapat dibuat manual atau secara batch melalui CSV online, Admin dapat mengunggah/mengunduh dokumen melalui backend pada bucket privat, dan Admin dapat membuat tagihan PPDB yang terhubung dengan Finance.

Gap produk yang masih terbuka adalah pendaftaran Admin saat offline, pembayaran mandiri keluarga sebelum akun/relasi santri tersedia, UAT staging, dan rehearsal migrasi pada salinan Supabase yang dapat dipulihkan. Impor arsip tagihan tidak diperlukan untuk snapshot Firestore yang diperiksa karena `financeBillings` berisi nol dokumen; hitung ulang jika sumber berubah. CI tidak membuktikan kesiapan Production.


## Checkpoint dokumen PPDB privat — 26 Oktober 2026

### Progres menuju go-live: tetap 78/100

Perbaikan akses dokumen Admin dan audit baca lulus CI terisolasi. Skor belum berubah karena migration belum direhearsal pada staging yang dapat dipulihkan, sementara fitur PPDB offline/batch, UAT, dan gerbang operasional lain masih terbuka.

- Koreksi audit: pendaftaran publik PPDB memang sudah mengunggah dokumen tervalidasi ke bucket privat `ppdb-documents`; gap yang ditemukan adalah belum adanya unduh Admin yang memeriksa tenant/izin dan mencatat akses.
- Commit `50454ab9a1dca41320f72bca3b030b3b835401c9` pada PR #13 lulus di kedua job CI [run 40250070917](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40250070917): typecheck/build, runtime customer-managed, migration source, pgTAP, NIS/Tahfidz concurrency, API auth/tenant, Finance Storage, PPDB Storage, dan backup/restore sintetis.
- Endpoint Admin memerlukan profil aktif berizin modul PPDB, membatasi pencarian berdasarkan tenant dan kandidat, memvalidasi pola path serta signature PDF/JPG/PNG, membatasi ukuran berkas, dan mengirim respons tanpa cache. Server membaca dari Storage menggunakan secret Supabase; bucket tetap privat dan akses browser ditolak.
- Tabel audit menyimpan aktor, tenant, kandidat, jenis dokumen, waktu, dan SHA-256; tidak menyimpan path berkas. `anon` dan `authenticated` tidak memiliki akses. `service_role` hanya mendapat SELECT/INSERT agar tidak dapat mengubah atau menghapus catatan.
- Tes HTTP sintetis menguji unduh byte, header `no-store`/`nosniff`, penolakan Wali, penolakan tenant asing, penolakan baca Storage langsung dari browser, dan satu catatan audit hanya untuk unduh berhasil. Tes pgTAP menambah 9 assertion untuk privilege, FORCE RLS, dan bucket privat.
- Source berisi 83 migration; baseline Production yang pernah diverifikasi tetap 47 migration sampai `20261206000000`, dengan 36 migration menunggu rehearsal. Tidak ada migration, data, flag runtime, atau pengaturan Storage yang diterapkan ke Production. Kedua flag unduh Admin tetap `false`.
- `node --check` untuk dua skrip API, `npm run test:migration-preflight`, dan pemeriksaan whitespace lulus. Typecheck, build, serta tes database/HTTP dijalankan pada GitHub Actions karena toolchain dan Supabase lokal tidak tersedia di workspace.

Langkah pengembangan berikutnya: tunggu CI untuk unggah lampiran Admin, lalu tinjau impor arsip tagihan dan rehearsal staging. Jangan aktifkan flag dokumen sebelum rehearsal staging. PR #13 tetap Draft; tidak ada merge, deploy, atau migration Production pada checkpoint ini.

## Checkpoint pembuatan kandidat Admin PPDB — 26 Oktober 2026

### Progres menuju go-live: tetap 78/100

Pembuatan pendaftar Admin untuk satu record per pengiriman sudah lolos CI pada Supabase lokal terisolasi. Skor tetap 78/100 karena belum ada rehearsal staging, migrasi target, UAT Admin/Wali, backup/restore target, dan simulasi deployment pelanggan.

- Formulir Admin mengumpulkan data pendaftar dan orang tua; status dokumen tidak menandai lampiran sebagai tersedia sebelum file benar-benar diunggah.
- Endpoint mensyaratkan profil aktif, role Admin/SuperAdmin, permission PPDB, dan tenant dari sesi; browser tidak dapat menentukan tenant atau aktor untuk menulis langsung.
- NIK/NISN divalidasi dan dienkripsi/fingerprint di server. Fingerprint payload idempotensi memakai HMAC rahasia, sehingga retry setelah respons jaringan tidak membuat kandidat ganda dan catatan tidak menyimpan PII.
- RPC memeriksa profil dan status tenant di dalam transaksi, mengunci baris otorisasi, membatasi batch 1–100, mencatat actor, dan mengembalikan hasil lama hanya jika actor serta fingerprint payload sama. Identitas ganda membatalkan seluruh batch.
- Uji pgTAP menutup akses langsung anon/authenticated dan memeriksa permission, tenant, replay, konflik payload, atribusi Admin, dan rollback batch. Uji HTTP menolak akun tanpa permission PPDB serta role Wali.
- CI pada commit kode `587158138c0cf39d4eacb9bc348db380d81fdeec`, [run 40251344381](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40251344381), sukses di kedua job: typecheck/build, Docker/Compose, semua migration/pgTAP lokal, API auth/isolasi tenant, Storage, dan backup/restore sintetis. Run pertama `40251244836` menangkap import helper yang hilang; import diperbaiki sebelum run sukses.
- Jumlah migration pada source bertambah menjadi 84; dibanding ledger Production yang sebelumnya terbaca 47 migration sampai `20261206000000`, ada 37 migration pending. Angka ini tetap perlu dibaca ulang sebelum rehearsal.
- Belum ada migration/data/flag yang diterapkan ke Supabase Production. CLI dan dependensi proyek tidak tersedia di workspace ini; bukti build dan database berasal dari CI PR #13, bukan mesin lokal.

Tindak lanjut: validasi unggah lampiran privat untuk kandidat Admin di CI. Pertahankan PR #13 Draft dan jangan jalankan migration ke Production pada tahap ini.

## Checkpoint pratinjau impor PPDB CSV — 26 Oktober 2026

### Progres menuju go-live: tetap 78/100

- Admin dapat memilih CSV UTF-8 maksimal 1 MB/100 pendaftar, mengunduh templat, lalu melihat pratinjau tanpa menulis data.
- Pratinjau memvalidasi kolom dan format di server, mendeteksi nomor pendaftaran, NIK, dan NISN yang berulang di berkas atau sudah dipakai tenant ini, serta hanya mengembalikan status dan nomor baris tanpa mengirim NIK/NISN kembali ke browser.
- Penyimpanan batch hanya tersedia setelah semua baris lolos pratinjau. Jalur akhir memakai RPC tenant-aware, actor-attributed, idempoten, dan atomik yang sudah ada; constraint unik database memeriksa ulang kondisi yang berubah bersamaan. Jika satu baris berbenturan, seluruh batch ditolak.
- Tes baru mencakup parser/angka identitas berawalan nol, akses role PPDB, penolakan Wali, privasi respons, duplikasi batch, dan tidak adanya penulisan saat preview. Commit kode `62949ac08ce9f159cc13e17f3d9e1d72fdcb66c0` lulus pada kedua job CI [run 40252732580](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40252732580), termasuk build/typecheck, Docker/Compose, Supabase lokal/pgTAP, API auth/isolasi tenant, Storage, dan backup/restore sintetis.
- Tidak ada migration, penulisan data, feature flag, merge, atau deploy ke Supabase Production. PR #13 tetap Draft. Unggah lampiran privat Admin masih menunggu CI dan rehearsal staging.

## Checkpoint lampiran privat pendaftar PPDB Admin — 26 Oktober 2026

### Progres menuju go-live: tetap 78/100

- Detail kandidat Admin kini menampilkan status dan menyediakan unggah satu lampiran yang belum tersedia: Kartu Keluarga, akta kelahiran, rapor, ijazah, SKHUN, atau pas foto.
- Backend membatasi ukuran ke 1 MB, memeriksa tanda tangan byte PDF/JPG/PNG, membangun path tenant/kandidat di server, dan memakai service key hanya di backend. UI tidak menerima atau menyimpan path Storage.
- RPC mengunci kandidat, memeriksa profil Admin aktif/permission PPDB/tenant aktif, mengaitkan metadata dan status dokumen secara atomik, serta menolak unggahan lintas tenant atau penggantian diam-diam.
- ID permintaan dan hash isi membuat retry aman; bucket tetap privat. Jejak audit append-only menyimpan tenant, kandidat, aktor, jenis dokumen, dan SHA-256 tanpa isi berkas.
- Tes pgTAP memeriksa privilege, RLS, otorisasi, idempotensi, konflik, dan tenant; tes HTTP mencakup unggah, validasi MIME, retry, duplikasi, akses langsung Storage, dan penolakan lintas tenant. Dua percobaan awal menemukan sintaks ekspresi `CASE` dan retry identik yang tertolak oleh pemeriksaan lampiran awal; keduanya diperbaiki. CI pada commit `66cebd6d1c9cb5d12097799dd0ead366e91b31ec`, [run 40255475661](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40255475661), lulus penuh: build/typecheck/Docker, 771 assertion pgTAP, role/tenant, HTTP upload/retry/Storage, NIS/Tahfidz concurrency, dan backup/restore.
- Tidak ada migration/data/flag yang diterapkan ke Supabase Production. Flag unggah dan unduh tetap mati. Source berisi 85 migration; baseline Production yang pernah diverifikasi masih 47 migration sampai `20261206000000`, dengan 38 migration menunggu rehearsal dan pembacaan ulang ledger.
- PR #13 tetap Draft; tidak ada merge, deploy, atau migration Production pada checkpoint ini.

## Checkpoint rekonsiliasi tagihan PPDB legacy — 26 Oktober 2026

### Progres menuju go-live: tetap 78/100

- Pembacaan REST Firestore menggunakan ADC menemukan 0 dokumen pada jalur `financeBillings` di database kanonis. Yang dicatat hanya jumlah, tanpa isi atau identitas dokumen.
- Tidak ada data yang diubah pada Firebase atau Supabase. Tidak ada migration, import, invoice, atau ledger sintetis yang dibuat.
- Keperluan impor arsip tagihan dari snapshot Firestore saat ini dinyatakan tidak berlaku. Jika snapshot berubah sebelum cutover, jalankan hitung/preview baru dan rekonsiliasi terlebih dahulu.
- Pembayaran wali sebelum onboarding masih belum tersedia. Ini gap produk yang berbeda dari pemindahan arsip; akun wali baru memperoleh akses setelah proses onboarding menghubungkan kandidat ke santri dan akun wali.
- Skor go-live tetap 78/100 karena langkah ini hanya menutup satu ketidakpastian sumber. Rehearsal staging yang dapat dipulihkan, migration pending, UAT Admin/Wali, dan uji deployment pelanggan tetap menjadi gerbang utama.

