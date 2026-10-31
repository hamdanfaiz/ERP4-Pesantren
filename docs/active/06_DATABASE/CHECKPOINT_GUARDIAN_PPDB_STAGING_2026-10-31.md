# Checkpoint UAT Wali PPDB di Supabase Staging

- Terakhir diperbarui: 31 Oktober 2026.
- Repo: `hamdanfaiz/ERP4-Pesantren`.
- PR: [#38 — Enable guardian access to PPDB finance before onboarding](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/38).
- Branch: `codex/continue-erp-hardening-20261031`; source UI UAT diambil dari head `88e7e7438c91b1fa79d765ebf77ed8efc16ea8a7`.
- Target UAT: Supabase VQE, project ref `vqemuyzveuirlkvdggjd`, yang pengguna tetapkan sebagai staging.
- PTSAS `ptsasgdvgrbdtgyqieie` adalah Production; tidak ada data atau skema database yang diubah. Satu email konfirmasi untuk akun Admin yang sudah ada dikirim ulang melalui Auth setelah persetujuan pengguna; kata sandi tidak diubah.

## Batas lingkungan

- Dashboard VQE menampilkan `main / PRODUCTION`, tetapi pengguna menetapkan VQE sebagai staging. Gunakan hanya data sintetis dan jangan menyalin data Firestore.
- Supabase MCP menolak pembacaan PTSAS; tidak ada perubahan yang diterapkan ke PTSAS Production.
- Worktree PR memiliki `.env` lokal yang hanya menunjuk ke VQE. File tersebut dikonfirmasi diabaikan Git dan tidak boleh di-commit, dibagikan lewat chat, atau dimasukkan ke bundle browser.
- Kunci server VQE bernama `codex_uat_staging` dibuat setelah persetujuan pengguna. Kunci PII acak juga disiapkan secara lokal; nilai kredensial tidak dicatat di dokumen ini.
- Konfigurasi lokal menggunakan tenant sintetis di bawah, membuka endpoint konfigurasi/Finance PPDB untuk UAT, dan menjaga `PUBLIC_PPDB_ENABLED=false` agar intake PPDB publik tidak terbuka.
- PTSAS Production, kredensialnya, dan aturan redirect-nya tidak diubah.
- Pada pemeriksaan terbaru, browser membuka `http://localhost:4179/` dan menampilkan halaman masuk ERP. Layar menampilkan pesan kredensial tidak cocok dan pemberitahuan pemulihan yang generik; ini membuktikan UI dirender, bukan login berhasil atau email pemulihan terkirim. Runtime lokal menunjuk ke VQE. Akun Production PTSAS tidak dapat dipakai pada preview ini.
- Konfigurasi Auth VQE: Site URL tetap `http://localhost:3000`; setelah persetujuan pengguna, Redirect URLs mencantumkan `http://localhost:4179/**` agar callback preview VQE diterima. Perubahan ini terbatas pada staging; PTSAS Production tidak diubah.

## Keadaan VQE saat ini

- Tenant sintetis `uat-wali-erp4-20261031`, ID `80f406de-aa77-4efa-b36b-232ceb160178`, dibuat kembali di VQE pada 31 Oktober 2026.
- Satu akun Admin pemilik sudah dikonfirmasi melalui Auth dan memiliki profil `admin` berstatus `active` pada tenant sintetis tersebut. Kata sandi ditetapkan oleh pemilik sendiri; nilainya tidak dicatat.
- Data operasional selain profil Admin masih kosong: 0 kandidat, wali, relasi akun Wali-kandidat, tagihan, dan permintaan tulis Finance untuk tenant itu.
- Fixture Wali, PPDB, Finance, serta Storage dari putaran UAT terdahulu telah dibersihkan dan belum dibuat kembali pada putaran ini.
- Tidak ada data operasional Firestore yang disalin. PTSAS Production tidak disentuh.

## Hasil verifikasi

- Dengan role database `authenticated`, RLS mengembalikan hanya profil sendiri dan tenant aktif akun uji.
- Role `authenticated` tidak memiliki akses Data API langsung ke tabel finansial; akses finansial harus melewati endpoint server. Bucket bukti bersifat privat dan tidak memiliki policy akses langsung.
- Helper relasi Wali-kandidat mengizinkan kandidat yang tertaut, serta menolak tenant/kandidat yang tidak terkait dan kandidat yang ditolak.
- Upload bukti memakai hak admin dashboard; ini bukan bukti upload melalui sesi Wali aplikasi.
- RPC `register_tenant_finance_payment_proof` berhasil mencatat tagihan menjadi `verification`. Pengulangan dengan idempotency key sama menghasilkan `alreadyApplied: true`.
- Uji negatif RPC menolak role yang tidak sesuai, path traversal, dan tenant berbeda.
- Login Admin berhasil melalui preview pada 31 Oktober 2026 sekitar 09:22 UTC; UI menampilkan `Admin UAT` / `Administrator` pada tenant `Pesantren`. Namun ringkasan dashboard belum memuat data dan menampilkan layanan identitas belum dikonfigurasi. Endpoint browser `GET /health/ready` mengembalikan `{"status":"unavailable"}`. Pemeriksaan baca-saja `checkIdentityStoreReady()` dari worktree perbaikan dengan konfigurasi VQE berhasil dan membaca satu profil; ketidaksesuaian ini mengindikasikan backend yang melayani browser belum terbukti memakai konfigurasi yang sama. UAT data Admin, upload Wali, onboarding, dan akses pasca-onboarding tetap belum lulus. Jangan masukkan kredensial Production di preview staging.

## Perubahan dan verifikasi kode

- Wali dengan email Auth terverifikasi dapat mengakses tagihan kandidat PPDB pra-onboarding hanya pada tenant yang sesuai, untuk kandidat yang belum ditolak/di-onboard, dengan tagihan aktif.
- Setelah onboarding, akses kandidat dicabut dan tagihan mengikuti relasi santri serta Wali kanonis.
- CI [run 41179143190](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41179143190) lulus **2/2 job** pada PR head `e49d38a22b89eea30212792895651f6403ceb94b`. Setelah pembaruan checkpoint pada head `b93bffd830dc5f225a909b42aa7aa69f9f5a4eeb`, CI [run 41179453533](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41179453533) juga lulus **2/2 job**, meliputi build/guard frontend, rehearsal seluruh migrasi, pgTAP, API auth/isolasi tenant, Storage HTTP, backup/restore, regresi modul, dan build Docker pelanggan.
- Kode aplikasi tidak berubah dalam kedua commit dokumentasi tersebut; seluruh workflow lengkap tetap berjalan dan lulus.
- Setelah perubahan pemulihan Auth, `npm run lint`, `npm run build`, dan `npm run test:auth-recovery-redirect` lulus secara lokal. Build masih mengeluarkan peringatan ukuran chunk `react-pdf`/aplikasi dan anotasi Rollup dari Zod; tidak menghalangi hasil build.
- Log Auth VQE menunjukkan permintaan `/recover` terakhir ditolak dengan HTTP 429 `over_email_send_rate_limit`; satu email pemulihan sebelumnya berhasil dikirim. Ini batas kirim email bawaan proyek, bukan masalah password. Supabase membatasi email bawaan secara bersama per proyek; periksa kotak masuk/spam dan hindari permintaan berulang. Untuk pengujian berulang, siapkan custom SMTP pada staging.
- Percobaan awal `npm ci` menemukan dua paket bawaan Tailwind WASI yang belum dicatat. `package-lock.json` kini memuat `@emnapi/core` dan `@emnapi/runtime`; instalasi ulang `npm ci --no-audit --no-fund` berhasil pada worktree bersih. Langkah terpisah ditambahkan ke CI untuk menjaga instalasi NPM environment pelanggan.
- VQE memiliki 115 migration sampai `20270212000000_optimize_core_tenant_query_indexes`. pgTAP live sebelumnya: 53 assertion privilege API dan 44 assertion isolasi tenant; skrip memakai rollback.
- Security Advisor: 156 INFO untuk tabel backend-only tanpa policy; tidak ada WARN helper SECURITY DEFINER atau `auth_rls_initplan`. Performance Advisor memberi INFO indeks FK/unused-index. VQE tidak memiliki data operasional sehingga telemetry indeks belum mewakili beban nyata.
- Riwayat percobaan instalasi sebelumnya pada worktree preview terhambat Windows `EPERM` ketika menghapus modul native `lightningcss`; percobaan offline juga tidak memiliki `zxing-wasm@3.0.3` di cache. Keduanya bukan lagi blocker: verifikasi bersih dengan akses registry berhasil setelah lockfile diperbaiki. CI pada head `6662385` lulus 2/2 job; perubahan berikutnya menambahkan pemeriksaan `npm ci` sebagai job terpisah.

## Tindak lanjut

1. Login Admin sudah berhasil; jangan kirim recovery email lagi. Tim perlu memastikan proses backend yang melayani browser memakai konfigurasi VQE dan `/health/ready` menjadi `ready` sebelum menyatakan UAT data berhasil.
2. Setelah readiness backend pada browser `ready`, verifikasi profil/tenant serta akses modul Admin; jangan alihkan preview staging ke PTSAS Production.
3. Buat akun Wali uji dan fixture sintetis baru di VQE. Pengguna menetapkan kata sandi sendiri; jangan memakai atau memasukkan kredensial Production ke staging.
4. Uji profil Wali, daftar kandidat/tagihan, upload berkas melalui endpoint Wali, penolakan akses lintas tenant, onboarding, dan akses setelah onboarding.
5. Hapus semua fixture setelah UAT dan verifikasi hitungannya kembali nol. Minta konfirmasi tepat sebelum penghapusan cloud.
6. Tinjau PR dan bukti UAT UI sebelum mengubah PR dari Draft/Open.

## Status PR dan progress checkpoint

PR #38 tetap Draft/Open sampai UAT UI Wali dan tinjauan backend selesai.

**Progress checkpoint PR #38: 75% (3 dari 4 gate).** Implementasi, CI pada commit kode, dan skema staging selesai. UAT database memberi bukti untuk validasi tenant, role, upload object, pencatatan transaksi, dan idempotensi. Form login aplikasi tampil, tetapi login hingga UAT alur Wali belum selesai. Angka ini hanya untuk checkpoint PR #38, bukan seluruh ERP atau kesiapan komersial.

## Riwayat rekonsiliasi migrasi

VQE sempat menerima timestamp migration sementara dari tool. Baris yang terdampak direkonsiliasi hanya setelah nama dan SQL diverifikasi, dengan guard bahwa versi kanonis belum ada; SQL skema tidak dijalankan ulang. Ledger akhir berisi 115 migrasi dengan versi terbaru cocok dengan source PR.

## Source-level regression checkpoint — 31 Oktober 2026

Source lokal yang diuji berada pada checkout `88e7e7438c91b1fa79d765ebf77ed8efc16ea8a7`; perbandingan Git menunjukkan satu-satunya perbedaan dari commit kode PR `2ba3cdb362aba2a6fa8eaafdd60c5142ea0814f7` adalah dokumen checkpoint. Kode yang diuji identik dengan commit source yang lulus CI.

- `npm run lint` lulus (`tsc --noEmit`).
- `npm run test:guardian-invitation-verification` lulus: 7 skenario (1 diterima, 6 ditolak).
- `npm run test:guardian-student-selection` lulus: 6 assertion.
- `npm run test:ppdb-onboarding-rooms` lulus.
- `npm run test:public-ppdb-validation` lulus untuk batas ukuran total dokumen server-side.
- `npm run test:rbac-permissions` lulus (15 pemeriksaan role/permission dan katalog modul Indonesia).
- Finance unit-scope API dan filter unit lulus.
- Tahfidz membership date lulus (7 fixture, 2 aktif pada tanggal operasional); pagination roster/riwayat dan keyset sesi lulus; progress capaian lulus.
- Master Data pagination dan minimisasi rekursif PII lulus.
- Pemeriksaan yang sudah dicatat pada checkpoint sebelumnya tetap lulus: runtime Supabase-only (92 modul/26 route), deployment flags (30 key publik/37 gerbang server), schema API internal, serta build aplikasi.

Semua butir di atas adalah pemeriksaan source lokal/CI. **Tidak menggantikan UAT UI Wali atau sesi Auth melalui aplikasi**; keduanya masih memerlukan konfigurasi server VQE dan akun sintetis sementara. Persentase checkpoint PR #38 tetap 75% sampai gate UAT tersebut selesai.



## Addendum Auth recovery and environment check — 31 Oktober 2026

- Kueri baca-saja terbaru pada VQE memastikan tenant sintetis `uat-wali-erp4-20261031` aktif dengan satu profil `admin:active`. Hitungan tenant tersebut: kandidat 0, wali 0, relasi wali-kandidat 0, relasi wali-santri 0, tagihan 0, dan permintaan Finance 0. Tidak ada fixture baru dibuat.
- Log Auth VQE: email recovery pernah diterima layanan pada `2026-10-31T07:46:51Z`; verifikasi tautan yang dicoba pukul `08:00:17Z` menyatakan token tidak ditemukan/kedaluwarsa. Permintaan recovery pada `08:00:24Z`, `08:01:07Z`, dan `08:10:58Z` ditolak HTTP 429 `over_email_send_rate_limit`. Pesan tersebut bukan kesalahan kredensial; batas email bawaan berlaku gabungan per proyek. Untuk percobaan selanjutnya tunggu batas pulih dan kirim satu permintaan saja, atau siapkan SMTP khusus di VQE untuk UAT berulang. Jangan gunakan tautan yang lama.
- Pesan umum muncul karena jalur exception sebelumnya tidak memakai pemetaan error Auth. Perbaikan pemetaan exception 429 berada pada head kode `af9db8378e91c62b682e44e994302abd24f026c2`, yang lulus CI 3/3 pada [run 41184875367](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41184875367). Follow-up kode `fa7e77ee53f1f30280a1c2c6b518f0b8b26a0178` menambahkan assertion khusus; status CI dapat diperiksa pada [run 41185402434](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41185402434). Jangan menganggap run 411848 mencakup assertion tambahan itu. Local `npm run test:auth-recovery-redirect`, `npm run lint`, `npm run build`, dan `npm run test:customer-deployment-flags` lulus.
- Workstation Windows tidak menyediakan Supabase CLI, Docker CLI, atau tool PostgreSQL `psql`, `pg_dump`, dan `pg_restore`; karena itu smoke test backup/restore tidak dapat dijalankan lokal (ENOENT). Job database pada CI menjalankan test backup/restore serta build container dan lulus. Uji instalasi pelanggan di VPS/on-premise tetap perlu dilakukan tim penerapan.
- Pemeriksaan metadata proyek PTSAS `ptsasgdvgrbdtgyqieie` melalui konektor ditolak izin. Tidak ada schema, migration, Auth, atau data Production yang diubah.

**Langkah UAT selanjutnya:** jangan membuat ulang tenant atau akun Admin. Login Admin sudah berhasil, tetapi readiness backend yang melayani browser masih `unavailable`; selaraskan proses/env VQE terlebih dahulu. Setelah `/health/ready` menjadi `ready`, verifikasi profil dan cakupan modul, lalu buat fixture Wali/kandidat/tagihan sintetis untuk skenario UI. Bersihkan fixture dengan persetujuan sebelum penghapusan.
