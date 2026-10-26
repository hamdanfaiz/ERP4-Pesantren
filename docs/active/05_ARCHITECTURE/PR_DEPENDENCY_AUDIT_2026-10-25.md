# Audit dependensi Pull Request — 26 Oktober 2026

## Ringkasan eksekutif

- PR #12 sudah digabung ke `main` pada commit `c8738185ff6e5080ae427ef0021ee25681036c40`.
- PR #13 adalah jalur cutover utama, berbasis `main` setelah merge PR #12, pada head `83ca2b096041ceec1e5eab21e7370fe883b14992`. PR #13 masih terbuka sebagai Draft dan belum siap di-merge atau di-deploy.
- PR #11 adalah bagian dari rangkaian bertingkat yang berakhir di PR #10. Ia bukan leluhur commit PR #13. Perbandingan head terkini #11 dengan #13 menunjukkan riwayat bercabang: #13 432 commit di depan, 235 commit di belakang, dengan merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`.
- Karena PR #11 dan #13 divergen, kemiripan fitur bukan bukti kesetaraan implementasi. Jangan menggabungkan PR #11 secara utuh ke #13; cocokkan fitur unik dan port secara selektif setelah uji.
- Revalidasi GitHub pada 26 Oktober 2026 mengonfirmasi hanya PR #12 yang merged; PR #1–#11 dan #13 masih Open/Draft.

## Peta dependensi dan dasar branch

| PR | Dasar saat audit | Status | Catatan |
|---|---|---|---|
| #1 | `main` pada `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8` | Open / Draft | Dasar `main` sebelum merge #12. |
| #2 | `main` pada `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8` | Open / Draft | Dokumentasi kesiapan komersial; basis perlu disegarkan sebelum penggabungan. |
| #3 | `backend/supabase-tenant-foundation` pada `e3cbb70822fb12f2a4446e6a999191807e0c014f` | Open / Draft | Base tidak sama dengan head PR #1 terkini; cek ulang perbedaan sebelum merge. |
| #4 | `main` pada `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8` | Open / Draft | Dasar `main` sebelum merge #12. |
| #5 | `backend/supabase-tenant-foundation` pada `e3cbb70822fb12f2a4446e6a999191807e0c014f` | Open / Draft | Base tidak sama dengan head PR #1 terkini; jalur ini dilanjutkan PR #7. |
| #6 | `main` pada `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8` | Open / Draft | Dokumentasi roadmap; dasar `main` sebelum merge #12. |
| #7 | head PR #5 `57b5ec7b5818648b2e67adf5ceae663c416b648e` | Open / Draft | Stacked di atas PR #5. |
| #8 | head PR #7 `0b8bc4e103b8bf83f6da334568f183d0d97ef7d7` | Open / Draft | Stacked di atas PR #7. |
| #9 | head PR #8 `a9fc8809806e667bbbaea908a5e7ece7c0c55d7b` | Open / Draft | Stacked di atas PR #8. |
| #10 | head PR #9 `c27bace37d6438a209ec3949a133eafaec13c67b` | Open / Draft | Stacked di atas PR #9. |
| #11 | head PR #10 `127c67ef2373eb8d5a654ae10f58c4b0fd1c304b` | Open / Draft | Bagian lanjutan dari stack #5–#10; tidak menjadi base #13. |
| #12 | `main` sebelum merge | Merged | Merge commit `c8738185ff6e5080ae427ef0021ee25681036c40`. |
| #13 | `main` pada merge PR #12 `c8738185ff6e5080ae427ef0021ee25681036c40` | Open / Draft | Cutover Supabase utama; head `83ca2b096041ceec1e5eab21e7370fe883b14992`. |

## Bukti PR #11 terhadap PR #13

