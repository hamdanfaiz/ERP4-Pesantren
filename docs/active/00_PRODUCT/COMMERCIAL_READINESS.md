# Kesiapan Komersial dan Go-Live — ERP4 Pesantren

**Status:** dokumen penerimaan internal. Dokumen ini tidak menyatakan produk siap dijual atau siap produksi.
**Diperbarui:** 30 Oktober 2026
**Jalur rilis utama:** PR #13, self-hosted, satu instalasi per pesantren.

## Kontrak produk

ERP4 Pesantren ditujukan sebagai software yang dipasang dan dioperasikan untuk pesantren, bukan SaaS multi-pelanggan yang dikelola vendor. Asumsi rilis awal adalah satu instalasi untuk satu pesantren. Backend, Auth, database, Storage, domain, secret, dan backup menjadi milik/lingkup instalasi tersebut.

Kolom `tenant_id` tetap menjadi batas data dan otorisasi di dalam instalasi. Keberadaannya tidak berarti semua pesantren akan ditempatkan pada satu database vendor. Dukungan beberapa pesantren dalam satu instalasi harus menjadi keputusan produk tersendiri.

**Batas rilis awal:** atas keputusan pemilik, PPOB, Layanan ekosistem, dan integrasi payment gateway dikeluarkan sementara. Provider belum dipilih dan tidak ada koneksi provider yang ditawarkan pada rilis awal. Modul disembunyikan dari navigasi dan tidak bisa dibuka melalui permission yang tersimpan sebelumnya. Finance tetap mendukung pencatatan serta verifikasi pembayaran manual; settlement otomatis belum termasuk.

Paket Docker ERP berkomunikasi dengan endpoint Supabase yang disediakan operator. Paket ini **belum membundel atau mengoperasikan seluruh layanan Supabase**. VPS dan on-premise berarti jalur deployment yang dituju, bukan bukti bahwa clean install di semua jenis server telah berhasil.

Pendapatan yang mungkin ditawarkan mencakup lisensi, jasa instalasi, migrasi yang disetujui pelanggan, pelatihan, pemeliharaan, dan dukungan. Harga, bentuk lisensi, periode update, SLA, dan cakupan support belum ditetapkan. Jangan menjanjikan layanan SaaS, operasi offline penuh, native Windows Server, Kubernetes, atau skala tertentu sebelum dirancang dan diuji.

## Status teknis berdasarkan bukti

- Source cutover PR #13 sudah merged ke `main` (merge commit `cea0ed481950c4e40a1035ff9d971cf3a43929bc`). Source mengarahkan modul operasional ke API Supabase. Firebase Admin dinonaktifkan pada semua environment; paket Firebase tidak masuk ke dependensi production. Impor arsip Firestore dinonaktifkan lewat kebijakan global, dan data contoh akan dibuat manual.
- GitHub Actions [run 41051400486](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/41051400486) lulus **2/2 job** pada head source PR #13 `e449c234c253eb7a65795af18c5794fa45e6e9cb`. Cakupan meliputi typecheck/build, penguncian PPOB di RBAC, Docker/Compose, Supabase lokal sintetis, rehearsal migration, pgTAP, API/tenant, transaksi serentak, Storage, dan backup/restore. Ini bukan UAT pelanggan atau bukti perubahan database live.
- Source `main` memiliki 109 file migration. Pembacaan SQL Editor dashboard yang read-only pada 30 Oktober mengonfirmasi 47 versi ledger, dari `20260603000000` sampai `20261206000000`; dua baris memiliki `name` dan `statements` kosong. Selisih hitungan potensial 62 belum membuktikan versi/statement mana yang aman diterapkan. Dashboard menandai ref target `ptsasgdvgrbdtgyqieie` sebagai `main / PRODUCTION`, bertentangan dengan jawaban terdahulu bahwa itu staging. Tidak ada migration yang diterapkan.
- Snapshot katalog target terdahulu menunjukkan 119/119 tabel `public` memakai RLS dan FORCE RLS; 118/118 tabel tenant mewajibkan `tenant_id`; 243/243 FK antartabel tenant memasangkan `tenant_id`; tabel `anon` tanpa SELECT dan `authenticated` tanpa hak tulis langsung. Katalog dan baseline ini belum dibaca ulang; rehearsal harus dilakukan pada staging terisolasi.
- Runtime feature flags sengaja mati secara default sampai migration, provisioning tenant, Auth, role/permission, dan UAT masing-masing modul lulus.
- Tagihan PPDB dapat dibuat Admin pada record calon santri dan ditautkan ke santri saat onboarding. Admin dapat mencatat pelunasan manual sebelum onboarding; unggah bukti mandiri oleh Wali baru tersedia setelah akun Wali terhubung dengan santri aktif. Jika pembayaran mandiri Wali sebelum onboarding dibutuhkan, itu masih perlu dirancang dan diuji.
- Docker/Compose dan smoke test tersedia pada branch cutover. Belum ada bukti instalasi baru dari server kosong milik pelanggan, upgrade/restore di VPS/on-premise, atau uji beban berskala pesantren besar.

Snapshot teknis ini bukan pengganti audit endpoint, pemeriksaan definisi seluruh function di staging, uji lintas tenant secara live, dan penerimaan pengguna.

## Gerbang rilis komersial

### 1. Skema, relasi, dan transaksi

- Tim backend dapat menjalankan `npm run preflight:db-migrations` dari root source `main` untuk membandingkan versi, nama, dan statement migration dengan koneksi PostgreSQL read-only. Pastikan hostname menunjuk ke project target; jangan membagikan URL atau secret. Jika ada `HENTIKAN` atau mismatch, selesaikan rekonsiliasi sebelum rehearsal.
- Rekonsiliasi hasil ringkasan ledger terkini terhadap 109 file migration di source `main`, termasuk menyelesaikan dua baris metadata kosong dan membuktikan kesetaraan statement. Selisih hitungan potensial 62 bukan daftar migration siap diterapkan. Jangan tandai versi sebagai applied tanpa bukti schema.
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

1. Tim backend memastikan target yang benar dan menyediakan environment staging terisolasi yang dapat dipulihkan. Konektor Supabase yang tersedia pada Codex saat ini tidak menampilkan ref target `ptsasgdvgrbdtgyqieie`; jangan gunakan project Supabase lain sebagai pengganti.
2. Baca ulang ledger, review, dan rehearsalkan urutan migration yang benar-benar belum diterapkan pada lingkungan yang dapat dipulihkan; tidak ada importer Firestore yang perlu dijalankan.
3. Jalankan UAT Auth, role/tenant, modul kritis, Storage, dan error recovery pada staging.
4. Lakukan clean install, upgrade, dan pemindahan host pada VPS Linux serta VM on-premise representatif.
5. Selesaikan rotasi secret, operasi/support, lisensi, pilot, dan sizing beban.
6. PR #13 sudah merged sebagai baseline source. Tim penerapan menjalankan rehearsal target, deployment, dan UAT; versi rilis/penjualan tetap menunggu seluruh gerbang di atas lulus.

## Perkiraan checkpoint

Estimasi terakhir adalah **73% penyelesaian pengembangan**. Deployment dan UAT dikerjakan tim penerapan. CI, ERD, atau snapshot RLS yang lulus tidak menggantikan migration staging, UAT, dan simulasi environment pelanggan.

