# Kesiapan Komersial dan Go-Live — ERP4 Pesantren

> **Status otoritatif — 8 November 2026, 23:56 WIB.** `main` berada pada merge commit PR #90 `fd937f4876aa1069500694b9bc20ec70eef8ee14`. PR #91 tetap **Open/Draft** pada head `f50b8a7f900bbce541c4935ae2ef6028f916c1aa`. CI [run #1419](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42501493603) lulus 3/3: migrasi/API/pgTAP, frontend build/runtime guard, instalasi NPM pelanggan. Supabase Preview dilewati karena PR tidak memakai Supabase Branch.
>
> Pemeriksaan lokal `npm run lint`, `npm run build`, `npm run test:supabase-runtime-no-firebase`, dan `npm run test:rbac-permissions` lulus. CI #1417 sempat menangkap berkas rusak pada proses transfer; koreksi sudah ada di branch dan keempat file terkait cocok dengan sumber lokal. Build menampilkan peringatan chunk PDF besar dan anotasi dependency Zod.
>
> Source PR memakai komponen tab bersama. Dokumen Digital dan Tahfidz memakai `ERPTabs` dengan CSS gulir horizontal; tampilan browser yang cocok dengan head terbaru dan viewport ponsel belum diuji.
>
> Pemeriksaan baca-saja staging VQE sebelumnya menemukan kecocokan 140/140 versi dan nama migration; ini bukan bukti kesamaan seluruh DDL. Konektor sesi ini masih menolak pembacaan PTSAS Production. Tidak ada perubahan Production.
>
> **Produk belum dinyatakan siap deploy atau komersial.** UAT visual/responsif source-match, CRUD UI seluruh modul dan matriks role/tenant, verifikasi DDL/urutan migration serta backup/restore oleh tim backend, dan clean install/upgrade/restore pada VPS/on-premise masih terbuka. Gunakan [checkpoint pengujian terkini](CHECKPOINT_2026-11-08_CI_AND_STAGING.md) dan [handoff backend](BACKEND_TEAM_START_HERE.md).

> Catatan checkpoint berikut adalah arsip historis; status otoritatif ada di atas.

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
**Diperbarui:** 8 November 2026
**Jalur rilis utama:** PR #13, self-hosted, satu instalasi per pesantren.

## Kontrak produk

ERP4 Pesantren ditujukan sebagai software yang dipasang dan dioperasikan untuk pesantren, bukan SaaS multi-pelanggan yang dikelola vendor. Asumsi rilis awal adalah satu instalasi untuk satu pesantren. Backend, Auth, database, Storage, domain, secret, dan backup menjadi milik/lingkup instalasi tersebut.

Kolom `tenant_id` tetap menjadi batas data dan otorisasi di dalam instalasi. Keberadaannya tidak berarti semua pesantren akan ditempatkan pada satu database vendor. Dukungan beberapa pesantren dalam satu instalasi harus menjadi keputusan produk tersendiri.

**Batas rilis awal:** atas keputusan pemilik, PPOB, Layanan ekosistem, dan integrasi payment gateway dikeluarkan sementara. Provider belum dipilih dan tidak ada koneksi provider yang ditawarkan pada rilis awal. Modul disembunyikan dari navigasi dan tidak bisa dibuka melalui permission yang tersimpan sebelumnya. Finance tetap mendukung pencatatan serta verifikasi pembayaran manual; settlement otomatis belum termasuk.

Paket Docker ERP berkomunikasi dengan endpoint Supabase yang disediakan operator. Paket ini **belum membundel atau mengoperasikan seluruh layanan Supabase**. VPS dan on-premise berarti jalur deployment yang dituju, bukan bukti bahwa clean install di semua jenis server telah berhasil.

Pendapatan yang mungkin ditawarkan mencakup lisensi, jasa instalasi, migrasi yang disetujui pelanggan, pelatihan, pemeliharaan, dan dukungan. Harga, bentuk lisensi, periode update, SLA, dan cakupan support belum ditetapkan. Jangan menjanjikan layanan SaaS, operasi offline penuh, native Windows Server, Kubernetes, atau skala tertentu sebelum dirancang dan diuji.

## Status teknis berdasarkan bukti

- Runtime utama menggunakan Supabase; guard CI memastikan Firebase tidak masuk ke graph frontend aktif. Pada kandidat PR #86, build/runtime Docker, instalasi NPM, migrasi/API/pgTAP lulus di [CI #42459060708](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42459060708). PR itu kemudian di-squash merge menjadi `c219bbb`; belum ada run terpisah pasca-merge yang ditemukan.
- CI menguji round-trip API sintetis untuk Akademik, CBT, LMS, HRIS, Koperasi, CRM, komunikasi, Laundry, Donasi/Wakaf, Dokumen, Kesehatan, Tahfidz, Perpustakaan, fasilitas, dan Urusan Umum; juga NIS/asrama bersamaan, PPDB, Finance/Storage, serta backup/restore lokal satu record sintetis. Guard memastikan seluruh 55 skrip test package dijadwalkan. Ini cakupan otomatis terpilih, bukan UAT semua form, alur, dan tombol di browser.
- PR #1–#11 ditutup tanpa merge karena implementasi utamanya digantikan source yang lebih baru. Tidak ada alasan untuk menggabungkan branch lama langsung ke `main`; lihat [audit paritas](../05_ARCHITECTURE/PR1_TO_PR11_PARITY_AUDIT_2026-10-30.md).
- Source `main` berisi 139 berkas migrasi; VQE staging saat ini mencatat 139 versi sampai `20270307000000`. Pembacaan `pg_get_functiondef` mengonfirmasi fungsi pengaturan mengeluarkan `PT409` untuk versi basi. Ledger dan satu fungsi ini tidak membuktikan kesesuaian semua definisi DDL.
- Akses konektor Production saat ini ditolak. Snapshot operator terdahulu menyebut 47 ledger entries dan 119 tabel public ber-RLS + FORCE RLS, tetapi DDL terkini dan urutan migrasi belum direkonsiliasi dengan 139 berkas source. Tidak ada perubahan Production; rekonsiliasi dan backup/restore tetap pekerjaan tim backend.
- CI menggunakan Supabase lokal dan data sintetis. Login Admin/Wali di browser, semua CRUD/relasi UI, deployment clean-install ke VPS/on-premise, serta UAT hosting belum terbukti. Backup/restore lokal CI bukan backup/restore Production.
- Batas rilis awal tetap: PPOB/payment gateway tidak termasuk; Peer Review Tahfidz hanya teks dan dimoderasi Ustadz. Aplikasi berjalan sebagai container yang memakai Supabase eksternal; paket tidak membundel seluruh layanan Supabase. Harga, SLA, dukungan, dan ketentuan lisensi juga belum ditetapkan.
## Gerbang rilis komersial

### 1. Skema, relasi, dan transaksi

- Tim backend dapat menjalankan `npm run preflight:db-migrations` dari root source `main` untuk membandingkan versi, nama, dan statement migration dengan koneksi PostgreSQL read-only. Pastikan hostname menunjuk ke project target; jangan membagikan URL atau secret. Jika ada `HENTIKAN` atau mismatch, selesaikan rekonsiliasi sebelum rehearsal.
- Untuk Production, rekonsiliasi ledger dan schema PTSAS secara terpisah. Snapshot sebelumnya menunjukkan 47 versi ledger dan dua entri tanpa metadata, sedangkan source saat ini memiliki 138 migration. Selisih hitungan bukan instruksi untuk menerapkan migration atau mengubah ledger. Jangan tandai versi sebagai applied tanpa bukti schema.
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

