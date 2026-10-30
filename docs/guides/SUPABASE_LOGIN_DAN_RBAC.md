# Login, Profil, dan RBAC Supabase

**Status:** panduan mengikuti source main setelah PR #13, bukan bukti bahwa Auth atau database Production telah diuji.
**Diperbarui:** 30 Oktober 2026
**Model rilis:** satu instalasi ERP untuk satu pesantren; tabel tetap memiliki tenant_id sebagai batas otorisasi.

> Panduan transisi lama yang menyebut modul operasional masih memakai Firestore sudah tidak berlaku. Runtime aplikasi memakai Supabase. Tabel public.user_profiles dipertahankan untuk kompatibilitas/backfill; sumber profil kanonis runtime adalah public.profiles.

## Komponen identitas

- Supabase Auth menyimpan identitas dan kredensial pada auth.users.
- public.profiles menyimpan profil ERP, role, status, tenant, unit, izin modul, dan relasi Wali–Santri.
- public.tenants menyimpan tenant, termasuk status dan zona waktu.
- Password tidak disimpan di tabel profil. Login browser menggunakan Supabase Auth dan hanya membaca profil milik pengguna melalui RLS.
- Kunci SUPABASE_SECRET_KEY hanya dipakai proses server/operator. Jangan pernah mengirimkannya ke browser, variabel VITE_*, Git, log, atau dokumen.

## Alur login

1. Browser mengirim email dan kata sandi ke supabase.auth.signInWithPassword().
2. Sesi disimpan pada sessionStorage, sehingga hanya bertahan dalam sesi tab browser; fitur “ingat saya” berbasis penyimpanan lokal tidak digunakan.
3. Aplikasi membaca baris profiles dengan user_id yang sama dengan UID Supabase Auth. RLS membatasi pembacaan profil; role yang tidak dikenal, profil tidak ditemukan, tenant kosong, profil tidak aktif, atau tenant tidak aktif membuat login ditolak.
4. Permintaan ke API ERP membawa access token sebagai Authorization: Bearer …. Server memverifikasi token menggunakan Supabase Auth, lalu membaca profil kanonis lagi sebelum menjalankan operasi.
5. Logout mengakhiri sesi Supabase dan membersihkan identitas sesi aplikasi.

Akun Auth tanpa profil ERP aktif tidak mendapat akses ke sistem.

## Role dan izin modul

Daftar role dalam source:

| Role | Batas akses awal |
|---|---|
| SuperAdmin | Akses modul sistem menurut RBAC aplikasi. |
| Admin | Semua modul dalam lingkup tenant secara bawaan. |
| Ustadz | Dashboard, Akademik, Tahfidz, Asrama, LMS, CBT, Komunikasi, dan Perpustakaan. |
| Santri | Dashboard, Akademik, Tahfidz, Asrama, Keuangan, LMS, CBT, dan Perpustakaan. |
| Walisantri | Dashboard, Akademik, Tahfidz, Asrama, Keuangan, Komunikasi, dan Donasi. |
| Public | Tidak mendapat akses modul ERP terautentikasi. |

Pengaturan hanya untuk SuperAdmin. module_permissions dapat menolak akses bawaan dengan nilai false atau memberi izin dalam lingkup tenant dengan true; kunci modul tidak dikenal ditolak. Modul PPOB/payment gateway tidak termasuk rilis awal dan tidak boleh diaktifkan melalui izin lama.

RBAC di menu browser hanya mengatur tampilan. Batas keamanan ditegakkan kembali oleh API server dan kebijakan database. Tabel profiles memakai RLS/FORCE RLS; pengguna terautentikasi tidak diberi hak tulis langsung untuk profil. Endpoint Admin memeriksa token, status aktif, role, izin modul users, dan tenant aktor. Operasi tenant memakai identitas tenant dari profil terverifikasi, bukan nilai yang dipercaya dari payload browser.

## Siklus akun

### Admin pertama pada tenant baru

Perintah operator:

<pre><code>bun run provision:tenant-admin -- slug "Nama Pesantren" admin@example.com "Nama Admin"</code></pre>

Proses ini bukan halaman pendaftaran publik. Script memakai SUPABASE_URL dan SUPABASE_SECRET_KEY, mengundang alamat email lewat Supabase Auth, lalu memanggil RPC bootstrap tenant/Admin. Admin menetapkan password melalui tautan undangan; jangan memasukkan password ke command line atau mengirimkannya lewat chat.

Script menghentikan proses jika email/tenant sudah memiliki profil yang tidak cocok. Jika pembuatan profil gagal, akun undangan sementara dibersihkan; bila pembersihan gagal, operator harus merekonsiliasi akun sebelum mencoba ulang. Jalankan hanya setelah migration bootstrap direkonsiliasi dan pada target yang telah dipastikan benar.

### Akun staf dan santri

Admin tenant membuat akun melalui modul Pengguna. Server memeriksa tenant aktif, role, unit organisasi, izin modul, dan relasi Santri yang diminta. Kata sandi awal 12–128 karakter dipakai untuk membuat akun Auth; profil ditandai must_change_password=true. Pengguna harus menggantinya saat pertama kali masuk. Jika penulisan profil gagal, server mencoba menghapus akun Auth yang baru dibuat.