- PR #11 head: `88f2686d34bbffb1aa1c7997b55cd015c424f85c`.
- PR #13 head: `83ca2b096041ceec1e5eab21e7370fe883b14992`.
- GitHub compare terbaru melaporkan `diverged`, `ahead_by=432`, `behind_by=235`, merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`.
- PR #11 mengiklankan pekerjaan Master Data dan impor, penempatan asrama, CRUD santri transaksional, serta fondasi dan runtime Tahfidz. PR #13 memiliki cutover dan sejumlah padanan Supabase, tetapi audit ini tidak mengklaim paritas 100% tanpa perbandingan endpoint, skema, UI, dan tes.
- Tindakan: buat checklist per domain dari diff PR #11, tandai padanan yang benar-benar ada di #13, port kekurangan satu per satu, lalu tutup PR #11 setelah seluruh fungsi unik tercakup. Jangan merge stack lama langsung ke #13.

## Status review dan CI

- PR #11: data review GitHub dan review thread kosong; tidak ditemukan workflow run pada head saat audit.
- PR #13: data review GitHub dan review thread kosong. Workflow Supabase database tests run 40163774289 berstatus gagal; dua job yang tercatat (Frontend build and Firebase bundle guard dan Migrations, API auth, and pgTAP) juga berstatus gagal.
- Pengunduhan log kedua job mengembalikan 404 BlobNotFound, sehingga akar penyebab kegagalan belum dapat dipastikan. Tidak ada CI hijau pada head #13 saat audit.
- `mergeable=true` dari GitHub hanya melaporkan status konflik branch; itu bukan persetujuan review, keberhasilan tes, atau kesiapan rilis.
- Pemeriksaan review untuk PR #1–#13 pada audit sebelumnya juga tidak menemukan review submission atau thread. Periksa ulang tepat sebelum merge.

## Koreksi lokal yang belum masuk PR remote

Pada worktree `codex/pr13-wali-link-validation-20261025` di head `8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b`, terdapat perubahan lokal yang belum di-commit/push, termasuk:

- alur aktivasi undangan Wali mendukung callback Supabase PKCE maupun access/refresh token dan memakai sesi terbaru setelah perubahan kata sandi;
- constraint SQL menolak metadata klaim undangan yang parsial, disertai pgTAP;
- Finance, izin asrama, operasi fasilitas, Tahfidz, dan pengumuman memakai relasi Wali–santri kanonis untuk pembatasan multi-anak;
- pengumuman berbasis kelas mengambil penerima dari relasi kanonis Wali–anak, bukan snapshot kelas profil lama; daftar penerima dipaginasi dan gagal tertutup jika melewati batas 50.000.

Perubahan ini belum menjadi isi PR #13 remote. Jangan menyatakan PR sudah memuat atau memverifikasinya sebelum commit dikirim dan CI sukses.

## Validasi yang tersedia dan yang belum

- Lulus: pemeriksaan TypeScript terarah terhadap modul Wali, komunikasi, Finance, asrama, Tahfidz, AuthContext, dan aktivasi undangan.
- Lulus: transpile sintaks esbuild pada modul komunikasi, aktivasi undangan, dan AuthContext.
- Lulus: `git diff --check` tanpa error whitespace; Git hanya mengeluarkan peringatan konversi LF/CRLF.
- Belum lulus / belum dijalankan: typecheck seluruh aplikasi gagal dengan error resolusi Firebase Admin/Vite dan error tipe pada server/komponen lain. Baseline bersih PR #13 belum dibandingkan, jadi asal tiap error belum dipastikan.
- Belum dijalankan: pgTAP dan migrasi Supabase lokal. Supabase CLI, Docker, dan `psql` tidak tersedia pada workspace ini. SQL baru belum diterapkan ke Supabase Production.

## Urutan tindak lanjut yang disarankan

1. Pertahankan PR #13 sebagai jalur utama, tetapi tetap Draft sampai CI terbaru berhasil dan review selesai.
2. Pulihkan kuota/billing Actions repo atau jalankan workflow yang sama di runner yang disetujui, lalu pastikan kedua job hijau pada head yang akan di-merge.
3. Minta tim backend menyediakan Supabase lokal/staging dengan versi PostgreSQL dan ekstensi yang cocok; jalankan seluruh migration dan pgTAP, termasuk 27 assertion pada `guardian_accounts.test.sql`.
4. Audit PR #11 per fitur terhadap PR #13. Port hanya perubahan unik yang dibutuhkan; jangan merge branch #11 langsung ke #13.
5. Segarkan base PR #1, #2, #4, dan #6 dari `main` pasca-#12. Sinkronkan dasar PR #3 dan #5 dengan head tenant foundation terkini, lalu verifikasi ulang stack #5–#11.
6. Sebelum merge/go-live, selesaikan rekonsiliasi tenant/data, uji login dan matriks role, migrasi di staging, backup/restore, rotasi secret, serta UAT Admin dan Wali.

## Batas audit

Audit ini menggunakan metadata GitHub dan file lokal per 25 Oktober 2026. Audit tidak mengubah status PR, tidak melakukan merge/push, dan tidak menerapkan migrasi atau menulis data ke Supabase Production.

## Revalidasi setelah audit — 25 Oktober 2026

- Pemeriksaan ulang GitHub tidak menemukan perubahan pada PR #13: masih Open/Draft, base commit tetap merge PR #12 (`c8738185ff6e5080ae427ef0021ee25681036c40`), head tetap `8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b`.
- Combined commit status masih kosong; workflow run terbaru yang ditemukan tetap `40163774289` dengan conclusion `failure`. Belum ada run hijau pada head ini.
- `git blame` menelusuri dua error typecheck di `server.ts` (baris 1001 dan 2827) ke commit 23 Oktober 2026, dan keduanya tidak berada pada hunk lokal yang berubah. Diagnostik lain yang teramati berada di file yang tidak berubah atau pada resolusi tipe/dependensi Firebase Admin/Vite. Typecheck terarah pada modul yang berubah tetap lulus; baseline typecheck bersih penuh masih belum tersedia.
- Percobaan membuat junction sementara ke dependensi sibling ditolak oleh sandbox sebelum junction terbentuk. Tidak ada dependency link yang tersisa di `node_modules`.

## Revalidasi fetch PR dan status CI — 25 Oktober 2026

- Pengambilan metadata ulang PR #1–#13 memastikan hanya PR #12 yang sudah merged. PR #1–#11 dan #13 masih Open/Draft; status konflik mergeable=true pada PR terbuka bukan tanda bahwa isi atau CI telah lengkap.
- PR #12 merged ke main dengan commit c8738185ff6e5080ae427ef0021ee25681036c40. PR #13 masih berbasis tepat pada commit tersebut, dengan head 8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b.
- PR #11 tetap berbasis pada head PR #10 (127c67ef2373eb8d5a654ae10f58c4b0fd1c304b), dengan head 88f2686d34bbffb1aa1c7997b55cd015c424f85c; tidak ada perubahan relasi yang membuatnya menjadi leluhur #13.
- Head PR #1 telah bergerak ke 736ec92ae86bf195cdaa23fe4b8d5d3797a31891, sedangkan base PR #3 dan #5 masih e3cbb70822fb12f2a4446e6a999191807e0c014f. Basis PR #3 dan #5 perlu disegarkan/dibandingkan terhadap tenant foundation terbaru sebelum merge.
- Perbandingan commit ulang antara head #11 dan #13 tetap diverged: #13 333 commit di depan dan 235 di belakang, dengan merge-base f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8. Kesimpulan tetap: jangan merge #11 secara utuh ke #13.
- Tidak ditemukan review submission atau review thread pada PR #11 maupun #13. Head #11 tidak memiliki workflow run; pada head #13 workflow terbaru tetap 40163774289 dengan conclusion failure, dan kedua job yang dilaporkan gagal. Log kedua job tidak dapat diunduh (404 BlobNotFound), jadi dugaan penyebab seperti batas billing belum terverifikasi. Belum ada run hijau pada head #13.
- Referensi lokal refs/remotes/origin/pr-13-audit belum terlihat di checkout erp4-canonical maupun worktree audit setelah pengguna menjalankan fetch. Untuk pemeriksaan status dan relasi di addendum ini, SHA diverifikasi langsung melalui GitHub; hasil perintah fetch lokal masih perlu dikirim jika akan dipakai untuk pemeriksaan Git lokal.
## Revalidasi lanjutan — 25 Oktober 2026

- Rerun workflow PR #13 (attempt 2 pada run 40163774289) juga gagal. Kedua job mulai dan berakhir dalam sekitar dua detik, tidak memiliki step, dan log tetap tidak tersedia. Ini menunjukkan runner tidak menjalankan langkah pengujian; penyebab eksternal atau konfigurasi masih belum dapat dipastikan dari bukti yang ada.
- Alur aktivasi Wali di worktree kini menolak sesi tanpa callback autentikasi undangan dan memeriksa status konfirmasi email sebelum mengizinkan pembuatan kata sandi. Kondisi tanpa email terverifikasi menampilkan petunjuk dan tidak merender form aktivasi.
- Typecheck terarah pada halaman aktivasi Wali, AuthContext, identity store, komunikasi, Finance, asrama, dan Tahfidz lulus. git diff --check juga lulus; Git hanya menampilkan peringatan normal konversi LF/CRLF.
- Perubahan alur aktivasi ini masih lokal dan belum dikirim ke PR #13. Migrasi SQL/pgTAP tetap belum dapat dijalankan di workspace karena Supabase CLI/Docker/psql tidak tersedia; jangan menganggap CI gagal sebagai pengganti validasi lokal yang belum berjalan.
## Validasi lokal lanjutan — 25 Oktober 2026

- Typecheck terarah terbaru lulus untuk halaman aktivasi Wali, AuthContext, identity store, komunikasi, Finance, asrama, dan Tahfidz.
- Uji logika lokal lulus: RBAC (11 kasus), tanggal bisnis tenant (12), idempotency key (8), alur Alumni (14), gate Firebase Admin, dan tenant scoping importer Firestore.
- Inventaris statis menemukan 77 file migrasi SQL dengan 77 versi unik dan tanggal/nama file valid. Pemeriksaan ini tidak memvalidasi sintaks SQL atau kecocokan terhadap schema_migrations remote.
- git diff --check lulus tanpa kesalahan whitespace; hanya ada peringatan konversi akhir baris LF/CRLF.
- Supabase CLI, Docker, dan psql tetap tidak tersedia, sehingga migrasi database, pgTAP, API auth tenant, NIS bersamaan, Storage, serta backup/restore belum terbukti pada environment lokal/staging.
## Pemeriksaan ulang seluruh PR — metadata GitHub 25 Oktober 2026

### Status seluruh PR

| PR | Status GitHub terbaru | Base → head | Kesimpulan tindakan |
|---|---|---|---|
| #1 | Open / Draft | `main` → tenant foundation | Belum lengkap; basis `main` masih sebelum merge #12. |
| #2 | Open / Draft | `main` → commercial readiness docs | Dokumentasi belum digabung; segarkan base. |
| #3 | Open / Draft | tenant foundation → user provisioning | Base SHA masih tenant foundation lama; jangan merge sebelum disegarkan. |
| #4 | Open / Draft | `main` → self-hosted container | Belum digabung; verifikasi against main pasca-#12. |
| #5 | Open / Draft | tenant foundation → public PPDB | Base SHA lama; stack berlanjut ke #7–#11. |
| #6 | Open / Draft | `main` → migration roadmap | Belum digabung; segarkan base. |
| #7 | Open / Draft | #5 → PPDB admin runtime | PR bertingkat, menunggu keputusan atas #5. |
| #8 | Open / Draft | #7 → Master Data/onboarding | PR bertingkat, menunggu keputusan #7. |
| #9 | Open / Draft | #8 → Finance foundation | PR bertingkat, menunggu keputusan #8. |
| #10 | Open / Draft | #9 → PPDB Finance UI | PR bertingkat, menunggu keputusan #9. |
| #11 | Open / Draft | #10 → Master Data/asrama/Tahfidz | PR bertingkat; divergen dari cutover utama #13. |
| #12 | Merged | `main` → `tegar` | Sudah digabung di `c8738185ff6e5080ae427ef0021ee25681036c40`; ini hanya commit awal Supabase, bukan bukti seluruh produk selesai. |
| #13 | Open / Draft | commit merge #12 → runtime cutover | Jalur cutover utama; belum siap merge karena CI head gagal dan release gate masih terbuka. |

Tidak ada perubahan state PR sejak pemeriksaan sebelumnya. GitHub melaporkan `mergeable=true` pada PR terbuka; itu hanya berarti tidak terdeteksi konflik merge dan bukan tanda PR sudah lengkap. Semua PR terbuka (#1–#11 dan #13) masih Draft. Pengambilan gabungan status commit untuk head-head tersebut tidak mengembalikan status check; pemeriksaan submission review juga kosong untuk seluruh PR yang diperiksa.

### Hubungan PR #11, #12, dan #13

- PR #12 merged ke `main` pada `c8738185ff6e5080ae427ef0021ee25681036c40`. PR #13 memakai commit tersebut sebagai base secara tepat.
- PR #11 head `88f2686d34bbffb1aa1c7997b55cd015c424f85c` tetap berada pada stack #5→#10. PR #13 head `8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b` dikembangkan dari #12, bukan dari #11.
- Perbandingan GitHub terakhir tetap menunjukkan dua head divergen: #13 333 commit di depan dan 235 commit di belakang #11, dengan merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`. Karena itu, menggabungkan #11 utuh ke #13 berisiko membawa kembali sejarah/implementasi lama dan konflik. Cocokkan hanya kemampuan yang memang belum setara.
- Area #11 yang wajib dicentang terhadap #13: CRUD Santri transaksional dan enkripsi identitas; import Master Data beserta provenance/conflict handling; penempatan kamar yang atomik dan rekam riwayat; import halaqah/keanggotaan; otorisasi Ustadz berdasarkan halaqah tugas; serta baca/tulis setoran dan target Tahfidz dengan idempotensi.
- Isi PR #11 sendiri menyebut beberapa fitur Tahfidz lanjutan masih belum tersedia, memakai Firebase Auth/Firestore sebagai jembatan identitas, dan mematikan flag cutover secara default. PR #13 juga mencatat alur Tahfidz tertentu (Talaqqi, munaqasyah, laporan wali, peer review, dan pencapaian) masih menunggu skema/API tersimpan. Jadi stack #11 dan #13 sama-sama bukan produk selesai; item-item ini harus tetap ada dalam matriks penerimaan, bukan dianggap selesai karena UI tampil.

