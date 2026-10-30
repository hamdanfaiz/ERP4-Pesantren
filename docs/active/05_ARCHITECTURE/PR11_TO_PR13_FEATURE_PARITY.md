# Matriks Paritas Fitur PR #11 → PR #13

# Status PR dan hasil verifikasi terbaru — 30 Oktober 2026

- Status GitHub terverifikasi langsung: PR #1–#11 **Open / Draft**, PR #12 **Closed / Merged** ke `main` pada commit `c8738185ff6e5080ae427ef0021ee25681036c40`, dan PR #13 **Open / Draft**.
- Commit kode PR #13 yang terakhir diuji `15deecd9d16668b11109643ff6d65bfa642a2658`; GitHub Actions [run 41017481319](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41017481319) lulus **2/2 job**. Audit paritas ini diperbarui pada head `4188de236c9080a0af11d896dc463b0c23d17be9` dan lulus **2/2 job** pada [run 41018920840](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41018920840). CI mencakup typecheck/build, guard runtime tanpa Firebase, Docker/Compose, rehearsal migrasi sintetis, 1.268 assertion pgTAP, API dan isolasi tenant, transaksi serentak, Storage, serta backup/restore. Uji berjalan pada Supabase lokal sintetis; bukan database Supabase live.
- Tab capaian Tahfidz kini menggunakan hitungan catatan Supabase yang tenant-scoped; Peer Review masih tertutup dan tetap menjadi gap.
- PR #1, #2, #4, dan #6 berbasis `main`. PR #3 dan #5 berbasis PR #1, #7 berbasis #5, #8 berbasis #7, #9 berbasis #8, #10 berbasis #9, dan #11 berbasis #10. PR #13 memiliki riwayat berbeda; merge PR lama secara berurutan atau berdasarkan nama file saja berisiko membawa ulang implementasi lama.
- Pemeriksaan nama file menemukan beberapa file unik di PR #1–#11. Sebagian perilakunya memiliki implementasi baru dengan nama/path berbeda di PR #13, tetapi perbandingan source/path belum membuktikan seluruh paritas. Audit fitur PR #1–#10 masih terbuka.
- Jangan menutup PR #1–#11 sebelum setiap fitur unik terbukti masuk ke `main` atau digantikan. Jangan menutup atau merge PR #13 sebelum gerbang engineering di deskripsi PR dan dokumen ini selesai.
- Estimasi kematangan pengembangan sekitar **73%** masih perkiraan kasar; deploy hosting dan UAT oleh tim penerapan tidak termasuk.
---


> **Perubahan ruang lingkup 27 Oktober 2026:** Firestore yang tersedia berisi data dummy dan tidak perlu disalin. Pemetaan/impor arsip yang tercatat di matriks ini bukan release gate. Nilai paritas perilaku melalui test Supabase lokal/CI dan UAT; data contoh dapat diisi manual kemudian.

## Revalidasi source terbaru — 30 Oktober 2026

- Head PR #13 `0cf670ba9097b7002322173adb92568f9ed8a054` lulus GitHub Actions [run 41041688664](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41041688664), 2/2 job.
- Pendaftaran mandiri Wali kini menggunakan email kontak yang tercatat pada data PPDB. RPC server-only mengharuskan email Auth terverifikasi, menetapkan tenant dari konfigurasi server, memberi role `wali_santri` tanpa permission tambahan, dan hanya menautkan relasi Wali aktif dengan email yang sama. pgTAP menguji 19 kondisi alur tersebut.
- PR #1–#11 tetap Open/Draft dan PR #12 Closed/Merged. Nama/path yang tidak sama pada diff lama tidak langsung berarti fiturnya hilang; beberapa implementasi telah dipindah ke API server atau migration baru. Paritas fungsional tetap perlu dipastikan di matriks dan setelah source merge.
- PR #13 tetap Open/Draft sampai audit paritas, keputusan cakupan Peer Review/PPOB, dan rekonsiliasi migration target tuntas atau dinyatakan sebagai pengecualian rilis secara eksplisit.

## Status branch historis (snapshot 26 Oktober 2026; status terkini ada di atas)

