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
- UAT UI belum selesai. Percobaan menjalankan server baru bertabrakan dengan listener lama pada port 3000; server yang ada kemudian dihentikan. Browser tidak dapat menjangkau localhost dari workspace ini, sehingga sesi login aplikasi belum bisa diverifikasi.

## Keadaan VQE saat ini

- Tenant sintetis `uat-wali-erp4-20261031`, ID `80f406de-aa77-4efa-b36b-232ceb160178`, dibuat kembali di VQE pada 31 Oktober 2026.
- Hitungan setelah pembuatan menunjukkan: 1 tenant; 0 profil, kandidat, wali, relasi akun Wali-kandidat, tagihan, dan permintaan tulis Finance untuk tenant itu.
- Fixture Auth, PPDB, Finance, serta Storage dari putaran UAT terdahulu telah dibersihkan dan belum dibuat kembali pada putaran ini.
- Tidak ada data operasional Firestore yang disalin. PTSAS Production tidak disentuh.

## Hasil verifikasi

- Dengan role database `authenticated`, RLS mengembalikan hanya profil sendiri dan tenant aktif akun uji.
- Role `authenticated` tidak memiliki akses Data API langsung ke tabel finansial; akses finansial harus melewati endpoint server. Bucket bukti bersifat privat dan tidak memiliki policy akses langsung.
- Helper relasi Wali-kandidat mengizinkan kandidat yang tertaut, serta menolak tenant/kandidat yang tidak terkait dan kandidat yang ditolak.
- Upload bukti memakai hak admin dashboard; ini bukan bukti upload melalui sesi Wali aplikasi.
- RPC `register_tenant_finance_payment_proof` berhasil mencatat tagihan menjadi `verification`. Pengulangan dengan idempotency key sama menghasilkan `alreadyApplied: true`.
- Uji negatif RPC menolak role yang tidak sesuai, path traversal, dan tenant berbeda.
- Login aplikasi, profil setelah login, endpoint upload Wali, onboarding, dan akses pasca-onboarding belum teruji. Preview tetap menunjuk ke VQE yang sudah bersih; konfigurasi server VQE dan akun uji baru diperlukan untuk mengulang UAT UI. Jangan memakai kredensial Production pada preview staging.

## Perubahan dan verifikasi kode

- Wali dengan email Auth terverifikasi dapat mengakses tagihan kandidat PPDB pra-onboarding hanya pada tenant yang sesuai, untuk kandidat yang belum ditolak/di-onboard, dengan tagihan aktif.
- Setelah onboarding, akses kandidat dicabut dan tagihan mengikuti relasi santri serta Wali kanonis.
- CI [run 41168200484](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41168200484) lulus pada commit kode `2ba3cdb362aba2a6fa8eaafdd60c5142ea0814f7`: frontend build/guard, migration rehearsal, pgTAP, API tenant/auth, Storage, backup/restore, import, idempotensi, dan build Docker pelanggan.
- Head PR setelah commit kode berisi pembaruan dokumentasi saja; workflow CI tidak berjalan pada commit docs.
- VQE memiliki 115 migration sampai `20270212000000_optimize_core_tenant_query_indexes`. pgTAP live sebelumnya: 53 assertion privilege API dan 44 assertion isolasi tenant; skrip memakai rollback.
- Security Advisor: 156 INFO untuk tabel backend-only tanpa policy; tidak ada WARN helper SECURITY DEFINER atau `auth_rls_initplan`. Performance Advisor memberi INFO indeks FK/unused-index. VQE tidak memiliki data operasional sehingga telemetry indeks belum mewakili beban nyata.
- Pemeriksaan `npm ci --ignore-scripts --offline --dry-run` pada salinan lockfile berhasil merencanakan 115 paket tanpa kesalahan sinkronisasi lock. Instalasi penuh belum terverifikasi: di worktree preview, `npm ci` tertahan oleh Windows `EPERM` saat mencoba melepas `lightningcss` native module; di direktori bersih, mode offline berhenti karena `zxing-wasm@3.0.3` tidak tersedia di cache. Jalankan `npm ci` pada environment bersih dengan akses registry sebelum menyatakan jalur NPM siap. CI Docker pelanggan memakai Bun dan telah lulus.

## Tindak lanjut

1. Jalankan server dari worktree PR #38 pada mesin yang membuka browser dengan konfigurasi `.env` VQE. Pastikan halaman login dan `/health/ready` dapat dijangkau sebelum UAT.
2. Buat akun Wali uji dan fixture sintetis baru di VQE. Pengguna menetapkan password sendiri; jangan memakai atau memasukkan kredensial Production ke staging.
3. Uji login melalui aplikasi, profil Wali, daftar kandidat/tagihan, upload berkas melalui endpoint Wali, penolakan akses lintas tenant, onboarding, dan akses setelah onboarding.
4. Hapus semua fixture setelah UAT dan verifikasi hitungannya kembali nol. Minta konfirmasi tepat sebelum penghapusan cloud.
5. Tinjau PR dan bukti UAT UI sebelum mengubah PR dari Draft/Open.

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