### CI, review, dan penyelesaian stack

- Metadata terbaru PR #13: 331 commit, 292 file berubah, Open/Draft. Workflow run terkini pada head-nya adalah `40163774289` dengan conclusion `failure`; percobaan rerun sebelumnya juga gagal sebelum step berjalan. Log/job detail masih tidak tersedia untuk memastikan akar masalah. Tidak ada bukti CI hijau pada head #13.
- PR #11 tidak memiliki workflow run yang terasosiasi dengan head-nya. Tidak ada submission review maupun review thread pada #11 atau #13.
- Hasil ini tidak membuktikan PR #1–#10 bebas masalah SQL/runtime; status checks kosong dan status Draft berarti kelengkapan mereka belum terverifikasi. Untuk stack #5–#11, tentukan satu jalur utama: rebase/port fitur yang diperlukan ke #13 lalu tutup stack lama setelah parity diverifikasi, atau selesaikan stack lama terlebih dahulu dengan base dan CI yang benar. Jangan merge cabang-cabang stacked ke `main` secara terpisah tanpa rencana urutan.
- PR #1 dan #5 memakai base tenant foundation SHA `e3cbb70822fb12f2a4446e6a999191807e0c014f`, sementara head #1 kini `736ec92ae86bf195cdaa23fe4b8d5d3797a31891`; kedua PR perlu disegarkan sebelum review.

### Perubahan lokal dan validasi baru

- Pemeriksaan alur aktivasi Wali kini melakukan verifikasi server atas email Auth terkonfirmasi, hash undangan yang masih pending/belum kedaluwarsa, data Wali aktif, dan relasi ke santri aktif sebelum UI mengizinkan penggantian kata sandi. Pengujian sintetis 6 kasus ditambahkan dan dipasang pada workflow frontend.
- Perintah `npm run test:guardian-invitation-verification` langsung berhenti karena executable `tsx` tidak tersedia pada `node_modules` worktree. Namun sumber test berhasil ditranspilasi/dibundel dengan esbuild memakai dependensi Supabase lokal dari checkout canonical dan dijalankan: seluruh 7 skenario sintetis (1 valid dan 6 penolakan) lulus. Mock `.maybeSingle()` menggunakan bentuk respons array PostgREST. Hasil ini memvalidasi logika lokal, tetapi belum merupakan bukti workflow CI di PR #13 hijau; ulangi perintah native di CI.
- File perubahan lokal belum di-commit/push dan tidak ada PR yang diubah, digabung, atau ditutup. Migrasi Supabase tetap tidak diterapkan ke project produksi.

### Putusan audit

Belum semua PR lengkap. Dari #1–#13, hanya #12 yang merged, tetapi cakupannya sekadar awal integrasi Supabase. PR #13 adalah jalur utama yang paling maju, tetapi masih Draft, CI gagal, review belum ada, data Firebase belum direkonsiliasi/diimpor ke Supabase, dan release gate autentikasi, migrasi, backup-restore, keamanan, serta UAT tetap terbuka. PR #11 bukan dependency langsung #13; hanya fitur unik yang belum parity yang perlu dipindahkan setelah dibandingkan dan diuji.
## Validasi lokal build dan runtime — 25 Oktober 2026

- Typecheck `npm run lint` lulus; build client dan server `npm run build` lulus pada worktree dengan perubahan lokal saat ini.
- Instalasi untuk pemeriksaan ini memakai NPM tanpa lockfile (`--no-save --package-lock=false`), karena Bun 1.4.4 gagal mengakses direktori temporary pada sandbox. Ini bukan reproduksi CI yang menggunakan `bun install --frozen-lockfile`; hasil tetap perlu dikonfirmasi pada runner CI yang sama dengan lockfile resmi.
- Tes logika lokal lulus: verifikasi undangan Wali (7 skenario: 1 valid, 6 ditolak), RBAC (11), tanggal bisnis tenant (12), idempotensi request (8), Alumni (14), PPDB import preview (9), impor katalog Perpustakaan (10), sirkulasi Perpustakaan (14), impor HRIS (11), Koperasi/paginasi PostgREST (17 kelompok), Firebase legacy gate, Firestore tenant scoping, dan Master Data pagination/PII minimization.
- Guard paket produksi lulus: Firebase menjadi dependensi development, sedangkan Supabase tetap dependency runtime. Smoke HTTP dengan Node production build juga lulus: halaman frontend memberi HTTP 200 dan `/api/users` menolak anonymous dengan HTTP 401.
- Pemetaan source map menemukan PDF pendaftaran, grafik/Markdown pencarian AI, dan ekspor PDF berada pada jalur awal walau belum dibuka. Ketiganya kini dimuat sesuai kebutuhan: formulir saat pengguna membuka PPDB publik, PDF setelah pendaftaran berhasil, hasil pencarian saat hasil AI tersedia, dan pustaka ekspor saat tombol dipakai. Ukuran chunk awal turun dari sekitar 3.012 kB (gzip 968 kB) menjadi 577 kB (gzip 165 kB). Renderer PDF tetap berada pada chunk tertunda 1.242 kB (gzip 454 kB), dan build masih memberi peringatan ukuran chunk; ukurannya tidak lagi membebani halaman awal. Typecheck dan build ulang lulus setelah perubahan ini.
- Uji Supabase lokal/pgTAP, NIS race, auth/tenant live, Storage, backup/restore, dan image Docker belum dijalankan: Docker, Supabase CLI, dan `psql` tidak tersedia, serta worktree tidak memiliki `.env`. Instalasi production-only terpisah untuk menjalankan smoke script CI juga tertahan oleh pembatasan sandbox pada pembuatan paket `node_modules`.
- Tidak ada akses ke database produksi, tidak ada migration yang diterapkan, dan hasil npm lokal ini tidak menggantikan CI hijau pada head PR #13.
## Pemeriksaan hubungan PR dan kelengkapan — pembacaan ulang GitHub, 25 Oktober 2026

