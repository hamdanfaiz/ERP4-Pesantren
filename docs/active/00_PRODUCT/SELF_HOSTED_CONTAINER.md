# Paket Container Self-Hosted — Tahap Runtime Aplikasi

Status: implementasi pertama untuk memindahkan image aplikasi antar-host. Ini belum merupakan rilis self-hosted penuh atau bukti siap produksi.

## Yang tersedia pada branch ini

- Dockerfile multi-stage dengan dependency terkunci dari \`bun.lock\`.
- Compose service untuk menjalankan aplikasi pada host Linux Docker.
- Image tidak membawa konfigurasi Firebase web milik developer; konfigurasi diambil saat runtime dari environment.
- Endpoint konfigurasi runtime tidak di-cache, endpoint liveness/readiness, port dan jumlah trusted proxy yang dapat dikonfigurasi.
- Firebase Admin credential dipasang sebagai file read-only dari host, tidak disalin ke image.
- Secret, file kredensial, file environment lokal, dan konfigurasi Firebase AI Studio dikecualikan dari image context.
- Service berjalan sebagai user non-root, read-only root filesystem, tanpa Linux capabilities tambahan, dan memiliki healthcheck.

## Batas saat ini

Runtime masih memakai Firebase Authentication, Firestore, dan Firebase Storage. Compose hanya menjalankan aplikasi; database dan file pelanggan belum dipindahkan ke backend yang ikut dimiliki pesantren. Karena itu, paket ini membantu memindahkan aplikasi server, tetapi belum memenuhi tujuan on-premise penuh atau independensi dari Firebase.

Migrasi ke Supabase belum masuk runtime utama. Saat migrasi itu selesai, konfigurasi Firebase dan service-account mount akan diganti dengan URL/key Supabase per instalasi, backend/storage pelanggan, serta prosedur migrasi/restore. Jangan menggunakan project Firebase pembuat aplikasi untuk instalasi pelanggan.

## Build dan pemindahan image

Build image sekali dengan versi rilis yang jelas. Untuk host lain, kirim image yang sama melalui registry pelanggan atau arsip image; jangan membangun ulang dari source berbeda pada setiap environment.

\`\`\`sh
docker build --pull --tag erp4-pesantren:1.0.0 .
\`\`\`

Simpan digest image yang diuji bersama metadata rilis. Untuk lingkungan tanpa koneksi registry, ekspor/impor image memakai \`docker save\` dan \`docker load\`.

## Setup instalasi

1. Salin \`deploy/self-hosted.env.example\` menjadi \`.env\`; isi nilai Firebase milik pelanggan dan tag image yang akan dijalankan.
2. Buat service-account Firebase Admin khusus instalasi dengan hak minimum yang dibutuhkan backend. Letakkan file kredensial di luar repository, misalnya \`secrets/firebase-admin.json\`, lalu pastikan pengguna Docker pada host dapat membacanya.
3. Pastikan \`FIREBASE_ADMIN_CREDENTIALS_FILE\` pada \`.env\` menunjuk ke file tersebut. File dipasang read-only di container.
4. Bangun image dengan tag yang sama seperti \`ERP_IMAGE\` di \`.env\`.
5. Jalankan \`docker compose up -d\`, lalu periksa \`docker compose ps\` dan \`docker compose logs erp\`.
6. Publikasikan hanya melalui reverse proxy/TLS pelanggan atau jaringan privat. Set \`TRUST_PROXY_HOPS\` sesuai jumlah proxy yang benar-benar dipercaya; jangan mengekspos container secara langsung ke internet tanpa TLS dan firewall.
7. Verifikasi \`/health/live\` dan \`/health/ready\`. Readiness memeriksa kelengkapan konfigurasi runtime dan format berkas Admin yang dipasang; ia tidak membuktikan koneksi atau izin Firebase berhasil.

## Simulasi yang harus dilakukan sebelum menyatakan portable

- **Clean install:** host Linux bersih, data sintetis, file credential terpisah, tidak ada file AI Studio di image.
- **Konfigurasi lintas instalasi:** gunakan image digest yang sama dengan project Firebase sandbox kedua; pastikan aplikasi tidak menghubungi project developer.
- **Restart dan upgrade:** restart container, jalankan versi baru dengan prosedur rollback/forward-fix yang terdokumentasi.
- **VPS dan on-premise:** ulangi di dua host Linux dengan konfigurasi domain/proxy masing-masing.
- **Pemindahan host:** kirim image dan konfigurasi baru, lalu verifikasi login dan modul utama.
- **Pemulihan data:** belum dapat diuji sebagai instalasi mandiri karena Firestore dan Storage masih berada di Firebase. Selesaikan setelah backend pelanggan ikut dipaketkan/migrasikan.
- **Windows:** target deployment rilis awal adalah Docker Linux. Windows Server hanya melalui VM Linux setelah uji terpisah; belum didukung langsung.

Pengujian dan simulasi di atas belum dijalankan pada branch ini. Jangan menandai environment sebagai didukung sebelum setiap langkah yang relevan berhasil dicatat.

## Kriteria keluar dari tahap ini

Tahap runtime aplikasi selesai setelah build di CI berhasil dari source commit yang sama, image berjalan pada dua host Linux bersih, konfigurasi pelanggan terbukti terisolasi dari image, dan upgrade/restart dapat diulang.

Produk belum siap dijual sebagai paket on-premise penuh sampai Firebase selesai dipindahkan dari runtime, data dan Storage ikut dimiliki pelanggan, migrasi serta restore berhasil, dan matriks keamanan/fungsi akhir lulus.
