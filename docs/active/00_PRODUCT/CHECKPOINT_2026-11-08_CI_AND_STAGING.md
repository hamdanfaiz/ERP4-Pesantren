# Checkpoint ERP4 Pesantren — CI dan staging

**Diperbarui:** 9 November 2026, 10.05 WIB
**Status:** produk belum dinyatakan siap deploy atau komersial.

## Status terukur terbaru

- PR #90 sudah merged ke `main` (`fd937f4876aa1069500694b9bc20ec70eef8ee14`). PR #91 masih **Open/Draft**. Perubahan kode berada pada `34ca4e6`; commit sesudahnya memperbarui checkpoint/handoff. CI run [#42553902436](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42553902436) lulus **3/3** pada head checkpoint; Supabase Preview dilewati karena branch PR tidak terhubung ke Supabase Branch.
- `npm ci`, `npm run lint`, `npm run build`, dan 15 regresi terpilih lulus sebelum push. Cakupan meliputi pesan aman, feature flags, Supabase-only runtime, RBAC, Master Data, tanggal tenant, Dokumen Digital, pagination Tahfidz, policy API, skema private, dan pendaftaran Wali.
- Build memberi peringatan nonfatal anotasi Zod dan chunk PDF sekitar 1,46 MB. `.env`, `dist/`, dan kredensial tidak disertakan ke commit.
- UAT visual baca-saja berhasil dilanjutkan pada preview Admin UAT `localhost:4179`, yang runtime publiknya menunjuk VQE. Semua kategori/menu utama muncul di navigasi. Tahfidz memuat empty state; Asrama menampilkan lima submodul dan empty state izin. Strip tab Dokumen Digital dapat digulir, tetapi datanya gagal dimuat. Identitas commit source yang menyajikan `localhost:4179` belum dapat dibuktikan sama dengan head PR #91.
- Tidak ada perubahan VQE atau Production. VQE sebelumnya menunjukkan 140/140 nama dan versi ledger sama dengan source; metadata Production yang operator laporkan menunjukkan 47 entri ledger, 119/119 tabel dengan RLS + FORCE RLS dan lima policy `SELECT`. Ini bukan bukti kesamaan DDL atau backup/restore. Detail ada di [rekonsiliasi Production](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-09.md) dan [triase Advisors VQE](../06_DATABASE/VQE_STAGING_ADVISORS_2026-11-09.md).
- Masih terbuka: UAT source-matched, viewport ponsel, UAT Wali dan CRUD seluruh modul, diagnosis/pengaktifan runtime Dokumen Digital di VQE, validasi DDL/urutan migrasi Production, backup/restore Production, serta clean install/upgrade VPS/on-premise.

### Langkah berikutnya

1. Tim backend meninjau PR #91; PR tetap Draft sampai UAT visual/responsif source-matched selesai.
2. Jalankan UAT menu/sub-menu, CRUD representatif, viewport ponsel, dan role/tenant pada staging.
3. Tim backend menyelesaikan validasi migrasi Production, backup/restore rehearsal, dan uji pemasangan lingkungan pelanggan.
Catatan PR #86 di bawah merupakan snapshot historis dan tidak menggantikan status PR #91 yang dirangkum di atas.

## Source dan CI

