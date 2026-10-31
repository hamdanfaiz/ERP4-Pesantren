# Titik Mulai Tim Backend — ERP4 Pesantren

> **Status terbaru — 31 Oktober 2026, source `d094515` dan handoff `39af868`:** PR #39 Draft/Open, head sudah diperbarui dengan visibilitas submenu lintas modul dan audit paritas. Pemeriksaan lokal lulus (`npm run lint`, `npm run test:supabase-runtime-no-firebase`, `npm run build`, `git diff --check`, dan 33 skrip uji logika/kontrak yang tidak memerlukan database live). GitHub belum mengembalikan workflow run atau status check untuk head aplikasi. `npm run test:db` belum menjalankan pgTAP: database lokal di `127.0.0.1:54322` menolak koneksi dan `supabase status` melaporkan Docker/Podman tidak tersedia. Supabase CLI berhasil dijalankan dengan direktori konfigurasi sementara di `node_modules`; tidak perlu mengubah folder pengguna. Preview `localhost:4179` masih menunjukkan bundle lama—Data Induk hanya menampilkan Entitas/Struktur dan mengklaim modul lain disembunyikan—serta UI melaporkan layanan identitas Supabase server belum dikonfigurasi. File `.env` staging tidak ada di worktree PR #39. Karena itu UAT browser belum dilakukan. Pembacaan staging VQE saat ini menunjukkan project `ACTIVE_HEALTHY`, 116 versi migrasi sampai `20270212000000` yang cocok persis dengan 116 versi/nama file lokal, dan seluruh tabel `public` yang terdaftar memiliki RLS aktif; tenant/profil dasar ada, sementara data operasional yang terdaftar masih kosong. Ini tidak membuktikan checksum/DDL sama, kebijakan RLS efektif, atau UAT berhasil. Pembacaan project Production PTSAS melalui konektor saat ini ditolak; tidak ada perubahan Production dan auto-deploy tetap OFF.

> Bagian di bawah yang merujuk head, jumlah migrasi, atau hasil pemeriksaan sebelumnya adalah riwayat checkpoint. Gunakan status terbaru di atas jika ada perbedaan.

Dokumen ini menyatakan keadaan yang terverifikasi untuk membantu tim melanjutkan pemeriksaan. Ini bukan pernyataan bahwa produk telah lulus UAT atau siap produksi.

## Pembaruan 31 Oktober 2026 — menu dan konfigurasi runtime

