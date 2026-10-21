# Distribusi Self-Hosted dan Portabilitas Environment

Status: rancangan kontrak distribusi berdasarkan baseline GitHub main pada 2026-10-21. Belum ada image/container atau clean-install yang dapat dibuktikan.

## Tujuan distribusi

ERP4 Pesantren adalah software yang dijalankan pada infrastruktur pelanggan, bukan layanan SaaS multi-pelanggan yang dikelola vendor. Rilis awal menargetkan satu pesantren per installation mandiri. Setiap installation memiliki domain, Supabase/backend, database, storage, secret, dan backup sendiri.

Tenant ID tetap menjadi bagian model data untuk isolasi internal dan kompatibilitas, tetapi tidak berarti vendor mengoperasikan banyak pelanggan dalam satu database. Penjualan lisensi, instalasi, migrasi, pelatihan, support, dan update terjadi terpisah dari modul Keuangan pesantren.

## Baseline dan gap yang terbukti

- Aplikasi utama masih Firebase-first pada branch main. Supabase belum menjadi sumber data runtime.
- server.ts menginisialisasi Firebase Admin melalui Application Default Credentials dan membaca firebase-applet-config.json.
- Frontend mengimpor konfigurasi Firebase lokal; belum ada kontrak environment standar untuk URL/key Supabase.
- server.ts memakai port tetap 3000 dan trust proxy bernilai satu hop.
- Tidak ditemukan Dockerfile atau Docker Compose pada main.
- Belum ada command installer/preflight, image versioning, healthcheck, atau bukti persistensi data pada volume.
- Supabase project vqemuyzveuirlkvdggjd adalah koneksi pengembangan. Jangan gunakan URL, key, atau nama project tersebut sebagai default produk pelanggan.
- PR #1 dan PR #3 adalah draft. Migrasi dan provisioning belum diterapkan; Firebase tetap menjadi runtime aktif.
- Tidak ada clean-room install atau backup/restore drill yang sudah diverifikasi.

## Matriks environment rilis awal

| Environment | Tujuan | Basis yang dituju | Status saat ini |
| --- | --- | --- | --- |
| Development lokal | Pengembangan dan data sintetis | Supabase CLI + app server | Belum terhubung penuh |
| CI | Lint/build, migrasi dari kosong, integration/security checks | Disposable service containers | Belum tersedia |
| Staging/pilot | Simulasi instalasi pelanggan dan upgrade | Linux VM/VPS, Compose, synthetic data | Belum tersedia |
| VPS pelanggan | Produksi milik pelanggan | Linux + Docker Compose + reverse proxy + persistent volumes | Belum tersedia |
| On-premise | Produksi di server atau VM pelanggan | Linux + Docker Compose; backup ke media/host terpisah | Belum tersedia |
| Windows host | Host lokal pelanggan | VM Linux yang tervalidasi | Belum tervalidasi |
| Kubernetes/alternatif | Pelanggan dengan platform khusus | Paket deployment khusus setelah diuji | Di luar rilis awal |

Supabase membedakan local CLI development stack dari deployment produksi self-hosted. Panduan self-hosted resminya menggunakan Docker Compose; kemampuan managed seperti branching serta managed backups/PITR tidak tersedia, sehingga backup, upgrade, monitoring, security hardening dan DR menjadi tanggung jawab operator. Cek matriks dan versi Supabase sebelum setiap rilis:
- https://supabase.com/docs/guides/self-hosting
- https://supabase.com/docs/guides/self-hosting/docker

Panduan Docker self-hosted Supabase saat ini mencantumkan kebutuhan minimum untuk seluruh komponen sebesar 4 GB RAM, 2 core CPU, dan 40 GB SSD; rekomendasi 8 GB+, 4 core+, dan 80 GB+ SSD. Angka tersebut adalah baseline stack backend, bukan hasil sizing ERP4 Pesantren. Tetapkan kebutuhan resmi aplikasi melalui simulasi beban dan pertumbuhan file.

## Kontrak konfigurasi

Aplikasi tidak boleh memuat nilai environment pelanggan dari source code, build arg, atau default cloud pembuat produk. Image yang sama harus bisa dipindahkan antar-environment dengan memasukkan konfigurasi saat container dijalankan.

### Frontend yang aman untuk browser

- SUPABASE_URL: URL API untuk backend installation ini.
- SUPABASE_PUBLISHABLE_KEY: key yang memang dirancang untuk dikirim ke browser, dengan RLS aktif pada semua tabel yang dapat dicapai klien.
- APP_PUBLIC_URL: origin aplikasi untuk redirect dan tautan email.

Karena konfigurasi berbeda per instalasi, nilai ini harus disajikan saat runtime, misalnya lewat endpoint konfigurasi statis runtime-config.js yang dibuat server ketika container berjalan. Jangan menanam URL/key per pelanggan ke build artifact; itu akan memaksa rebuild berbeda per environment. Konfigurasi browser harus dibatasi ke nilai publik yang aman, dikirim dengan cache policy yang sesuai, dan tidak pernah memuat secret server.

### Backend/installer only