- Metadata terkini tetap menunjukkan PR #1–#11 dan #13 **Open/Draft**; PR #12 **Merged** pada `c8738185ff6e5080ae427ef0021ee25681036c40`. Tidak ada PR terbuka yang dapat dinyatakan lengkap/siap merge hanya dari status `mergeable=true`.
- #13 berbasis langsung pada merge #12 (`c8738185ff6e5080ae427ef0021ee25681036c40`) dan head-nya `8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b`. #12 dengan demikian sudah tercakup sebagai basis #13; tidak perlu memasukkan #12 lagi.
- #11 head `88f2686d34bbffb1aa1c7997b55cd015c424f85c` tetap ditumpuk di atas #10 (`127c67ef2373eb8d5a654ae10f58c4b0fd1c304b`), bukan leluhur #13. Perbandingan head terbaru tetap divergen: #13 333 commit di depan, 235 di belakang, merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`.
- Dari 25 nama file yang diubah #11, hanya 6 nama file yang sama persis dengan daftar perubahan #13. Banyak implementasi domain yang mirip berada di path atau migration yang berbeda (`server/` vs `src/server/`, serta nomor urut migration berbeda). Ini membuktikan overlap kode terbatas pada nama file, bukan membuktikan hilang atau setaranya fitur. Matriks parity #11→#13 masih wajib mencocokkan RPC, validasi tenant/role, efek transaksi, UI, dan tes untuk: CRUD/enkripsi identitas Santri; impor Master Data dan provenance; penempatan kamar transaksional/riwayat; impor halaqah/anggota; pembatasan Ustadz ke halaqah tugas; serta rekam setoran/target dan idempotensi.
- Metadata workflow saat pembacaan ulang: head #13 hanya memiliki run `40163774289` dengan conclusion `failure`; kedua job gagal tanpa step/log yang dapat diambil. Tidak ditemukan PR-triggered workflow run untuk head #1–#12, termasuk #11. Ini bukan bukti bahwa kode mereka gagal, tetapi juga berarti belum ada bukti CI hijau untuk head-head tersebut. Pemeriksaan review submission/thread untuk PR yang ditinjau tetap kosong.
- Perintah fetch yang diminta pengguna belum menghasilkan ref lokal `refs/remotes/origin/pr-13-audit` di repo kanonis/worktree audit. Ref remote tracking `origin/codex/supabase-runtime-cutover-20261022` pada worktree sudah menunjuk ke SHA head #13 di atas; metadata dan perbandingan commit diverifikasi langsung melalui GitHub, sehingga audit hubungan tetap mengacu pada SHA yang tepat.
- Keputusan audit: pertahankan #13 sebagai jalur cutover utama; jangan merge #11 atau stack #5–#11 secara utuh. Tetapkan pemilik untuk matriks parity, port hanya kekurangan yang disetujui ke #13, segarkan base PR lama, lalu minta seluruh head target menjalankan CI/review sebelum mengubah status Draft atau merge. Sampai itu selesai, **belum semua PR lengkap**.

## Matriks parity fungsional PR #11 → PR #13 — 25 Oktober 2026

Penilaian membedakan head PR #13 di GitHub dari worktree lokal: koreksi di worktree belum otomatis menjadi isi PR. Nama file yang sama tidak dipakai sebagai bukti bahwa perilaku sistem sama.

| Kapabilitas PR #11 | Bukti padanan pada PR #13 / worktree | Status | Catatan tindak lanjut |
|---|---|---|---|
| Struktur Master Data: baca, tambah/ubah, hapus Gedung/Kamar/Kelas | src/server/supabaseOnboarding.ts, route server.ts, migration 20261030000000_master_data_onboarding.sql | Terwakili di kode | Uji endpoint/RLS dan tenant pada Supabase lokal masih menunggu. |
| Preview/apply impor struktur Firestore dan hitung okupansi dari santri | Service dan RPC struktur sudah ada; dua endpoint migrasi ternyata absen dari head remote #13. Route tenant-scoped serta panel Admin dengan flag default-off kini ditambahkan secara lokal. | Teratasi lokal; belum ada di PR remote | Jalankan API test, dry-run dengan sumber sintetik, dan uji apply di staging sebelum mengirim perubahan. |
| CRUD santri, cek NIS/identitas, enkripsi NIK/NISN, pengarsipan | src/server/supabaseOnboarding.ts, 20261102000000_master_data_student_runtime.sql, identity fingerprint index/RPC | Terwakili di kode | Uji SQL, duplikasi serentak, pengarsipan dan okupansi belum dijalankan. |
| Impor legacy santri/wali dengan provenance dan deteksi konflik | 20261031000000_legacy_master_data_import.sql dan importer migrateSupabaseLegacyMasterDataStudents; route dan panel baru berada di worktree lokal. | Teratasi lokal; belum ada di PR remote | Rekonsiliasi sumber, fingerprint, relasi Wali dan hasil apply harus diverifikasi di staging; bukan pada Production. |
| Penempatan kamar atomik dan riwayat: tenant, kapasitas, gender, okupansi, actor/source | 20261101000000_student_room_assignment.sql dan migration lokal 20270106000000_boarding_room_assignment_history.sql; API room placement, room-history, CRUD dan arsip | Transaksi terwakili di #13; riwayat teratasi di worktree lokal, belum di PR | Trigger menyimpan assignment awal, pindah, unassign, snapshot nama ruang/gedung, aktor dan sumber; Admin dapat melihat timeline di detail Santri. pgTAP 42 assertion ditulis tetapi belum dijalankan. Perubahan lokal belum dikirim ke PR #13. |
| Tahfidz snapshot/roster dan pembatasan Ustadz ke halaqah tugas | src/server/supabaseTahfidz.ts, 20261103000000_tahfidz_tenant_runtime.sql, 20261105000000_tahfidz_recorder_assignment_guard.sql | Terwakili di kode | #13 mengganti pemetaan UID Firebase lama dengan UID/profile Supabase. Jalankan tes role/tenant dan SQL. |
| Setoran idempotent, validasi keanggotaan, identitas tenant | RPC record_tahfidz_setoran dan API /api/tahfidz/records | Terwakili di kode | Bukti runtime/pgTAP belum tersedia pada environment ini. |
| Target Tahfidz harian dengan periode, audit, retry idempotent | 20261106000000_tahfidz_target_write_api.sql, endpoint /api/tahfidz/targets | Terwakili di kode | Uji konflik retry dan riwayat target pada pgTAP masih wajib. |
| Impor halaqah/anggota; perubahan halaqah dan penempatan anggota dengan ledger request | 20261104000000_tahfidz_legacy_import.sql, 20261107000000_tahfidz_halaqah_membership_write_api.sql, endpoint snapshot/migration/halaqahs/memberships | Terwakili di kode | Uji apply/retry, konflik keanggotaan aktif, dan isolasi tenant masih menunggu. |
| Sesi Tahfidz dan slot pengajar | Tambahan #13: 20261116000000_tahfidz_sessions_runtime.sql, endpoint sessions | Superset pada #13 | Ini kemampuan baru di #13, tidak perlu dipindah dari #11. |
| Talaqqi, munaqasyah, laporan Wali, peer review, pencapaian | Deskripsi PR #11 sendiri menyatakan skema/API tersimpan masih tertunda; layar legacy bukan padanan runtime Supabase. | Belum terwakili | Tetap sebagai gap produk; tidak boleh menampilkan data contoh sebagai transaksi tersimpan. |
| Auth runtime | #11 memakai Firebase Auth UID sebagai jembatan; #13 memverifikasi sesi Supabase dan profile tenant | Digantikan secara sengaja | Jangan port Firebase UID mapping ke jalur runtime Supabase-only. |

