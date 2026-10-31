# Titik Mulai Tim Backend — ERP4 Pesantren

> **Checkpoint source yang diaudit — 31 Oktober 2026:** PR #39 memulihkan visibilitas menu dan menambahkan transfer CSV tenant; PPOB tetap dikeluarkan dari rilis awal. Pemecahan bundle terbaru lulus lint dan build; bundle utama berukuran 105.07 kB (31.32 kB gzip). Build masih memberi peringatan untuk chunk renderer PDF 1.46 MB (488.38 kB gzip), yang diunduh saat kartu PDF diminta. Setelah perubahan ini, guard runtime Supabase tanpa Firebase lulus (96 modul/26 rute), pemeriksaan redirect pemulihan kata sandi lulus, dan undangan Wali lulus tujuh skenario. UAT browser belum lulus: `localhost:4179` menampilkan UI lama dan port tersebut menolak peluncuran source terbaru dengan `EADDRINUSE`. `.env` VQE ada di checkout UAT terpisah tetapi tidak di worktree PR; nilainya tidak disalin atau ditampilkan. Server source PR sempat berjalan pada `127.0.0.1:3000`, tetapi browser in-app mengalami timeout; server dihentikan dan tidak ada UAT UI yang diklaim lulus. Source menambahkan opsi `HOST` agar server lokal dapat dibatasi ke loopback; default deployment tetap `0.0.0.0`. Uji CSV/paginasi Master Data, skrip logika/kontrak, migration preflight, dan guard schema API privat tercatat lulus pada source sebelumnya di PR. `npm run test:db` belum menjalankan pgTAP karena Docker/Podman dan database lokal `127.0.0.1:54322` tidak tersedia. Audit baca-saja VQE mengonfirmasi 116 versi/nama migration serta SQL statement yang cocok dengan 116 file lokal setelah normalisasi komentar/whitespace; enam entri ledger yang menyimpan satu string penuh dipecah kembali sebelum dibandingkan. Status RLS, grant, advisor, dan batas akses Production dirinci di bawah. Tidak ada perubahan database Production dan auto-deploy tetap OFF.

> Bagian di bawah yang merujuk head, jumlah migrasi, atau hasil pemeriksaan sebelumnya adalah riwayat checkpoint. Gunakan status terbaru di atas jika ada perbedaan.

Dokumen ini menyatakan keadaan yang terverifikasi untuk membantu tim melanjutkan pemeriksaan. Ini bukan pernyataan bahwa produk telah lulus UAT atau siap produksi.

## Pembaruan 31 Oktober 2026 — menu dan konfigurasi runtime

