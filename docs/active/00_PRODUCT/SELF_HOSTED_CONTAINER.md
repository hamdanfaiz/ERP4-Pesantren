# Paket Deployment Portable ERP4 Pesantren

Status: rancangan paket container aplikasi tahap awal. Branch ini belum menjadi rilis self-hosted penuh dan belum membuktikan produk siap produksi.

## Keputusan distribusi

ERP4 Pesantren dipasarkan sebagai instalasi per pelanggan, bukan layanan SaaS bersama. Setiap pesantren memiliki konfigurasi, database, file, kredensial, backup, dan proses pemulihannya sendiri. Image aplikasi yang sama harus dapat dipasang di berbagai host tanpa membangun fork khusus pelanggan.

Target rilis pertama yang dapat diuji:

| Environment | Target | Catatan |
| --- | --- | --- |
| VPS | Linux x86_64 dengan Docker Engine dan Compose | Reverse proxy/TLS disediakan pelanggan atau paket instalasi. |
| On-premise | Server fisik atau VM Linux milik pesantren | Dapat memakai jaringan privat; akses internet dibutuhkan untuk pembaruan kecuali image dibawa secara offline. |
| Cloud milik pelanggan | VM Linux pada penyedia pilihan pelanggan | Bukan SaaS bersama; database dan berkas tetap berada pada infrastruktur yang dipilih pelanggan. |
| Windows Server | VM Linux di atas hypervisor | Windows Server native belum didukung sampai ada simulasi terpisah. |
| Kubernetes/Podman | Kandidat tahap berikutnya | Tidak dinyatakan didukung sebelum konfigurasi dan operasi diuji khusus. |

Backend final harus dapat berjalan dengan Supabase terkelola yang dikendalikan pelanggan, atau Supabase self-hosted untuk instalasi privat/on-premise. Aplikasi tidak boleh bergantung pada project Firebase developer. Image yang sama, skema migrasi SQL, dan prosedur upgrade digunakan lintas environment; perbedaan host diberikan lewat konfigurasi runtime. Supabase CLI local development bukan paket produksi.

Supabase self-hosted memberi kontrol atas data, tetapi pelanggan menjadi penanggung jawab pemeliharaan server, patch keamanan, konfigurasi layanan, PostgreSQL, backup, monitoring, dan restore. Dokumentasi resmi Supabase menyebut Docker Compose sebagai jalur self-hosting resmi dan merekomendasikan minimal 4 GB RAM serta SSD 40 GB untuk seluruh komponen; kapasitas itu hanya dasar, bukan jaminan cukup untuk beban produksi ERP. Ukuran akhir harus ditentukan melalui simulasi data dan beban yang realistis.

## Profil deployment produk akhir

Setiap instalasi memakai image ERP yang sama dan satu konfigurasi backend Supabase per pelanggan. Perbedaan VPS, cloud milik pelanggan, dan on-premise disediakan lewat URL layanan dan rahasia runtime; tidak dibuat fork source code per host.

1. **Supabase terkelola milik pelanggan.** ERP berjalan pada VPS, VM cloud, atau server lokal pelanggan dan terhubung ke project Supabase yang dimiliki serta dibayar pelanggan. Ini dapat menjadi jalur operasi yang lebih ringan, tetapi memerlukan konektivitas internet dan project Supabase pelanggan.
2. **Supabase self-hosted milik pelanggan.** ERP berjalan pada jaringan privat yang sama dengan stack Supabase Docker Compose resmi, di host yang sama atau host terpisah. Profil ini ditujukan untuk pelanggan yang harus menyimpan database dan berkas di infrastruktur sendiri. Installer produksi harus memakai konfigurasi self-hosting resmi; Supabase CLI untuk development lokal bukan pengganti deployment ini.

Pada kedua profil, frontend hanya memakai kredensial publik yang memang dirancang untuk client; secret/service-role key tetap di backend. Domain, SMTP, backup, kunci enkripsi, tenant, dan data dimiliki atau dikendalikan operator instalasi. Project Firebase developer tidak boleh menjadi dependensi produksi.

**Cakupan dukungan rilis pertama:** Linux x86_64 dengan Docker Engine dan Docker Compose. Windows Server dijalankan melalui VM Linux. Kubernetes, Podman, ARM64, dan host tanpa Docker tetap kandidat sampai setiap profil memiliki installer, upgrade, backup/restore, dan bukti simulasi tersendiri. Tidak ada janji dukungan untuk environment yang belum diuji.

## Yang tersedia pada branch ini

- Dockerfile multi-stage dengan dependency terkunci dari bun.lock.
- Compose service untuk menjalankan aplikasi pada host Linux Docker.
- Konfigurasi Firebase web diambil saat runtime, tidak dibangun ke image.
- Endpoint konfigurasi runtime tidak di-cache, endpoint liveness/readiness, serta port dan jumlah trusted proxy yang dapat dikonfigurasi.
- Firebase Admin credential dipasang sebagai file read-only dari host.
- Secret dan file konfigurasi lokal dikecualikan dari image context.
- Service berjalan sebagai user non-root, root filesystem read-only, tanpa Linux capabilities tambahan, dan memiliki healthcheck.

## Batas implementasi saat ini