Pemeriksaan GitHub pada 26 Oktober 2026: PR #11 masih Open/Draft pada `88f2686d34bbffb1aa1c7997b55cd015c424f85c`, berbasis `backend/supabase-finance-ui` (`127c67ef2373eb8d5a654ae10f58c4b0fd1c304b`). PR #12 merged ke `main` pada `c8738185ff6e5080ae427ef0021ee25681036c40`. PR #13 Open/Draft pada `028a93a1a52439cc463209bc9b6ec2aa47500414`, berbasis commit main hasil merge PR #12 tersebut. Perbandingan saat ini tetap diverged (merge-base `f7f8bb098d3a6032eef5a101ad29e9d2086f111b4`): PR #13 memiliki 461 commit yang tidak ada di #11, sedangkan #11 memiliki 235 commit yang tidak ada di #13. Jangan gabungkan seluruh branch #11; petakan paritas per fitur.

> Checkpoint bertanggal di bawah adalah catatan historis. Status branch, hitungan migration, CI, dan estimasi terbaru pada bagian “Revalidasi PR dan CI” di akhir dokumen menggantikan angka lama di checkpoint tersebut.

## Matriks fitur

| Area PR #11 | Bukti pada PR #13 | Status paritas | Keputusan |
|---|---|---|---|
| Master Data struktur: daftar, ubah, hapus, impor legacy | `src/server/supabaseOnboarding.ts`; route `/api/master-data/structures*`; migration tenant runtime; `MasterDataManager` memanggil API tenant. | Padanan Supabase-native tersedia dan tercakup oleh CI. Ini tidak membuktikan migrasi data target. | Jangan port file atau migration lama. Pertahankan kontrak #13 dan jalankan rekonsiliasi pada staging. |
| Data Santri, enkripsi PII, NIS unik, arsip, impor legacy | `src/server/supabaseOnboarding.ts`; `/api/master-data/students*`; `nis_reservations`; test/API race NIS pada CI. | Padanan tersedia; transaksi dan race NIS tercakup CI sintetis. | Tidak perlu menggabungkan implementasi PR #11. Uji tetap perlu pada staging dan login akhir. |
| Pemetaan kelas Akademik lama ke unit | PR #13 menambah UI Admin, antrean paginasi kelas tanpa unit, RPC tenant-scoped dengan audit/idempotensi, dan tes role/permission/tenant. Migration `20270202000000_academic_class_unit_mapping.sql`; pgTAP pada run `41007214721`. | Alur pemetaan kelas baru telah lulus CI; kelas lama dan arsip Akademik tetap menunggu pemetaan yang benar dari Admin. | Pertahankan padanan #13. Jangan menutup kebutuhan rekonsiliasi historis hanya karena UI pemetaan tersedia. |
| Isolasi unit Asrama dan pemetaan lokasi lama | PR #13 menambahkan `boardingUnitScope.ts`, penyaringan di API baca/tulis, trigger assignment lintas unit, migration `20270203000000_boarding_unit_scope.sql`, dan UI Admin untuk memetakan Gedung/Kamar lama secara idempoten. Ustadz dibatasi ke lokasi aktif dan santri operasional yang sama unit serta penugasannya. | CI [run `41010491068`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41010491068) lulus 2/2 job, termasuk pgTAP dan API tenant. Data yang belum dipetakan tetap Admin-only; penggunaan dengan akun nyata dan pemetaan historis tenant belum diuji. Tes pgTAP secara eksplisit menolak akses alumni; kode menolak status nonaktif yang dikenal. | Padanan kode dan CI tersedia. Sebelum flag operasional diaktifkan, Admin harus memetakan data lama dan tim penerapan perlu menguji role/tenant pada environment pemulihan. |
| Penempatan kamar dan riwayat | `/api/boarding/students/:studentId/room`, riwayat asrama, migration `20270106000000_boarding_room_assignment_history.sql` dan `20270109000000_boarding_room_history_baseline.sql`. | Padanan lebih baru tersedia; tidak membuktikan sejarah sebelum baseline dapat direkonstruksi. | Pertahankan snapshot baseline sebagai baseline, bukan riwayat perpindahan lama. |
| Tahfidz: roster, setoran, target, halaqah/anggota, impor | `src/server/supabaseTahfidz.ts`, `src/pages/TahfidzManager.tsx`, `src/pages/SupabaseTahfidzSessions.tsx`; API paginasi dan sesi; migration Tahfidz hingga `20270108000000`; uji paginasi, tanggal tenant, race, dan pgTAP di CI. | Alur inti memiliki padanan Supabase-native dan diuji dengan data sintetis. | Jangan port jembatan Firebase Auth PR #11. Pertahankan Supabase Auth/profile dan lanjutkan UAT tenant. |
| Identitas Tahfidz melalui Firebase UID | PR #11 memakai bridge Firebase Auth/profile. PR #13 memakai sesi Supabase Auth, profil `user_profiles`/`profiles`, serta guard Firebase yang melarang SDK Firebase dalam bundle aktif. | Sengaja diganti oleh arsitektur cutover; bukan fitur yang harus dipertahankan. | Jangan aktifkan bridge lama. Firebase Admin hanya dipakai untuk pembacaan arsip migrasi yang dipagari. |
| Pendaftaran publik PPDB dan perubahan tahap/nilai | `src/server/supabasePublicPpdb.ts`, `src/server/supabasePpdb.ts`, route `/api/public/ppdb/*` dan `/api/ppdb/candidates*`, `SupabasePpdbManager`. | Pendaftaran publik, penilaian, tahap, dan onboarding memiliki padanan. | Pertahankan alur ini dan uji ujung ke ujung pada staging. |
| Pembuatan kandidat manual oleh Admin dan perubahan batch | PR #13 menyediakan modal Admin, endpoint `POST /api/ppdb/candidates`, validasi server, enkripsi NIK/NISN, RPC batch transaksional, dan retry idempoten. Form manual membuat satu kandidat; UI CSV UTF-8 mendukung batch 1–100 setelah pratinjau duplikasi, tanpa mengembalikan NIK/NISN ke browser. | Uji parser CSV, pgTAP, API role/tenant, dan CI run `40260536432` pada commit kode `9754b9c` lulus. Offline capture belum tersedia; UAT/staging belum dilakukan. | Pertahankan transaksi identitas dan jalur CSV online; jangan membuka tulis langsung dari browser. Putuskan apakah mode offline memang diperlukan sebelum mendesain antrean lokal untuk data PII. |
| Berkas dokumen calon santri | Pendaftaran publik memvalidasi berkas lalu mengunggahnya ke bucket privat `ppdb-documents`; path disimpan pada `candidate_documents`. PR #13 menyediakan endpoint unduh dan unggah Admin tenant-scoped, pemeriksaan role/modul, validasi path/MIME/ukuran, audit akses, dan kontrol lampiran pada detail kandidat. Retry idempoten dan tidak ada penggantian diam-diam. | pgTAP dan HTTP regression untuk unggah/unduh Admin serta penolakan akses langsung browser lulus pada CI run `40260536432`. Rehearsal staging dan UAT belum dilakukan. | Pertahankan bucket privat dan akses melalui backend; jangan membuka bucket untuk browser. Feature flag tetap mati sampai migration dan rehearsal staging lulus. |
| Tagihan dan pembayaran PPDB kandidat, penolakan, impor tagihan | PR #13 menyediakan pembuatan invoice pendaftaran/uang pangkal melalui `POST /api/ppdb/candidates/:candidateId/bills`, mencatatnya pada Finance, dan menautkan invoice ke santri saat onboarding; bukti bayar/verifikasi memakai alur Finance yang ada. | Uji pgTAP/API pada CI run `40260536432` lulus. Snapshot Firestore kanonis yang diperiksa pada 26 Oktober berisi 0 dokumen `financeBillings`; tidak ada arsip tagihan untuk snapshot itu. Pembayaran mandiri keluarga sebelum onboarding belum tersedia; rehearsal staging belum dilakukan. | Tidak perlu impor arsip dari snapshot saat ini. Jika sumber berubah, jalankan hitung/preview baru. Tetapkan desain pembayaran sebelum onboarding sebagai gap produk terpisah. Jangan merge migration Finance lama dari #11. |
| Portabilitas VPS/on-premise | Docker memakai konfigurasi runtime `/runtime-config.json` dengan allowlist 30 nilai publik; feature gate browser dan server tetap mati secara default. Satu image dapat dipromosikan lintas host tanpa rebuild; secret tetap server-only. | GitHub Actions [run 40505234863](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40505234863) lulus build frontend, Docker image smoke, Compose config, serta suite migrasi/API/pgTAP. Supabase Preview dilewati karena branch belum terhubung ke Supabase Branch. | Luluskan CI Docker/Compose, lalu rehearsal instalasi serta backup/restore pada VM representatif dan environment pelanggan.

