# Kesiapan Komersial dan Go-Live ERP4 Pesantren

Status: kriteria kerja untuk produk yang dipasang dan dioperasikan oleh pelanggan; bukan klaim bahwa produk sudah siap dijual.

## Model produk yang berlaku

ERP4 Pesantren tidak akan dijual sebagai SaaS yang dioperasikan terpusat oleh vendor. Model rilis awal adalah instalasi mandiri milik pelanggan pada VPS atau infrastruktur on-premise. Setiap instalasi memiliki backend, database, storage, secret, backup, dan domain sendiri.

Asumsi kerja rilis awal: satu instalasi melayani satu pesantren. Kolom tenantId/tenant_id tetap dipertahankan sebagai batas data dan kompatibilitas, tetapi tidak berarti vendor mengoperasikan banyak pelanggan dalam satu database. Dukungan beberapa pesantren dalam satu instalasi perlu menjadi keputusan produk tersendiri.

Pendapatan komersial dapat berasal dari lisensi, jasa instalasi/migrasi, pelatihan, pemeliharaan, dan dukungan. Harga, masa lisensi, pembaruan, serta cakupan support belum ditetapkan. Sistem tidak akan memiliki penagihan SaaS atau paket berlangganan per tenant sebelum keputusan produk lain dibuat.

## Baseline teknis yang diverifikasi

- Branch main masih memakai Firebase untuk autentikasi dan data operasional; package.json memuat firebase dan firebase-admin, belum memuat SDK Supabase.
- Supabase GitHub integration terhubung ke project vqemuyzveuirlkvdggjd untuk alur pengembangan. Integrasi itu tidak menjadikan produk ERP sebagai SaaS dan tidak menerapkan migrasi; deploy otomatis produksi nonaktif.
- PR #1 adalah fondasi tenant/RLS Supabase dan masih draft; migrasi belum diterapkan. PR #3 menambahkan provisioning user Supabase, juga masih draft.
- Aplikasi belum memiliki Dockerfile atau Docker Compose. server.ts memakai Application Default Credentials Firebase, mengambil konfigurasi Firebase dari file/variabel, dan menggunakan port tetap 3000.
- Frontend Firebase config diambil dari firebase-applet-config.json. Ini belum menjadi kontrak konfigurasi backend-portable.
- Form PPDB saat ini menggunakan Firebase. File yang dipilih di UI belum benar-benar dikirim sebagai konten file, dan server Firebase menyimpan NIK/NISN plaintext.
- Tidak ada bukti clean install, migrasi, backup/restore, atau pemindahan instance ke server kedua yang telah berhasil.

Baseline tersebut menunjukkan aplikasi belum dapat dipasang secara reproducible pada server pelanggan dan masih perlu migrasi runtime sebelum paket distribusi dibangun.

## Environment yang dituju

### Target rilis awal

1. Development lokal dengan Supabase CLI dan data sintetis. Stack CLI hanya untuk development/test, bukan server produksi.
2. VPS Linux milik pelanggan dengan Docker Compose, TLS/reverse proxy, database dan storage persisten.
3. On-premise pada server Linux atau VM Linux milik pesantren. Instalasi melalui Docker Compose dengan prosedur backup dan pemulihan lokal/off-site.

Windows Server belum menjadi target produksi langsung. Pelanggan Windows dapat menggunakan VM Linux setelah prosedur itu benar-benar diuji. Kubernetes, bare-metal tanpa container, dan provider lain ditambahkan setelah ada matriks kompatibilitas dan kebutuhan pelanggan.

### Dependensi platform

Untuk target on-premise, gunakan Supabase self-hosted Docker Compose atau deployment backend lain yang secara eksplisit diuji dengan aplikasi ini. Jangan menganggap Supabase CLI stack lokal sebagai konfigurasi produksi. Supabase self-hosted menempatkan tanggung jawab pemeliharaan server, hardening, upgrade, backup/DR, pemantauan, dan ketersediaan pada operator instalasi. Beberapa kemampuan managed Supabase seperti branching, managed backups/PITR, dan Management API tidak tersedia pada self-hosted.

Referensi resmi:
- https://supabase.com/docs/guides/self-hosting
- https://supabase.com/docs/guides/self-hosting/docker

## Gerbang kesiapan komersial

### 1. Paket distribusi dan instalasi

- Sediakan image aplikasi dengan versi tetap, Dockerfile multi-stage, compose file produksi, healthcheck, volume persisten, dan contoh konfigurasi tanpa secret.
- Konfigurasi URL Supabase, key publik, URL aplikasi, SMTP, domain, dan port melalui environment; tidak ada URL/customer project ID yang tertanam pada bundle.
- Secret server, password Postgres, signing key, serta kunci enkripsi dibuat per instalasi; tidak ada secret bersama antar pelanggan atau di GitHub.
- Sediakan installer dan preflight yang memeriksa versi OS/Docker, resource disk/memori, DNS/TLS, port, secret, koneksi backend, dan status migrasi.
- Semua schema change harus berupa migrasi berurutan dan kompatibel dengan versi rilis; sediakan prosedur upgrade dan rollback/forward-fix.
- Tentukan lisensi, proses aktivasi/pembaruan, hak penggunaan, jalur upgrade, dan support di luar model SaaS. Jangan mengunci data pelanggan saat lisensi atau jaringan vendor tidak tersedia.