### Putusan parity

- Sebagian besar operasi Master Data dan core Tahfidz memiliki implementasi Supabase pada #13. Hasil ini adalah inspeksi kode; belum bukti migration dan transaksi lulus di database.
- Head remote PR #13 masih kehilangan dua route migrasi Master Data yang dibutuhkan client/service. Worktree lokal kini memulihkan route dan UI dengan gate terpisah, pembatasan Admin, pemetaan tenant legacy, dan konfirmasi apply. Perubahan ini belum dikirim ke PR.
- Riwayat perpindahan kamar kini sudah memiliki implementasi lokal pada database/API/UI, tetapi belum terbukti lewat pgTAP/CI dan belum masuk PR #13. Penyimpanan Talaqqi/munaqasyah/laporan Wali/peer review/pencapaian tetap belum tercakup.
- PR #11 tidak boleh digabung utuh ke #13 karena branch divergen serta mencakup jembatan Firebase Auth yang sudah diganti. Port fitur hanya jika parity belum ada, lalu jalankan suite yang relevan.
- Status kesiapan keseluruhan tetap **53/100**. Hanya PR #12 yang merged; PR #1–#11 dan #13 masih Open/Draft dalam audit GitHub terakhir. PR #13 belum memiliki CI hijau, review, atau bukti pgTAP.
## Pembaruan riwayat penempatan kamar — 25 Oktober 2026

- Kekurangan parity yang ditandai pada matriks kini memiliki implementasi lokal: trigger database mencatat penempatan awal, pindah kamar, perubahan gedung, dan pengakhiran penempatan dengan snapshot nama gedung/kamar. Wrapper audited juga meneruskan aktor dan sumber `ppdb_onboarding` untuk penerimaan PPDB; jalur Asrama, Master Data, dan arsip santri tetap mencatat aktor dan sumbernya.
- Tabel history dipagari RLS dan akses Data API hanya diberikan kepada service_role; API pembacaan mematok tenant dari profil aktif dan membatasi akses Admin. Detail Santri menampilkan riwayat dari backend, bukan data contoh.
- Ditambahkan pgTAP dengan 42 assertion untuk riwayat, retry tanpa duplikasi, okupansi kamar, arsip, attribution actor/source, batas tenant/role, hak append-only, serta atribusi onboarding PPDB. Jumlah assertion cocok dengan plan(42), tetapi SQL belum dijalankan karena akses Supabase live ditolak oleh konektor dan Supabase CLI/Docker/psql tidak tersedia.
- Typecheck dan build production lulus setelah perubahan; node --check scripts/test-api-auth-tenant.mjs dan git diff --check lulus. Build masih memperingatkan chunk PDF tertunda 1,24 MB.
- Metadata GitHub terkini: PR #12 merged; PR #1–#11 dan #13 masih Open/Draft. PR #11 tetap divergen dari #13 (333 commit di depan, 235 di belakang; merge-base f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8). CI #13 pada head 8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b tetap gagal sebelum langkah uji berjalan; tidak ada CI hijau pada head itu.
- Kesiapan rilis tetap 53/100. Perubahan lokal ini belum masuk PR; pgTAP, CI hijau, Supabase staging, migrasi/rekonsiliasi, dan UAT tetap gerbang terbuka. Tidak ada migrasi atau data Production yang diubah.

## Pembaruan CI head PR #13 — 25 Oktober 2026

- Rerun run `40163774289` pada SHA `8d9dc4c3555b69b223aa9f36c78c2e7e4cf7858b` berakhir sukses untuk job frontend dan database. Seluruh pgTAP pada head remote, pemeriksaan NIS serentak, API tenant, Finance Storage, backup/restore, build, dan smoke Docker lulus.
- Hasil ini menggantikan status kegagalan runner yang dicatat di bagian sebelumnya. PR #13 tetap Open/Draft dan tidak memiliki review approval.
- Rerun hanya menguji head remote. Perubahan worktree belum didorong, termasuk migration riwayat kamar dengan 42 assertion pgTAP; perubahan itu belum memiliki bukti CI.
- Skor kesiapan rilis terkini 58/100. Tidak ada perubahan pada Supabase Production.

## Revalidasi paritas PR #11 → PR #13 — 25 Oktober 2026

Pemeriksaan ini memakai head GitHub PR #11 `88f2686d34bbffb1aa1c7997b55cd015c424f85c` dan head PR #13 setelah pembaruan `e3d91bc4eb29bac2e59310e435394c98196ee211`. Hasil berikut menggantikan catatan lama yang menyebut route migrasi Master Data dan riwayat kamar hanya ada di worktree lokal:

- Route pratinjau/impor struktur dan santri kini ada pada `server.ts`; halaman Master Data memanggil importer Supabase dan UI pratinjau tersedia pada PR #13. Flag server/UI tetap mematikan apply secara default. Kehadiran route tidak membuktikan rekonsiliasi data sumber atau apply pada staging.
- Riwayat penempatan kamar kini ada pada migration `20270106000000_boarding_room_assignment_history.sql`, test pgTAP `boarding_room_assignment_history.test.sql`, endpoint detail riwayat, serta layar detail Santri. CI run `40188865422` lulus pada database terisolasi setelah migration dan seluruh pgTAP dijalankan.
- Operasi inti Tahfidz dari #11 memiliki padanan Supabase pada #13: snapshot/setoran, membership halaqah, target harian, impor halaqah, dan sesi Tahfidz. #13 menyimpan modul server pada `src/server/supabaseTahfidz.ts` dengan migrasi berurutan `20261103000000`–`20261107000000` dan `20261116000000`; jembatan UID Firebase/Auth di #11 sengaja tidak dibawa karena identitas runtime kini Supabase.
- CI sampai run `40188865422` belum memiliki test pgTAP khusus yang langsung menguji RPC setoran, CRUD halaqah, penempatan membership, dan target sebagai satu rangkaian. File baru `supabase/tests/tahfidz_runtime_write_api.test.sql` menambahkan 62 assertion sintetis untuk tenant/role, validasi membership, retry identik, konflik payload, RLS, dan hak execute; hasilnya menunggu CI.
- Fitur lanjutan Talaqqi, laporan Wali, peer review, dan pencapaian Tahfidz belum memiliki penyimpanan/API runtime terverifikasi. Jangan menyalin migrasi #11 satu per satu: nama, urutan, Auth, dan kontrak tenant sudah berevolusi di #13.

PR #11 tetap Open/Draft dan divergen; status parity inti pada #13 bukan alasan untuk merge stack #11. Pertahankan #13 sebagai jalur utama, port hanya celah yang terbukti, dan tunggu CI baru untuk test Tahfidz sebelum menaikkan skor kesiapan dari **61/100**.