## Bukti dan batas

- CI PR #13 pada head checkpoint `b17517d834e6f01eddb0f2df16b3f1378a24edae` sukses pada kedua job di run [`40245870815`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40245870815). CI menguji database lokal terisolasi dengan data sintetis, bukan target Supabase Production.
- Head PR #13 berikutnya `ed7a5600d71308206003e6d23cbba525d2d4252b` juga sukses pada kedua job di run [`40246580443`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40246580443); run tersebut mencakup uji regresi preflight ledger.
- Snapshot baca-saja Production terakhir yang terdokumentasi menunjukkan 47 migration sampai `20261206000000`. Tree branch PR #13 pada head `028a93a` berisi 91 file migration sampai `20270119000000`; 44 file adalah kandidat belum tercatat menurut snapshot tersebut, bukan daftar yang boleh diterapkan otomatis. Ledger harus dibaca ulang dan semua migration direhearsal pada backup staging yang dapat dipulihkan. Project target sebelumnya tercatat Free tanpa backup terjadwal. Jangan menjalankan migration pending ke Production.
- Matriks ini membuktikan pemeriksaan source dan check run yang disebutkan, bukan paritas perilaku penuh, hasil UAT, rekonsiliasi arsip, atau kesiapan deploy.
- Run CI [`40260536432`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40260536432) pada kode commit `9754b9cb2f4c4771ee126b7752fe07f9b8c4c808` lulus pada kedua job. CI terbaru untuk commit dokumentasi `4a66a402bb62af556e00ff7df9b9e0494b0470c6` juga lulus pada kedua job di run [`40260937224`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40260937224).
- Commit dokumentasi `6cccac6813acdd74bd1feb04fab117ac282a8f09` juga lulus pada kedua job di CI run [`40261402123`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40261402123).

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

