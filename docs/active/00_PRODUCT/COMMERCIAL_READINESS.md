## Supabase Advisor dan tindak lanjut keamanan — 23 November 2026

Pemeriksaan Advisor bersifat baca-saja dan tidak mengubah skema, Auth, atau data.

### Peringatan keamanan

- **PTSAS Production:** Advisor melaporkan satu fungsi dengan `search_path` yang dapat berubah (`public.erp4_ppdb_update_updated_at_column`) dan empat helper `SECURITY DEFINER` yang masih bisa dijalankan pengguna terautentikasi di schema `public` (`current_app_role()`, `current_tenant_id()`, `has_module_access(text)`, dan `is_tenant_admin()`). Source memiliki migrasi `20270209000000_harden_ppdb_trigger_search_path` dan `20270210000000_internalize_tenant_rls_helpers`; kedua versi tercatat di VQE dan tidak tercatat di ledger PTSAS.
- Perubahan source tersebut tampak ditujukan tepat pada dua jenis temuan di atas. Namun, perbedaan ledger bukan bukti bahwa DDL Production sama persis dengan source atau belum berubah secara manual. Pemilik database perlu membandingkan definisi aktual, lalu menilai dan menjadwalkan promosi dua migrasi itu melalui prosedur yang telah direview; jangan menjalankan seluruh migration gap sekaligus.
- **Kedua project, PTSAS dan VQE:** Advisor melaporkan perlindungan kata sandi bocor nonaktif. Ini pengaturan Auth project, bukan migrasi SQL. Tinjau dan aktifkan lebih dulu di staging setelah memastikan dampaknya pada alur pendaftaran dan penggantian kata sandi; setelah itu rencanakan pengaturan Production.
- Info `RLS enabled without policy` ditemukan pada 157 tabel PTSAS dan 176 tabel VQE. RLS tanpa policy biasanya menolak akses langsung untuk role biasa, sehingga temuan INFO ini sendiri bukan bukti data terbuka. Tetap pastikan jalur server yang menggunakan role istimewa memeriksa identitas, tenant, dan izin modul.

### Peringatan kinerja

- PTSAS: 269 foreign key tanpa indeks, dua peringatan rencana inisialisasi fungsi Auth pada policy RLS, dan satu pasangan indeks duplikat pada `document_records`. VQE: 262 foreign key tanpa indeks, satu peringatan rencana inisialisasi Auth, dan tidak ada temuan indeks duplikat.
- Advisor juga melaporkan indeks yang belum digunakan (PTSAS 89, VQE 91). Jangan menghapus indeks hanya dari statistik ini; tinjau query workload, batas waktu pengamatan, constraint, dan pola beban dahulu.

### Batas dan langkah berikut

Hasil Advisor tidak membuktikan kebijakan RLS, grant, route backend, Storage, atau definisi DDL secara menyeluruh. Tidak ada query baris operasional yang dijalankan dalam pemeriksaan Advisor ini. Rekonsiliasi DDL Production, review urutan migrasi, dan latihan backup/restore tetap menjadi gate terpisah bagi pemilik database.

## Checkpoint verifikasi modul staging — 23 November 2026

### Source dan deployment
- PR #234 memperbaiki keterangan tagihan PPDB agar mengikuti flag fitur dan sudah di-merge ke `main` pada commit `01785fccacbddc41e160d6db1f22f1218921500f`. CI lulus untuk frontend/build, instalasi NPM pelanggan, serta suite database/API pada Supabase lokal terisolasi.
- hPanel situs staging `lightgreen-jay-425688.hostingersite.com` menunjukkan branch `main`, commit `01785fcc`, status **Completed / Current**. Tidak ada konfigurasi atau data Production yang diubah.
- Status sebelas flag runtime server staging — PPDB, Keuangan, Anggaran, UKS, Koperasi, Multi-Unit, HRIS, Pemesanan Fasilitas, Aset GA, Donasi, dan Marketplace — **belum terverifikasi**. Checkpoint sebelumnya mencatat semuanya `true`, tetapi Admin UAT kemudian melaporkan tidak menemukannya di hPanel. Pada pemeriksaan 23 November ini hanya halaman Deployments yang terlihat; runtime computer-use gagal dimulai sehingga halaman Environment variables dan nilainya belum dapat diperiksa ulang. Jangan menganggap flag aktif atau menambahkan semuanya sekaligus: cocokkan tiap modul dengan migrasi, role/tenant/RLS, Storage, dan hasil UAT sebelum aktivasi.
- Sesi Admin UAT staging membuka layar PPDB, Keuangan & Tagihan, UKS, Koperasi, Multi-Unit, Keuangan & Anggaran, HCM, Sarana & Prasarana, Relasi Wali & Donatur, Donasi & Wakaf, dan Marketplace. Kesepuluh modul yang diuji tidak menampilkan pesan “Fitur ini belum tersedia saat ini”. Sesudah halaman preview dimuat ulang, banner PPDB menampilkan keterangan baru yang sesuai flag.

### Batas bukti dan langkah lanjut
- Pemeriksaan ini membuktikan menu/layar termuat pada build staging yang teramati; tidak ada formulir disimpan dan tidak ada transaksi dibuat. Uji baca-simpan-baca, validasi relasi, role/tenant, dan skenario lintas modul masih perlu dijalankan dengan data sintetis staging.
- Sebelum menyatakan produk siap deploy, tim backend tetap perlu menyelesaikan gate Production yang sudah tercatat di runbook: rekonsiliasi DDL dan ledger migrasi, peninjauan urutan migrasi, serta bukti pemulihan backup. Tidak ada migrasi Production yang dijalankan pada checkpoint ini.

---

## Checkpoint pasca-UAT CBT — 22 November 2026

### Hasil PR #227 dan staging
- Perbaikan daftar soal CBT setelah tenant aktif sudah digabung ke main pada commit 9f16c51540db5f74765efe2c75a93a67d94758f0. Admin UAT mengonfirmasi pada preview PR bahwa daftar soal tampil otomatis tanpa tombol muat ulang.
- CI PR #227 lulus 3/3 job. Pemeriksaan lokal lulus: regresi awal CBT, pagination CBT (20 assertion), Alumni (21 assertion), konfigurasi deployment, runtime Supabase-only (169 modul/26 route), pesan pengguna, lint, dan build.
- Pemeriksa graph aset lulus pada preview PR (104 aset JavaScript) dan domain Production (107 aset JavaScript). Ini hanya memvalidasi status dan jenis konten aset, bukan identitas commit yang berjalan.

### Batas Production dan pekerjaan berikutnya
- Identitas build Production belum dapat dikonfirmasi: halaman erp4-pesantren.tlusur.com merujuk entry asset index-RZ8AWqJa.js; permintaan terhadap nama chunk CBT dari build lokal kandidat mengembalikan HTML fallback, bukan JavaScript. Tim hosting perlu memastikan deployment yang aktif berasal dari main commit 9f16c51 sebelum menyebut perubahan sudah live.
- Pembacaan metadata Supabase 22 Nov memperbarui status migrasi: source main memiliki 167 file; VQE mencatat seluruh 167 versi; PTSAS mencatat 100 dan belum mencatat 67 versi source, dengan tiga nama ledger tidak dikembalikan. PTSAS memiliki 162 tabel publik dibanding 182 di VQE; seluruh tabel yang diperiksa mengaktifkan RLS dan FORCE RLS. Advisor juga menemukan helper SECURITY DEFINER publik dan password protection Auth nonaktif. Ini temuan baca-saja, bukan bukti DDL/backup-restore; rinciannya ada di [runbook audit Production](../06_DATABASE/PTSAS_PRODUCTION_MIGRATION_ROLLOUT_AUDIT_2026-11-20.md).
- Enam flag VQE yang diaktifkan untuk uji tetap CBT, LMS, Komunikasi, Perpustakaan, Alumni, dan Laundry. Donasi Alumni masih menampilkan kegagalan umum; penyebab belum diketahui. Tracer Study dan Komunitas Alumni memiliki cakupan yang terbatas, dan Perpustakaan Digital memerlukan flag tersendiri yang belum diaktifkan.
- Masih perlu UAT lintas role/tenant dan simpan-baca modul lainnya. Jangan menyimpulkan seluruh produk siap komersial dari kelulusan PR #227.
- Tidak ada migrasi atau perubahan data Supabase Production pada PR #227. Rekonsiliasi DDL, ledger, dan latihan pemulihan Production tetap gate terpisah.

---

## Checkpoint UAT VQE staging — 22 November 2026

### Hasil yang sudah terlihat
- Admin UAT mengonfirmasi enam flag staging aktif (CBT, LMS, Komunikasi, Perpustakaan, Alumni, Laundry), pengumuman Komunikasi aktif, dan deployment staging telah diperbarui. Production PTSAS tidak disentuh.
- CBT menampilkan 6 soal dan 1 ujian. Pada kunjungan awal daftar soal meminta dimuat ulang; setelah tombol ditekan, keenam soal tampil. Pesan tersebut sudah sesuai dengan PR #226 di main. Source kandidat memperbaiki pemuatan ulang daftar setelah tenant selesai diinisialisasi.
- LMS menampilkan 1 kursus dan 1 tugas; pada kunjungan ulang data tampil setelah menunggu sekitar enam detik. Komunikasi menampilkan 1 pengumuman, Perpustakaan 5 judul/32 eksemplar tersedia/1 peminjaman, dan Laundry 1 pesanan.
- Tahfidz memperlihatkan leaderboard berdasarkan ayat unik: dua santri dengan 15 dan 10 ayat, serta tiga catatan setoran.
- Direktori Alumni dapat dibuka, tetapi belum ada profil alumni. Tracer Study hanya ringkasan per angkatan dan Komunitas hanya direktori. Tab Donasi Alumni menampilkan kegagalan layanan umum; penyebabnya belum dipastikan. Jangan aktifkan flag Donasi tanpa persetujuan terpisah.
- Perpustakaan Digital belum tersedia dan memakai flag server tersendiri SUPABASE_LIBRARY_DIGITAL_ASSETS_ENABLED, yang belum termasuk konfigurasi enam flag dan belum diaktifkan.
- Pemeriksaan ini menavigasi tampilan saja; tidak membuat atau mengubah catatan operasional.

