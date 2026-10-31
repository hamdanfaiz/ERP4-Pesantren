# Kesiapan Komersial dan Go-Live — ERP4 Pesantren

**Status:** dokumen penerimaan internal. Dokumen ini tidak menyatakan produk siap dijual atau siap produksi.
**Diperbarui:** 31 Oktober 2026
**Jalur rilis utama:** PR #13, self-hosted, satu instalasi per pesantren.

## Kontrak produk

ERP4 Pesantren ditujukan sebagai software yang dipasang dan dioperasikan untuk pesantren, bukan SaaS multi-pelanggan yang dikelola vendor. Asumsi rilis awal adalah satu instalasi untuk satu pesantren. Backend, Auth, database, Storage, domain, secret, dan backup menjadi milik/lingkup instalasi tersebut.

Kolom `tenant_id` tetap menjadi batas data dan otorisasi di dalam instalasi. Keberadaannya tidak berarti semua pesantren akan ditempatkan pada satu database vendor. Dukungan beberapa pesantren dalam satu instalasi harus menjadi keputusan produk tersendiri.

**Batas rilis awal:** atas keputusan pemilik, PPOB, Layanan ekosistem, dan integrasi payment gateway dikeluarkan sementara. Provider belum dipilih dan tidak ada koneksi provider yang ditawarkan pada rilis awal. Modul disembunyikan dari navigasi dan tidak bisa dibuka melalui permission yang tersimpan sebelumnya. Finance tetap mendukung pencatatan serta verifikasi pembayaran manual; settlement otomatis belum termasuk.

Paket Docker ERP berkomunikasi dengan endpoint Supabase yang disediakan operator. Paket ini **belum membundel atau mengoperasikan seluruh layanan Supabase**. VPS dan on-premise berarti jalur deployment yang dituju, bukan bukti bahwa clean install di semua jenis server telah berhasil.

Pendapatan yang mungkin ditawarkan mencakup lisensi, jasa instalasi, migrasi yang disetujui pelanggan, pelatihan, pemeliharaan, dan dukungan. Harga, bentuk lisensi, periode update, SLA, dan cakupan support belum ditetapkan. Jangan menjanjikan layanan SaaS, operasi offline penuh, native Windows Server, Kubernetes, atau skala tertentu sebelum dirancang dan diuji.

## Status teknis berdasarkan bukti

- Source cutover PR #13 tetap menjadi baseline. PR #17 kini juga merged ke `main` pada merge commit `3e752f8d6c1961130b9baa108736c51ffc702eb7`. Jalur Firestore server dan Firebase Admin sudah dihapus; Firebase client SDK masih ada untuk source lama yang tidak aktif, tetapi guard CI memastikan runtime frontend aktif tidak memuat Firebase.
- CI PR #17 lulus pada [run 41136728382](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41136728382), 2/2 job, pada Supabase lokal sintetis. Tidak ada migration/schema/record yang diterapkan ke Supabase Production atau data dummy Firestore yang disalin; PPOB/payment gateway dikecualikan dari rilis awal.
- GitHub Actions [run 41051400486](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41051400486) lulus **2/2 job** pada head source PR #13 `e449c234c253eb7a65795af18c5794fa45e6e9cb`. Cakupan meliputi typecheck/build, penguncian PPOB di RBAC, Docker/Compose, Supabase lokal sintetis, rehearsal migration, pgTAP, API/tenant, transaksi serentak, Storage, dan backup/restore. Ini bukan UAT pelanggan atau bukti perubahan database live.
- PR #36 sudah merged pada commit `edd5385fee4d10db64681de9cc08ee757130eb78`. VQE staging mencatat seluruh 110 migration source tanpa versi hilang/ekstra. PTSAS tetap Production dengan auto-deploy OFF; snapshot historisnya mencatat 47 versi ledger, tetapi belum direkonsiliasi ulang terhadap source 110 migration. Tidak ada deployment Production.
- Verifikasi staging VQE setelah PR #36: 160/160 tabel memiliki RLS dan FORCE RLS; 159 tabel tenant-scoped (root `tenants` dikecualikan); 5 policy publik, tidak ada grant langsung ke `anon` atau grant tulis langsung bagi `authenticated`; 4 bucket privat. Ini inventaris staging, bukan bukti katalog PTSAS setara.
- Runtime feature flags sengaja mati secara default sampai migration, provisioning tenant, Auth, role/permission, dan UAT masing-masing modul lulus.
- Guard source memeriksa 26 route Supabase. PPOB/Layanan Ekosistem tidak memiliki tipe modul atau route pada rilis awal, dan layar simulasi lamanya sudah dihapus; permission lama untuk modul itu tetap ditolak oleh RBAC. Layar Multi-Unit dan Anggaran tersedia, tetapi API-nya tetap terkunci feature flag server yang default-nya `false`; Analitik memakai ringkasan Supabase berbasis aturan. Pemetaan route tidak membuktikan alur live siap dipakai.
- Tagihan PPDB dapat dibuat Admin pada record calon santri dan ditautkan ke santri saat onboarding. Admin dapat mencatat pelunasan manual sebelum onboarding; unggah bukti mandiri oleh Wali baru tersedia setelah akun Wali terhubung dengan santri aktif. Jika pembayaran mandiri Wali sebelum onboarding dibutuhkan, itu masih perlu dirancang dan diuji.
- Docker/Compose dan smoke test tersedia pada branch cutover. Belum ada bukti instalasi baru dari server kosong milik pelanggan, upgrade/restore di VPS/on-premise, atau uji beban berskala pesantren besar.