## Iterasi pgTAP Tahfidz — 25 Oktober 2026

- CI run `40189751690` berhasil mengurai dan menjalankan seluruh 62 assertion baru. Sebanyak 61 assertion lulus; satu assertion membership mengirim Ustadz B ke halaqah A, padahal Ustadz B hanya mengampu halaqah B. Penolakan RPC dengan kode `42501` membuktikan pemeriksaan akses pengampu berjalan dan menunjukkan fixture belum mengisolasi pemeriksaan membership.
- Fixture diperbaiki agar Ustadz B menulis pada halaqah B yang diampunya untuk santri yang masih terdaftar pada halaqah A. Tidak ada perubahan pada SQL runtime atau skema. CI baru diperlukan untuk menilai ulang assertion tersebut; skor go-live tetap **61/100** sampai suite berhasil.

## Perbaikan Portal Wali Tahfidz untuk beberapa santri — 25 Oktober 2026

- Ringkasan Tahfidz untuk Wali sebelumnya selalu memilih elemen pertama dari daftar santri yang tertaut, walaupun backend sudah membatasi snapshot ke relasi guardian–student aktif dan dapat mengembalikan lebih dari satu santri.
- Portal kini menampilkan pilihan santri jika terdapat beberapa tautan. Ringkasan halaqah, target, setoran bulanan, setoran terakhir, serta riwayat mengikuti santri yang dipilih. Akun Santri tetap memakai tautan tunggal profilnya.
- Fungsi pemilihan memvalidasi ID terhadap daftar server yang diizinkan; bila sebuah tautan dicabut, pilihan lama tidak dipertahankan. Enam assertion sintetis untuk perilaku ini masuk ke workflow CI.
- PR #13 head `67e8699c2955da0371c25fb1a9d3f063da402dec` lulus run `40190799618` pada job frontend dan database. Tidak ada perubahan schema atau data produksi.
- Kesiapan rilis naik **62→63/100** pada cakupan modul dan bukti integrasi UI. PR masih Draft; login staging, migrasi/rekonsiliasi sumber, rotasi secret, dan UAT customer-managed belum dilaksanakan.

## Revalidasi semua PR dan head CI — 25 Oktober 2026

Metadata GitHub diperiksa ulang untuk PR #1–#13:

| Kelompok | Status terbaru | Dasar dan tindakan |
|---|---|---|
| #1–#2, #4, #6 | Open / Draft | Berbasis `main` lama `f7f8bb0`; segarkan base setelah jalur cutover ditetapkan. |
| #3, #5 | Open / Draft | Berbasis tenant foundation `e3cbb70`; cek ulang stack dan konflik sebelum dipertimbangkan. |
| #7–#10 | Open / Draft | Stack berurutan PPDB → Master Data → Finance → UI Finance; PR #11 dibangun di atas #10. |
| #11 | Open / Draft | Base `backend/supabase-finance-ui` pada `127c67e`, head `backend/supabase-masterdata-structures-ui` pada `88f2686`. Tetap stack lama, bukan base PR #13. |
| #12 | Merged | Merge commit `c8738185ff6e5080ae427ef0021ee25681036c40`; menjadi dasar PR #13. |
| #13 | Open / Draft | Jalur utama cutover; base merge PR #12, head `a972b8a079af68d4d71a3032c18c386f0bf7ae42`. |

Run GitHub Actions `40191075189` pada head PR #13 lulus di kedua job. Ini mengesahkan suite CI lokal/sintetis untuk commit tersebut; tidak menandakan migrasi Production, review, autentikasi staging, atau UAT telah selesai. Nilai `mergeable=true` hanyalah laporan konflik Git dan bukan persetujuan merge.

Konektor Supabase masih tidak memiliki izin pada project target `ptsasgdvgrbdtgyqieie`; daftar project yang dapat dilihat hanya memuat `vqemuyzveuirlkvdggjd`. Jangan menggunakan project yang berbeda sebagai pengganti target dan jangan menyatakan database Production sudah diverifikasi.

Rekomendasi operasional tetap: pertahankan PR #13 sebagai jalur utama; audit fitur unik #11 per domain dan port hanya yang diperlukan setelah CI; jangan merge stack #11 langsung ke #13. PR #1–#11 yang masih Draft perlu ditandai sebagai stack/arsip/review satu per satu oleh pemilik repo sebelum rilis, supaya tidak ada jalur yang dianggap selesai hanya karena #13 lulus CI.

## Head PR #13 setelah koreksi roster Tahfidz — 25 Oktober 2026

- Head PR #13 bergerak ke `ba327e8c5b5ca7e11dff00922fd53ff0d393f06a`; PR tetap Open/Draft dan berbasis pada merge PR #12. PR #11 masih Open/Draft di atas #10 dan tidak menjadi dependensi #13.
- CI run `40192352964` sukses pada kedua job. Frontend meliputi typecheck, tes tanggal keanggotaan Tahfidz, build, Docker, dan smoke test; job database menjalankan Supabase lokal, semua migration/pgTAP, NIS serentak, auth/isolasi tenant, Storage, dan backup/restore.
- Koreksi memilih membership Tahfidz aktif menurut tanggal bisnis tenant. Perubahan diuji dengan fixture sintetis; tidak ada skema atau data Production yang diubah.
- Konektor Supabase masih menolak akses ke target `ptsasgdvgrbdtgyqieie` dan hanya menampilkan project `vqemuyzveuirlkvdggjd`. Staging target dan migrasi data belum diverifikasi.

Hasil CI tidak menutup release gate staging, review, rekonsiliasi data, login/role UAT, dan deployment customer-managed. Jangan menggabungkan PR #11 seluruhnya ke #13; audit fitur uniknya per domain.

## Revalidasi status seluruh PR — 26 Oktober 2026

Metadata PR GitHub dibaca ulang. Tabel ini adalah snapshot status branch dan dependensi, bukan pernyataan bahwa setiap fitur di semua branch sudah memiliki parity.

| PR | Status saat pemeriksaan | Base → head | Catatan |
|---|---|---|---|
| #1 | Open / Draft | `main@f7f8bb0` → `backend/supabase-tenant-foundation@736ec92` | Foundation lama; base belum diperbarui setelah merge #12. |
| #2 | Open / Draft | `main@f7f8bb0` → `product/commercial-readiness@98e98a4` | Dokumen kesiapan komersial pada base lama. |
| #3 | Open / Draft | `backend/supabase-tenant-foundation@e3cbb70` → `backend/tenant-user-provisioning@515def6` | Stack lama di atas #1. |
| #4 | Open / Draft | `main@f7f8bb0` → `deployment/self-hosted-app-container@b4cd1b8` | Container transisi; perlu dinilai terhadap runtime Supabase #13. |
| #5 | Open / Draft | `backend/supabase-tenant-foundation@e3cbb70` → `backend/supabase-public-ppdb-runtime@57b5ec7` | Stack PPDB lama. |
| #6 | Open / Draft | `main@f7f8bb0` → `docs/supabase-complete-migration-roadmap@3732db4` | Dokumen roadmap pada base lama. |
| #7 | Open / Draft | `backend/supabase-public-ppdb-runtime@57b5ec7` → `backend/supabase-ppdb-admin-runtime@0b8bc4e` | Stack di atas #5. |
| #8 | Open / Draft | `backend/supabase-ppdb-admin-runtime@0b8bc4e` → `backend/supabase-masterdata-onboarding@a9fc880` | Stack Master Data/onboarding lama. |
| #9 | Open / Draft | `backend/supabase-masterdata-onboarding@a9fc880` → `backend/supabase-finance-foundation@c27bace` | Stack Finance lama. |
| #10 | Open / Draft | `backend/supabase-finance-foundation@c27bace` → `backend/supabase-finance-ui@127c67e` | Stack UI Finance lama. |
| #11 | Open / Draft | `backend/supabase-finance-ui@127c67e` → `backend/supabase-masterdata-structures-ui@88f2686` | Bukan leluhur #13; jangan merge sebagai satu stack. |
| #12 | Merged | `main@f7f8bb0` → `tegar@afe5167` | Merge commit `c8738185ff6e5080ae427ef0021ee25681036c40`; menjadi base #13. |
| #13 | Open / Draft | `main@c873818` → `codex/supabase-runtime-cutover-20261022@adf299f` | Jalur cutover utama; head pada snapshot ini sebelum catatan ditambahkan. |