- SUPABASE_URL dan SUPABASE_SECRET_KEY untuk trusted server/Edge Functions.
- DATABASE_URL hanya pada job migrasi/maintenance yang membutuhkan koneksi database.
- FIELD_ENCRYPTION_KEY dan PII_FINGERPRINT_KEY dibuat dan disimpan per installation, terpisah dari repo serta backup data.
- SMTP_HOST/PORT/USER/PASSWORD dan sender domain untuk email.
- APP_PUBLIC_URL, TRUSTED_PROXY_HOPS, PORT, log level, dan storage configuration.
- Backup destination, retention, encryption key reference, dan restore target disimpan di luar volume utama.

Nama final harus distandardisasi di implementasi. .env.example hanya berisi placeholder non-rahasia; preflight harus menolak nilai placeholder/default. Secret tidak boleh disimpan di image, bundle frontend, repository, atau log.

## Target paket instalasi

Setelah runtime backend selesai dimigrasikan, rilis perlu menyediakan:
1. Image ERP dengan tag versi immutable dan SBOM/dependency inventory.
2. Compose production untuk aplikasi, reverse proxy/TLS integration, dan service dependencies yang diperlukan.
3. Volume database/storage eksplisit dengan healthcheck dan kebijakan restart.
4. Supabase self-hosted stack pada versi yang diuji bersama; jangan menyalin stack local CLI sebagai stack produksi.
5. Script install, configure, backup, restore, upgrade, rollback/forward-fix, dan diagnostik.
6. Dokumentasi resource minimum/target, port/firewall, DNS/TLS, SMTP, lokasi berkas, disk growth, dan log.
7. Cara mengekspor database dan objek storage ke format terdokumentasi yang dapat dipindahkan ke instance lain.
8. Tidak ada telemetri vendor atau ketergantungan license-check eksternal yang dapat membuat pelanggan kehilangan akses ke datanya ketika internet/vendor tidak tersedia.

Image rilis harus dibangun sekali per commit/tag, lalu dipromosikan sama persis ke staging dan instalasi pelanggan. Konfigurasi tiap pelanggan masuk melalui secret/config injection ketika runtime, bukan rebuild image.

## Alur simulasi yang harus dibuat

1. Buat VM Linux bersih dengan resource setara target minimum pelanggan.
2. Jalankan installer tanpa akses ke komputer developer atau Supabase managed project vendor.
3. Isi environment baru dan buat semua secrets unik; pastikan secret tidak masuk Git atau image.
4. Deploy stack, jalankan migrasi secara tercatat, tunggu healthcheck, buat tenant/Admin awal melalui backend bootstrap terkontrol.
5. Isi data sintetis untuk PPDB, santri, akademik, tahfidz, asrama, keuangan, dan berkas.
6. Jalankan alur modul utama, role isolation, upload/download, serta restore.
7. Backup database dan storage, restore ke VM kedua dengan hostname dan secrets baru, lakukan rekonsiliasi.
8. Upgrade dari versi rilis sebelumnya dan uji rollback/forward-fix pada snapshot.
9. Ulangi dengan konfigurasi jaringan on-premise yang membatasi egress; tandai dengan jelas fitur yang memang memerlukan SMTP/API luar.
10. Catat log, versi image, versi skema, durasi operasi, kegagalan, dan tindakan operator pada runbook.

Kriteria lulus: image identik dapat berjalan pada host kedua hanya dengan konfigurasi baru; migrasi sesuai; akses antar tenant/role tertutup; saldo, relasi, serta berkas konsisten; dan backup dapat dipulihkan.

## Kesiapan komersial untuk produk self-hosted

- Tentukan model lisensi, masa pemeliharaan/update, biaya instalasi/migrasi, pelatihan, support, serta cakupan perubahan khusus.
- Definisikan siapa mengelola OS, Docker, database, backup, SMTP, DNS/TLS dan incident response untuk instalasi self-managed dan untuk instalasi yang dikelola tim.
- Jangan menawarkan SLA availability untuk VPS/on-prem yang dikelola pelanggan kecuali tim juga mengelola monitoring, backup, patch, dan on-call sesuai kontrak.
- Siapkan panduan instalasi untuk admin pesantren, checklist preflight, runbook operator, release notes, troubleshooting, ekspor data, dan proses terminasi.
- Pilot harus menguji instalasi VPS dan on-premise, bukan hanya login demo atau preview AI Studio.

## Keputusan teknis yang belum dibuat

- Apakah tim menawarkan hanya self-managed package atau juga layanan instalasi/managed hosting terpisah.
- Dukungan native Windows, Kubernetes, arsitektur offline/air-gapped, arsitektur CPU selain amd64, dan provider S3-compatible.
- Kebijakan lisensi dan aktivasi yang tidak mengunci data pelanggan.
- SMTP default/provider, sistem pembayaran lisensi, update channel, telemetry/diagnostics consent.
- Kapasitas minimum resmi ERP berdasarkan simulasi beban, bukan hanya kebutuhan minimum Supabase.

Keputusan ini tidak boleh disamarkan sebagai kemampuan yang sudah ada. Uji dan dokumentasikan sebelum menjanjikannya di materi penawaran.