## Revalidasi PR dan CI — 27 Oktober 2026

- **PR #11:** Open/Draft, head `88f2686d34bbffb1aa1c7997b55cd015c424f85c`, base `backend/supabase-finance-ui` pada `127c67ef2373eb8d5a654ae10f58c4b0fd1c304b`; 25 file berubah. GitHub connector tidak mengembalikan workflow run atau commit status untuk head ini, jadi status CI #11 tidak terverifikasi.
- **PR #12:** Closed/Merged ke `main` pada 21 Oktober 2026. Head main yang menjadi base PR #13 adalah `c8738185ff6e5080ae427ef0021ee25681036c40`.
- **PR #13:** Open/Draft, base `main`, head dokumentasi terkini `bbeda8d4143b0444cce1549452f3312a4c951aea`; kode yang diuji terakhir adalah `44d8e317873ee0da2fd25c338807d59d69915388`. PR ini mengubah 399 file.
- Perbandingan head PR #11 terhadap PR #13 berstatus **diverged** dengan merge-base `f7f8bb098d3a6032eef5a101ad29e13bc2bf5c8`: PR #13 585 commit di depan dan 235 commit di belakang PR #11. Hanya 6 dari 25 path PR #11 sama persis dengan path PR #13. Angka commit/path tidak membuktikan kehilangan fitur karena #13 memindahkan dan membangun ulang banyak modul; gunakan matriks fitur di atas untuk memeriksa padanan perilaku.
- Berdasarkan pemetaan source dan CI, padanan Supabase-native PR #13 tersedia untuk fondasi Master Data/NIS, penempatan kamar/asrama, alur inti Tahfidz, Finance, serta PPDB. Ini belum membuktikan parity runtime pada staging atau UAT. Bridge identitas Firebase dari #11 sengaja digantikan oleh Supabase Auth; jangan port atau aktifkan bridge lama.
- GitHub Actions [run 40493469094](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40493469094) lulus pada head kode PR #13 `44d8e31`: frontend/typecheck/build/Docker dan migrasi/pgTAP/API auth-tenant/Storage/backup-restore lokal sintetis. Commit dokumentasi terbaru tidak mengubah source kode; belum ada workflow run baru untuk commit tersebut.
- Source PR #13 memiliki 95 migration sampai `20270123000000`. Staging baca-saja terakhir menunjukkan 47 versi sampai `20261206000000`; 48 belum tercatat dan metadata dua versi terakhir kosong. Tidak ada data Firestore yang perlu disalin, dan tidak ada migration atau row staging/Production yang diterapkan.
- Konektor Supabase penuh pada sesi ini hanya mencantumkan project `vqemuyzveuirlkvdggjd`, bukan staging `ptsasgdvgrbdtgyqieie`; konektor khusus staging hanya baca. Rehearsal schema/restore, rekonsiliasi ledger, serta UAT login, role, tenant, dan modul tetap menjadi gerbang.
- Estimasi proyek: **73% kematangan fitur / 46% kesiapan go-live**. Ini estimasi, bukan hasil UAT atau bukti kapasitas.