### Akun Wali

Wali dapat memakai undangan Admin atau pendaftaran mandiri. Pendaftaran mandiri meminta email yang tercatat pada data Wali, kata sandi minimal 12 karakter, konfirmasi email Supabase, lalu pencocokan dan pengaitan ke data Wali–Santri aktif. Akses tidak diberikan hanya karena seseorang memiliki akun Auth.

Pendaftaran Wali menggunakan tenant yang dikonfigurasi server dan URL aplikasi yang diizinkan pada Supabase Auth. Ini terpisah dari pembukaan formulir PPDB publik: PUBLIC_PPDB_ENABLED mengatur penerimaan kandidat PPDB, bukan pendaftaran akun Wali. SMTP, redirect URL, dan konfirmasi email harus diuji pada environment non-production.

### Reset dan perubahan kata sandi

Pengguna dengan password sementara menggantinya melalui alur perubahan pertama. Admin dapat membuat tautan recovery untuk akun dalam tenantnya; aplikasi menampilkan tautan tersebut untuk disampaikan kepada pengguna melalui kanal yang aman. Alur ini tidak mengirim password baru dan tidak menyimpan password plaintext. Jangan menyalin tautan reset ke log atau kanal publik.

## Environment dan instalasi

Gunakan .env lokal yang diabaikan Git, atau secret manager pada server. Nilai contoh tersedia pada .env.example; jangan menaruh kredensial nyata di sana.

- Server: SUPABASE_URL, SUPABASE_SECRET_KEY.
- Browser: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY saja.
- Bootstrap/Admin pertama: SUPABASE_AUTH_REDIRECT_URL, BOOTSTRAP_TENANT_TYPE, BOOTSTRAP_TENANT_TIME_ZONE.
- Pendaftaran Wali: PUBLIC_APP_URL (atau origin aplikasi yang disetujui), PUBLIC_PPDB_TENANT_ID, dan konfigurasi Auth/SMTP. Pastikan URL redirect diizinkan pada Supabase.
- SUPABASE_DB_URL dan SUPABASE_DB_POOLER_URL untuk pekerjaan database operator; keduanya bukan konfigurasi login aplikasi.

Repo mengunci Bun melalui .bun-version. Instal dependensi dari root repo dengan bun install --frozen-lockfile; jangan memakai npm ci pada lockfile NPM yang saat ini tidak sinkron. Jalankan aplikasi pengembangan dengan bun run dev.

## Source of truth

- [Klien Supabase dan penyimpanan sesi browser](../../src/utils/supabase.ts)
- [Login, pemuatan profil, dan alur perubahan password](../../src/contexts/AuthContext.tsx)
- [Role dan izin modul](../../src/rbac.ts)
- [Verifikasi token, pembacaan profil, dan manajemen akun](../../src/server/identityStore.ts)
- [Middleware serta endpoint API server](../../server.ts)
- [Skema tenant, profil, RLS, dan grant](../../supabase/migrations/20261023000000_tenant_profile_foundation.sql)
- [Bootstrap tenant/Admin pertama](../../scripts/provision-tenant-admin.mjs)
- [Nama environment variable dan default feature flag](../../.env.example)

## Status verifikasi dan batas keselamatan

GitHub Actions run 41051400486 lulus 2/2 job pada source PR #13 yang kemudian merged ke main. CI mencakup build, guard runtime Firebase, RBAC, API/tenant, dan tes database sintetis. Hasil ini bukan bukti login terhadap Supabase live.

Project ptsasgdvgrbdtgyqieie terlihat sebagai main / PRODUCTION. Snapshot read-only mencatat 47 versi migration pada ledger dan 109 file migration pada source; metadata dua versi ledger kosong. Konektor Supabase Codex menolak akses baca. Jangan menjalankan db push, migration repair, bootstrap tenant/Admin, atau mengaktifkan runtime flag pada target tersebut untuk mengatasi selisih itu.

Sebelum login pertama dan aktivasi runtime:

1. Tim backend menyediakan Supabase staging terisolasi yang dapat di-backup dan dipulihkan.
2. Jalankan preflight migration dari checkout main yang hendak dirilis; rekonsiliasi provenance dua baris ledger kosong dan perbedaan versi melalui proses yang ditinjau.
3. Rehearsalkan migration dan restore pada staging; verifikasi RLS, grant, Auth redirect/SMTP, dan profil tenant.
4. Provision tenant/Admin di staging, lalu uji login, perubahan password pertama, role × tenant, reset, undangan Wali, pencocokan relasi Wali–Santri, dan penolakan akun nonaktif.
5. Simpan hanya hasil yang disanitasi. Rotasi secret Supabase dan password database yang pernah dibagikan sebelum go-live.

Lihat [kesiapan komersial](../active/00_PRODUCT/COMMERCIAL_READINESS.md), [checkpoint target Supabase](../active/06_DATABASE/CHECKPOINT_SUPABASE_TARGET_2026-10-30.md), dan [tindakan lokal tim backend](../active/06_DATABASE/TEAM_LOCAL_READINESS_ACTIONS_2026-10-26.md) untuk status serta runbook terkini.