Perbaikan menu Data Induk, daftar izin Admin, dan visibilitas submenu Asrama berada di PR [#39](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/39), branch `codex/menu-parity-import-export-20261031`, Draft/Open di atas PR #38. Lima tab Data Induk dan kategori terkait kembali terlihat di mode Supabase; kategori yang dikelola modul lain mengarah ke modul tersebut. Lima bagian Asrama tetap terlihat saat gerbang runtime ditutup dan menampilkan alasan/flag yang perlu disiapkan, bukan layar kosong. `Jejak Audit` tetap ditandai belum tersedia karena API audit tenant Supabase belum ada. Pengaturan platform tetap Superadmin-only, dan modul tenant yang ditolak secara eksplisit pada profil Admin ditampilkan dalam daftar pembatasan.

Audit langsung terhadap referensi AI Studio menemukan submenu yang belum terlihat di Akademik, CBT, LMS, HCM, Alumni, dan Perpustakaan Digital. PR #39 sekarang menambahkan submenu/status untuk area tersebut: API yang sudah ada tetap memakai jalur Supabase; area tanpa API menampilkan batasan dan tidak menyajikan simulasi. Lihat [audit paritas referensi AI Studio](AI_STUDIO_REFERENCE_PARITY_AUDIT_2026-10-31.md) untuk peta seluruh modul, pengarah submenu, dan pekerjaan backend yang masih diperlukan. Audit itu juga mencatat PPOB sebagai pengecualian rilis awal sesuai keputusan pemilik produk.

Pemeriksaan browser pembanding tanggal 31 Oktober: referensi AI Studio terbuka dengan peran Super Admin, sedangkan `localhost:4179` menggunakan Admin UAT. Admin melihat 25 menu; Settings memang dibatasi untuk Superadmin dan PPOB sengaja dikeluarkan dari rilis awal. Pada Data Induk, preview masih menampilkan banner lama “Modul Master Data lain belum dipindahkan”, toggle Entities/Structure, kategori Santri, dan belum menampilkan lima tab navigasi maupun tombol Impor CSV. Source PR #39 mendefinisikan lima tab Data Induk serta impor/ekspor untuk kategori Santri dan struktur yang sudah terhubung. Karena itu, preview yang dibuka belum mencerminkan source branch terbaru dan tidak dapat dipakai sebagai bukti paritas atau UAT. Koneksi shell ke `localhost:4179` ditolak oleh batas jaringan lingkungan ini; `.env` VQE juga tidak tersedia. `npm run preview` hanya menjalankan Vite static preview; `npm run dev` menjalankan Express/API sekaligus Vite. Untuk uji integrasi, jalankan server penuh dari branch PR #39 pada port terpisah dengan `.env` staging VQE, tunggu `/health/ready` berstatus `ready`, lalu ulangi UAT. Jangan gunakan port `4179` sebagai bukti backend siap.

Guard frontend mencocokkan 26 tujuan menu/rute Supabase. Perapihan konfigurasi juga menghapus flag browser `VITE_SUPABASE_*_RUNTIME_ENABLED` inert dari `.env.example`; hanya flag pada allowlist runtime publik yang boleh dikonfigurasi browser. Semua sakelar server tetap fail-closed. Lihat [panduan visibilitas menu dan flag runtime](MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md).

Pada source PR #39, `npm run test:customer-deployment-flags` lulus (30 nilai browser allowlist dan 37 gerbang server fail-closed); `npm run test:supabase-runtime-no-firebase` lulus (96 modul, 26 rute Supabase, 26 rute impor lama yang ditutup); `npm run lint`, `npm run build`, dua uji Master Data, 33 skrip uji logika/kontrak, `npm run test:migration-preflight`, `npm run test:private-api-schema`, dan `git diff --check` juga lulus. Parser preflight kini membagi setiap elemen SQL ledger yang berisi satu file penuh sebelum perbandingan dan mempertahankan elemen kosong sebagai mismatch. GitHub belum melaporkan status check untuk head PR #39. Pemeriksaan pgTAP belum berjalan karena Docker/Podman dan database lokal tidak tersedia. Audit baca-saja VQE kini membandingkan SQL migration secara penuh setelah normalisasi; hasilnya dijelaskan pada bagian staging. Tidak ada perubahan Production.

## Pemeriksaan tambahan staging — keamanan dan kinerja

Pemeriksaan ini memakai konektor dan SQL `SELECT` baca-saja pada VQE staging (`vqemuyzveuirlkvdggjd`) tanggal 31 Oktober 2026; tidak ada data operasional, kebijakan, atau konfigurasi yang diubah.

- Katalog PostgreSQL menunjukkan **161 tabel `public`; semua mengaktifkan RLS**. Hanya lima kebijakan tersedia dan semuanya untuk `authenticated`: baca sendiri/tenant pada profil dan tenant, serta baca kandidat/dokumen PPDB oleh Admin berizin. Tidak ditemukan kebijakan `anon` atau ekspresi `true` pada kebijakan tersebut.
- Grant Data API baca-saja setelah kebijakan exposure Supabase berubah: **156 relasi publik** memiliki grant untuk `service_role`; lima tabel tenant/profil/kandidat yang dipakai browser hanya memberi `SELECT` kepada `authenticated`; tidak ada grant tabel untuk `anon`. Tidak ada fungsi publik yang dapat dieksekusi oleh `anon` atau `authenticated`, sementara jalur server `service_role` memiliki grant eksplisit. Temuan ini selaras dengan migrasi `20261205000000_data_api_default_privilege_hardening.sql` dan tidak membuka akses publik. Semua migration baru tetap harus memberi grant minimal secara eksplisit, karena tabel baru tidak lagi otomatis mendapat grant Data API. Lihat [changelog Supabase](https://supabase.com/changelog?types=breaking-change) dan [panduan pengamanan Data API](https://supabase.com/docs/guides/api/securing-your-api).
- **Jangan menambah kebijakan umum untuk menghilangkan temuan linter.** RLS tanpa kebijakan menolak akses langsung secara default; runtime harus terus melayani tabel operasional melalui endpoint server yang memverifikasi bearer token, profil aktif, role, izin modul, dan tenant. Karena server memakai kunci istimewa yang melewati RLS, setiap endpoint dan mutasinya tetap harus diaudit/UAT. Akses langsung browser saat ini hanya membaca profil sendiri; unggah berkas memakai URL bertanda tangan.
- Security Advisor memberi peringatan **Leaked Password Protection Disabled**. Aktifkan pemeriksaan kata sandi bocor di Authentication → Settings → Password Security pada lingkungan staging dan Production sebelum pilot, lalu catat hasilnya. Pengaturan Production belum dapat diperiksa oleh konektor.
- Performance Advisor menandai **238 foreign key tanpa indeks penutup**. Tim backend perlu menilai indeks untuk foreign key jalur kueri/penghapusan yang sering dipakai dengan `EXPLAIN (ANALYZE, BUFFERS)` dan data sintetis berukuran realistis. Hindari membuat seluruh indeks tanpa tinjauan karena biaya tulis/ruang dan pola gabungan dapat berbeda.
- **81 indeks tampak belum digunakan.** Staging belum menerima beban operasional sehingga temuan ini belum cukup untuk menghapus indeks. Pertahankan sampai workload representatif dan statistik produksi/benchmark tersedia; kemudian evaluasi indeks satu per satu.

Gate khusus: sebelum menyatakan kontrol akses matang, jalankan tes endpoint untuk semua role/tenant serta uji penolakan lintas tenant pada server API. Temuan RLS tanpa kebijakan bukan kegagalan akses bila jalur broker benar-benar tunggal; itu juga bukan bukti bahwa API aman dengan sendirinya.

## Keadaan lingkungan

| Lingkungan | Ref | Keadaan dan batas |
| --- | --- | --- |
| Staging ERP | `vqemuyzveuirlkvdggjd` | Status project baca-saja `ACTIVE_HEALTHY`; 116 versi/nama dan SQL migration setelah normalisasi cocok dengan file lokal sampai `20270212000000`. Enam entri ledger menyimpan satu string SQL penuh dan dipecah sebelum perbandingan. Fixture UAT sebelumnya telah dibersihkan; jangan menganggap ada data Wali/kandidat/tagihan uji aktif. Integrasi GitHub sudah terputus. Dashboard menampilkan label internal `main / PRODUCTION`; perlakukan VQE sebagai staging ERP sesuai keputusan pemilik. |
| Production ERP | `ptsasgdvgrbdtgyqieie` | Auto-deploy OFF. Konektor Codex saat ini menolak pembacaan project, ledger, dan katalog. Snapshot historis mencatat 119 tabel dan 47 entri ledger (dua tanpa metadata), tetapi belum diverifikasi ulang. Jangan deploy migration atau memperbaiki ledger sebelum rekonsiliasi baca-saja dan backup yang dapat dipulihkan. |

`main` dan VQE memang berbeda saat ini: VQE mencatat lima migration PR #38 dan satu migration PR #39 yang belum digabung. Jangan menyebut VQE setara dengan `main`; kecocokan SQL yang dibuktikan di atas hanya membandingkan ledger VQE dengan source lokal PR, bukan dengan keadaan `main` atau Production PTSAS. Tidak ada data Firestore yang perlu disalin.

## Tim dapat mulai sekarang

1. **Review PR #38:** periksa perubahan akses Wali terhadap tagihan PPDB sebelum onboarding, lima migration tambahan, RLS/grants, dan CI. PR masih Draft/Open karena UAT aplikasi Wali belum dilakukan. CI hijau belum menguji login melalui UI.
2. **Lanjutkan UAT sintetis di VQE:** tenant dan profil Admin uji pernah diverifikasi; jangan membuat tenant atau akun Admin duplikat. Worktree PR #39 saat checkpoint tidak memiliki `.env` staging dan tidak menjalankan server di 4179. Siapkan konfigurasi VQE yang terisolasi pada secret manager atau `.env` diabaikan Git, mulai server di port pemeriksaan, dan tunggu `/health/ready` menunjukkan `ready` sebelum UAT. Jangan menggunakan `.env` checkout kanonis yang menunjuk ke PTSAS Production, kredensial pelanggan, atau data Production.
3. **Jalankan skenario UAT:** login Wali, lihat tagihan kandidat yang cocok, upload bukti ke bucket privat, tolak akses lintas-tenant atau kandidat yang tidak valid, onboarding kandidat, dan pastikan hubungan Wali–santri kanonis berfungsi. Catat bukti, hasil, dan commit yang diuji. Hapus fixture setelah UAT.
4. **Uji instalasi pelanggan:** ikuti runbook Docker/Compose pada VPS Linux dan VM on-premise bersih. Uji konfigurasi runtime, upgrade, backup serta restore database dan Storage. Catat hasil dan batas platform yang benar-benar diuji.
5. **Rekonsiliasi PTSAS secara baca-saja:** pastikan dashboard memilih ref `ptsasgdvgrbdtgyqieie`, lalu jalankan [skrip inventaris baca-saja](../06_DATABASE/PTSAS_PRODUCTION_READ_ONLY_RECONCILIATION.sql) di SQL Editor. Skrip hanya membaca metadata ledger, katalog, grants, function, trigger, dan bucket; tidak membaca baris operasional dan menutup transaksi dengan `ROLLBACK`. Query-query di dalamnya sudah divalidasi sebagai SELECT pada VQE staging; skrip belum dijalankan pada PTSAS. Tim backend/operator dapat menyerahkan hasilnya kepada pengembang untuk dicocokkan dengan migration source. Auto-deploy harus tetap OFF.

## Konfigurasi staging dan status Auth

Di checkout lokal kanonis yang diperiksa, file `.env` yang diabaikan Git menunjuk ke PTSAS Production (`ptsasgdvgrbdtgyqieie`), bukan VQE. Target Supabase yang dipakai halaman `localhost:4179` belum dapat dipastikan; login sukses tidak membuktikan targetnya. Jangan gunakan halaman/checkout itu untuk UAT atau memasukkan data. Jalankan UAT hanya dari checkout terpisah yang dikonfigurasi khusus ke VQE; jangan menampilkan atau menyalin secret, kunci PII, maupun nilai Production. Email Auth bawaan VQE pernah mencapai `over_email_send_rate_limit`; untuk beberapa putaran UAT, tim dapat mengonfigurasi SMTP khusus di Authentication → Emails → SMTP Settings. Simpan kredensial SMTP hanya di dashboard/secret manager, jangan di chat atau bundle klien. Panduan rinci ada di [runbook email Auth](SUPABASE_AUTH_EMAIL_DELIVERY_RUNBOOK.md).

Untuk alur UAT yang mencakup login Wali, tagihan, bukti, dan onboarding, konfigurasi server/browser mencakup `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_PPDB_TENANT_ID`, `PII_ENCRYPTION_KEY`, dan `PII_FINGERPRINT_KEY`. Buat kedua kunci PII secara acak dan independen, masing-masing 32 byte/64 karakter hex. Atur flag server dan pasangannya yang berawalan `VITE_` sesuai skenario PPDB, dokumen, finance bill, serta onboarding; semuanya harus tetap mati di Production sampai ada rencana rilis yang disetujui. Pendaftaran Wali memakai `SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED`; `PUBLIC_PPDB_ENABLED` hanya diperlukan jika UAT juga menguji pendaftaran calon santri publik. Kunci PII dan `SUPABASE_SECRET_KEY` tidak boleh masuk bundle klien.

## Gerbang sebelum PR #38 siap digabung

- UAT Wali PPDB dan isolasi tenant lulus dengan fixture sintetis.
- CI lulus 3/3 pada head source `af9db8378e91c62b682e44e994302abd24f026c2` ([run `41184875367`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41184875367)): instalasi NPM, frontend/build/Docker guard, migrasi, API Auth/tenant, pgTAP, dan backup/restore.
- Tim backend meninjau function/RPC, grants, RLS, Storage privat, dan dampak migration.
- Tidak ada migration Production yang diterapkan. Rekonsiliasi PTSAS, backup/restore, dan persetujuan change window adalah pekerjaan terpisah sebelum cutover.

## Batas yang diketahui

- Firebase tidak menjadi runtime aplikasi pada import graph aktif yang dijaga CI. Source legacy dan Firebase sebagai devDependency masih tersimpan; guard memeriksa agar keduanya tidak masuk runtime bundle.
- Tenant sintetis dan profil Admin aktif pernah diverifikasi langsung di VQE dengan kueri baca-saja. Login Admin melalui UI berhasil, tetapi target Supabase browser belum terverifikasi; `/health/ready` mengembalikan `unavailable`. File `.env` checkout lokal kanonis yang diperiksa sekarang menunjuk ke PTSAS Production, sehingga checkout dan preview tersebut tidak aman untuk UAT. Profil Wali, kandidat, relasi, tagihan, upload, onboarding, dan isolasi tenant melalui UI belum diuji. Fixture baru dibuat setelah readiness pulih dan dihapus sesudah UAT.
- PTSAS belum dapat diaudit ulang melalui konektor; percobaan `get_project` terbaru ditolak akses. Snapshot Production di dokumen lama tetap historis. Tidak ada perubahan Production.
- PPOB/payment gateway dikeluarkan dari rilis awal.
- Persentase penyelesaian keseluruhan tidak dihitung dari kemajuan schema atau CI saja.

## Kepemilikan pekerjaan

| Pekerjaan | Pemilik |
| --- | --- |
| Source aplikasi, perbaikan, PR dan CI | Pengembang aplikasi |
| Provisioning sintetis, akses staging, inventaris, backup | Tim backend |
| UAT fungsi pesantren dan persetujuan hasil | Tim backend dan perwakilan pesantren |
| Instalasi VPS/on-premise, operasi, runbook | Tim backend/penerapan |
| Rekonsiliasi serta deployment PTSAS Production | Tim backend/penerapan setelah rencana disetujui |

Dokumen terkait: [temuan redirect Auth Production](PRODUCTION_AUTH_REDIRECT_CHECKPOINT_2026-10-31.md), [checkpoint staging PR #38](../06_DATABASE/CHECKPOINT_GUARDIAN_PPDB_STAGING_2026-10-31.md), [audit cutover Supabase](../06_DATABASE/SUPABASE_PROJECT_REF_CUTOVER_AUDIT_2026-10-31.md), [snapshot Production](../06_DATABASE/PTSAS_PRODUCTION_READINESS_SNAPSHOT_2026-10-31.md), dan [kesiapan komersial](COMMERCIAL_READINESS.md).

## Runbook singkat: preview login berhasil tetapi readiness 503

**Temuan browser 31 Oktober 2026:** login Admin UAT pernah berhasil, tetapi `http://localhost:4179/health/ready` mengembalikan `{"status":"unavailable"}` dan dashboard belum dapat membaca data. Tampilan yang kini masih terbuka pada port 4179 juga berasal dari UI lama. Percobaan memulai source PR terbaru pada port itu gagal `EADDRINUSE`; proses lama tidak dihentikan. Target backend/client pada browser belum terbukti staging. Jangan gunakan port 4179 atau memasukkan data hingga target diverifikasi.

Untuk mengisolasi API server tanpa menghentikan proses lama:

1. Buka PowerShell baru pada **checkout terpisah dan bersih PR #38 khusus staging**, bukan checkout kanonis yang file `.env`-nya menunjuk ke Production. Di root repository, pastikan file lokal `.env` ada dan diabaikan Git:
   ```powershell
   Test-Path .env
   git check-ignore .env
   ```
   Jangan tampilkan isi `.env`, jangan commit, dan pastikan `SUPABASE_URL` serta `VITE_SUPABASE_URL` menghasilkan host `vqemuyzveuirlkvdggjd.supabase.co`. Jangan gunakan URL/key PTSAS Production.
2. Pastikan dua variabel server terbaca tanpa mencetak nilainya:
   ```powershell
   node -r dotenv/config -e "for (const name of ['SUPABASE_URL','SUPABASE_SECRET_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY']) { const value = process.env[name]; console.log(name + ': ' + (name.endsWith('_URL') && value ? new URL(value).host : value ? 'set' : 'missing')); }"
   ```
   Bila dependensi belum terpasang, jalankan `npm ci` terlebih dahulu. Perintah ini hanya memasang paket dari lockfile.
3. Jalankan server API dari root repository pada port default VQE. Ikat server ke loopback agar endpoint dengan secret VQE tidak terbuka ke jaringan lokal:
   ```powershell
   $env:PORT = '3000'
   $env:HOST = '127.0.0.1'
   npm run dev
   ```
   Skrip `dev` menjalankan `tsx server.ts`; server memuat `.env` dari direktori kerja. Pastikan `APP_URL` dan `PUBLIC_APP_URL` mengarah ke `http://localhost:3000`, sesuai Site URL/redirect VQE. Biarkan terminal ini terbuka agar log readiness terlihat.
4. Di PowerShell kedua, periksa endpoint:
   ```powershell
   curl.exe -i http://127.0.0.1:3000/health/ready
   ```
   Lulus jika respons `HTTP 200` dan `{"status":"ready"}`. Respons `503` berarti identity store masih gagal diperiksa.
5. Jika tetap 503, lihat terminal server untuk log `Supabase identity readiness check failed`. Log hanya memuat tipe error serta penanda apakah URL dan secret tersedia, bukan nilainya. Perbaiki konfigurasi/profil/akses staging berdasarkan error tersebut; jangan tempel secret atau isi lengkap log sensitif ke tiket.
6. Setelah health 200, buka `http://localhost:3000/` dan verifikasi login serta dashboard. Jalur password-recovery tidak perlu diulang. Jika health 200 tetapi data modul tetap gagal, periksa flag runtime modul dan log API secara terpisah; readiness hanya membuktikan identity store merespons, bukan seluruh modul UAT.

Server menghormati `HOST`; jika tidak diatur, default tetap `0.0.0.0` untuk deployment/container. Untuk UAT lokal, gunakan `HOST=127.0.0.1`. Port `3000` cocok dengan Site URL VQE pada konfigurasi saat ini. Gunakan hanya konfigurasi staging VQE. Jangan memasukkan `SUPABASE_SECRET_KEY`, kunci PII, atau nilai Production ke klien Vite.