Pada snapshot yang sama, perbandingan head #11 dan #13 berstatus `diverged`, dengan merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8` (396 commit #13 di depan dan 235 di belakang). PR #11 dan #13 belum memiliki review submission; thread review #13 juga kosong. `mergeable=true` hanya berarti GitHub tidak melaporkan konflik merge.

CI run `40244584892` sukses di kedua job pada commit kode #13 `5fa94d13f0739c364bb946d21ebf321013d2b4af`; run `40244853760` juga sukses di kedua job pada snapshot dokumentasi `adf299fc90ee01d0dbc81cada54d90f409f51a3b`. CI sintetis tidak menggantikan review, staging, backup/restore, migrasi data, login/UAT, atau keputusan pemilik repository atas PR bertingkat. Pertahankan #13 sebagai jalur utama, audit/port fitur unik secara selektif, dan jangan menutup atau menggabungkan PR lama secara otomatis.


## Revalidasi PR #11 → #13 dan akses project Supabase — 26 Oktober 2026

- Metadata GitHub terkini: PR #11 Open/Draft pada head `88f2686d34bbffb1aa1c7997b55cd015c424f85c`; PR #13 Open/Draft pada head `c6cd7e971c2979a03d6c3a2599bbae2bb0b84d18`, base merge PR #12 (`c8738185ff6e5080ae427ef0021ee25681036c40`).
- Perbandingan head terkini menyatakan `diverged`: #13 397 commit di depan dan 235 di belakang #11, dengan merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`. Hasil ini tidak membenarkan merge stack lama; gunakan matriks parity untuk memilih fitur yang benar-benar belum tersedia.
- CI PR #13 pada SHA `c6cd7e9` sukses pada kedua job di run [`40245171876`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40245171876). Ini hanya memvalidasi source dan database sintetis yang dipakai CI; tidak mengesahkan project Supabase target atau migrasi data.
- Konektor Supabase yang aktif hanya mengembalikan project `vqemuyzveuirlkvdggjd`. Target yang ditetapkan sebelumnya adalah `ptsasgdvgrbdtgyqieie`, dan target itu tidak tersedia pada daftar konektor. Karena itu pemeriksaan tabel, migration ledger, advisor, backup, atau data target belum dilakukan dalam checkpoint ini.
- Tidak ada query tulis, migration, perubahan skema, atau pengaktifan feature flag Supabase pada project mana pun. Jangan gunakan project `vqemuyzveuirlkvdggjd` sebagai pengganti target.

Status akhir tetap: #13 adalah jalur cutover utama tetapi belum siap merge/go-live; #11 belum ditutup dan tidak boleh digabungkan utuh; staging, target Supabase yang benar, rekonsiliasi, review, login/UAT, secret rotation, dan uji customer-managed tetap diperlukan.


## Koreksi status terkini — 26 Oktober 2026

Dashboard, bukan konektor Supabase MCP, berhasil memberikan akses baca pada target `ptsasgdvgrbdtgyqieie`. Karena itu pernyataan di snapshot sebelumnya bahwa ledger target belum dapat diperiksa sudah tidak berlaku.

- PR #13 masih Open/Draft, head `b17517d834e6f01eddb0f2df16b3f1378a24edae`, base merge PR #12 `c8738185ff6e5080ae427ef0021ee25681036c40`; CI run [`40245870815`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40245870815) sukses pada kedua job.
- PR #11 masih Open/Draft, head `88f2686d34bbffb1aa1c7997b55cd015c424f85c`, base `backend/supabase-finance-ui` pada `127c67ef2373eb8d5a654ae10f58c4b0fd1c304b`. Perbandingan terhadap head #13 terbaru berstatus `diverged`: #13 398 commit di depan dan 235 di belakang, merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`.
- Target production memiliki 47 migration tercatat hingga `20261206000000`; 34 migration repository dari `20261207000000` hingga `20270109000000` belum tercatat. Paket Supabase Free menyatakan tidak menyediakan backup project terjadwal. RLS aktif di 119 tabel `public`, sedangkan akses Data API ditampilkan sebagai disabled/restricted.
- Pengamatan dashboard dan status migration hanya baca. Tidak ada migration, data, policy, grant, atau konfigurasi target yang diubah. CI memakai database lokal sintetis dan tidak mencakup target production.

Jangan menerapkan migration ke Production. Lanjutkan setelah ada salinan terisolasi yang dapat dipulihkan; lakukan rehearsal 34 migration, validasi jalur service-role/API dan pemulihan, lalu tutup review PR serta login/UAT sebelum menetapkan readiness.


## Penutupan audit paritas fitur PR #11 → #13 — 26 Oktober 2026

Perbandingan file dan jalur runtime menemukan bahwa Master Data/NIS/asrama dan inti Tahfidz memiliki padanan Supabase-native pada #13; bridge Firebase Auth #11 memang digantikan oleh Supabase Auth. Audit juga menemukan tiga gap PPDB yang tidak tertangkap dari perbandingan commit saja: pembuatan/batch kandidat Admin belum terbukti ada, unggah dokumen kandidat belum tersedia di UI/API aktif, dan tagihan/pembayaran kandidat belum terhubung ke Finance. Layar PPDB aktif menyebut integrasi pembayaran masih menunggu cutover.