Selesai jika operator yang mengikuti dokumentasi dapat memasang versi rilis pada server kosong tanpa akses ke akun developer, AI Studio, GitHub Actions, atau Supabase project milik vendor.

### 2. Pemindahan antar-environment

- Bedakan konfigurasi dari data; jangan salin .env production ke staging atau pelanggan lain.
- Sediakan ekspor dan impor database serta storage yang dapat dijalankan ulang dengan dry-run, validasi, checksum/jumlah record, dan laporan kegagalan.
- Uji pemindahan snapshot ke server kedua dengan konfigurasi dan secret tujuan yang baru, lalu verifikasi login, tenant isolation, file, transaksi, dan alur utama.
- Backup meliputi database dan berkas, memiliki enkripsi, retensi, prosedur kunci, serta uji restore berkala.
- Tidak ada ketergantungan pada Firebase, project cloud pribadi pembuat, filesystem container yang tidak persisten, IP internal, atau URL lokal pada runtime rilis.
- Dukungan mode tanpa internet harus dinilai terpisah. Integrasi eksternal seperti email, Qur'an, atau data wilayah harus memiliki konfigurasi dan perilaku ketika jaringan keluar dibatasi.

Selesai jika instalasi dapat direstore atau dipindahkan ke host lain tanpa kehilangan relasi, berkas, atau integritas transaksi.

### 3. Keamanan dan operasi pelanggan

- Isolasi tenant dan role tetap diuji; pada rilis satu pesantren per installation, perbatasan utama juga harus dijaga oleh server, database, jaringan, dan secret masing-masing instalasi.
- Semua jalur tulis kritis memakai backend tepercaya. Key service-role tidak pernah masuk browser, image frontend, log, atau repository.
- Sediakan SMTP pelanggan/terkonfigurasi untuk verifikasi, reset password, dan notifikasi.
- Dokumentasikan patch OS/container/database, rotasi secret, firewall, TLS, log, monitoring, kapasitas, eskalasi, incident response, dan pemulihan bencana.
- Tetapkan RPO/RTO, jadwal backup, jangka retensi, serta siapa yang bertanggung jawab pada instalasi yang dikelola pelanggan versus instalasi yang dikelola tim ERP.
- Siapkan proses ekspor, penghapusan, dan serah-terima data saat kontrak berakhir.

Selesai jika instalasi pelanggan dapat dipelihara, dipantau, dipulihkan, dan diupgrade oleh pihak yang jelas dengan tanggung jawab operasional tertulis.

### 4. Validasi penawaran

- Pilih pesantren pilot yang mewakili variasi ukuran dan kesiapan IT.
- Ukur keberhasilan instalasi, waktu onboarding, penyelesaian alur utama, error, waktu dukungan, serta biaya cloud/perjalanan/pelatihan.
- Validasi kesediaan membayar untuk lisensi dan jasa berdasarkan biaya instalasi, migrasi, support, pemeliharaan, serta upgrade.
- Siapkan demo dengan data sintetis dan materi penawaran yang hanya menyebut kemampuan yang sudah tersedia.
- Tetapkan definisi support, masa pemeliharaan, biaya perubahan khusus, dan versi yang masih mendapat update.

Selesai jika pilot bisa dipasang dan dipakai pada infrastruktur pelanggan, kebutuhan support dapat dipenuhi dengan biaya yang diketahui, dan harga ditopang bukti pasar.

## Urutan kerja

1. Pertahankan satu sumber kode resmi di GitHub dan review perubahan AI Studio sebelum sinkronisasi.
2. Selesaikan kontrak tenant, RLS, manajemen akun, PPDB, dan backend tepercaya sebelum mengubah runtime Firebase.
3. Buat adapter Supabase dan migrasi data per modul; Firebase tetap sumber aktif sampai cutover terbukti.
4. Setelah backend rilis terbentuk, buat Dockerfile/Compose untuk ERP dan Supabase self-hosted, contoh environment, serta installer/preflight.
5. Simulasikan clean install, upgrade, data sintetis, kegagalan komponen, backup/restore, pemindahan ke host kedua, dan UAT lintas role.
6. Jalankan pilot pada VPS dan on-premise Linux; catat beban support, biaya layanan, serta hasil operasional.
7. Tawarkan lisensi dan layanan komersial setelah prosedur instalasi, pemulihan, upgrade, dukungan, serta batas tanggung jawab lulus pilot.

## Batas tindakan

PR atau dokumen tidak membuktikan runtime siap dipasang. Penerapan migrasi pada database pelanggan, perubahan sumber data aktif, pembukaan akses publik, serta distribusi rilis membutuhkan prosedur backup, uji lingkungan, dan persetujuan pemilik sistem. Firebase belum boleh dihentikan sebelum migrasi dan rekonsiliasi data selesai.