Runtime pada branch ini masih memakai Firebase Authentication, Firestore, dan Firebase Storage. Compose hanya menjalankan aplikasi; backend dan berkas belum ikut dimiliki oleh instalasi pelanggan. Ini paket container aplikasi tahap transisi saja, bukan instalasi mandiri dan bukan bukti bahwa Firebase sudah dilepas.

Setelah migrasi backend selesai, konfigurasi Firebase dan service-account mount harus dihapus. Runtime final memakai Supabase Auth, PostgreSQL/RLS, dan Storage per instalasi, dengan secret hanya di backend. Jangan menggunakan project Firebase pembuat aplikasi untuk instalasi pelanggan.

## Prinsip packaging dan pemindahan

1. Bangun image sekali dari commit rilis yang sudah ditinjau; beri tag versi dan simpan digest image.
2. Jangan masukkan URL, tenant ID, kunci, data, ataupun credential pelanggan ke build image.
3. Berikan konfigurasi non-secret melalui file environment runtime; simpan secret dan sertifikat di luar repository dengan hak akses terbatas.
4. Terapkan skema database memakai migration SQL yang terversi dan bisa dijalankan pada instalasi kosong.
5. Simpan data PostgreSQL dan objek Storage pada volume persisten atau backend S3-compatible yang dikonfigurasi pelanggan.
6. Pemindahan host menyalin image dengan digest yang sama, konfigurasi yang sudah diganti secret-nya, backup database, berkas Storage, dan kunci enkripsi yang diperlukan. Jangan memindahkan data hanya dengan menyalin container.
7. Sediakan prosedur upgrade dan rollback yang mempertimbangkan kompatibilitas migrasi database dan versi image.
8. Untuk lokasi tanpa registry, ekspor image bertanda versi lalu verifikasi digest setelah impor. Rahasia dikirim terpisah melalui kanal aman.

## Prasyarat operasi tiap instalasi

- Linux x86_64 dengan Docker Engine/Compose untuk target rilis pertama.
- Reverse proxy dan HTTPS untuk akses dari internet; firewall membatasi port dan akses administratif.
- Persistensi disk untuk database dan Storage, kebijakan kapasitas disk, serta retensi backup.
- SMTP pelanggan untuk undangan dan pemulihan akun.
- Kunci enkripsi unik per instalasi, mekanisme rotasi, dan salinan pemulihan yang disimpan aman.
- Pencatatan versi image, migrasi yang sudah diterapkan, konfigurasi non-secret, dan runbook untuk operator.
- Jika jaringan privat/offline digunakan, paket image, prosedur pembaruan offline, dan sumber waktu/DNS lokal harus disiapkan.

## Simulasi wajib sebelum menyatakan environment didukung

Simulasi dilakukan menggunakan data sintetis. Login, akses backend, dan suite akhir tetap menunggu tahap akhir pemrograman sesuai arahan pemilik produk.

- **Instalasi bersih:** buat deployment pada Linux kosong dari image rilis, contoh konfigurasi, serta migration SQL; pastikan Admin awal dibuat lewat alur bootstrap yang aman.
- **VPS:** pasang melalui domain dan HTTPS di belakang reverse proxy, periksa URL runtime, email, health, backup, dan restore.
- **On-premise:** ulangi pada server/VM Linux di jaringan pesantren dengan DNS, SMTP, dan kebijakan firewall yang mewakili kondisi nyata.
- **Offline/terbatas:** impor image berdasarkan digest tanpa akses registry; pastikan aplikasi tetap berjalan dan prosedur pembaruan dapat dilakukan.
- **Perpindahan host:** pindahkan instalasi contoh dari host A ke host B dengan backup database dan Storage, konfigurasi target, serta rotasi secret; cocokkan jumlah data dan relasi setelah pemulihan.
- **Upgrade dan rollback:** uji upgrade image dan migration dari versi sebelumnya; dokumentasikan tindakan bila deployment gagal.
- **Isolasi instalasi:** pastikan setiap instalasi menunjuk hanya ke backend, bucket, dan konfigurasi milik pesantren yang benar.
- **Responsif dan fungsi utama:** jalankan matriks akhir pada browser dan ukuran layar yang disepakati setelah seluruh modul selesai.

Setiap simulasi harus mencatat commit aplikasi, image digest, versi backend, versi migrasi, konfigurasi environment yang telah disensor, hasil, dan kendala. Jangan menandai VPS/on-premise/jenis environment lain sebagai didukung sebelum bukti simulasi untuk target tersebut tersedia.

## Kriteria keluar

Paket deployment dinyatakan siap setelah:

- build image berhasil dari commit yang sama dengan sumber rilis;
- aplikasi, database, Auth, dan Storage berjalan tanpa ketergantungan runtime Firebase;
- satu image digest lulus instalasi bersih dan pemindahan VPS ke on-premise atau sebaliknya;
- migration, bootstrap admin, backup/restore, dan upgrade/rollback terdokumentasi serta terbukti pada data sintetis;
- uji keamanan, matriks role/tenant, pemulihan, dan tampilan akhir lulus;
- paket dan panduan menjelaskan kebutuhan host, proses update, backup, restore, rotasi secret, serta batas dukungan dengan bahasa yang dapat diikuti operator pelanggan.

Pengujian dan simulasi pada daftar ini belum dijalankan. Migrasi produksi maupun pengaktifan akses publik tetap menunggu gerbang akhir tersebut.