### Kandidat source dan pemeriksaan lokal
- Kandidat perubahan disusun pada checkout bersih dari main commit 5311861 (PR #226). Perubahan fungsional utama menata ulang request daftar soal CBT saat tenant siap; tambahan lain menyediakan regresi otomatis serta pemeriksa graph aset pada deployment.
- Lulus: tes pemuatan awal CBT; validasi cursor CBT (20 assertion); tes workflow Alumni (21 assertion); konfigurasi deployment (17 nilai publik/38 gerbang server); runtime Supabase-only (169 modul, 26 route Supabase); pesan error pengguna (16 assertion); lint TypeScript; build frontend dan server; pemeriksaan diff.
- Build lulus dengan peringatan ukuran chunk PDF yang besar dan peringatan komentar dependensi yang diabaikan Rollup.
- Production PTSAS tidak diubah. UAT visual untuk perubahan CBT pada artefak kandidat belum dilakukan.

### Gerbang berikutnya
1. Jalankan CI pada kandidat, tinjau hasil dan pastikan preview VQE dibangun dari commit yang sama.
2. Ulangi CBT pada preview tanpa menekan muat ulang manual; pastikan daftar tampil setelah tenant siap.
3. Catat gap Alumni, Donasi, dan Perpustakaan Digital; bedakan kebutuhan fitur dari kendala konfigurasi sebelum menentukan cakupan rilis.
4. Lanjutkan uji role, tenant, dan simpan-baca modul lain pada staging dengan record sintetis yang disetujui.
5. Rekonsiliasi DDL, urutan migrasi, dan latihan pemulihan Production tetap menjadi gerbang backend. Jangan menjalankan db push massal ke PTSAS.

---

## Checkpoint terbaru — 22 November 2026, 07.57 WIB

### Source, perubahan, dan preview
- `main` berada pada merge commit `4dbe584da7813ef055ee8823815c144bebf530ae`. PR #216–#218 sudah tergabung; pencarian terakhir menunjukkan tidak ada PR terbuka.
- PR #218 menstandarkan pesan error yang ditampilkan ke pengguna. Pemeriksaan CI yang diwajibkan lulus **3/3 job**, termasuk validasi teks, typecheck, build frontend/server, dan smoke test image Docker untuk instalasi mandiri. Perubahan PR ini tidak mengubah skema atau data Supabase.
- Hostinger VQE staging menunjukkan deployment `main` commit `4dbe584` berstatus **Completed / Current** pada 22 November 2026 sekitar 07.50 WIB.
- Enam flag modul yang diaktifkan khusus pada VQE untuk UAT: CBT, LMS, Komunikasi, Perpustakaan, Alumni, dan Laundry. Flag tersebut bukan konfigurasi Production atau nilai bawaan semua instalasi.
- Belum ada bukti UAT UI pasca-deploy untuk keenam modul. Dashboard Admin perlu diperiksa pada build staging terbaru sebelum modul dinyatakan lulus. UAT lintas role, tenant, dan alur simpan-baca seluruh modul juga belum tuntas.

### Batas hasil teknis dan status migrasi
- CI memeriksa graph import aplikasi/server aktif, dependensi produksi, dan Docker sehingga runtime/build aktif tidak memakai Firebase. Berkas legacy yang masih memuat Firebase tetap ada di repository, tetapi tidak dirujuk oleh route aktif dan tidak masuk bundle produksi. Jadi status yang akurat adalah **runtime aktif bebas Firebase**, bukan “tidak ada satu pun referensi Firebase di seluruh source”.
- Suite CI pada basis database sintetis juga menjalankan replay migrasi, uji database/API, isolasi tenant, transaksi bersamaan, Storage, Tahfidz, dan backup/restore lokal. Itu bukan bukti pemulihan backup Production.
- Snapshot metadata Production terakhir yang tercatat tetap memiliki 100 versi ledger, 3 nama migrasi kosong, dan 66 migration source yang belum tercatat. DDL aktual serta urutan promosi belum direkonsiliasi. **Jangan menjalankan `db push` massal ke PTSAS Production.** Tidak ada perubahan Production pada checkpoint ini.
- Tim backend masih perlu membandingkan DDL PTSAS dengan source, menjelaskan tiap versi ledger yang berbeda, membuktikan backup dan restore Production, serta menguji urutan promosi sebelum deploy database.

### Persentase dan langkah berikutnya
- Kematangan source keseluruhan tetap **sekitar 75% (estimasi kasar)** dari checkpoint terdahulu; denominator fitur berbobot belum dibuat, jadi angka ini bukan persentase UAT atau kesiapan deploy.
- Milestone PR #218: **100% selesai** — merged, CI lulus, dan deployment staging teramati aktif.
- Berikutnya di staging: masuk sebagai Admin, verifikasi halaman dan alur utama CBT, LMS, Komunikasi, Perpustakaan, Alumni, dan Laundry; catat hasil per modul serta error yang terlihat. Setelah itu lanjutkan audit peran/tenant dan fungsi modul yang belum mendapat bukti browser.


---

## Checkpoint setelah PR #214 — 22 November 2026, 04.50 WIB

- `main` berada pada merge commit `e6062fee5f38752d0f275bebe3f65bf60a7784c5`; PR #214 sudah tergabung, pemeriksaan CI pada PR lulus **3/3 job**, dan pencarian GitHub menunjukkan **tidak ada PR terbuka**.
- PR #214 merapikan istilah pada layar agar lebih sesuai untuk pengguna dan menambahkan pemeriksaan otomatis pada teks antarmuka yang dirender. Tidak ada migrasi, data, Auth, Storage, atau konfigurasi cloud yang diubah.
- Perkiraan kematangan source tetap **sekitar 75%**. Ini estimasi lama yang dipertahankan, bukan angka UAT; denominator fitur berbobot dan bukti penerimaan lengkap belum tersedia.
- Pembacaan metadata ledger pada 22 November 2026, 04.53 WIB: VQE staging memiliki **166 versi** (unik, tanpa nama kosong), terakhir `20270404010000`; PTSAS Production memiliki **100 versi** (unik), terakhir `20270316000000`, dengan **3 nama kosong**. Pemeriksaan hanya membaca versi/nama ledger; tidak membaca baris operasional, DDL, atau menulis ke database.
- Belum ada bukti UAT browser terkini lintas Admin, Ustadz, Wali, dan role lain untuk alur simpan-baca seluruh modul. Preview yang menjalankan commit terbaru juga belum dibuktikan.
- DDL aktual PTSAS, penjelasan dan urutan untuk migration yang belum tercatat, bukti pemulihan backup Production, serta versi yang benar-benar aktif di hosting masih perlu dibuktikan oleh tim backend. **Jangan menjalankan `db push` massal ke Production.**
- Berikutnya: lanjutkan UAT staging dengan sesi pengguna yang tersedia; catat skenario lulus/gagal per role dan modul; setelah itu backend owner merekonsiliasi DDL dan rencana promosi Production secara bertahap.

---

## Pembaruan setelah PR #211 — 22 November 2026

- `main` saat snapshot ini berada pada merge commit `da399a88967f1c093cd8ef99fb620e04e67d4533`. PR #211 merged setelah PR #210; tiga job CI required lulus pada run [#44943499275](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44943499275). Perubahannya hanya dokumentasi.
- Pencarian GitHub setelah merge tidak menemukan PR terbuka.
- Pembacaan ulang metadata ledger: VQE staging memiliki **166 versi** hingga `20270404010000`, semuanya dengan nama; PTSAS Production memiliki **100 versi** hingga `20270316000000`, dengan nama kosong pada `20261205000000`, `20261206000000`, dan `20270118000000`. Pembacaan ini tidak mengambil baris aplikasi atau DDL dan tidak menulis ke database.
- Status gerbang Production tidak berubah: 66 source migrations belum tercatat di ledger; DDL aktual, urutan/promosi migrasi, backup/restore Production, dan commit hosting yang aktif masih perlu bukti/review tim backend. Jangan jalankan `db push` massal.

---

## Pembaruan setelah PR #210 tergabung — 22 November 2026

- PR #210 telah tergabung pada merge commit `0170dc3f5a990cd4665109f6ade759d10ee3ddf5`. Snapshot checkpoint pukul 02.35 WIB di bawah ini dibuat sebelum merge, sehingga baris `main` pada snapshot itu mencatat base commit `f82b2c9e61bfa3bb864dd2132ed2d8321c8187c4` dengan benar pada saat tersebut.
- Pemeriksaan GitHub setelah merge tidak menemukan PR terbuka. Pembaruan ini hanya menyelaraskan jejak dokumentasi; tidak mengubah aplikasi atau database.

---

## Checkpoint terbaru — 22 November 2026, 02.35 WIB

### Source dan PR
- `main` berada pada merge commit `f82b2c9e61bfa3bb864dd2132ed2d8321c8187c4`.
- PR #207 (rekonsiliasi dokumentasi ledger), #208 (laporan Supabase Advisor), dan #209 (audit pengganti PR #1–#11) sudah tergabung. PR #209 lulus **3/3 job CI** pada run [#44940624451](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44940624451).
- PR #1–#11 tetap closed/tidak merged; source lama dipetakan ke padanan saat ini dan tidak perlu digabung ulang. PR #12 dan #13 merged. Tidak ada PR terbuka pada pemeriksaan 02.35 WIB.
- Rincian: [audit PR #1–#11](../05_ARCHITECTURE/PR1_TO_PR11_SUPERSESSION_AUDIT_2026-11-22.md), [audit advisor Supabase](../06_DATABASE/SUPABASE_ADVISOR_REVIEW_2026-11-22.md), dan [rekonsiliasi ledger](../06_DATABASE/ENVIRONMENT_MIGRATION_PARITY_2026-11-22.md).

### Tahfidz dan batas bukti
- Source leaderboard Tahfidz menampilkan **Peringkat Hafalan Santri** untuk mode sepanjang waktu; urutan utama menghitung ayat hafalan unik, lalu setoran dan hari aktif sebagai pemecah seri. Endpoint membatasi data Ustadz pada halaqah yang ditugaskan kepadanya.
- Pengujian source/CI memeriksa urutan, deduplikasi ayat, serta cakupan tenant dan halaqah. Tampilan preview yang sedang tersaji **belum terverifikasi**; pemeriksaan UI otomatis gagal dimulai pada sesi ini. Tangkapan layar dari preview lama tidak membuktikan build terbaru sudah tampil.

### Progress dan pekerjaan yang tersisa
- Perkiraan pengembangan source tetap sekitar **75%**. Ini angka checkpoint kasar, bukan persentase fitur yang telah lulus UAT atau kesiapan Production.
- Ledger VQE staging 166/166 cocok dengan source pada snapshot 22 November. Ledger PTSAS Production memiliki 100 entri: 97 pasangan versi/nama cocok, tiga nama kosong, dan 66 migration source belum tercatat. Selisih ledger **bukan** instruksi menjalankan `db push` massal; DDL aktual harus direkonsiliasi satu per satu.
- UAT browser lintas role/tenant dan verifikasi preview terbaru masih terbuka. Bukti DDL Production, pemulihan backup/restore Production, dan commit hosting yang sedang aktif juga belum ada.
- PR #209 dan checkpoint ini hanya mengubah dokumentasi. Tidak ada perubahan aplikasi, database, Auth, Storage, atau data Production.

---

## Checkpoint terbaru — 22 November 2026, 01.42 WIB

### Source, fitur, dan CI

- `main` berada pada commit `6db3ac18c4b1bc194d55bae83f48a3dd777c363a`. PR #205 (siaran OpenWA idempoten) dan PR #206 (checkpoint rilis) sudah merged.
- PR #205 menambahkan ledger tahan lama per kampanye/penerima, mencegah retry kirim ulang status terminal atau ambigu, dan mempertahankan id permintaan di UI saat hasil belum pasti.
- PR #205 lulus **3/3 CI** sebelum merge (run [#44933961597](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44933961597)); CI pasca-merge juga **3/3** (run [#44934747145](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44934747145)). Pengujian database berjalan di Supabase lokal terisolasi dengan data sintetis.
- Estimasi source sekitar **75%** tetap perkiraan checkpoint terdahulu, bukan skor UAT dan belum dihitung ulang.

### Status ledger terbaru, baca-saja

Pemeriksaan 22 November membaca metadata `version, name` dari kedua proyek dan membandingkannya dengan 166 file migration pada `main`:

- **VQE staging** `vqemuyzveuirlkvdggjd`: proyek ACTIVE_HEALTHY; ledger **166/166** cocok persis. Ledger mencatat migration `20270404010000_crm_broadcast_idempotency`. Ini membuktikan metadata migration ada di VQE, tetapi bukan bukti UAT CRM/OpenWA atau siapa/kapan yang menerapkannya.
- **PTSAS Production** `ptsasgdvgrbdtgyqieie`: proyek ACTIVE_HEALTHY; **100** entri ledger, **97** pasangan versi/nama cocok, **3** nama kosong, **66** source migration belum tercatat; tidak ditemukan versi ekstra atau nama berbeda.
- Manifest lengkap dan daftar 66 versi terdapat pada [rekonsiliasi ledger 22 November](../06_DATABASE/ENVIRONMENT_MIGRATION_PARITY_2026-11-22.md). Konektor hanya membaca metadata. Tidak ada DDL atau data aplikasi yang dibaca, dan sesi ini tidak menjalankan SQL tulis maupun migration.

### Bukti yang masih kurang

- VQE ledger cocok, tetapi UAT browser CRM/OpenWA belum dilakukan. Tidak ada bukti kirim berhasil, penolakan provider, timeout ambigu, atau klik ulang pada UI VQE.
- Ledger PTSAS belum direkonsiliasi dengan DDL aktual. **Jangan** menjalankan `supabase db push` massal untuk 66 versi yang belum tercatat; sebagian perubahan mungkin sudah berada di skema Production tanpa ledger.
- Perbandingan DDL penuh, tinjauan backend owner, backup dan restore Production, serta verifikasi commit yang sedang disajikan hosting masih belum terbukti.
- Produk belum dinyatakan siap go-live atau komersial. Migrasi PTSAS dan konfigurasi Production tidak diubah.

### Urutan lanjutan

1. Backend owner cocokkan DDL Production, fungsi, trigger, policy, grants, dan dependensi terhadap migrasi yang belum tercatat; periksa pula tiga nama ledger kosong.
2. Lakukan UAT CRM di VQE dengan penerima uji terkendali; uji hasil sukses, penolakan, timeout ambigu, dan retry id yang sama. Pengiriman pesan eksternal harus diarahkan ke nomor yang disetujui pemilik.
3. Buktikan backup dan restore pada target aman sebelum menyusun rencana promosi Production; jalankan hanya migration yang dampaknya sudah dipahami.
4. Pastikan hosting menjalankan commit yang disetujui, lalu lakukan smoke test lintas role/tenant dan modul utama.


---

## Checkpoint terbaru — 21 November 2026, 23.11 WIB

### Source dan deployment mandiri

- `main` berada pada commit `a8c1b86d494a530a465c8ff975fae8e9762c3f0d`.
- PR #199 meneruskan `WA_GATEWAY_API_KEY` dari environment host ke container server; nilai opsionalnya kosong secara bawaan dan tidak boleh masuk ke browser. Panduan deployment dan pemeriksaan Compose juga diperbarui.
- PR #196 sebelumnya menambahkan pass-through server-only untuk `PUBLIC_PPDB_ENABLED` dan `PUBLIC_PPDB_TENANT_ID`, tetap fail-closed.
- CI PR #199 lulus **3/3 job**: instalasi NPM pelanggan, build/Docker/guard Firebase, serta migrasi sintetis, pgTAP, API tenant, Storage, dan backup-restore lokal. [Run #2162](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44922434357).
- PR #196–#199 sudah digabung; pemeriksaan GitHub tidak menemukan PR terbuka.

### Batas bukti

- Tidak ada perubahan data, Auth, Storage, atau konfigurasi Supabase di VQE maupun PTSAS Production. CI menjalankan database lokal terisolasi; hasil backup-restore CI bukan bukti pemulihan cloud.
- Konektor web tidak dapat mengakses domain pelanggan untuk memverifikasi commit yang sedang disajikan. Deployment hosting tetap belum terkonfirmasi.
- Estimasi source tetap sekitar **75%** dan bersifat kasar, bukan skor UAT. Login browser lintas role/modul, simpan-baca penuh pada staging, rekonsiliasi DDL Production, serta rehearsal backup-restore cloud masih terbuka.
- Tidak ada langkah manual yang dilakukan; pekerjaan browser/hosting yang memerlukan sesi pemilik akun ditunda sampai pemilik aktif.

---

## Checkpoint terbaru — 21 November 2026, 22.51 WIB

### Source dan paket pemasangan mandiri

- `main` berada pada merge commit `de6c2deb8e98188ab9a730b9d024de4fc63f26e6`.
- PR #196 menutup celah konfigurasi Docker: `PUBLIC_PPDB_ENABLED` dan `PUBLIC_PPDB_TENANT_ID` kini diteruskan ke proses server. PPDB tetap nonaktif secara bawaan; variabel tenant tidak ditambahkan ke konfigurasi browser.
- PR #197 memperjelas panduan pendaftaran Wali dan PPDB publik pada [panduan deployment terkelola pelanggan](../../guides/CUSTOMER_MANAGED_DEPLOYMENT.md).
- CI PR #196 dan #197 lulus 3/3 job wajib, termasuk instalasi NPM bersih, build/Docker/guard Firebase, replay migrasi sintetis, pgTAP, isolasi API/tenant, Storage, dan backup-restore database lokal. [Run PR #197](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44920290816).
- Pemeriksaan GitHub setelah merge tidak menemukan PR terbuka. Status domain hosting belum diverifikasi terhadap commit `main`.

### Batas hasil

- Tidak ada perubahan database, Auth, Storage, atau konfigurasi cloud pada VQE maupun PTSAS Production dalam pekerjaan ini. CI berjalan pada database lokal terisolasi.
- Estimasi kasar pengembangan source tetap sekitar **75%**; bukan skor UAT. Login browser lintas role/modul, simpan-baca penuh pada staging, verifikasi hosting, diff DDL Production, serta backup-restore cloud tetap belum terbukti.
- Tidak ada operasi manual yang dilakukan. Lanjutkan UAT browser setelah pemilik akun aktif; Production belum dinyatakan siap deploy atau komersial.

---

## Checkpoint terbaru — 21 November 2026, 20.30 WIB

### Source dan pemeriksaan otomatis
- PR #189 telah tergabung ke `main` pada commit `1223e12fbdb96e0942c5bf504ad2f77fcc0b37d4`: halaman CBT Firebase lama yang tidak dirutekan dan dependensi rentan yang hanya dipakainya dihapus; CBT aktif `SupabaseCBTManager` dipertahankan.
- GitHub Actions [run #44908590992](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/44908590992) lulus 3/3 job: instalasi NPM bersih, frontend/build/Docker dan guard runtime, serta replay migrasi, pgTAP, API/tenant, Storage, Document Center, dan backup-restore database lokal sintetis.
- Pemeriksaan tersebut berjalan pada source yang kemudian di-merge. Tidak ada migrasi, perubahan record, atau operasi Storage ke PTSAS Production. Status deployment hosting/domain pelanggan belum diverifikasi.

### Progress dan batas klaim
- Estimasi kasar pengembangan source sampai serah-terima tim: **sekitar 75%**. Ini bukan persentase fitur yang telah lulus UAT; denominator berbobot untuk semua skenario belum ditetapkan.
- CI membuktikan suite otomatis pada Supabase lokal terisolasi, bukan UAT browser semua role/modul dan bukan kesetaraan DDL atau pemulihan Production.
- Catatan fixture staging 21 November melaporkan data tenant uji pada 43 dari 177 tabel ber-tenant; beberapa modul masih belum memiliki skenario simpan-baca. Angka tabel tidak membuktikan fitur siap. Sebelum menambah fixture, hitung ulang data tenant saat ini dan buat hanya yang benar-benar belum tersedia agar tidak menduplikasi.
- UAT browser lintas role/modul, upload pada hosting, responsivitas penuh, dan alur simpan-baca UI masih belum lengkap. Pembacaan Production terakhir yang terdokumentasi di checkpoint sebelumnya hanya metadata ledger/katalog; belum ada diff DDL penuh atau rehearsal backup-restore Production.

### Langkah berikutnya
1. Lanjutkan UAT browser staging pada sesi Admin yang sudah tersedia; catat hasil per modul/role dan tandai yang belum aktif sebagai belum diuji.
2. Perbarui inventaris record tenant UAT dengan hitungan baca-saja. Tambahkan data sintetis hanya melalui UI/API staging, lalu buktikan relasi dan baca-ulang setelah refresh.
3. Uji build hosting terhadap commit `1223e12` dan environment staging; status domain pelanggan perlu bukti deployment dan smoke test terpisah.
4. Selesaikan pemeriksaan DDL/urutan migrasi dan rehearsal pemulihan Production sebelum menyimpulkan siap Production atau komersial.

**Status:** PR #189 sudah closed/merged dan semua job CI lulus. Produk masih belum dinyatakan siap go-live atau komersial; UAT browser, environment pelanggan, serta bukti Production tetap terbuka.

---

# Kesiapan Komersial dan Go-Live — ERP4 Pesantren

## Checkpoint terbaru — 21 November 2026, 19.24 WIB

### Source, Tahfidz, dan CI

- PR #185 telah **tergabung ke `main`** pada `3080422ffc552b82704da0941b574cf8d220b45a`; PR #186 pada `ee73543f75f79d9e9ca6666bb0959fb08ad6319f`; dan checkpoint pasca-UAT PR #187 pada `1365ba1e007c52c7b906f11fe29bfe5c44fbcc78`. PR #182 ditutup sebagai duplikat yang superseded oleh #185. Pencarian repo setelah merge #187 tidak menemukan PR terbuka.
- UAT browser sebelumnya pada preview Hostinger PR #185 dengan akun Ustadz sintetis VQE menunjukkan 2 santri, 1 halaqah, 3 setoran hari itu, cakupan target 2/2, satu panel leaderboard, dan peringkat 15 lalu 10 ayat unik. Riwayat setoran memakai nama Surah serta rentang ayat dari katalog. Tab preview yang tersedia sekarang kembali ke layar publik/masuk; UAT lanjutan perlu sesi login staging baru.
- Empat pemeriksaan lokal pada source aplikasi `c19f8c2` lulus: kontrak environment Compose (100 variabel tercakup, nilai secret kosong), konfigurasi deployment (31 nilai runtime publik dan 38 gerbang server fail-closed), graph runtime Supabase tanpa Firebase (169 modul, 26 rute Supabase, arsip impor ditutup), dan leaderboard Tahfidz (95 assertion database).
- CI PR #185 dan PR #186 lulus tiga job wajib: frontend/build guard, instalasi paket pelanggan, dan migrasi/API Auth/pgTAP. Tes database berjalan pada Supabase lokal terisolasi. Job Supabase Preview dilewati karena branch tidak ditautkan ke Supabase Branch.

### Staging dan Production

- Pemeriksaan baca-saja VQE `vqemuyzveuirlkvdggjd` saat ini menunjukkan status `ACTIVE_HEALTHY`, **165/165 pasangan versi dan nama migrasi** cocok dengan 165 file source, hingga `20270404000000_tahfidz_unique_ayah_projection_indexes`. Inventaris schema menemukan 180 tabel `public` dan semuanya melaporkan RLS aktif.
- Kecocokan ledger versi/nama dan RLS aktif bukan bukti checksum/DDL lengkap, ketepatan setiap policy, UAT seluruh modul, atau backup/restore cloud. Tidak ada migrasi atau baris data yang ditulis ke VQE pada pemeriksaan ini.
- PTSAS Production `ptsasgdvgrbdtgyqieie` terbaca `ACTIVE_HEALTHY` (PostgreSQL 17.11.0.003). Ledger baca-saja memuat **100 versi** sampai `20270316000000`. Dibanding 165 file migrasi source: **97 pasangan versi/nama cocok persis**, **3 nama ledger kosong** (`20261205000000`, `20261206000000`, `20270118000000`), dan **65 versi source tidak memiliki baris ledger** (mulai `20261207000000` sampai `20270404000000`). Tidak terlihat versi ledger di luar set versi source.
- Pembacaan ini hanya metadata versi/nama, bukan payload SQL, DDL aktual, policy, atau data aplikasi. Tidak ada migration/repair/data write ke PTSAS. Jangan menyusun rencana promosi dari jumlah ledger; tim backend tetap perlu membandingkan DDL/dependensi dan membuktikan restore sebelum rehearsal.

### Gerbang produk yang masih terbuka

- UAT browser lintas modul dan role belum lengkap; verifikasi leaderboard Ustadz bukan pengganti UAT Admin, Wali, Santri, keuangan, PPDB, Akademik, CBT/LMS, Storage, dan modul operasional lain.
- Clean install, upgrade, dan pemulihan pada VPS/on-premise pelanggan belum dibuktikan. Tes konfigurasi Compose lokal yang lulus hanya memverifikasi kontrak environment dan guard.
- Kesiapan Production masih memerlukan peninjauan DDL/migrasi dan bukti backup/restore oleh tim backend. Persetujuan UAT pengguna serta kesiapan operasional/komersial juga masih terbuka.
- **Produk keseluruhan belum dinyatakan siap go-live atau komersial.** Persentase total tidak dihitung karena cakupan dan bobot UAT lintas environment belum memiliki denominator terukur yang disepakati.

## Status otoritatif — 21 November 2026, 03.52 WIB

### Source dan hasil pengembangan

- Source `main` berada pada merge commit PR #178, `60d64d7c71685dcbfadb459519026ee7eeed8478`.
- PR #177 menyamarkan 105 penanganan error pada 25 modul; PR #178 menutup jalur error mentah pada tombol muat ulang pemesanan fasilitas dan menambahkan deteksi error kebijakan baris data pada pesan pelanggan.
- CI pada head PR #178, `6a7df37a27e01033641f8e2c8120d253d03504e1`, lulus 3/3 job: build frontend/Docker, instalasi paket pelanggan, serta migrasi, API auth, pgTAP, dan pengujian database di Supabase lokal terisolasi.
- PR #178 hanya mengubah source frontend, penyaring pesan, dan pemeriksaan otomatis. Tidak ada migrasi, perubahan data, Storage, hosting, atau Production.
- CI bukan UAT browser. Ia tidak membuktikan semua alur tampilan, setiap role, konfigurasi Hostinger, pemulihan cloud, atau kesetaraan skema Production.
- Pemetaan pesan error kini menjaga jalur UI yang dicakup agar tidak menampilkan error teknis provider. Ini bukan bukti bahwa seluruh teks di seluruh repository telah ditinjau secara visual.
- Runtime frontend aktif tidak memakai Firebase sebagai backend; guard CI memeriksa dependency produksi dan graph bundle. Arsip/kode Firebase legacy yang tidak aktif tetap ada di repository.
- Saya tidak menetapkan persentase akhir karena daftar penerimaan dan bobot UAT lintas environment belum disepakati secara terukur.

### Backend — pemeriksaan baca-saja terbaru

- Source `main` memuat 163 file migrasi hingga `20270402000000`.
- VQE staging `vqemuyzveuirlkvdggjd` memiliki 163 entri migrasi hingga versi yang sama; pemeriksaan sebelumnya menyebut ledger `upToDate`. Ini hanya membuktikan paritas ledger, bukan kesetaraan penuh DDL atau kelulusan modul.
- Inventaris VQE menunjukkan 179 tabel `public`, semuanya mengaktifkan RLS. Pemeriksaan per tenant pada 177 tabel dengan kolom `tenant_id` menemukan record pada 43 tabel di tenant UAT yang terdokumentasi; rincian dan kekosongan modul ada di [inventaris fixture VQE](UAT_VQE_FIXTURES_2026-11-20.md). Angka tersebut tidak membuktikan UAT UI lulus. Gunakan data yang sudah ada dan tambahkan hanya yang terbukti kurang.
- PTSAS Production `ptsasgdvgrbdtgyqieie` masih memiliki 100 entri ledger sampai `20270316000000`, dibanding 163 file source. Ada 63 versi source yang belum tercatat, termasuk tiga entri tanpa nama (`20261205000000`, `20261206000000`, `20270118000000`). Inventaris baca-saja menampilkan 162 tabel `public`, semuanya dengan RLS aktif.
- Perbandingan katalog terakhir mencatat 17 tabel source belum ada di PTSAS serta perbedaan kolom, constraint, foreign key, indeks, trigger, fungsi, dan ekspresi policy. Rincian: [audit rollout Production](../06_DATABASE/PTSAS_PRODUCTION_MIGRATION_ROLLOUT_AUDIT_2026-11-20.md). Ini bukan diff DDL lengkap atau bukti perilaku aplikasi.
- Production tidak diubah. Rehearsal migrasi, penjelasan tiga nama ledger kosong, dan bukti backup/restore tetap harus ditangani sebelum cutover; jangan mengejar jumlah ledger dengan menjalankan seluruh 63 migrasi.

### Produk dan UAT yang masih terbuka

- Fixture UAT sintetis yang terdokumentasi mencakup Data Induk, sebagian Asrama, target Tahfidz, dan Dokumen Digital; lihat [catatan fixture UAT VQE](UAT_VQE_FIXTURES_2026-11-20.md). UAT antarmuka lintas role serta alur lengkap PPDB, Keuangan, Akademik, CBT/LMS, dan modul operasional lain belum terbukti menyeluruh.
- VQE memiliki data di sejumlah tabel modul lain, tetapi belum dipastikan apakah record tersebut termasuk fixture UAT yang dimaksud atau berada pada tenant yang sama. Sebelum menambah data UAT, petakan tenant sasaran dan referensinya, gunakan fungsi aplikasi, lalu cek konflik/duplikasi.
- Matriks runtime berisi 38 gerbang server; nilai contoh di `.env.example` sengaja `false`. Aktifkan flag hanya untuk skenario staging setelah skema, Auth/tenant, izin, dan Storage siap. Lihat [matriks gerbang runtime](MODULE_RUNTIME_FLAG_MATRIX.md).
- UAT browser untuk role, navigasi, simpan-baca, transaksi, unggahan, sesi login, dan tampilan responsif belum lengkap. Gunakan [handoff UAT antarmuka](../05_ARCHITECTURE/FRONTEND_UAT_HANDOFF.md).
- Source Asrama memiliki pembungkus tema dan aturan permukaan berbasis token pada `src/index.css`. Tampilan Hostinger pada build terbaru belum diperiksa setelah PR #178; keluhan panel putih belum dapat dinyatakan selesai hanya dari pemeriksaan source.
- Commit serta konfigurasi Hosting/domain pelanggan belum diverifikasi cocok dengan `main` dan flag environment aktif. Build preview PR tidak membuktikan bahwa domain pelanggan sudah menyajikan commit yang sama.
- Bukti backup/restore yang ada berasal dari CI database lokal sintetis; pemulihan cloud staging dan Production belum dibuktikan.
- Kesiapan komersial self-hosted masih memerlukan clean install, upgrade, pemulihan database/Storage, dukungan operasional, kebijakan data/lisensi, dan pilot pesantren.

### Langkah berikutnya

1. Setelah operator aktif, lakukan UAT browser di VQE menggunakan Admin yang sudah ada; periksa tampilan Asrama pada build terbaru dan alur modul yang fixture-nya tersedia.
2. Petakan record VQE yang sudah ada per tenant sebelum membuat fixture tambahan; buat hanya yang kurang, untuk UAT sintetis, dan verifikasi melalui alur aplikasi.
3. Lengkapi UAT lintas role, modul, alur simpan-baca, upload privat, dan layar responsif; tandai hasil per skenario.
4. Tim backend menyelesaikan diff DDL Production, tiga nama ledger kosong, dan rehearsal pemulihan atas 63 versi migrasi yang belum tercatat.
5. Cocokkan build/flag domain pelanggan, lalu lakukan clean install/upgrade serta backup/restore pada environment target sebelum status rilis dinilai ulang.

**Status:** PR #177 dan #178 telah tergabung ke `main`; CI PR #178 lulus 3/3 job. Pengembangan source dan pengujian otomatis masih berlanjut. UAT browser, verifikasi hosting, backup/restore cloud, dan rekonsiliasi Production tetap terbuka; produk belum dinyatakan siap Production atau siap komersial.

## Addendum otoritatif — checkpoint 14 November 2026

Snapshot ini membedakan source aplikasi dari dokumentasi dan database live. Source aplikasi `main` tetap pada `b0824476cb6d0207925283f15cb6f0d2714e54a3`; commit `a168e48030c127cb0fe802f36e6e11f44e239d66` hanya menambahkan PR dokumentasi #119. PR #117 dan #118 juga hanya dokumentasi. Source memuat 150 file migrasi.

### Status backend live

- **PTSAS Production** memuat 100 baris ledger; 97 versi/nama cocok persis dengan source, 3 nama ledger kosong, 50 versi source belum tercatat, dan tidak ada versi ledger-only. Head ledger `20270316000000`; source tertua yang belum tercatat `20261207000000`. Selisih berada di tengah riwayat; tidak aman mengejar semuanya dengan `db push`.
- **VQE staging** memuat 150 baris ledger: 140 cocok, 6 file source belum tercatat, 4 versi bernama berbeda, dan 6 versi ledger tanpa file bernomor sama. Ada migrasi CBT 17–19 yang tidak punya file source bernomor sama.
- Inventaris live menampilkan **162 tabel PTSAS** dan **169 tabel VQE**; RLS aktif pada seluruh tabel `public` yang diperiksa. Katalog `quran_surahs` ada di VQE, tetapi belum ada di PTSAS. Ini belum membuktikan seluruh kebijakan RLS atau tiap endpoint memagari role dan tenant dengan benar.
- Laporan [rekonsiliasi Production](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-14.md) dan [audit benturan versi PR](../06_DATABASE/OPEN_PR_MIGRATION_COLLISION_AUDIT_2026-11-14.md) berisi rincian dan langkah backend. Tidak ada DDL, baris data, atau berkas Storage yang diubah dalam checkpoint ini.

Kecocokan ledger Production adalah **97/150 (64,7%) versi dan nama**. Ini ukuran rekonsiliasi migrasi, bukan persentase penyelesaian fitur ERP.

### Status source dan PR

- PR #114 (validasi katalog Surah dan tab Tahfidz) serta #115 (pesan komersial lintas modul) memiliki CI hijau. Keduanya masih terbuka; UAT browser/visual belum dikonfirmasi.
- PR #116 (leaderboard bulanan Tahfidz) memiliki CI hijau pada head terbaru, tetapi masih draft. UAT Admin/Ustadz/Santri/Wali dan keadaan tanpa data masih diperlukan.
- PR #112 (CBT skala besar) CI-nya hijau, tetapi GitHub menandai cabang `dirty`; migrasi `20270321000000` berbenturan dengan PR #116. Cabang PR #92 kini diselaraskan ke head PR #91 dan indeks FK dipindahkan ke migrasi `20270330000000` setelah rangkaian Tahfidz `20270327000000`–`20270329000000`; CI pada head baru masih menunggu. Tidak ada database cloud yang diubah. PR #96–#102 tetap harus diperiksa terhadap source dan ledger sebelum merge.
- PR #1–#11 berstatus closed tanpa merge; PR #13 sudah merged sebagai cutover besar. Ini tidak membuktikan tiap perubahan lama telah hadir satu per satu. Pertahankan status lama dan port hanya logic yang terbukti belum ada melalui PR terpisah.

### Gerbang penyelesaian

Produk **belum siap dinyatakan go-live atau komersial**. Sebelum tim backend deploy, perlu:
1. menyelesaikan urutan PR dan versi migrasi tanpa benturan;
2. memeriksa DDL Production, tiga metadata ledger kosong, serta 50 versi yang belum tercatat satu per satu;
3. membuktikan backup dan restore Production;
4. merekonsiliasi staging ke satu source kanonis lalu rehearsal migrasi;
5. menyelesaikan UAT antarmuka dan simpan-baca peran/tenant untuk modul inti, Storage, responsif, dan instalasi target.

CI hijau pada database lokal sintetis adalah bukti source yang terbatas; CI tidak menggantikan UAT browser atau verifikasi Production. Tidak ada persentase total pengembangan yang dapat dibuktikan tanpa denominator fitur dan bukti UAT yang disepakati.

> **Status otoritatif — 11 November 2026.** Source `main` berada pada `fd937f4876aa1069500694b9bc20ec70eef8ee14` (merge PR #90), 140 file migrasi. CI pada SHA itu lulus 3/3 job di [run #42482785770](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42482785770). PR #91 masih draft dan belum masuk `main`.
>
> Preflight baca-saja PTSAS Production `ptsasgdvgrbdtgyqieie` pada tanggal yang sama: PostgreSQL 17.11, ledger 47 versi sampai `20261206000000`, 45 versi cocok nama dan SQL-nya dengan source, 2 versi tanpa payload, 93 versi source belum tercatat, 119/119 tabel `public` ber-RLS dan FORCE RLS. Transaksi `READ ONLY` ditutup `ROLLBACK`. Tidak ada perubahan Production. Daftar selisih bukan rencana migrasi. Lihat [rekonsiliasi 11 November](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-11.md) dan [handoff backend](BACKEND_TEAM_START_HERE.md).
>
> Ledger VQE 140/140 terakhir dibuktikan 8 November di [panduan UAT](../05_ARCHITECTURE/FRONTEND_UAT_HANDOFF.md). Sesi 11 November tidak membaca ulang VQE. UAT browser lintas role, backup/restore Production, dan instalasi host target belum lulus.
>
> Produk **belum dinyatakan siap deploy atau komersial**. Persentase terukur: **CI 3/3 job pada run #42482785770**. Angka ini bukan persentase penyelesaian seluruh ERP.

> **Arsip status — 8 November 2026, setelah PR #86.** Source utama `main` berada pada merge commit `c219bbb467e1d2db3385abcaa7b8b1ee14ef0ad9`. PR #86 memperbaiki konflik versi simpan Pengaturan Tenant dan sudah merged. PR #1–#11 tetap closed tanpa merge karena implementasi intinya digantikan source yang lebih baru.
>
> CI pada kandidat PR #86 (`c34fed60a41c0e13e37e03281b650abffcd58fc7`) lulus 3/3 job: build/runtime Docker dan guard frontend, migrasi/API/pgTAP, serta instalasi NPM pelanggan. [Hasil CI](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42459060708). Supabase Preview dilewati. Job memakai Supabase lokal terisolasi dan fixture sintetis; ini bukan UAT browser penuh atau bukti Production.
>
> Pemeriksaan baca-saja staging VQE `vqemuyzveuirlkvdggjd` menunjukkan proyek aktif sehat, 139 migrasi sampai `20270307000000_tenant_settings_conflict_http_409`, dan definisi `save_tenant_system_settings` menggunakan `PT409`. Ini membuktikan keberadaan migrasi/fungsi tersebut pada VQE; bukan bukti seluruh DDL, modul UI, atau CRUD setiap role sudah lulus UAT.
>
> Akses baca Production PTSAS melalui konektor sesi itu ditolak. Snapshot operator terdahulu menyebut 47 entri ledger dan 119 tabel public dengan RLS + FORCE RLS. Angka ledger dan RLS itu kemudian diverifikasi ulang pada 11 November; lihat status otoritatif di atas.
>
> Produk **belum dinyatakan siap deploy atau komersial**. Login browser, matriks role/tenant menyeluruh, simpan-baca seluruh modul lewat UI, Storage di hosting target, tampilan responsif, dan clean install/restore di VPS/on-premise belum lulus UAT. Gunakan [checkpoint pengujian terkini](CHECKPOINT_2026-11-08_CI_AND_STAGING.md) dan [handoff backend](BACKEND_TEAM_START_HERE.md).
>
> Persentase terukur pada checkpoint ini: **CI 3/3 job (100% dari job wajib di run tersebut)**. Angka ini bukan persentase penyelesaian seluruh ERP; persentase keseluruhan tidak dihitung karena UAT, Production, dan penerimaan komersial belum memiliki denominator berbukti yang sama.

> Catatan checkpoint bertanggal setelah ringkasan ini merupakan arsip historis dan tidak menggantikan status otoritatif di bagian atas.

> **Pembaruan checkpoint — 6 November 2026, 23.08 WIB.** CI #1191 lulus 3/3 job pada source dokumen PR `602926c548410e2f6af2d0001701d5cf23fd0ece`; source aplikasi terakhir diuji tetap `c61825935c49b642d8bed08b16e7c428a73add15`. UAT browser, inventaris penuh Production, backup/restore yang terbukti, dan rehearsal/dry-run masih terbuka.
>
> VQE memiliki 136 migration ledger rows, dengan migration kamar aktif pada alias `20261106151606`; jangan menjalankan DDL ulang. MCP masih menolak baca ledger Production, dan tidak ada perubahan Production.
> [Checkpoint terbaru dan langkah operator](CHECKPOINT_2026-11-06_RESUME_STAGING.md).

> **Status terbaru — 6 November 2026, 22.58 WIB.** CI #1188 lulus 3/3 job pada head review `dfff6bbd13c10f115cf17b845f087b6ebcf84421`; bukti tersebut mencakup build/runtime, instalasi NPM, migration replay sintetis, API/Auth, pgTAP, Storage, dan backup/restore lokal CI. UAT browser dan cutover Production belum lulus.
>
> Read-only MCP terbaru mengonfirmasi VQE memiliki 136 ledger rows, dengan migration `student_room_assignment_reference_locks` tercatat sebagai alias `20261106151606` (source `20270304000000`); jangan mengulang DDL. PTSAS Production tidak disentuh, dan permintaan baca ledger terbaru ditolak connector. Operator perlu memberikan inventaris baca-saja terkini.
>
> Uji lokal tambahan lulus pada integration worktree yang berbeda dari head PR dan mengandung perubahan belum commit; karena itu hasilnya bersifat pendukung, bukan verifikasi release head. Build lokal lulus dengan peringatan ukuran chunk PDF sekitar 1,46 MB.
> [Checkpoint terbaru dan urutan tindakan](CHECKPOINT_2026-11-06_RESUME_STAGING.md).

> **Status terbaru — 6 November 2026, 22.50 WIB.** PR #40 masih terbuka untuk review. Source aplikasi terakhir yang diuji adalah `c61825935c49b642d8bed08b16e7c428a73add15`; CI #1187 lulus 3/3 pada head dokumentasi `58553c2e493d10cf35e0268a2d1e40a7bed064c8`. Run #1187 menguji build/runtime, instalasi NPM, migration replay sintetis, API/auth, pgTAP, Storage, backup/restore lokal CI, dan konkurensi. Hasil CI ini tidak sama dengan UAT browser atau verifikasi Production.
>
> Preview lokal 4179/3000 tidak aktif saat diperiksa. UAT login Admin/Wali dan modul di browser masih terbuka. VQE sudah menjalankan migration `20270304000000`, tetapi satu versi ledger masih alias `20261106151606`; jangan jalankan ulang DDL. PTSAS Production tidak disentuh, dan tetap menunggu inventaris penuh, backup/restore yang terbukti, rehearsal serta dry-run yang disetujui.
> [Checkpoint terbaru dan urutan tindakan](CHECKPOINT_2026-11-06_RESUME_STAGING.md).


> **Status terkini — 6 November 2026, 22.45 WIB.** Data operasional/angka di bagian bertanggal di bawah adalah snapshot historis dan tidak menggantikan status terbaru ini.
>
> - PR #40 `codex/menu-owner-placement-20261101` adalah source review aktif; kode terakhir diuji pada `c61825935c49b642d8bed08b16e7c428a73add15`. CI #1186 lulus 3/3 pada head dokumentasi terbaru `80990bca4f29ae71f6d2a1e0a1e6f4bd20d9f0d3`. PR #40 terbuka, siap ditinjau backend, belum merged.
> - Sidebar source memuat 25 modul rilis awal; PPOB/payment provider tetap dikecualikan. Izin role dapat menyembunyikan menu yang tidak diizinkan, dan gerbang runtime server tetap default mati. Menu atau rute yang terlihat tidak membuktikan API modul sudah UAT.
> - Migration `20270304000000_student_room_assignment_reference_locks` sudah aktif di VQE staging `vqemuyzveuirlkvdggjd`; ledger memakai alias `20261106151606`. Jangan jalankan ulang SQL. Rekonsiliasi metadata satu baris belum dilakukan.
> - VQE berpaket Supabase Free. Leaked-password protection memerlukan Pro menurut [dokumentasi Auth Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); tidak ada upgrade atau biaya dilakukan.
> - PTSAS Production `ptsasgdvgrbdtgyqieie` tidak diubah. Snapshot yang tersedia memiliki 47 ledger version versus 136 file migration source; dua migration 20261031 terbukti memiliki objek DDL yang belum ada. Selisih 89 ledger bukan bukti bahwa semua DDL hilang, dan inventaris skema penuh, backup/restore, dry-run, serta rehearsal Production belum selesai.
> - UAT internal UI belum selesai: referensi AI Studio yang dapat dibuka menampilkan beranda PPDB dan login; tidak ada sesi Admin aktif untuk menguji dashboard/modul. Local preview `localhost:4179` dan `:3000` tidak sedang listening.
> - [Checkpoint terbaru, bukti, dan langkah berikut](CHECKPOINT_2026-11-06_RESUME_STAGING.md). Persentase yang dapat dibuktikan adalah CI 3/3; produk belum dinyatakan siap komersial atau Production cutover.
>

**Status:** dokumen penerimaan internal. Dokumen ini tidak menyatakan produk siap dijual atau siap produksi.
**Diperbarui:** 11 November 2026
**Jalur rilis utama:** PR #13, self-hosted, satu instalasi per pesantren.

## Kontrak produk

ERP4 Pesantren ditujukan sebagai software yang dipasang dan dioperasikan untuk pesantren, bukan SaaS multi-pelanggan yang dikelola vendor. Asumsi rilis awal adalah satu instalasi untuk satu pesantren. Backend, Auth, database, Storage, domain, secret, dan backup menjadi milik/lingkup instalasi tersebut.

Kolom `tenant_id` tetap menjadi batas data dan otorisasi di dalam instalasi. Keberadaannya tidak berarti semua pesantren akan ditempatkan pada satu database vendor. Dukungan beberapa pesantren dalam satu instalasi harus menjadi keputusan produk tersendiri.

**Batas rilis awal:** atas keputusan pemilik, PPOB, Layanan ekosistem, dan integrasi payment gateway dikeluarkan sementara. Provider belum dipilih dan tidak ada koneksi provider yang ditawarkan pada rilis awal. Modul disembunyikan dari navigasi dan tidak bisa dibuka melalui permission yang tersimpan sebelumnya. Finance tetap mendukung pencatatan serta verifikasi pembayaran manual; settlement otomatis belum termasuk.

Paket Docker ERP berkomunikasi dengan endpoint Supabase yang disediakan operator. Paket ini **belum membundel atau mengoperasikan seluruh layanan Supabase**. VPS dan on-premise berarti jalur deployment yang dituju, bukan bukti bahwa clean install di semua jenis server telah berhasil.

Pendapatan yang mungkin ditawarkan mencakup lisensi, jasa instalasi, migrasi yang disetujui pelanggan, pelatihan, pemeliharaan, dan dukungan. Harga, bentuk lisensi, periode update, SLA, dan cakupan support belum ditetapkan. Jangan menjanjikan layanan SaaS, operasi offline penuh, native Windows Server, Kubernetes, atau skala tertentu sebelum dirancang dan diuji.

## Status teknis berdasarkan bukti

- Runtime utama menggunakan Supabase; guard CI memastikan Firebase tidak masuk ke graph frontend aktif. Pada `main` `fd937f4`, build/runtime, instalasi NPM, dan migrasi/API/pgTAP lulus di [CI #42482785770](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42482785770).
- CI menguji round-trip API sintetis untuk Akademik, CBT, LMS, HRIS, Koperasi, CRM, komunikasi, Laundry, Donasi/Wakaf, Dokumen, Kesehatan, Tahfidz, Perpustakaan, fasilitas, dan Urusan Umum; juga NIS/asrama bersamaan, PPDB, Finance/Storage, serta backup/restore lokal satu record sintetis. Guard memastikan seluruh 55 skrip test package dijadwalkan. Ini cakupan otomatis terpilih, bukan UAT semua form, alur, dan tombol di browser.
- PR #1–#11 ditutup tanpa merge karena implementasi utamanya digantikan source yang lebih baru. Tidak ada alasan untuk menggabungkan branch lama langsung ke `main`; lihat [audit paritas](../05_ARCHITECTURE/PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md).
- Source `main` berisi 140 berkas migrasi. Bukti VQE 140/140 terakhir adalah 8 November dan belum diulang pada 11 November. Di Production, `save_tenant_system_settings` yang terpasang tidak memuat `PT409`.
- Preflight baca-saja Production 11 November mengonfirmasi 47 ledger, 45 kecocokan nama/SQL, 2 payload kosong, 93 versi source belum tercatat, dan 119/119 tabel public ber-RLS + FORCE RLS. Tidak ada perubahan Production. Backup/restore dan rehearsal tetap pekerjaan tim backend. Lihat [rekonsiliasi 11 November](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-11.md).
- CI menggunakan Supabase lokal dan data sintetis. Login Admin/Wali di browser, semua CRUD/relasi UI, deployment clean-install ke VPS/on-premise, serta UAT hosting belum terbukti. Backup/restore lokal CI bukan backup/restore Production.
- Batas rilis awal tetap: PPOB/payment gateway tidak termasuk; Peer Review Tahfidz hanya teks dan dimoderasi Ustadz. Aplikasi berjalan sebagai container yang memakai Supabase eksternal; paket tidak membundel seluruh layanan Supabase. Harga, SLA, dukungan, dan ketentuan lisensi juga belum ditetapkan.
## Gerbang rilis komersial

### 1. Skema, relasi, dan transaksi

- Tim backend dapat menjalankan `npm run preflight:db-migrations` dari root source `main` untuk membandingkan versi, nama, dan statement migration dengan koneksi PostgreSQL read-only. Pastikan hostname menunjuk ke project target; jangan membagikan URL atau secret. Jika ada `HENTIKAN` atau mismatch, selesaikan rekonsiliasi sebelum rehearsal.
- Untuk Production, rekonsiliasi ledger dan schema PTSAS secara terpisah. Preflight 11 November menunjukkan 47 versi ledger dan dua entri tanpa metadata, sedangkan source `fd937f4` memiliki 140 migration. Selisih hitungan bukan instruksi untuk menerapkan migration atau mengubah ledger. Jangan tandai versi sebagai applied tanpa bukti schema.
- Sebelum penerapan, simpan backup yang dapat dipulihkan dan rehearsalkan seluruh urutan migration pada salinan/environment staging.
- Verifikasi signature dan definisi function, constraint, index, RLS, Storage policy, dan Data API grant terhadap source commit yang akan dirilis.
- Uji transaksi kritis: NIS unik bersamaan, onboarding PPDB-ke-santri, assignment kamar, pembayaran/jurnal, stok/dompet koperasi, buku dan peminjaman, sesi/setoran Tahfidz, serta idempotensi retry.
- Isi tenant baru melalui form dan workflow ERP. Tidak ada prasyarat salin data dari Firestore.

**Selesai jika:** source migration yang diuji sama dengan source release, tidak ada drift yang tidak dijelaskan, dan alur kritis berhasil pada fixture sintetis serta UAT staging.

### 2. Identitas dan keamanan

- Uji undangan Admin pertama, login, perubahan kata sandi awal, recovery, aktivasi Wali, pemetaan Wali–Santri, role, permission modul, tenant aktif, dan penghentian akses.
- Pastikan pengguna satu tenant tidak dapat membaca atau mengubah tenant lain, termasuk lewat endpoint server dan Storage.
- Rotasi secret Supabase dan password database yang pernah dibagikan melalui chat sebelum go-live. Buat key PII per instalasi, simpan di secret manager, dan uji bahwa pemulihan kunci cocok dengan backup terenkripsi.
- Uji rate limit, audit trail, session expiry/revocation, header proxy, upload MIME/ukuran, dan penolakan akses langsung ke bucket privat.
- Jangan mengirim service-role/secret key ke browser, bundle, log, atau repository.

**Selesai jika:** matriks role × tenant lulus pada staging dan seluruh secret production dibuat/dirotasi serta dicatat oleh operator, tanpa menaruh nilainya di dokumen ini.

### 3. Paket instalasi dan portabilitas

- Verifikasi image dengan versi tetap pada Linux VM/VPS bersih dan satu VM/on-premise yang mewakili calon pelanggan.
- Pastikan URL Supabase dapat dijangkau dari browser pengguna dan container server; TLS, DNS, reverse proxy, port, persistent volume, Storage, SMTP, dan secret dikonfigurasi per instalasi.
- Buktikan image yang sama dapat dipindahkan antarenvironment dengan konfigurasi runtime; jangan mengandalkan akun AI Studio, GitHub Actions, atau project Supabase milik pembuat.
- Simulasikan upgrade dan pemulihan database **serta Storage** ke host kedua dengan kunci dan konfigurasi tujuan yang benar.
- Tentukan dukungan arsitektur CPU, versi Docker/Linux, ukuran resource, akses internet keluar, dan provider Supabase yang secara eksplisit diuji.

**Selesai jika:** operator dapat install, upgrade, dan restore sesuai runbook di dua environment target tanpa kehilangan file atau relasi.

### 4. Operasi dan tanggung jawab layanan

Sebelum menjual layanan, tetapkan secara tertulis:

- siapa mengelola OS, patch keamanan, Docker, database, Storage, SMTP, domain/TLS, backup, monitoring, incident response, dan biaya infrastruktur;
- kebijakan backup/retensi/enkripsi, lokasi backup, pemilik kunci, restore drill, target RPO/RTO, dan jalur eskalasi;
- proses upgrade, compatibility window, release notes, rollback/forward-fix, masa pemeliharaan versi, serta dukungan saat pelanggan menolak update;
- kepemilikan/ekspor/penghapusan data dan prosedur serah-terima ketika kontrak berakhir.

Jangan menjanjikan SLA ketersediaan pada instalasi yang dikelola pelanggan jika tim tidak mengelola monitoring, backup, patch, dan on-call yang diperlukan SLA itu.

### 5. Pilot dan penawaran

- Jalankan pilot pada pesantren yang mewakili ukuran dan kesiapan IT yang ditargetkan.
- Ukur onboarding, waktu penyelesaian alur harian, error, kebutuhan bantuan, restore, kapasitas, dan biaya support.
- Simulasikan volume serta konkurensi berdasarkan data calon pelanggan; tetapkan batas skala setelah hasil beban dan pemantauan tersedia.
- Putuskan lisensi, harga, jumlah instalasi, biaya instalasi/pelatihan, masa update, support, perubahan khusus, garansi, dan tanggung jawab insiden.
- Siapkan demo sintetis dan materi penawaran yang tidak memuat data pribadi maupun klaim kemampuan yang belum dibuktikan.

**Selesai jika:** pilot dapat dioperasikan dan dipulihkan; biaya dan kebutuhan dukungan diketahui; model lisensi/support disetujui; serta klaim penawaran cocok dengan kemampuan yang diterima pada pilot.

## Urutan kerja yang disarankan

1. VQE `vqemuyzveuirlkvdggjd` adalah staging terisolasi; pemeriksaan terakhir menunjukkan 139 migration sampai `20270307000000`. Lanjutkan UAT browser dengan fixture sintetis dan verifikasi alur role/tenant serta simpan-baca modul. PTSAS `ptsasgdvgrbdtgyqieie` tetap Production dan tidak disentuh.
2. Untuk Production, baca ulang ledger dan katalog secara terpisah melalui akses yang disetujui, rekonsiliasi dua entri ledger tanpa metadata, lalu rancang rehearsal yang dapat dipulihkan. Jangan jalankan migration Production hanya untuk menyamakan hitungan.
3. Jalankan UAT Auth, role/tenant, modul kritis, Storage, dan error recovery pada staging.
4. Lakukan clean install, upgrade, dan pemindahan host pada VPS Linux serta VM on-premise representatif.
5. Selesaikan rotasi secret, operasi/support, lisensi, pilot, dan sizing beban.
6. PR #13 sudah merged sebagai baseline source. Tim penerapan menjalankan rehearsal target, deployment, dan UAT; versi rilis/penjualan tetap menunggu seluruh gerbang di atas lulus.

## Perkiraan checkpoint

Checkpoint terukur: VQE ledger **139 migration hingga `20270307000000`**; CI **3/3 job** pada kandidat PR #86. Persentase keseluruhan fitur belum dapat dihitung dengan bukti yang tersedia. UAT browser, validasi instalasi pelanggan, dan rekonsiliasi Production masih terbuka.



## Addendum verifikasi terbaru — 31 Oktober 2026

Catatan di atas yang menyebut VQE 110/110 dan mencatat konfigurasi Production berasal dari snapshot sebelumnya. Kondisi dan batas bukti setelah pemeriksaan terbaru:

- PR #38 tetap terbuka dalam status Draft. Source `main` pada base PR memiliki 110 migrasi sampai `20270207000000`; VQE staging memiliki 112 sampai `20270209000000`, sehingga staging memuat dua migrasi PR #38 yang belum ada di `main`.
- Integrasi GitHub VQE telah diputus. Label dashboard `main / PRODUCTION` masih tampil dan tidak menunjukkan kesiapan cutover.
- Upaya baca-saja terbaru ke PTSAS untuk metadata proyek, ledger migration, dan daftar tabel ditolak oleh konektor. Maka angka dan konfigurasi PTSAS di snapshot terdahulu tetap historis; status live skema/ledger dan deployment Production belum terverifikasi ulang. Tidak ada perubahan pada PTSAS.
- CI PR #38 run [41162313076](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41162313076) lulus 2/2 job, dengan Supabase Preview dilewati. VQE masih tidak memiliki fixture Auth/tenant/PPDB; UAT Wali dan isolasi tenant belum dilakukan.
- Untuk **cakupan PR #38 saja**, implementasi, CI, dan penerapan/review skema staging sudah lulus; UAT adalah satu gerbang tersisa (3 dari 4, sekitar 75%). Ini bukan persentase penyelesaian keseluruhan ERP atau kesiapan komersial.


## Addendum status terbaru — 31 Oktober 2026

Addendum ini menggantikan angka dan status staging/PR pada addendum sebelumnya.

- PR #38 masih Draft/Open. `main` pada base PR (`e9e65e3e8b9d05d126a6150ce726f720722839c5`) memiliki 110 migration sampai `20270207000000`; PR #38 menambahkan lima migration. VQE staging mencatat 115 sampai `20270212000000`.
- CI terbaru [run 41167881103](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41167881103) lulus 2/2 job pada head branch terkini `9e939d87b3285dd1cb92e34974b7010545158a20`. Cakupan termasuk build/Docker/Compose, rehearsal migration, pgTAP, API auth/tenant, Storage, dan backup/restore. Skrip inventaris PTSAS hanya SELECT metadata; query-querynya telah divalidasi pada VQE staging dan belum dijalankan pada PTSAS Production.
- Integrasi GitHub VQE sudah terputus. Label dashboard `main / PRODUCTION` tetap label internal Supabase; VQE tetap dipakai sebagai staging sesuai keputusan pemilik.
- UAT UI Wali PPDB (login, akses tagihan kandidat, unggah bukti, onboarding, dan isolasi tenant) belum dilakukan. Staging tidak memiliki fixture tenant/Auth/kandidat/tagihan persisten; pembuatan fixture masih menunggu persetujuan. CI dan pgTAP tidak menggantikan UAT UI.
- Konektor saat ini menolak baca PTSAS Production. Snapshot ledger/katalog lama harus dianggap historis sampai tim backend/operator menjalankan [inventaris baca-saja](../06_DATABASE/PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION.sql) pada ref yang benar. Auto-deploy Production tetap harus OFF sampai rekonsiliasi dan backup dipulihkan.
- **Progres checkpoint PR #38: 75% (3 dari 4 gerbang internal: implementasi, CI, dan penerapan skema staging selesai; UAT UI tersisa).** Angka ini hanya untuk patch PR #38, bukan keseluruhan ERP, kesiapan komersial, atau kelayakan deployment.
- Tim backend dapat mulai review PR #38 dan menyiapkan jadwal UAT. Jangan merge PR atau menerapkan migration ke PTSAS sebelum UAT dan rekonsiliasi Production selesai.

## Addendum verifikasi staging dan gerbang UAT — 31 Oktober 2026

Bagian ini menggantikan status UAT/CI lama di addendum sebelumnya. Catatan historis lain tetap berlaku bila tidak bertentangan.

- **PR #38 tetap Draft/Open.** Source code pada commit `2ba3cdb362aba2a6fa8eaafdd60c5142ea0814f7` lulus CI [run 41168200484](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41168200484), 2/2 job. Head PR sesudahnya berisi pembaruan dokumentasi; jangan menganggap UAT UI sudah lulus.
- **VQE staging** aktif sehat dengan 115 migration sampai `20270212000000`. Inventaris langsung saat checkpoint ini menunjukkan 161 tabel `public`, semuanya RLS aktif, dan tidak ada baris operasional pada tabel-tabel tersebut.
- Fixture sintetis tenant, akun Auth, profil Wali, kandidat, tagihan, relasi, request, dan objek Storage pernah dibuat untuk UAT atas persetujuan pemilik, lalu dihapus atas persetujuan pemilik. Tidak ada fixture atau akun Wali UAT yang persisten sekarang; pernyataan sebelumnya bahwa pembuatan fixture masih menunggu persetujuan sudah tidak berlaku.
- Source frontend PR lulus guard Supabase-only pada 92 modul; 26 route Supabase aktif dan 26 route migrasi lama tertutup. Guard konfigurasi deployment juga lulus (30 nilai runtime publik, 37 gerbang server fail-closed); guard schema API internal lulus. Firebase masih tercantum dalam source legacy/devDependency, tetapi tidak berada dalam import graph runtime aktif yang diuji.
- Supabase Advisor melaporkan 156 temuan INFO `rls_enabled_no_policy` pada tabel backend-only. Ini perlu tetap dicocokkan dengan grant API dalam review backend/Production; tidak ada perubahan pada PTSAS Production dalam UAT ini.
- Preview lokal `http://localhost:4179` berhasil memuat aplikasi dan hanya menerima URL serta publishable key VQE. Worktree tidak memiliki `SUPABASE_SECRET_KEY` VQE atau `PUBLIC_PPDB_TENANT_ID`; karena itu login melalui aplikasi, tagihan Wali, upload endpoint, onboarding, dan isolasi tenant melalui antarmuka belum teruji.
- Tim backend perlu menyediakan konfigurasi VQE khusus melalui secret manager atau `.env` lokal yang diabaikan Git. Jangan memakai konfigurasi PTSAS Production. Variabel PII harus berupa dua kunci independen yang dibuat dari nilai acak 32 byte (64 karakter hex), disimpan server-side, dan tidak dikirim melalui chat atau dimasukkan ke bundle.
- Setelah konfigurasi VQE tersedia, buat ulang fixture sintetis untuk UAT UI, jalankan login/tagihan/unggah/onboarding/isolasi tenant, lalu hapus fixture dan verifikasi jumlahnya kembali nol. PTSAS tetap tidak disentuh.

**Progress checkpoint PR #38 tetap 75% (3/4 gerbang internal);** angka ini hanya cakupan PR, bukan persentase keseluruhan ERP atau kesiapan komersial. UAT UI, rekonsiliasi Production, rotasi secret Production, dan clean-install/upgrade/restore di environment pelanggan masih terbuka.


## Addendum kesiapan Auth dan callback — 31 Oktober 2026

- Kode server recovery Admin kini meneruskan `PUBLIC_APP_URL` ke Supabase Auth. Regression test `test:auth-recovery-redirect` lulus lokal dan terdaftar di CI.
- GitHub Actions [run 41175465787](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41175465787) lulus 2/2 job pada PR head dokumentasi terbaru `4cb142edfd7e18563c49f8396b0388b9ee551738`; source code yang diuji mencakup perubahan recovery redirect pada `ed8d536ba3c7f638be357db9c2f7164435af88c3`.
- Pemeriksaan dashboard Auth Production menunjukkan Site URL `http://localhost:3000` dan belum ada Redirect URLs. Akun Admin sudah berstatus **Confirmed** dan terakhir masuk pada 31 Oktober 2026 pukul 12.19. Verifikasi email berhasil; browser gagal membuka tujuan localhost karena aplikasi tidak tersedia pada origin/port itu.
- URL Auth Production belum diubah. Sebelum email Auth dikirim kepada pengguna produksi, operator harus menetapkan domain HTTPS hosting dan menambahkan hanya redirect aplikasi yang tepat. Jangan memakai nilai localhost sebagai URL pelanggan.
- UAT UI Wali pada VQE tetap belum terbukti karena konfigurasi secret server dan tenant UAT belum tersedia. PR #38 tetap Draft/Open dengan progress khusus PR **75%** (implementasi, CI, dan skema staging lulus; UAT UI tersisa). Persentase keseluruhan ERP belum dihitung.


## Addendum pemeriksaan menu, transfer data, dan runtime — 31 Oktober 2026

Addendum ini mencatat bukti setelah perubahan paritas menu dan CSV pada PR #39. Nilai di bawah hanya menggambarkan checkout/branch dan project staging yang disebut; bukan status Production atau seluruh ERP.

- PR #39 Draft/Open, tiga commit, head `ba71a3018375330c12bd39c76d994501c10c9258`, ditumpuk di atas head PR #38. Perubahan belum masuk `main`.
- Audit source memetakan 26 modul ke menu dan route Supabase. Pada Data Induk, tab yang dulu disembunyikan karena belum punya kontrak Supabase penuh kini ditandai dan diarahkan ke modul terkait; Pemesanan Fasilitas serta Peta Struktur ditampilkan lagi pada runtime Supabase. Jejak Audit belum memiliki sumber tenant Supabase yang setara. Ini belum membuktikan kesetaraan seluruh formulir lama.
- Profil Admin aktif yang dibaca di VQE memiliki `module_permissions = {}`; pada kebijakan kode saat ini, ini menggunakan izin dasar role Admin tenant dan bukan deny override per modul. Jadi, untuk profil tersebut, tab Data Induk yang tidak muncul sebelumnya berasal dari pembatasan runtime tab, bukan daftar izin eksplisit. Pengaturan global tetap khusus SuperAdmin.
- Guard runtime Supabase-only lulus untuk 96 modul yang dicapai dari `src/main.tsx` dan mengonfirmasi 26 route Supabase serta penutupan 26 route migrasi lama. Kode Firebase lama masih ada di file legacy/dev dependency, tetapi tidak masuk graph frontend aktif; Firebase bukan runtime dependency produksi.
- VQE ledger kini berisi 116 migration, termasuk `20261031104213_master_data_import_create_only`, versi yang dicatat saat migration PR #39 diterapkan. RPC tersebut hanya bisa dipanggil `service_role`; `anon` dan `authenticated` ditolak. Uji transaksi create/duplicate menghasilkan `created` lalu `already_exists`, kemudian rollback; jumlah record struktur kembali 0.
- `npm run lint`, `npm run build`, `npm run test:master-data-transfer-csv`, `npm run test:migration-preflight`, `npm run test:supabase-runtime-no-firebase`, pemeriksaan RBAC, pagination, dan no-browser-drafts lulus secara lokal. Supabase Preview CI dilewati dan GitHub Actions belum melaporkan run untuk head PR #39.
- UAT browser untuk login, impor/ekspor, role/tenant, dan keterkaitan lintas modul belum berjalan. Preview lokal belum dibuktikan menunjuk ke VQE dan tidak boleh dianggap aman untuk tulis. Konfigurasi server khusus VQE, tenant UAT, dan dua kunci PII server-side perlu dipastikan oleh tim backend sebelum UAT.
- **PR #39 sekitar 75% pada lingkup patch ini**: implementasi, pemeriksaan lokal, dan pemeriksaan RPC staging selesai; UAT browser, Supabase Preview/CI, dan tinjauan backend masih menunggu. Persentase ini bukan progres keseluruhan ERP atau kesiapan go-live.
- PTSAS Production tidak disentuh. Rekonsiliasi ledger/schema Production, rotasi secret, backup/restore, clean install VPS/on-premise, UAT pelanggan, dan penerimaan komersial tetap terbuka.

## Addendum tindak lanjut menu yang hilang — 31 Oktober 2026

- Pada mode runtime Supabase, seluruh lima tab Data Induk dan kategori lama kini tetap terlihat. Santri, Gedung, Kamar, Kelas, Peta Struktur, dan Pemesanan Fasilitas memakai tampilan yang memiliki sumber Supabase. Wali Santri, Guru/Asatidz, Pegawai, Alumni, Kurikulum/Mata Pelajaran, Yayasan/Kampus, dan Halaqah memberi tautan ke modul pemilik datanya.
- Jejak Audit sekarang menampilkan status belum tersedia karena belum ada sumber API tenant Supabase. Data contoh/lokal tidak ditampilkan sebagai log operasional. Aksi tambah dan Scan QR disembunyikan pada kategori yang hanya mengarahkan ke modul lain; tautan modul tetap mematuhi izin akun.
- Daftar izin Admin yang secara eksplisit ditolak dibuka pada Sidebar agar menu tersembunyi dapat diketahui. Aturan RBAC tidak dilonggarkan.
- Pemeriksaan paritas sekarang memeriksa bahwa setiap rute modul memiliki tujuan navigasi Sidebar, termasuk Analitik. `npm run lint`, build, `npm run test:supabase-runtime-no-firebase`, `npm run test:rbac-permissions`, dan `npm run test:master-data-transfer-csv` lulus. Build masih memberi peringatan ukuran chunk besar dan komentar dependensi yang diabaikan Rollup.
- Ini memulihkan visibilitas dan jalur navigasi; bukan klaim bahwa seluruh kemampuan legacy sudah memiliki kesetaraan backend. UAT browser VQE dan tinjauan backend masih diperlukan. PR #39 tetap Draft sampai gerbang tersebut selesai; Production PTSAS tidak disentuh.


## Addendum rekonsiliasi staging dan Production — 23 November 2026

Bagian ini menggantikan angka ledger, katalog, dan status PR terdahulu jika berbeda. Pemeriksaan Supabase dilakukan baca-saja; tidak ada isi record aplikasi yang dibaca dan tidak ada perubahan database.

### Status source dan ledger

- Source of truth adalah branch `main`, commit `59bca548995862922527140b93695181752fde04`. Pemeriksaan GitHub menemukan **0 PR terbuka**.
- Repo berisi **167 file migrasi SQL** dan VQE staging mencatat **167 versi**. Nomor versi source dan ledger VQE cocok seluruhnya.
- PTSAS Production mencatat **100 versi**, terbaru `20270316000000` (`communication_ops_runtime`). Ada **67 versi** yang sudah ada di source/VQE tetapi belum tercatat di Production; tidak ditemukan versi Production yang tidak ada di VQE/source.
- Tiga baris ledger Production tidak mengembalikan nama: `20261205000000`, `20261206000000`, dan `20270118000000`. VQE mencatat nama untuk ketiga versi tersebut.
- Selisih ledger adalah bukti Production tertinggal dari source/staging, bukan izin untuk menerapkan migrasi. Tidak ada migration, repair, atau perubahan data Production yang dijalankan.

### Perbandingan katalog schema `public`

- VQE: **182 tabel**; PTSAS: **162 tabel**. Semua tabel yang terdaftar pada kedua project mengaktifkan RLS.
- **162 tabel** ada di kedua project; **20 tabel** hanya ada di VQE; tidak ada tabel yang hanya ada di PTSAS.
- Pada 162 tabel bersama, **20 tabel** berbeda pada metadata kolom atau foreign key. Pemeriksaan ini tidak membandingkan seluruh definisi DDL, policy RLS, grant, indeks, trigger, fungsi, Storage, atau perilaku aplikasi.

Hasil ini belum membuktikan backup Production dapat dipulihkan, seluruh policy/route aman, atau cutover layak dilakukan. Tim database perlu meninjau DDL aktual dan menjalankan rehearsal pemulihan sebelum cutover Production.

### Flag runtime Hostinger staging

- Operator melaporkan 11 flag server untuk PPDB, Keuangan, UKS, Koperasi, Multi-Unit, HRIS, Pemesanan Fasilitas, Aset GA, Donasi, dan Marketplace tidak terlihat pada Environment Variables hPanel. Pada `.env.example`, nilai contoh flag tersebut `false`.
- Karena sesi computer-use gagal dimulai, keberadaan dan nilainya di hPanel belum dapat diverifikasi. Tidak ada flag yang diubah. Nilai default `false` menjaga API modul tetap tertutup; tampilan “Fitur ini belum tersedia saat ini” konsisten dengan gate yang belum aktif.
- Flag harus diaktifkan **satu kelompok pada satu waktu** di staging setelah prasyarat migrasi, tenant/profil, role, RLS, Storage (bila dipakai), dan UAT kelompok itu siap. Jangan mengaktifkan seluruh flag sekaligus atau menyalinnya ke Production.

### Tindakan lanjutan

1. Selesaikan UAT staging per modul dan catat bukti baca/tulis, izin role, isolasi tenant, validasi, serta alur gagal.
2. Tim database meninjau 67 migrasi yang tertinggal, tiga nama ledger kosong, perbedaan katalog, DDL aktual, dan bukti backup/restore. Jangan menjalankan `db push` atau migration repair massal ke PTSAS.
3. Setelah semua gerbang Production disetujui pemilik database, rencanakan cutover terpisah dari aktivasi flag aplikasi. Production tetap tidak berubah pada pemeriksaan ini.