Rincian bukti, path source, status verifikasi, dan keputusan per fitur ada pada [matriks paritas PR #11 → #13](PR11_TO_PR13_FEATURE_PARITY.md). PR #11 tetap Draft dan tidak digabung utuh. Gap yang dipilih untuk produk harus diimplementasikan sebagai kontrak Supabase baru di #13, kemudian direhearsal pada staging yang dapat dipulihkan sebelum dipertimbangkan selesai.


## Tindak lanjut audit PPDB — 26 Oktober 2026

PR #13 kini memiliki migration baru `20270110000000_ppdb_candidate_finance_bills.sql` dan alur Admin untuk membuat invoice pendaftaran/uang pangkal kandidat. Invoice masuk ke Finance tenant, dibatasi role/tenant, dilindungi idempotensi dan status tutup buku, lalu tertaut ke santri saat onboarding. Bukti wali pasca-onboarding dan settlement memakai kontrak Finance yang ada. PgTAP bertambah 16 pemeriksaan dan berencana menjalankan 73 assertion. Source preflight kini menghitung 82 migration: dari Production yang tercatat pada 47 versi, 35 migration belum dijalankan.

Implementasi belum diverifikasi oleh CI atau staging pada checkpoint ini. Semua flag tetap mati; jangan menerapkan migration di Production. Pembuatan kandidat offline/batch Admin, unggah dokumen privat, impor arsip tagihan, serta pembayaran mandiri wali sebelum onboarding tetap menjadi gap atau keputusan produk. Rincian ada di [matriks paritas](PR11_TO_PR13_FEATURE_PARITY.md) dan [checkpoint pengembangan PPDB–Keuangan](CHECKPOINT_2026-10-25.md#pengembangan-ppdbkeuangan--26-oktober-2026).


### Koreksi status CI — 26 Oktober 2026

Pernyataan “belum diverifikasi oleh CI” di atas adalah snapshot sebelum push dan kini digantikan hasil run [40248840857](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40248840857) pada head `442794bf8f0795facc9257399b047a3994bebcb6`: kedua job berhasil. Suite lokal sintetis menerapkan seluruh 82 migration, memeriksa 73 assertion Finance termasuk tagihan PPDB, menguji izin PPDB+Keuangan dan batas tenant, Storage bukti pembayaran, backup/restore, serta build dan image Docker customer-managed. Ini tidak mengubah atau memvalidasi database Production; 35 migration masih menunggu rehearsal pada staging yang dapat dipulihkan. PR #13 tetap Open/Draft.

## Revalidasi seluruh PR dan checkpoint go-live — 26 Oktober 2026

Status berikut dibaca ulang dari GitHub pada 26 Oktober 2026. Hanya PR #12 yang telah digabung; PR lain tetap Draft dan tidak boleh dianggap selesai hanya karena berada pada stack lama.

| PR | Status | Base → head | Head saat pemeriksaan |
|---|---|---|---|
| #1 | Open / Draft | `main` → `backend/supabase-tenant-foundation` | `736ec92ae86bf195cdaa23fe4b8d5d3797a31891` |
| #2 | Open / Draft | `main` → `product/commercial-readiness` | `98e98a4294c462e3c5d088369ad5db1a7576b88d` |
| #3 | Open / Draft | `backend/supabase-tenant-foundation` → `backend/tenant-user-provisioning` | `515def66fafcb45b8c6bdb11280189fa21675d5b` |
| #4 | Open / Draft | `main` → `deployment/self-hosted-app-container` | `b4cd1b86efd14fca7cb3de0a71e469676d0c03a7` |
| #5 | Open / Draft | `backend/supabase-tenant-foundation` → `backend/supabase-public-ppdb-runtime` | `57b5ec7b5818648b2e67adf5ceae663c416b648e` |
| #6 | Open / Draft | `main` → `docs/supabase-complete-migration-roadmap` | `3732db4f738fa6380938f0799f9212921270ab41` |
| #7 | Open / Draft | `backend/supabase-public-ppdb-runtime` → `backend/supabase-ppdb-admin-runtime` | `0b8bc4e103b8bf83f6da334568f183d0d97ef7d7` |
| #8 | Open / Draft | `backend/supabase-ppdb-admin-runtime` → `backend/supabase-masterdata-onboarding` | `a9fc8809806e667bbbaea908a5e7ece7c0c55d7b` |
| #9 | Open / Draft | `backend/supabase-masterdata-onboarding` → `backend/supabase-finance-foundation` | `c27bace37d6438a209ec3949a133eafaec13c67b` |
| #10 | Open / Draft | `backend/supabase-finance-foundation` → `backend/supabase-finance-ui` | `127c67ef2373eb8d5a654ae10f58c4b0fd1c304b` |
| #11 | Open / Draft | `backend/supabase-finance-ui` → `backend/supabase-masterdata-structures-ui` | `88f2686d34bbffb1aa1c7997b55cd015c424f85c` |
| #12 | Merged | `main` → `tegar` | merge `c8738185ff6e5080ae427ef0021ee25681036c40` |
| #13 | Open / Draft | `main` → `codex/supabase-runtime-cutover-20261022` | `83ca2b096041ceec1e5eab21e7370fe883b14992` |

PR #11 dan #13 berstatus `diverged` dengan merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`: PR #13 memiliki 432 commit unik dan PR #11 memiliki 235 commit unik. Pertahankan matriks paritas per fitur; jangan menggabungkan stack PR #1–#11 secara utuh ke PR #13.

CI terbaru pada head PR #13 `83ca2b096041ceec1e5eab21e7370fe883b14992` lulus di kedua job pada run [`40267474151`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40267474151). Cakupan mencakup typecheck/build, runtime tanpa Firebase, Docker/Compose, 87 migration dan pgTAP pada Supabase lokal, auth/isolasi tenant, Storage, concurrency, importer sintetis, serta backup/restore sintetis.

Pembacaan baca-saja dashboard Supabase target `ptsasgdvgrbdtgyqieie` menunjukkan 47 migration hingga `20261206000000`; repository PR #13 memiliki 87 migration hingga `20270115000000`, sehingga 40 masih pending. Health Advisor tidak tersedia pada project dan belum ada staging/backup Production yang pemulihannya terverifikasi. Tidak ada migration atau data Production yang ditulis.

**Perkiraan kesiapan go-live: 45/100.** CI source saat ini hijau, tetapi upgrade Production, preview dan rekonsiliasi/impor data, login/UAT, serta instalasi/pemulihan pada environment pelanggan masih harus dibuktikan.

## Revalidasi PR dan batas akses — 26 Oktober 2026, head `24015c9`

- GitHub saat pemeriksaan menunjukkan PR #11 **Open/Draft**, base `backend/supabase-finance-ui`, head `88f2686d34bbffb1aa1c7997b55cd015c424f85c`; PR #12 **Merged** ke `main`; PR #13 **Open/Draft**, base `main`, head sebelum catatan ini `24015c9a316bc64a344cea9e3425490920815dec`.
- Perbandingan commit PR #11 → PR #13 berstatus `diverged`, dengan merge-base `f7f8bb098d3a6032eef5a101ad29ae13bc2bf5c8`: PR #13 memiliki 464 commit unik dan PR #11 memiliki 235. Jangan merge PR #11 utuh; teruskan paritas per fitur dan port hanya gap yang disetujui.
- Source PR #13 pada head tersebut berisi 91 migration. GitHub Actions [run 40308481444](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40308481444) lulus pada **2/2 job**, mencakup build/runtime/Docker dan migrasi/pgTAP/API/tenant/Storage/backup-restore sintetis. CI tidak membaca atau mengubah project Supabase target.
- Pemeriksaan sumber Firestore baca-saja mengonfirmasi seluruh 453 dokumen `master_data` dan 50 `candidates` tidak memiliki field tingkat atas `tenantId`. Dokumen pengguna yang tersedia memiliki tenant key yang cocok dengan satu dokumen tenant, tetapi ini tidak menggantikan persetujuan pemetaan kepemilikan setiap record. Rincian pemetaan dan gerbang import ada di [checklist rehearsal migrasi](../06_DATABASE/PRODUCTION_MIGRATION_REHEARSAL_CHECKLIST_2026-10-26.md).
- Pada sesi audit ini, konektor Supabase hanya menampilkan project `vqemuyzveuirlkvdggjd`; akses baca ke target `ptsasgdvgrbdtgyqieie` ditolak. Karena itu keadaan ledger migration, data target, dan status impor saat ini **belum diverifikasi ulang**. Jangan memperlakukan snapshot Production lama sebagai status terkini atau menerapkan migration berdasarkan angka historis.
- Tidak ada migration, data, policy, feature flag, atau konfigurasi Production yang diubah. PR #13 tetap Draft; kesiapan go-live masih menunggu verifikasi target, rehearsal dari backup yang dapat dipulihkan, rekonsiliasi tenant, login/UAT, rotasi credential, dan simulasi deployment pelanggan.
- Estimasi proyek pada checkpoint PR adalah sekitar **73% kematangan fitur / 46% kesiapan go-live**. Ini estimasi, bukan hasil UAT atau ukuran otomatis.

Langkah berikutnya setelah akses target pulih: baca ulang ledger dan tabel target secara baca-saja, jalankan preview setiap importer dengan pemetaan tenant yang disetujui, lalu lakukan rehearsal terisolasi sebelum menerapkan data atau schema ke Production.
