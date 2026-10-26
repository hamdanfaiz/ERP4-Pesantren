# Matriks Paritas Fitur PR #11 → PR #13

## Status branch

Pemeriksaan GitHub pada 26 Oktober 2026 menunjukkan PR #11 masih Open/Draft, head `88f2686d34bbffb1aa1c7997b55cd015c424f85c`, berbasis pada head PR #10 `127c67ef2373eb8d5a654ae10f58c4b0fd1c304b`. PR #13 masih Open/Draft, head `b17517d834e6f01eddb0f2df16b3f1378a24edae`, berbasis pada merge PR #12 di `c8738185ff6e5080ae427ef0021ee25681036c40`.

GitHub membandingkan kedua head sebagai `diverged`: PR #13 398 commit di depan dan 235 commit di belakang, dengan merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`. Jangan menggabungkan seluruh PR #11 ke PR #13. Migrasi PR #11 bertanggal `20260606000000`–`20260618000000` adalah bagian dari lineage lamanya dan tidak boleh ditambahkan ke lineage PR #13 secara mekanis.

## Matriks fitur

| Area PR #11 | Bukti pada PR #13 | Status paritas | Keputusan |
|---|---|---|---|
| Master Data struktur: daftar, ubah, hapus, impor legacy | `src/server/supabaseOnboarding.ts`; route `/api/master-data/structures*`; migration tenant runtime; `MasterDataManager` memanggil API tenant. | Padanan Supabase-native tersedia dan tercakup oleh CI. Ini tidak membuktikan migrasi data target. | Jangan port file atau migration lama. Pertahankan kontrak #13 dan jalankan rekonsiliasi pada staging. |
| Data Santri, enkripsi PII, NIS unik, arsip, impor legacy | `src/server/supabaseOnboarding.ts`; `/api/master-data/students*`; `nis_reservations`; test/API race NIS pada CI. | Padanan tersedia; transaksi dan race NIS tercakup CI sintetis. | Tidak perlu menggabungkan implementasi PR #11. Uji tetap perlu pada staging dan login akhir. |
| Penempatan kamar dan riwayat | `/api/boarding/students/:studentId/room`, riwayat asrama, migration `20270106000000_boarding_room_assignment_history.sql` dan `20270109000000_boarding_room_history_baseline.sql`. | Padanan lebih baru tersedia; tidak membuktikan sejarah sebelum baseline dapat direkonstruksi. | Pertahankan snapshot baseline sebagai baseline, bukan riwayat perpindahan lama. |
| Tahfidz: roster, setoran, target, halaqah/anggota, impor | `src/server/supabaseTahfidz.ts`, `src/pages/TahfidzManager.tsx`, `src/pages/SupabaseTahfidzSessions.tsx`; API paginasi dan sesi; migration Tahfidz hingga `20270108000000`; uji paginasi, tanggal tenant, race, dan pgTAP di CI. | Alur inti memiliki padanan Supabase-native dan diuji dengan data sintetis. | Jangan port jembatan Firebase Auth PR #11. Pertahankan Supabase Auth/profile dan lanjutkan UAT tenant. |
| Identitas Tahfidz melalui Firebase UID | PR #11 memakai bridge Firebase Auth/profile. PR #13 memakai sesi Supabase Auth, profil `user_profiles`/`profiles`, serta guard Firebase yang melarang SDK Firebase dalam bundle aktif. | Sengaja diganti oleh arsitektur cutover; bukan fitur yang harus dipertahankan. | Jangan aktifkan bridge lama. Firebase Admin hanya dipakai untuk pembacaan arsip migrasi yang dipagari. |
| Pendaftaran publik PPDB dan perubahan tahap/nilai | `src/server/supabasePublicPpdb.ts`, `src/server/supabasePpdb.ts`, route `/api/public/ppdb/*` dan `/api/ppdb/candidates*`, `SupabasePpdbManager`. | Pendaftaran publik, penilaian, tahap, dan onboarding memiliki padanan. | Pertahankan alur ini dan uji ujung ke ujung pada staging. |
| Pembuatan kandidat manual oleh Admin dan perubahan batch | PR #13 menambah modal Admin, endpoint `POST /api/ppdb/candidates`, validasi server, enkripsi NIK/NISN, RPC batch transaksional, pembuat kandidat, dan kunci retry idempoten. API menerima 1–100 entri; UI saat ini membuat satu entri per pengiriman. | Build/typecheck, pgTAP, dan uji API role/tenant lulus CI lokal terisolasi. Impor CSV dan berkas kandidat offline belum tersedia. | Susun pratinjau CSV dan alur lampiran privat setelah migration direhearsal di staging. |
| Berkas dokumen calon santri | Pendaftaran publik di `src/server/supabasePublicPpdb.ts` sudah memvalidasi berkas lalu mengunggahnya ke bucket privat `ppdb-documents`; path disimpan pada `candidate_documents`. PR #13 kini menambahkan endpoint unduh Admin tenant-scoped, pemeriksaan role/modul, validasi path/MIME/ukuran, log audit unduhan, serta tombol pada detail kandidat. CI terisolasi lulus untuk migration, pgTAP, dan HTTP role/tenant/Storage. | Unggah publik tersedia dan unduh Admin lolos CI. Rehearsal staging belum dilakukan. Pembuatan kandidat offline/batch beserta lampiran tetap belum ada. | Pertahankan bucket privat dan akses melalui backend; jangan membuka bucket untuk browser. Flag unduh tetap mati sampai rehearsal staging lulus. |
| Tagihan dan pembayaran PPDB kandidat, penolakan, impor tagihan | PR #11 memiliki route/service tagihan pendaftaran/uang pangkal, pencatatan dan penolakan pembayaran, serta impor arsip. PR #13 sekarang menambah invoice kandidat di `finance_bills`, RPC Admin idempoten, kontrol tenant/buku Finance, tautan otomatis ke `student_id` saat onboarding, dan pemakaian alur bukti bayar/verifikasi/ledger yang sudah ada. | Tagihan kandidat terhubung ke Finance di source; alur keluarga sebelum onboarding dan impor arsip #11 tetap belum tersedia. Migration baru belum diuji pada staging/Production. | Uji pgTAP serta CI; lakukan rehearsal pada salinan yang dapat dipulihkan. Putuskan terpisah apakah pembayaran mandiri sebelum onboarding dan impor arsip tagihan diperlukan. Jangan merge migration Finance lama dari #11. |
| Portabilitas VPS/on-premise | PR #11 menambah dokumen portabilitas. PR #13 menyediakan `docs/guides/CUSTOMER_MANAGED_DEPLOYMENT.md`, Docker/Compose, dan CI smoke test. | Padanan dokumentasi dan instalasi tersedia; uji pemulihan di environment pelanggan belum ada. | Uji instalasi/backup/restore pada VM bersih sebelum komersialisasi. |