- `main` saat checkpoint: `c219bbb467e1d2db3385abcaa7b8b1ee14ef0ad9`.
- PR #86 (`fix: return HTTP 409 for stale tenant settings`) telah di-squash merge.
- CI kandidat PR diuji pada head `c34fed60a41c0e13e37e03281b650abffcd58fc7`: [run #42459060708](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42459060708). Build/runtime Docker, pemasangan NPM, dan migrations/API/pgTAP lulus. Supabase Preview dilewati. Belum ditemukan run terpisah setelah merge ke `main`.
- Perubahan memperbaiki konflik versi basi pada simpan Pengaturan Tenant: SQLSTATE `PT409` dipetakan ke HTTP 409. Tes SQL langsung dan API menguji simpan/baca, pemisahan tenant, role, penyaringan rahasia, sinkronisasi zona waktu, serta penolakan penimpaan data terbaru.

## Cakupan otomatis yang terbukti

CI menggunakan Supabase lokal terisolasi dan fixture sintetis. Log job database mencatat:

- Round-trip API, relasi, simpan-baca, idempotensi, pembatasan role dan isolasi tenant untuk Akademik, CBT, LMS, HRIS, Koperasi, CRM, komunikasi, Laundry, Donasi/Wakaf, Dokumen, Kesehatan, Tahfidz, Perpustakaan, fasilitas, Urusan Umum, katalog referensi, PPDB, dan Finance.
- Uji konkurensi NIS, slot pengajar Tahfidz, kapasitas kamar, status gedung, dan status tenant.
- Alur Storage sintetis untuk bukti Finance/dokumen PPDB, aset Perpustakaan, dan Dokumen Digital.
- Smoke test backup/restore lokal yang memulihkan satu record tenant sintetis.
- Build aplikasi, konfigurasi Docker pelanggan, smoke test image, guard runtime Supabase-only, autentikasi route API, serta instalasi dari lockfile NPM.

Ini bukan bukti bahwa setiap menu/form/tombol sudah diuji melalui browser. Uji lokal CI juga bukan UAT pada staging HTTP, bukan hosting calon pelanggan, dan bukan backup/restore Production.

## Supabase staging VQE

- Proyek `vqemuyzveuirlkvdggjd` terdeteksi `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.003.
- Pembacaan ulang `list_migrations` mencatat **140/140 versi dan nama** yang cocok dengan direktori `supabase/migrations` pada worktree ini, hingga `20270308000000_academic_class_unit_admin_role_baseline`.
- Kecocokan ledger membuktikan versi/nama saja, bukan bahwa seluruh DDL aktual identik atau seluruh modul telah UAT. Belum dilakukan UAT browser lengkap untuk role/tenant, CRUD semua modul, Storage dari hosting, dan tampilan responsif.

## Supabase Production PTSAS

- Proyek target Production: `ptsasgdvgrbdtgyqieie`.
- Operator melaporkan bahwa MCP Codex Desktop berhasil membaca metadata: **47 entri migration ledger** sampai `20261206000000` (baris `20261205000000` dan `20261206000000` tidak mengembalikan nama), **119/119 tabel `public` dengan RLS + FORCE RLS**, dan lima policy `SELECT` untuk `authenticated` pada `candidate_documents`, `candidates`, `profiles`, `tenants`, serta `user_profiles`. Pemeriksaan grant yang dibagikan tidak menemukan grant tabel langsung untuk `PUBLIC`, `anon`, atau `authenticated`.
- Worktree ini memuat 140 file migration. Selisih jumlah source dan ledger **tidak** berarti 93 migration siap diterapkan; objek DDL mungkin sudah ada, sebagian hanya metadata/version berbeda, atau memang belum ada. Tim backend harus cocokkan DDL dan lineage satu per satu sebelum rehearsal/dry-run.
- Hasil tersebut adalah inventaris katalog/metadata baca-saja yang dilaporkan operator; ini bukan schema diff seluruh DDL, bukan uji route/API, dan bukan bukti backup/restore. Tidak ada perubahan Production.
- Pemeriksaan ulang sesi ini melalui `supabase_list_migrations` pada project PTSAS kembali ditolak (`You do not have permission to perform this action`). Maka 47 versi di atas tetap merupakan snapshot yang dilaporkan operator, bukan hasil baca langsung yang berhasil diulang oleh konektor pada sesi ini. Tidak ada pembacaan baris aplikasi atau operasi tulis.
- Tim backend menangani schema diff DDL, urutan migrasi, backup/restore rehearsal, dry-run, dan UAT hosting. Jangan menyamakan jumlah ledger lalu menjalankan migrasi secara massal.

### Pembandingan metadata migrasi — 9 November 2026

- Source PR #91 head `f882af0de993f27105ff5362f9f47cac592db233` berisi 140 file migrasi. Daftar nama dan blob SHA seluruh file dibandingkan dengan tree `HEAD` lokal: **140/140 identik**. Ini membuktikan source migrasi pada ref tersebut sama, bukan seluruh source aplikasi.
- Terhadap ledger Production 47 versi yang dilaporkan operator, 47 versinya ditemukan pada source; **93 versi source tidak tercantum** pada ledger yang dilaporkan. Daftar lengkap dan pemetaan ada di [rekonsiliasi Production 9 November](../06_DATABASE/PTSAS_PRODUCTION_RECONCILIATION_2026-11-09.md).
- Selisih 93 adalah daftar triase, bukan instruksi `db push`. DDL aktual, backup/restore, dan riwayat penerapan Production belum diperiksa oleh agen. Tidak ada perubahan Production.

## Gerbang sebelum dinyatakan selesai

1. Jalankan preflight schema/ledger baca-saja terhadap VQE dari source `main` yang sama dengan kandidat rilis, lalu simpan hasilnya tanpa secret atau data pribadi.
2. Lakukan UAT browser pada staging: login Admin dan Wali, matriks role/tenant, alur CRUD dan relasi per modul, impor/ekspor, transaksi kritis, Storage, error/retry, dan tampilan responsif.
3. Uji clean install, upgrade, dan pemulihan image/config di VPS Linux serta satu environment on-premise representatif.
4. Tim backend membandingkan DDL Production, memeriksa urutan migration, dan membuktikan backup serta restore di target terisolasi. Production tetap tidak disentuh sampai ada change plan yang disetujui pemilik dan tim.
5. Catat hasil UAT serta batas operasional, lalu tetapkan harga, lisensi, support, dan klaim penawaran berdasarkan kemampuan yang sudah diterima.

Lihat [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md) untuk gerbang rilis lengkap dan [BACKEND_TEAM_START_HERE.md](BACKEND_TEAM_START_HERE.md) untuk handoff tim backend.

## Diagnosis source-only — 9 November 2026

Pemeriksaan source menemukan dua lapis feature gate yang harus sama-sama siap:

- `src/runtimeBackend.ts` menetapkan `SUPABASE_ONLY_RUNTIME=true`, sehingga antarmuka memakai jalur Supabase meski flag `VITE_*` tertentu kosong.
- API server tetap mengunci layanan secara terpisah. `SUPABASE_TAHFIDZ_RUNTIME_ENABLED` mengendalikan endpoint Tahfidz; `SUPABASE_BOARDING_RUNTIME_ENABLED` mengendalikan snapshot Asrama; `SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED` mengendalikan Perizinan. `.env.example` dan `docker-compose.yml` memakai nilai default `false` untuk gate tersebut. Endpoint yang terkunci mengembalikan HTTP 503.
- Karena itu, UI dapat tampil dan mencoba memuat modul sementara API server tetap menolak layanan. Ini **kandidat penyebab**, belum terbukti sebagai nilai konfigurasi preview yang sedang berjalan.

Pemeriksaan statis juga menemukan **35/35** flag `SUPABASE_*_RUNTIME_ENABLED` yang dipakai server tercantum di `.env.example` dan dipetakan di `docker-compose.yml`; seluruh nilai default Compose adalah `false`. Tidak ditemukan flag runtime server yang hilang dari kedua berkas konfigurasi tersebut. Ini memeriksa kelengkapan template, bukan konfigurasi aktif preview.

Pada pemeriksaan source, `GET /health/ready` hanya membuktikan kesiapan identity store; endpoint itu tidak memeriksa gate per modul. `GET /api/tahfidz/snapshot` tanpa token mengembalikan `401`, yang hanya membuktikan route meminta autentikasi. Nilai env runtime preview dan respons request Admin terautentikasi belum terbaca pada pemeriksaan ini.

Langkah operator saat tersedia:

1. Pada konfigurasi backend preview VQE `localhost:4180`, periksa status boolean **server-side** untuk tiga flag di atas. Jangan membagikan `.env`, key, token, atau header autentikasi.
2. Pastikan flag dinyalakan hanya bila migration dan UAT prasyarat untuk modul tersebut sudah diterima. Jika memang belum siap, biarkan `false` dan sembunyikan/tandai fitur secara wajar di UI.
3. Setelah perubahan konfigurasi, restart/redeploy service backend; lalu login sebagai Admin dan baca ulang Tahfidz, snapshot Asrama, dan Perizinan. Catat status HTTP/error yang sudah disamarkan, serta verifikasi tanpa membuat atau mengubah record.
4. Jangan mengubah Production PTSAS untuk diagnosis ini. Tidak ada konfigurasi staging atau Production yang diubah oleh pemeriksaan source-only ini.

## Advisor staging VQE — baca-saja, 9 November 2026

Pemeriksaan Supabase MCP terhadap project staging `vqemuyzveuirlkvdggjd` tidak membaca record aplikasi dan tidak mengubah database.

- Advisor keamanan memberi `INFO` **162 tabel RLS tanpa policy** dan `WARN` **perlindungan kata sandi bocor dinonaktifkan**. Katalog grant menunjukkan hanya 5 tabel `public` yang memberi `SELECT` ke `authenticated` (`candidate_documents`, `candidates`, `profiles`, `tenants`, `user_profiles`); kelimanya memiliki policy `SELECT` yang mengikat akses ke pengguna/tenant aktif dan role Admin yang sesuai. Tidak ditemukan grant tabel ke `anon` atau `PUBLIC` dalam ringkasan baca-saja. Karena modul operasional dilayani melalui server backend, status “RLS tanpa policy” konsisten dengan tabel server-only, tetapi keamanan tetap bergantung pada pemeriksaan role/tenant setiap route backend dan kerahasiaan server key.
- Metadata Storage staging menunjukkan `storage.objects` RLS aktif tanpa policy, dan bucket lampiran dokumen serta aset perpustakaan ada dalam keadaan privat. Source membuat reserve melalui route terautentikasi, lalu server menandatangani token untuk satu path; browser mengunggah hanya memakai token tersebut. Ini cocok dengan model kapabilitas terbatas dan tidak membenarkan policy bucket publik atau policy browser luas. UAT upload, finalisasi, unduh, dan isolasi tenant masih perlu lulus pada staging. Rujukan: [kontrol akses Storage](https://supabase.com/docs/guides/storage/security/access-control) dan [signed upload URL](https://supabase.com/docs/reference/python/storage-from-createsigneduploadurl).
- Dokumentasi Supabase menyebut perlindungan kata sandi bocor memakai Pwned Passwords dan tersedia pada paket Pro ke atas ([panduan keamanan kata sandi](https://supabase.com/docs/guides/auth/password-security)). Tinjau kelayakan paket dan aktifkan di Production saat paket mendukungnya; jangan menyalin password atau key ke laporan.
- Advisor performa memberi `INFO` **258 foreign key tanpa indeks penutup** dan **80 indeks tidak terpakai**. Ini berasal dari staging dan belum membuktikan bottleneck Production. Tinjau query-plan serta beban nyata sebelum menambah indeks atau menghapus indeks; jangan hapus indeks hanya karena staging belum menggunakannya. Rujukan: [foreign key tak terindeks](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) dan [indeks tidak terpakai](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Advisor kesehatan tidak mengembalikan temuan. Ringkasan log 24 jam menunjukkan sumber log yang tersedia (Edge, Auth, Storage, PgBouncer, Postgres, PostgREST, Realtime, Workflow); belum ada ekstraksi isi log error aplikasi karena log Supabase tidak membuktikan nilai env server pada preview.

Temuan ini menambah checklist hardening dan tuning, bukan izin untuk mengubah Production atau menyalakan flag runtime staging secara massal.

## Koreksi UI dan verifikasi build — 9 November 2026

- Pemeriksaan browser Admin pada Data Induk menemukan bahwa ketika request Aturan Penomoran gagal, komponen menampilkan pesan error sekaligus status kosong. Source kini hanya menampilkan status kosong setelah pemuatan sukses; saat gagal, pesan error dan tombol **Muat ulang** tetap tersedia.
- `npm run build` lulus; `npm run lint` lulus; `npm run test:naming-series-catalog` lulus (6 pemeriksaan kontrak). Build memberi peringatan chunk besar dan anotasi komentar dependency yang dihapus Rollup; tidak ada error build.
- Tab bersama `ERPTabs` sudah menggunakan `overflow-x: auto`, tab tidak mengecil, dan scrollbar tipis diatur di `src/index.css`. Perilaku pada viewport ponsel serta build baru belum diverifikasi melalui browser. Preview localhost yang diperiksa masih menampilkan build lama dan pesan ganda, jadi itu bukan bukti hasil koreksi source terbaru.
- Tidak ada operasi tulis ke VQE atau PTSAS. Nilai environment server preview tetap belum diverifikasi; UAT Tahfidz/Asrama, Storage, dan transaksi browser masih terbuka.

## Standar pesan pengguna — 9 November 2026

- Pemeriksaan menemukan banyak layar mengirim `error.message` mentah langsung ke pengguna. Fungsi `toERPUserMessage` kini juga membaca objek error Supabase, lalu memetakan gangguan jaringan, sesi/akses, kredensial masuk, tautan kedaluwarsa, pembatasan percobaan, serta kata sandi ke pesan Bahasa Indonesia yang aman.
- Pemanggilan langsung pada modul Supabase aktif, autentikasi Wali/Admin, formulir Data Induk, dan komponen terkait kini melewati penyaring pusat. Validasi bisnis yang aman tetap bisa ditampilkan; detail provider, SQL, endpoint, token, dan stack trace diarahkan ke fallback.
- `Pendaftaran Portal Wali belum diaktifkan untuk lingkungan ini` diganti dengan instruksi yang dapat dipahami pengguna tanpa istilah konfigurasi environment. Pengguna tetap diberi tahu bahwa pendaftaran belum tersedia dan bagaimana meminta bantuan.
- Pemeriksaan source tidak menemukan lagi tampilan `.message` mentah dari error pada layar aktif; temuan `issue.message` yang tersisa adalah pesan validasi formulir yang dibuat Zod, bukan pesan backend.
- Pemeriksaan lanjutan menangkap satu jalur tambahan pada impor/ekspor Data Induk: error request serta rincian pesan per baris kini melewati penyaring yang sama agar detail SQL/provider tidak bocor. File legacy `CommunicationHubLegacy` dan `FinanceManagerLegacy` masih memakai pesan exception langsung, tetapi tidak ditemukan referensi/import dari source aplikasi aktif; bila salah satunya diaktifkan kembali, pesan harus melewati penyaring. Berkas impor santri kini menerima status Bahasa Indonesia (Aktif, Tidak Aktif, Ditangguhkan) sambil menyimpan nilai kanonis yang sama. Patch impor/ekspor dan alias status ini belum dibuild setelah perubahan sesi 9 November.
- Pemeriksaan literal terhadap contoh pesan internal yang pernah terlihat di preview (ringkasan sumber data, isolasi tenant, mode Supabase, dan gate tagihan PPDB) tidak menemukan teks tersebut di source saat ini. Bagian Manajemen Pengguna hanya menjelaskan tugas pengguna Admin dengan bahasa produk, tanpa instruksi operator/backend.
- Panduan visibilitas modul diperbarui agar sesuai source: data terkait dimiliki modul masing-masing tanpa tombol pengalihan; Jejak Audit Data Induk tersedia khusus untuk Santri/Struktur; status Akademik dan Sarana & Prasarana dikoreksi; label CBT, LMS, Sarana & Prasarana, dan Tahfidz dilokalkan.
- Setelah perubahan akhir, `npm run build` dan `npm run lint` lulus. Tes PPDB publik, kelayakan kamar onboarding PPDB, pagination Tahfidz, penjagaan runtime Supabase-only, verifikasi undangan Wali, callback pendaftaran Wali React StrictMode, redirect pemulihan kata sandi, katalog Naming Series, serta 5 skenario pemetaan pesan aman juga lulus. Build masih memperingatkan ukuran chunk React-PDF yang besar dan anotasi komentar dependency; tidak ada error build.
- Regression test permanen `npm run test:user-messages` sekarang mencakup 11 skenario dan masuk workflow CI. `npm run test:ci-coverage` lulus serta mengonfirmasi semua **56 skrip test package** tetap dijadwalkan workflow.
- Verifikasi terbaru atas patch impor/ekspor: `npm run build`, `npm run lint`, `npm run test:user-messages`, `npm run test:master-data-transfer-csv`, dan `npm run test:master-data-student-import-plan` lulus. Tes rencana impor kini mencakup status “Aktif”, “Tidak Aktif”, “Ditangguhkan”, serta penolakan nilai tak dikenal dan pemetaan ke nilai basis data kanonis. Build tetap memberi peringatan nonfatal anotasi Zod dan chunk besar (PDF sekitar 1,46 MB). Ini bukan UAT UI atau koneksi live.
- Preview `localhost:4180` yang dilihat pada browser masih memperlihatkan build lama dan pesan ganda Aturan Penomoran. Perubahan source terbaru belum disajikan oleh preview, jadi belum ada klaim bahwa perbaikan tampak di browser. Belum ada UAT CRUD penuh, upload Storage, matriks tenant/role, atau transaksi browser pada build terbaru.
- Semua kerja pada bagian ini bersifat lokal/read-only terhadap cloud. VQE dan Production PTSAS tidak ditulis atau diubah.

## Navigasi tab pada layar sempit — 9 November 2026

- `ERPTabs` kini mengukur lebar konten; tombol gulir kiri/kanan yang memiliki label aksesibel muncul hanya ketika tab melebihi lebar wadah. Tombol dinonaktifkan di batas gulir, scrollbar native tetap tersedia, dan gerak halus mengikuti preferensi `prefers-reduced-motion`.
- Ketika perubahan nilai memilih tab di luar viewport, kontrol bersama menggulir tab aktif ke dalam frame; perubahan ini juga melengkapi navigasi Tahfidz yang memiliki sepuluh bagian.
- Inventaris source menemukan 28 file halaman/komponen yang memakai `ERPTabs` dan 10 halaman legacy yang memakai `.erp-tab-scroll` dengan gulir native. Audit rute aktif `App.tsx` menunjukkan menu modul operasional multi-bagian memakai komponen bersama; Pengaturan memakai daftar vertikal sehingga tidak memerlukan gulir horizontal. Ini pemeriksaan statis, bukan UAT viewport untuk build terbaru.
- Label Tahfidz yang masih berbahasa Inggris pada navigasi dan pencapaian sudah dilokalkan, termasuk “Ringkasan Halaqah”, “Riwayat Setoran Terbaru”, “Target & Rapor”, “Poin Pengalaman”, dan “Lencana Baru”.
- Perubahan berlaku pada modul yang memakai `ERPTabs`, termasuk Tahfidz; tidak perlu redirect atau memotong label tab. Acuan diperbarui di `docs/active/11_UI_UX/DESIGN_SYSTEM.md`.
- `npm run build`, `npm run lint`, dan `git diff --check` lulus setelah perubahan source terakhir. Build tetap memberi peringatan nonfatal tentang chunk React-PDF besar serta anotasi komentar dependency; tidak ada error.
- Dari 45 regresi lokal terpilih pada source yang sama, **42 lulus**. Cakupannya meliputi impor dan relasi Master Data/PPDB, Naming Series, akun Wali, pagination/otorisasi Akademik dan Tahfidz, Dokumen, Keuangan, CBT, Perpustakaan, RBAC, pesan aman, konfigurasi pelanggan, serta guard Firebase. `test:ci-coverage` mengonfirmasi 56 skrip tetap dijadwalkan di CI. Ini bukan bukti semua 56 telah lulus lokal atau pengganti UAT browser/database live.
- Tiga pemeriksaan lokal belum berjalan tuntas karena lingkungan: `test:api:auth-tenant` berhenti karena Supabase CLI (`supabase`) tidak terpasang (Docker CLI juga tidak tersedia); `test:runtime-config-http` dan `test:trusted-proxy-hops` terhalang koneksi loopback (`EACCES`/tidak mendapat respons HTTP) dalam sandbox. Langkah setara untuk API auth/tenant, endpoint runtime config, dan trusted proxy lulus pada CI PR #91 (3/3 job); ini memvalidasi source CI, bukan eksekusi lokal. Tidak ada perubahan cloud.
- Tampilan belum diverifikasi secara visual di preview/browser pada ukuran ponsel, sebab preview yang sedang dibuka bukan hasil build terbaru. Tidak ada perubahan pada Supabase staging maupun Production.

## Pemeriksaan preview Tahfidz dan tata letak — 9 November 2026

- Preview `localhost:4179` sudah memiliki sesi Admin UAT, tetapi port `4179` dan `4180` tidak memiliki listener saat diperiksa. Halaman yang masih tampak di tab browser adalah halaman lama/cache, bukan build yang sedang berjalan dari worktree ini; karena itu perubahan source terbaru belum dapat diverifikasi melalui preview.
- Tampilan lama memperlihatkan header Tahfidz menyempit pada lebar viewport menengah, tombol aksinya melewati frame, tab terpotong, dan ada copy internal tentang backend/API. Source lokal dibenahi agar header Tahfidz baru bertumpuk sampai lebar `xl`, tombol dapat membungkus, label teknis internal dihilangkan, dan label `AI Audio Assessment` diterjemahkan menjadi **Penilaian Suara Otomatis**.
- Komponen tab lokal sudah memiliki tombol gulir kiri/kanan yang tampil saat overflow, tetapi halaman preview lama yang terbuka belum memuat source tersebut. Setelah server preview dinyalakan dari worktree ini, lakukan pemeriksaan ulang Tahfidz dan viewport responsif. Jangan menganggap halaman `4179` lama sebagai bukti hasil patch.
- `npm run build` lulus setelah patch header/copy. Build mengeluarkan peringatan yang sudah dikenal untuk komentar anotasi Zod dan ukuran chunk React-PDF; tidak ada error. Hasil build belum dibuka sebagai preview, jadi tata letak akhir tetap perlu pemeriksaan visual setelah server dijalankan dari worktree ini.
- Perubahan ini lokal saja; tidak ada operasi cloud atau manual yang dilakukan.

## Verifikasi statis dan prasyarat preview — 9 November 2026

- `npm run test:supabase-runtime-no-firebase` lulus: 155 modul pada graph produksi tidak memuat dependency Firebase; 26 rute Supabase aktif, rute migrasi arsip yang dipensiunkan tetap tertutup, dan tidak ada penulisan `localStorage` aktif. `sessionStorage` hanya dipakai untuk sesi Supabase Auth dan kunci idempotensi sementara.
- `npm run test:user-messages` lulus (11 skenario); `npm run test:customer-deployment-flags` lulus (30 nilai konfigurasi publik terizinkan dan 37 gate server tetap fail-closed); `npm run test:ci-coverage` lulus (56 skrip test tercakup dalam workflow CI); `npm run lint`/TypeScript dan `npm run build` lulus.
- Build masih memberi peringatan nonfatal tentang anotasi komentar dependency Zod dan ukuran chunk React-PDF. Tidak ada error build.
- Worktree kini memiliki `.env` lokal yang diabaikan Git dan hanya menunjuk ke VQE staging; URL/password database serta feature gate runtime tidak ada di dalamnya. Perintah `supabase` dan `docker` tetap tidak tersedia. Preview dari worktree ini belum berhasil dijalankan karena bind gagal `EADDRINUSE`; endpoint lokal tidak dapat dijangkau, sehingga UAT autentikasi/API pada source terbaru belum dilakukan.
- `git fetch origin main` kembali gagal dengan `getaddrinfo() thread failed to start`. Ref lokal tidak berubah; tidak ada push/merge. Periksa ulang konektivitas sebelum sinkronisasi PR #91.
- Tidak ada koneksi maupun perubahan ke VQE atau Production PTSAS dalam pemeriksaan ini.

## Rekonsiliasi sumber dan handoff — 9 November 2026

- GitHub read-only melaporkan PR #91 masih **Draft/Open**, head `f882af0de993f27105ff5362f9f47cac592db233`, dan CI #1428 lulus 3/3. Deskripsi PR menyatakan UAT UI belum lulus untuk pemuatan Tahfidz dan izin Asrama; Production, UAT lengkap, serta deployment pelanggan masih menjadi gerbang terbuka.
- Checkout lokal yang sedang diperbarui berada pada commit lokal-only `8d2859a2d2e2ecc276ea88516a4e7a87f43dd561`, satu commit di atas remote-tracking `origin/codex/product-copy-cleanup-20261108`=`7b580ed30b276f79db94dd43c9930d925e8cdd01`. Ada 63 path lokal yang berubah/belum di-commit per checkpoint ini, termasuk normalisasi pesan dan kontrol gulir tab.
- Perbandingan commit baca-saja GitHub memastikan head PR `f882af0` **19 commit di depan** remote-tracking `7b580ed` (0 commit di belakang); commit lokal-only `8d2859a` tidak dikenal GitHub. `git fetch` lokal gagal karena DNS/network (`getaddrinfo() thread failed to start`); tidak ada perubahan ref. Jangan menimpa atau mendorong branch PR dari ref lokal sebelum fetch/rekonsiliasi.
- Source lokal saat ini lulus `npm run build`, `npm run lint`, dan `git diff --check`. Hasil ini berlaku untuk working tree lokal, bukan bukti CI pada head PR saat ini atau bukti tampilan preview.
- Belum ada perubahan cloud, push, atau merge pada sesi ini. Setelah tersedia jaringan/otorisasi repo yang sesuai, cocokkan commit dan patch lokal dengan head PR sebelum mengirim perubahan agar pekerjaan pada PR tidak tertimpa.

## Pemeriksaan browser saat ini — 9 November 2026, sekitar 04.25 WIB

- Tab Chrome yang masih terbuka pada `localhost:4180` memuat sesi **Admin UAT**. Di Tahfidz, tab melampaui lebar wadah tetapi tetap berada di dalam frame; tombol gulir kiri/kanan serta scrollbar terlihat. Klik tombol gulir kanan memindahkan tab strip dan mengungkap tab berikutnya. Ini membuktikan kontrol gulir berfungsi pada viewport desktop tersebut; tampilan ponsel belum diperiksa.
- Snapshot Tahfidz pada preview menunjukkan roster dan metrik bernilai nol serta pesan layanan belum dapat diproses. Karena itu, pemeriksaan ini hanya membuktikan navigasi tab dan render UI; belum membuktikan backend Tahfidz atau data UAT berfungsi.
- Snapshot Dashboard pada halaman yang masih terbuka sempat menampilkan teks internal `Runtime Dashboard Supabase belum diaktifkan operator.` Pencarian menyeluruh pada source checkout ini tidak menemukan literal tersebut; teks ditemukan di beberapa salinan `server.ts` pada worktree lama lain. `netstat` tidak menemukan proses yang mendengarkan pada `4179`, `4180`, `4173`, atau `5173`; tab Chrome tetap memegang UI yang sudah dimuat, sehingga identitas server/build yang sebelumnya mengembalikan pesan itu belum dapat dibuktikan.
- Pemeriksaan ini memperjelas catatan lama: visual tab diperiksa pada halaman yang masih tersimpan di Chrome, bukan pada server yang saat ini berjalan dari working tree ini. Jangan menganggap tampilan Dashboard itu sebagai hasil source terbaru; identifikasi checkout/build server preview sebelum UAT dan jangan menyalin teks tersebut ke source tanpa bukti. Tidak ada data atau konfigurasi cloud yang diubah.

## Persiapan preview lokal — 9 November 2026, sekitar 04.40 WIB

- `.env` pada worktree aktif telah dibuat dari konfigurasi lokal yang ref dan URL-nya terverifikasi menunjuk ke VQE staging. Hanya variabel URL, publishable/secret key Supabase, JWKS, dan kunci PII yang diperlukan yang disalin; `SUPABASE_DB_URL`, password database, serta seluruh flag runtime server tidak disalin. File `.env` diabaikan Git. Tidak ada secret atau nilai konfigurasi sensitif yang dicatat di dokumen ini.
- Server lokal belum berhasil hidup: `npm run dev` gagal bind dengan `EADDRINUSE` pada port 4179 dan 4181, sedangkan pemeriksaan HTTP lokal tidak mendapat koneksi. Kedua sesi server berakhir; tidak ada klaim bahwa preview aktif. Upaya tidak diteruskan ke port-port lain secara berulang.
- Environment staging tidak berisi flag `SUPABASE_*_RUNTIME_ENABLED`. Sesuai default fail-closed pada source, endpoint modul belum diaktifkan. Flag belum diubah karena perlu memastikan gate per modul hanya dibuka setelah prasyarat dan cakupan UAT VQE disepakati. Lanjutkan pemeriksaan setelah server preview dapat berjalan dan sesi Admin VQE bisa digunakan.

## Audit sinkronisasi perubahan lokal terhadap PR #91 — 9 November 2026, sekitar 04.50 WIB

- GitHub read-only mengonfirmasi PR #91 masih **Draft/Open**, base `main` pada `fd937f4876aa1069500694b9bc20ec70eef8ee14`, head `f882af0de993f27105ff5362f9f47cac592db233`. Workflow run #1428 lulus pada ketiga job: migration/API/pgTAP, instalasi NPM pelanggan, dan build frontend/guard bundle Firebase.
- Working tree lokal pada `8d2859a2d2e2ecc276ea88516a4e7a87f43dd561` memiliki 63 path berubah/belum terlacak. Dari 52 path yang juga disentuh PR, **45** blob pada PR masih sama dengan `HEAD` lokal, sementara **7** sudah berbeda pada PR head; semua 52 isi working tree lokal berbeda dari PR head. Ada **11 path lokal-only**.
- Perbandingan blob GitHub memastikan PR head sudah memiliki gulir horizontal native dan scrollbar pada `ERPTabs` (`overflow-x: auto`), sesuai permintaan agar tab panjang tetap di dalam frame; deskripsi PR juga mencatat gulir Tahfidz telah terlihat dan digerakkan pada UAT desktop. Working tree lokal menambahkan tombol panah gulir dan auto-scroll ke tab terpilih; peningkatan tambahan itu belum menjadi bagian PR head dan belum terbukti pada build baru.
- Temuan ini mempertegas bahwa working tree lokal tidak aman untuk dipush langsung: PR head memiliki perubahan berbeda pada tujuh file dan working tree membawa 63 perubahan yang belum menjadi commit. `git fetch` sebelumnya gagal karena jaringan/DNS. Setelah konektivitas tersedia, lakukan fetch PR head, review/rekonsiliasi per file, lalu jalankan ulang bukti build/CI pada kandidat yang benar sebelum memperbarui PR. Jangan menimpa branch atau menganggap perubahan lokal sudah dikirim.
- Perbandingan ini hanya membaca hash blob dan metadata PR; tidak membaca data aplikasi atau mengubah GitHub, Supabase staging, maupun Production.

## Pemeriksaan preview dari PC — 9 November 2026, sekitar 05.00 WIB

- Port 3000 kosong. `npm run dev` dapat menjalankan server dari sesi kerja dengan `HOST=127.0.0.1` dan `PORT=3000`, menghasilkan `Server listening on 127.0.0.1:3000`.
- Request HTTP dari sesi kerja ke `127.0.0.1:3000` ditolak OS (`socket ... forbidden by its access permissions`); Chrome Windows juga mendapatkan `ERR_CONNECTION_TIMED_OUT`. Karena itu preview dalam sesi kerja terisolasi dari browser PC. Server sesi kerja sudah dihentikan; tidak ada proses yang ditinggalkan.
- Berikutnya perlu dijalankan dari PowerShell PC pada checkout ini, bukan melalui sesi shell terisolasi: set `HOST=127.0.0.1`, `PORT=3000`, lalu `npm run dev` dan buka `http://localhost:3000/`. File `.env` tetap lokal dan tidak perlu dibagikan. Setelah halaman terbuka, lakukan pemeriksaan UI pada source terbaru; jika meminta login, pemilik harus mengisi sendiri dan saya tidak akan menangani kredensial.
- Ini kendala jalur loopback antara sesi kerja dan browser, bukan bukti bahwa aplikasi atau koneksi Supabase gagal. Belum ada perubahan Supabase VQE atau PTSAS Production.

## Lanjutan pemeriksaan UI dan build — 9 November 2026

- Pemilik menjalankan preview dari PowerShell dengan `HOST=127.0.0.1` dan `PORT=3000`. Server mengonfirmasi `Server listening on 127.0.0.1:3000`; port WebSocket pengembangan `24678` sedang digunakan proses lain. HTTP server tetap hidup, tetapi pembaruan otomatis (HMR) mungkin tidak berfungsi penuh.
- Chrome berhasil membuka `http://localhost:3000/`, tetapi halaman yang tampil saat pemeriksaan ini adalah layar masuk. Tidak ada kredensial yang dimasukkan; pemeriksaan visual setelah autentikasi menunggu sesi Admin pemilik.
- `npm run build` lulus dan menghasilkan bundle aplikasi serta server. Peringatan: beberapa komentar `@__PURE__` dependency diabaikan Rollup dan ada chunk `react-pdf` besar (sekitar 1,46 MB sebelum gzip); build tidak gagal.
- `npm run lint` (`tsc --noEmit`) lulus.
- Tahfidz menggunakan komponen bersama `ERPTabs`; source menyediakan scrollbar horizontal native, tombol gulir kiri/kanan ketika tab melampaui lebar wadah, dan membawa tab aktif ke area terlihat. Ini telah diperiksa pada source dan build, tetapi belum diverifikasi lagi secara visual pada sesi Admin terbaru.
- Modul Asrama yang digunakan aplikasi adalah keluarga `SupabaseBoarding*Manager`. Semuanya dirender di dalam `.erp-boarding-theme`, dan stylesheet mengarahkan permukaan `bg-white`, permukaan sekunder, border, serta teks ke token tema ERP. Karena Chrome saat ini berhenti di layar masuk, keluhan visual tentang panel putih belum dapat direproduksi/dinyatakan tuntas dari browser pada sesi ini.
- Tidak ada perubahan pada Firebase, Supabase staging/Production, GitHub, atau status PR. Tidak ada credential/secret yang ditulis ke dokumen ini.

## Checkpoint jeda pengembangan — 9 November 2026, 05.45 WIB

- Perubahan lokal terbaru pada lima submodul Asrama mengganti warna panel, latar sekunder, teks, border, pemisah tabel, serta hover menjadi token `--erp-*` langsung. Perubahan menyasar `SupabaseBoardingAssignmentsManager.tsx`, `SupabaseBoardingAttendanceManager.tsx`, `SupabaseBoardingDisciplineManager.tsx`, `SupabaseBoardingFacilityOpsManager.tsx`, dan `SupabaseBoardingPermitsManager.tsx`. Tujuannya menghilangkan ketergantungan warna dasar pada pemetaan selector lama; status/error berwarna tetap memakai warna semantik.
- Setelah perubahan tema tersebut, `npm run build` lulus dan menghasilkan CSS utility untuk token permukaan/teks. `npm run lint` (`tsc --noEmit`) lulus. `git diff --check` tidak menemukan whitespace error; Git hanya memberi peringatan normal bahwa beberapa file LF akan dinormalisasi ke CRLF.
- Build masih memberi peringatan ukuran chunk besar, terutama `react-pdf` sekitar 1,46 MB sebelum gzip, serta komentar dependency yang diabaikan Rollup. Peringatan ini tidak menggagalkan build dan menjadi optimasi terpisah.
- Preview dari PC tetap pada `http://localhost:3000/`; server HTTP mendengarkan, sementara port WebSocket pengembangan `24678` sudah dipakai proses lain. Chrome menunjukkan layar masuk pada saat terakhir diperiksa. Pemeriksaan visual Asrama/Tahfidz setelah login dan responsif ponsel belum dilakukan ulang; jangan menganggap tampilan Asrama yang dikeluhkan sudah lolos UAT.
- Working tree memuat 66 jalur lokal: 63 file terlacak berubah dan 3 file belum terlacak. Perubahan tersebut belum direkonsiliasi dengan PR #91 dan beberapa file lokal-only. Jangan push atau merge seluruh working tree. Sebelum melanjutkan perubahan GitHub, fetch PR head dan rekonsiliasi seluruh jalur ini dengan PR yang aktif.
- Tidak ada operasi Firebase, Supabase staging/Production, GitHub, deployment, atau pengubahan ledger pada checkpoint ini. File `.env` tetap lokal dan tidak dicatat/ditampilkan.
- **Titik lanjut:** mulai dari checkpoint ini; pastikan server/port preview yang dipakai dan checkout sumbernya, minta pemilik masuk sendiri bila layar login muncul, lalu verifikasi panel Asrama pada tema gelap dan terang serta strip tab Tahfidz di viewport desktop dan ponsel. Setelah bukti UI, jalankan pemeriksaan staging yang sudah disetujui; Production tetap tidak disentuh sampai sinkronisasi source dan migrasi ditinjau bersama tim backend.

## Pemeriksaan ulang konfigurasi preview dan regresi — 9 November 2026, 08.55 WIB

- Penyebab konfigurasi yang dapat direproduksi: `.env` lokal VQE sebelumnya tidak memiliki flag `SUPABASE_*_RUNTIME_ENABLED` maupun `VITE_SUPABASE_*_RUNTIME_ENABLED`. Server membaca flag modul secara fail-closed dan membalas `503` ketika modul belum diaktifkan; UI Supabase-only tetap merender modul, sehingga kegagalan ini tampak seperti modul tidak memuat data.
- Setelah memastikan `SUPABASE_PROJECT_REF` dan `SUPABASE_URL` lokal tepat menunjuk VQE `vqemuyzveuirlkvdggjd`, file `.env` yang di-ignore Git dikonfigurasi bertahap: hanya **17 dari 46 flag runtime** untuk Dashboard, Data Induk, Tahfidz, dan Asrama bernilai `true`; 29 lainnya `false`. Flag impor tetap tidak aktif. Nilai key tidak dicatat. Perubahan ini hanya konfigurasi lokal, tidak masuk Git dan tidak mengubah konfigurasi Supabase.
- `npm run build` lulus dengan flag staging; `npm run lint` (`tsc --noEmit`) lulus. Regresi `test:customer-deployment-flags`, `test:supabase-runtime-no-firebase`, `test:user-messages`, `test:ci-coverage`, dan `test:supabase-test-environment` semuanya lulus. Guard deployment tetap mempertahankan 37 gate server fail-closed pada konfigurasi sumber default; 56 skrip tes tercakup CI; 155 modul runtime tidak memuat Firebase.
- Pemeriksaan tambahan lulus: `git diff --check`, skema route privat (201 endpoint memerlukan autentikasi; 9 rute publik dan 3 rute deny-only ada di allowlist), RBAC (20 pemeriksaan), dan pemindaian bundle build terhadap server secret (`SUPABASE_SECRET_KEY` tidak ditemukan di `dist/`). Nilai secret tidak ditampilkan.
- Sanitasi pesan frontend diperkuat agar istilah `backend`, `server`, `runtime`, `operator`, `fingerprint`, dan `migrasi` tetap menjadi pesan fallback yang ramah pengguna; `npm run test:user-messages` kini lulus **14 skenario**, termasuk tiga error internal yang sebelumnya belum diuji.
- Build menghasilkan bundle lokal dengan konfigurasi staging dan bukan artefak Production. Folder `dist/` diabaikan Git. Jangan menyerahkan atau men-deploy bundle lokal ini ke pelanggan; build Production harus dibuat dengan environment Production yang ditetapkan tim backend.
- Verifikasi ulang setelah konfigurasi dipersempit: `.env` tetap terabaikan Git, menunjuk VQE, memiliki 17 flag runtime aktif/29 mati dan 0 flag impor aktif; pencarian server secret pada bundle hasil build tetap negatif. Tidak ada nilai secret yang ditampilkan.
- Server dari sesi kerja sempat melaporkan port 3000 aktif, tetapi loopback dari proses lain dan browser Codex tidak dapat menjangkaunya karena isolasi jaringan. Sesi server itu sudah dihentikan. Tidak ada server atau proses uji yang ditinggalkan, dan tidak ada operasi Production.
- Untuk pemeriksaan visual dari PC, pemilik perlu menjalankan preview pada checkout ini setelah `.env` diperbarui: `Set-Location 'C:\Users\VICTUS\Documents\Codex\2026-10-18\sa\erp4-product-copy-cleanup-20261108'; $env:HOST='127.0.0.1'; $env:PORT='3000'; $env:DISABLE_HMR='true'; npm run dev`, lalu buka `http://localhost:3000/`. `DISABLE_HMR=true` menghindari konflik port WebSocket `24678`; perubahan ini hanya mematikan hot reload, tidak mematikan HTTP preview. Pemilik tetap mengisi kredensial sendiri.
- Preview visual setelah login Admin belum dapat diperiksa oleh sesi ini. UAT transaksi/tulis dan Storage masih perlu dilakukan terhadap VQE dengan data sintetis, lalu dibersihkan. Production, backup/restore, migrasi/ledger, dan deployment pelanggan tetap menjadi gerbang yang perlu ditangani atau disaksikan tim backend.
- Source lokal masih memiliki 63 file terlacak berubah dan 3 file belum terlacak. PR #91 masih Draft/Open menurut pembacaan GitHub terakhir; tidak ada push atau merge. Fetch/rekonsiliasi PR head perlu dilakukan ulang ketika konektivitas GitHub dari workspace pulih.
- **Estimasi kerja saat ini:** sekitar **67%** penyelesaian produk/kode/handoff (di luar deploy dan UAT oleh tim backend) dan sekitar **45%** bukti operasional/go-live. Persentase ini perkiraan berdasarkan fitur, integrasi, keamanan tenant, pengujian, dan dokumentasi; bukan metrik otomatis. Belum layak menyebut produk selesai karena UAT live dan rilis source yang direkonsiliasi belum ada.

## Pemeriksaan visual Admin UAT terbaru — 9 November 2026, 09.56 WIB

- Preview yang dapat dibuka dalam browser adalah `http://localhost:4179/`, bukan alamat `localhost:3000` yang sebelumnya dipakai untuk instruksi menjalankan server. Halaman menunjukkan sesi Admin UAT. Runtime publiknya menunjuk VQE staging (`vqemuyzveuirlkvdggjd`); tidak ada secret yang dibaca atau dicatat.
- Navigasi menampilkan seluruh kategori dan modul utama, termasuk Data Induk, Asrama, Tahfidz, dan Dokumen Digital. Ini membantah dugaan bahwa modul-modul itu hilang dari build yang sedang terlihat. Namun tab preview ini belum dapat dipetakan ke commit tertentu, jadi belum menjadi bukti UAT source-matched terhadap PR #91.
- Tahfidz menampilkan sepuluh tab, tombol gulir kiri/kanan, serta ringkasan kosong yang berhasil selesai dimuat (0 santri, 0 halaqah, 0 setoran). Beberapa aksi tetap nonaktif pada tenant tanpa data. Pemeriksaan ini hanya baca tampilan; input setoran, relasi, dan penyimpanan belum diuji.
- Asrama menampilkan lima submodul berstatus aktif, kontrol gulir, dan empty state izin yang normal. CRUD izin/kedisiplinan/kehadiran/penugasan/fasilitas belum diuji.
- Dokumen Digital menampilkan enam tab dan tombol panah; klik panah kanan menggeser strip sehingga tab berikutnya terlihat di dalam frame. Tema gelap dan kontainer tampil konsisten pada viewport browser yang diperiksa. Data masih gagal dimuat dengan pesan umum “Dokumen belum dapat diproses. Coba lagi.”
- Akar masalah Dokumen Digital belum terkonfirmasi. Source API mengembalikan 503 secara fail-closed bila `SUPABASE_DOCUMENT_RUNTIME_ENABLED` bukan `true`; file `.env` lokal di checkout pengembangan yang diperiksa menyetel flag itu `false`. Proses yang menyajikan preview 4179 tidak terlihat dari shell lokal, sehingga kesamaan konfigurasi proses belum terbukti. Jangan menyalakan flag Production; tim perlu memastikan flag staging VQE dan restart servis staging sebelum mengulang GET/UAT.
- Browser mencatat peringatan sinkronisasi Pengaturan Supabase gagal serta peringatan ukuran grafik Recharts `width(-1)/height(-1)` dari dashboard sebelumnya. Ini belum memblokir tampilan Tahfidz/Asrama, tetapi perlu ditriase terpisah; belum ada perubahan kode atau konfigurasi untuk temuan ini.
- Pemeriksaan ini tidak mengirim formulir, membuat/mengubah record, mengunggah file, mengubah konfigurasi cloud, atau membaca data Production. VQE tetap tanpa fixture; tampilan nol adalah kondisi tanpa data contoh.
- **Revisi status UAT:** hasil ini menggantikan catatan awal sesi yang menyatakan layar login belum melewati autentikasi. UAT visual Admin sudah sebagian berjalan, tetapi belum lengkap, belum source-matched, belum mencakup ukuran ponsel, dan Dokumen Digital masih gagal. PR #91 tetap Draft/Open; tidak ada dasar untuk merge atau menyatakan produk siap deploy.

## Status CI setelah checkpoint UAT — 9 November 2026, 10.05 WIB

- Run [#42553902436](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42553902436) pada head PR saat itu lulus 3/3: instalasi NPM pelanggan, frontend build/Firebase bundle guard, dan migrations/API auth/pgTAP. Supabase Preview berstatus skipped, bukan passed, karena PR tidak terkait Supabase Branch.
- CI ini memvalidasi source otomatis pada branch PR, tetapi tidak menyelesaikan UAT UI Dokumen Digital, UAT CRUD live, viewport ponsel, source-match untuk localhost:4179, atau validasi DDL/backup/restore Production. PR #91 tetap Draft/Open.

## Pembaruan flag Dokumen Digital — 9 November 2026

- Pemilik memeriksa `.env` checkout staging `erp4-product-copy-cleanup-20261108`: `SUPABASE_PROJECT_REF` menunjuk VQE dan `SUPABASE_DOCUMENT_RUNTIME_ENABLED=true`. File tetap diabaikan Git; tidak ada key atau password yang dicatat. Ini hanya membuktikan isi file lokal, bukan konfigurasi proses/server yang sedang melayani preview.
- Preview Admin UAT pada `localhost:4179` masih menampilkan “Dokumen belum dapat diproses”. Klik ulang baca sempat menghasilkan empty state “Belum ada dokumen”, lalu error muncul kembali. Hasil baca belum stabil dan UAT Dokumen Digital belum lulus; tidak ada record yang dibuat/diubah.
- Restart server tetap perlu: proses baru dari sesi kerja tidak dapat bind ke port 4179 karena port sudah dipakai. Tidak ada proses yang dihentikan. Pemilik perlu menghentikan server yang benar melalui terminal asalnya, lalu menjalankannya kembali dari checkout yang memuat `.env` staging.
- Pemeriksaan baca-saja VQE mengonfirmasi migration `20270117000000_document_center_core`, bucket `erp4-private-document-attachments` dalam keadaan privat dengan PDF saja dan batas 25 MiB, serta seluruh tabel Dokumen Digital yang diperiksa memakai RLS dan FORCE RLS. Ini membuktikan prasyarat schema/bucket, bukan alur CRUD/upload live.
- Pemeriksaan lokal pada checkout saat audit: autentikasi 201 API privat, filter daftar dokumen, konfigurasi deployment, dan guard runtime Supabase-only lulus. Smoke test HTTP konfigurasi runtime tidak dapat berjalan di sandbox ini karena koneksi loopback ditolak OS dengan `EACCES`; hasil ini bukan bukti endpoint rusak dan perlu diulang pada runner/host yang mengizinkan loopback.
- CI PR #91 pada head `8f3b07338632ce456e4da03f07c52bd447fb5f2c`, run [#42555587634](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/42555587634), lulus tiga pemeriksaan wajib; Supabase Preview berstatus skipped. PR tetap **Open/Draft**. Production tidak diubah.