Perbaikan menu Data Induk, daftar izin Admin, dan visibilitas submenu Asrama berada di PR [#39](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/39), branch `codex/menu-parity-import-export-20261031`, Draft/Open di atas PR #38. Lima tab Data Induk dan kategori terkait kembali terlihat di mode Supabase; kategori yang dikelola modul lain mengarah ke modul tersebut. Lima bagian Asrama tetap terlihat saat gerbang runtime ditutup dan menampilkan alasan/flag yang perlu disiapkan, bukan layar kosong. `Jejak Audit` tetap ditandai belum tersedia karena API audit tenant Supabase belum ada. Pengaturan platform tetap Superadmin-only, dan modul tenant yang ditolak secara eksplisit pada profil Admin ditampilkan dalam daftar pembatasan.

Audit langsung terhadap referensi AI Studio menemukan submenu yang belum terlihat di Akademik, CBT, LMS, HCM, Alumni, dan Perpustakaan Digital. PR #39 sekarang menambahkan submenu/status untuk area tersebut: API yang sudah ada tetap memakai jalur Supabase; area tanpa API menampilkan batasan dan tidak menyajikan simulasi. Lihat [audit paritas referensi AI Studio](AI_STUDIO_REFERENCE_PARITY_AUDIT_2026-10-31.md) untuk peta seluruh modul, pengarah submenu, dan pekerjaan backend yang masih diperlukan. Audit itu juga mencatat PPOB sebagai pengecualian rilis awal sesuai keputusan pemilik produk.

Guard frontend mencocokkan 26 tujuan menu/rute Supabase. Perapihan konfigurasi juga menghapus flag browser `VITE_SUPABASE_*_RUNTIME_ENABLED` inert dari `.env.example`; hanya flag pada allowlist runtime publik yang boleh dikonfigurasi browser. Semua sakelar server tetap fail-closed. Lihat [panduan visibilitas menu dan flag runtime](MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md).

Pada pembaruan ini `npm run test:customer-deployment-flags` lulus: 30 nilai browser allowlist dan 37 gerbang server fail-closed terverifikasi; `npm run test:supabase-runtime-no-firebase` lulus: 96 modul, 26 rute Supabase, 26 rute impor lama yang ditutup, serta guard visibilitas lima bagian Asrama. `git diff --check` juga lulus. Lint, build, RBAC (15 pemeriksaan), dan transfer CSV Master Data sudah lulus pada source PR #39 sebelumnya; perubahan terbaru ini hanya menyentuh visibilitas submenu, guard, dan dokumen. PR #38 CI terbaru lulus 3/3; PR #39 belum memiliki job aplikasi. Pemeriksaan baca-saja membandingkan 116 versi/nama ledger VQE dengan 116 file migrasi lokal, tetapi belum membuktikan checksum atau DDL. Tidak ada perubahan Production.

## Keadaan lingkungan

| Lingkungan | Ref | Keadaan dan batas |
| --- | --- | --- |
| Staging ERP | `vqemuyzveuirlkvdggjd` | Status project baca-saja `ACTIVE_HEALTHY`; 116 versi migrasi tercatat sampai `20270212000000`, dan versi/nama cocok dengan source lokal. Kecocokan metadata bukan bukti checksum/DDL. Fixture UAT sebelumnya telah dibersihkan; jangan menganggap ada data Wali/kandidat/tagihan uji aktif. Integrasi GitHub sudah terputus. Dashboard menampilkan label internal `main / PRODUCTION`; perlakukan VQE sebagai staging ERP sesuai keputusan pemilik. |
| Production ERP | `ptsasgdvgrbdtgyqieie` | Auto-deploy OFF. Konektor Codex saat ini menolak pembacaan project, ledger, dan katalog. Snapshot historis mencatat 119 tabel dan 47 entri ledger (dua tanpa metadata), tetapi belum diverifikasi ulang. Jangan deploy migration atau memperbaiki ledger sebelum rekonsiliasi baca-saja dan backup yang dapat dipulihkan. |

`main` dan VQE memang berbeda saat ini: VQE mencatat lima migration PR #38 dan satu migration PR #39 yang belum digabung. Jangan menyebut VQE setara dengan `main`; kesamaan versi/nama berkas hanya memvalidasi ledger metadata terhadap source branch gabungan, bukan definisi DDL. Tidak ada data Firestore yang perlu disalin.

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

**Temuan browser 31 Oktober 2026:** login Admin UAT berhasil, tetapi `http://localhost:4179/health/ready` mengembalikan `{"status":"unavailable"}` dan dashboard belum dapat membaca data. Checkout lokal kanonis yang diperiksa memiliki `SUPABASE_URL` dan `VITE_SUPABASE_URL` menuju PTSAS Production. Karena proses yang melayani port 4179 belum dapat diidentifikasi, target backend/client pada browser belum terbukti staging. Jangan gunakan port 4179 atau memasukkan data hingga target diverifikasi.

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
3. Jalankan server API dari root repository pada port pemeriksaan yang terpisah:
   ```powershell
   $env:PORT = '4180'
   npm run dev
   ```
   Skrip `dev` menjalankan `tsx server.ts`; server memuat `.env` dari direktori kerja. Biarkan terminal ini terbuka agar log readiness terlihat.
4. Di PowerShell kedua, periksa endpoint:
   ```powershell
   curl.exe -i http://127.0.0.1:4180/health/ready
   ```
   Lulus jika respons `HTTP 200` dan `{"status":"ready"}`. Respons `503` berarti identity store masih gagal diperiksa.
5. Jika tetap 503, lihat terminal server untuk log `Supabase identity readiness check failed`. Log hanya memuat tipe error serta penanda apakah URL dan secret tersedia, bukan nilainya. Perbaiki konfigurasi/profil/akses staging berdasarkan error tersebut; jangan tempel secret atau isi lengkap log sensitif ke tiket.
6. Setelah health 200, buka `http://localhost:4180/` dan verifikasi lagi login serta dashboard. Jalur password-recovery tidak perlu diulang. Jika health 200 tetapi data modul tetap gagal, periksa flag runtime modul dan log API secara terpisah; readiness hanya membuktikan identity store merespons, bukan seluruh modul UAT.

Port `4180` dipilih untuk menghindari perubahan atau penghentian layanan lama di `4179`. Gunakan hanya konfigurasi staging VQE. Jangan memasukkan `SUPABASE_SECRET_KEY`, kunci PII, atau nilai Production ke klien Vite.