## Bukti dan batas

- CI PR #13 pada head checkpoint `b17517d834e6f01eddb0f2df16b3f1378a24edae` sukses pada kedua job di run [`40245870815`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40245870815). CI menguji database lokal terisolasi dengan data sintetis, bukan target Supabase Production.
- Head PR #13 berikutnya `ed7a5600d71308206003e6d23cbba525d2d4252b` juga sukses pada kedua job di run [`40246580443`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40246580443); run tersebut mencakup uji regresi preflight ledger.
- Target Supabase Production memiliki 47 migration tercatat sampai `20261206000000`; source PR #13 memiliki 81 file migration dan 34 pending. Paket Free tidak menyediakan backup project terjadwal. Karena itu migration maupun gap fitur yang memerlukan perubahan schema belum boleh diuji dengan menulis ke Production.
- Matriks ini membuktikan pemeriksaan source dan check run yang disebutkan, bukan paritas perilaku penuh, hasil UAT, rekonsiliasi arsip, atau kesiapan deploy.

## Gerbang penutupan PR #11

1. Tentukan kebutuhan Admin untuk mendaftarkan pendaftar offline.
2. Verifikasi jalur unduh dokumen privat Admin melalui rehearsal staging. CI sudah lulus. Pendaftaran publik sudah mengunggah dokumen ke bucket privat; lampiran untuk kandidat offline/batch belum memiliki alur. Tagihan kandidat sudah memiliki kontrak source, tetapi keputusan alur pembayaran sebelum onboarding dan impor arsip masih terbuka.
3. Tambahkan uji pgTAP dan API role/tenant untuk setiap kontrak baru; jalankan seluruh CI.
4. Rehearsal migration dan impor pada salinan Supabase yang dapat dipulihkan, lalu UAT dengan akun Admin dan Wali.
5. Setelah pemilik PR menyetujui matriks dan semua fitur yang dibutuhkan memiliki keputusan, baru tutup PR #11. Jangan merge branch lama secara utuh.


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