Snapshot teknis ini bukan pengganti audit endpoint, pemeriksaan definisi seluruh function di staging, uji lintas tenant secara live, dan penerimaan pengguna.

## Gerbang rilis komersial

### 1. Skema, relasi, dan transaksi

- Tim backend dapat menjalankan `npm run preflight:db-migrations` dari root source `main` untuk membandingkan versi, nama, dan statement migration dengan koneksi PostgreSQL read-only. Pastikan hostname menunjuk ke project target; jangan membagikan URL atau secret. Jika ada `HENTIKAN` atau mismatch, selesaikan rekonsiliasi sebelum rehearsal.
- Untuk Production, rekonsiliasi ledger dan schema PTSAS secara terpisah. Snapshot sebelumnya menunjukkan 47 versi ledger dan dua entri tanpa metadata, sedangkan source saat ini memiliki 110 migration. Selisih hitungan bukan instruksi untuk menerapkan migration atau mengubah ledger. Jangan tandai versi sebagai applied tanpa bukti schema.
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

1. VQE `vqemuyzveuirlkvdggjd` kini tersedia sebagai staging terisolasi dengan seluruh 110 migration diterapkan. Tim backend dapat memulai provisioning tenant dan akun sintetis, login/UAT, pengujian role/tenant dan alur operasional di sana. PTSAS `ptsasgdvgrbdtgyqieie` tetap Production dengan auto-deploy OFF.
2. Untuk Production, baca ulang ledger dan katalog secara terpisah melalui akses yang disetujui, rekonsiliasi dua entri ledger tanpa metadata, lalu rancang rehearsal yang dapat dipulihkan. Jangan jalankan migration Production hanya untuk menyamakan hitungan.
3. Jalankan UAT Auth, role/tenant, modul kritis, Storage, dan error recovery pada staging.
4. Lakukan clean install, upgrade, dan pemindahan host pada VPS Linux serta VM on-premise representatif.
5. Selesaikan rotasi secret, operasi/support, lisensi, pilot, dan sizing beban.
6. PR #13 sudah merged sebagai baseline source. Tim penerapan menjalankan rehearsal target, deployment, dan UAT; versi rilis/penjualan tetap menunggu seluruh gerbang di atas lulus.

## Perkiraan checkpoint

Checkpoint terukur: deployment skema staging **110/110 migration (100%)**. Persentase keseluruhan penyelesaian fitur belum dihitung ulang pada checkpoint ini; UAT, provisioning, validasi instalasi pelanggan, dan rekonsiliasi Production masih terbuka.



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