### Keputusan PR #11

Jangan merge branch PR #11 secara utuh ke #13 karena riwayatnya divergen dan implementasi #13 sudah memiliki kontrak Supabase-native. Jangan tutup sebagai “merged”. Pertahankan status Draft sampai tim backend meninjau padanan perilaku pada matriks; setelah mengonfirmasi tidak ada kebutuhan fitur yang hilang, PR #11 dapat ditutup sebagai superseded tanpa merge. Release tetap mengikuti gerbang staging dan UAT PR #13.
## Checkpoint konfigurasi lintas environment tanpa impor data — 27 Oktober 2026

- Data Firestore dummy tidak disalin; validasi relasi dan alur tetap memakai fixture sintetis. Data operasional contoh dibuat manual setelah tenant dan Admin diprovisikan.
- Browser mengambil konfigurasi publik dari endpoint server `/runtime-config.json` sebelum aplikasi dijalankan. Daftar 30 key di-allowlist; secret/key PII tidak disertakan. Dockerfile tidak menyimpan nilai `VITE_*` pada build, dan Compose mengirimkannya saat runtime.
- Lulus lokal: lint, build, test kontrak deployment, test routing Supabase-only, HTTP runtime-config smoke, dan `git diff --check`. GitHub Actions [run 40505234863](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40505234863) untuk commit `8f8dda2` mengonfirmasi Docker image smoke, Compose config, frontend build, dan suite database sintetis lulus; Supabase Preview dilewati karena branch belum terhubung ke Supabase Branch.
- Katalog staging dibaca tanpa operasi tulis: 119 tabel publik, 118 tabel tenant ber-RLS, dan seluruh 485 foreign key antartabel tenant memasangkan `tenant_id`. Ledger staging 47 versi versus 96 migration source; dua metadata ledger kosong dan 49 versi belum tercatat, sehingga rekonsiliasi lineage/restore masih menjadi release gate.
- Tidak ada schema, migration, atau row Supabase live yang diubah. Estimasi tetap **73% kematangan fitur / 46% kesiapan go-live**; angka ini estimasi, bukan hasil UAT.

## Revalidasi langsung — 30 Oktober 2026, 11:34 WIB

- Status GitHub terverifikasi ulang: PR #1–#11 **Open / Draft**, PR #12 **Closed / Merged**, PR #13 **Open / Draft**. Tidak ada status PR yang diubah.
- Head PR #13: `82936497f12ff27e33964c3f25a73460f951b959`. GitHub Actions [run 41002893214](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41002893214) lulus **2/2 job** pada head ini: build/typecheck, guard runtime Firebase, Docker/Compose dan smoke test image, serta migration rehearsal, pgTAP, auth/tenant, Storage dan backup/restore lokal sintetis.
- Perubahan setelah head kode `2b93f96da3571a828fd63e70d0fe765ebaa154f8` hanya dokumentasi; tidak ada migration atau data yang diterapkan ke Supabase live. Supabase Preview tidak berjalan karena branch tidak terhubung ke Supabase Branch, dan pembacaan proyek staging `ptsasgdvgrbdtgyqieie` tetap ditolak konektor.
- **Keputusan:** PR #13 belum siap ditandai siap review/merge. Multi-unit Akademik/Asrama, analitik AI dan PPOB/Layanan yang fail-closed, audit integrasi penuh, audit sisa source legacy, paritas fitur #1–#11 dan rekonsiliasi ledger staging masih terbuka. Persentase pengembangan 73% tetap estimasi.