Langkah pengembangan berikutnya: implementasikan pembuatan kandidat Admin untuk pendaftar offline/batch dengan pemeriksaan identitas unik per tenant dan lampiran privat, lalu tinjau impor arsip tagihan. Jangan aktifkan flag dokumen sebelum rehearsal staging. PR #13 tetap Draft; tidak ada merge, deploy, atau migration Production pada checkpoint ini.

## Checkpoint pembuatan kandidat Admin PPDB — 26 Oktober 2026

### Progres menuju go-live: tetap 78/100

Pembuatan pendaftar Admin untuk satu record per pengiriman sudah lolos CI pada Supabase lokal terisolasi. Skor tetap 78/100 karena belum ada rehearsal staging, migrasi target, UAT Admin/Wali, backup/restore target, dan simulasi deployment pelanggan.

- Formulir Admin mengumpulkan data pendaftar dan orang tua, menampilkan batas lampiran dengan jelas, dan tidak menandai dokumen sebagai diterima tanpa upload.
- Endpoint mensyaratkan profil aktif, role Admin/SuperAdmin, permission PPDB, dan tenant dari sesi; browser tidak dapat menentukan tenant atau aktor untuk menulis langsung.
- NIK/NISN divalidasi dan dienkripsi/fingerprint di server. Fingerprint payload idempotensi memakai HMAC rahasia, sehingga retry setelah respons jaringan tidak membuat kandidat ganda dan catatan tidak menyimpan PII.
- RPC memeriksa profil dan status tenant di dalam transaksi, mengunci baris otorisasi, membatasi batch 1–100, mencatat actor, dan mengembalikan hasil lama hanya jika actor serta fingerprint payload sama. Identitas ganda membatalkan seluruh batch.
- Uji pgTAP menutup akses langsung anon/authenticated dan memeriksa permission, tenant, replay, konflik payload, atribusi Admin, dan rollback batch. Uji HTTP menolak akun tanpa permission PPDB serta role Wali.
- CI pada commit kode `587158138c0cf39d4eacb9bc348db380d81fdeec`, [run 40251344381](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40251344381), sukses di kedua job: typecheck/build, Docker/Compose, semua migration/pgTAP lokal, API auth/isolasi tenant, Storage, dan backup/restore sintetis. Run pertama `40251244836` menangkap import helper yang hilang; import diperbaiki sebelum run sukses.
- Jumlah migration pada source bertambah menjadi 84; dibanding ledger Production yang sebelumnya terbaca 47 migration sampai `20261206000000`, ada 37 migration pending. Angka ini tetap perlu dibaca ulang sebelum rehearsal.
- Belum ada migration/data/flag yang diterapkan ke Supabase Production. CLI dan dependensi proyek tidak tersedia di workspace ini; bukti build dan database berasal dari CI PR #13, bukan mesin lokal.

Tindak lanjut: lengkapi upload lampiran privat untuk kandidat Admin. Pertahankan PR #13 Draft dan jangan jalankan migration ke Production pada tahap ini.

## Checkpoint pratinjau impor PPDB CSV — 26 Oktober 2026

### Progres menuju go-live: tetap 78/100

- Admin dapat memilih CSV UTF-8 maksimal 1 MB/100 pendaftar, mengunduh templat, lalu melihat pratinjau tanpa menulis data.
- Pratinjau memvalidasi kolom dan format di server, mendeteksi nomor pendaftaran, NIK, dan NISN yang berulang di berkas atau sudah dipakai tenant ini, serta hanya mengembalikan status dan nomor baris tanpa mengirim NIK/NISN kembali ke browser.
- Penyimpanan batch hanya tersedia setelah semua baris lolos pratinjau. Jalur akhir memakai RPC tenant-aware, actor-attributed, idempoten, dan atomik yang sudah ada; constraint unik database memeriksa ulang kondisi yang berubah bersamaan. Jika satu baris berbenturan, seluruh batch ditolak.
- Tes baru mencakup parser/angka identitas berawalan nol, akses role PPDB, penolakan Wali, privasi respons, duplikasi batch, dan tidak adanya penulisan saat preview. Commit kode `62949ac08ce9f159cc13e17f3d9e1d72fdcb66c0` lulus pada kedua job CI [run 40252732580](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40252732580), termasuk build/typecheck, Docker/Compose, Supabase lokal/pgTAP, API auth/isolasi tenant, Storage, dan backup/restore sintetis.
- Tidak ada migration, penulisan data, feature flag, merge, atau deploy ke Supabase Production. PR #13 tetap Draft. Upload lampiran privat untuk kandidat Admin masih menjadi langkah lanjutan sebelum rehearsal staging dan UAT.
