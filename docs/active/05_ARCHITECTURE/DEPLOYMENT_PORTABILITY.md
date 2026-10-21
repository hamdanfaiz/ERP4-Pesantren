# Kontrak Portabilitas Deployment ERP4 Pesantren

**Status:** target produk dan kriteria penerimaan; belum membuktikan instalasi production-ready.  
**Kebijakan produk:** perangkat lunak dipasang dan dimiliki pelanggan, bukan dijual sebagai SaaS bersama vendor.

## Model kepemilikan

Setiap pelanggan mengendalikan aplikasi, database, file, domain, kredensial, backup, dan jadwal upgrade miliknya. Instalasi pelanggan dapat memuat satu pesantren atau beberapa unit/cabang di bawah organisasi pelanggan. Isolasi tenant tetap ditegakkan oleh skema dan RLS; model instalasi terpisah tidak menjadi alasan untuk menghilangkan kontrol tersebut.

Vendor tidak boleh membutuhkan kunci service-role, kredensial SMTP, atau kunci enkripsi pelanggan untuk menjalankan platform vendor bersama. Akses dukungan harus diberikan pelanggan secara terbatas dan dapat dicabut.

## Profil environment

| Profil | Topologi target | Status saat ini |
| --- | --- | --- |
| VPS pelanggan + proyek Supabase milik pelanggan | Aplikasi dijalankan sebagai container di VPS; Auth, Postgres, dan Storage berada pada proyek Supabase yang dimiliki pelanggan. | Target v1; belum dikemas atau disimulasikan |
| VPS pelanggan, seluruh stack mandiri | Aplikasi dan stack Supabase self-hosted dijalankan melalui Docker Compose pada Linux. Reverse proxy pelanggan menangani HTTPS. | Target v1; belum tersedia paket installer/volume/backup yang tervalidasi |
| On-premise Linux | Topologi Compose yang sama pada server fisik atau VM milik pesantren; DNS, TLS, firewall, SMTP, dan backup dikendalikan tim pelanggan. | Target v1; belum disimulasikan di VM on-premise |
| Kubernetes atau platform container pelanggan | Image aplikasi yang sama dengan konfigurasi provider-specific. | Kandidat kompatibilitas berikutnya; belum didukung hingga ada manifest dan acceptance run |
| Windows Server tanpa Linux VM, ARM, atau jaringan tertutup penuh | Membutuhkan host/runtime dan pengujian khusus. | Belum didukung; Windows Server dapat memakai Linux VM setelah profil itu lulus simulasi |

“Didukung” hanya boleh dicantumkan setelah image rilis, migrasi, autentikasi, RLS, Storage, backup/restore, dan upgrade diuji di profil tersebut. Dokumen ini menetapkan tujuan; belum ada environment yang dinyatakan lulus.

## Batas portabilitas

- Aplikasi harus memakai satu image rilis dan satu rangkaian migrasi database pada profil yang didukung. Perbedaan environment disediakan lewat konfigurasi runtime dan secret, bukan perubahan kode.
- Backend target memakai layanan Supabase: PostgreSQL, Supabase Auth, RLS, dan Supabase Storage. Perpindahan antara proyek Supabase pelanggan dan stack Supabase self-hosted adalah sasaran portabilitas.
- Portabilitas ke PostgreSQL generik atau provider Auth/Storage lain bukan klaim v1. Jika target itu diperlukan, lapisan autentikasi, penyimpanan file, dan migrasi khusus provider harus dibuat dan diuji.
- Selama Firebase masih dipakai oleh modul atau proses login, instalasi belum Supabase-only dan perpindahan environment belum dapat disebut selesai.
- Semua data pelanggan, upload, dan konfigurasi harus tetap berada di akun atau infrastruktur pelanggan. Tidak ada dependensi pada tenant database SaaS milik vendor.

## Kontrak konfigurasi dan rahasia

Nama variabel runtime harus didokumentasikan pada template environment dan dibaca secara konsisten oleh frontend/backend. URL Supabase dan anon key hanya digunakan sesuai kebutuhan publik aplikasi; service-role key, database password, SMTP credentials, dan kunci enkripsi hanya boleh berada di server atau secret manager. Rahasia tidak boleh masuk Git, bundle frontend, image, log, maupun artefak backup tanpa enkripsi.

Konfigurasi minimum untuk paket rilis harus mencakup:

- URL aplikasi publik, daftar origin/CORS, dan mode produksi.
- URL Supabase dan public anon key.
- Supabase service-role key untuk proses backend saja.
- URL/credential SMTP agar reset kata sandi, verifikasi email, dan notifikasi dapat berfungsi.
- Kunci enkripsi PII dan fingerprint yang terpisah, dengan prosedur backup dan rotasi.
- Konfigurasi Storage privat, ukuran upload, serta callback/auth URLs.
- Pengaturan proxy/TLS dan health-check.

Nilai sebenarnya disediakan administrator instalasi. File contoh hanya berisi placeholder.

## Paket instalasi yang wajib dibuat

1. Dockerfile multi-stage untuk build dan runtime, dijalankan dengan user non-root dan tanpa rahasia build-time.
2. Docker Compose untuk aplikasi, health checks, restart policy, jaringan internal, dan mount volume yang eksplisit untuk komponen stateful.
3. Profil managed-Supabase dan self-hosted-Supabase yang membedakan konfigurasi tanpa mengubah image aplikasi.
4. Template environment, pemeriksaan konfigurasi yang gagal dengan pesan aman, serta panduan bootstrap Admin pertama.
5. Migrasi SQL berurutan yang dapat diperiksa sebelum diterapkan; tidak melakukan migrasi schema otomatis destruktif saat startup.
6. Reverse proxy/TLS contoh, SMTP setup, firewall/port matrix, batas minimum resource yang terukur, dan prosedur pembaruan.
7. Backup database, Storage, konfigurasi Auth, dan kunci enkripsi; instruksi restore ke host atau provider lain.
8. Health/readiness endpoint yang tidak membocorkan secret atau data santri.

Komponen database, Auth, dan Storage harus mengikuti versi Supabase yang dipatok untuk setiap rilis. Upgrade stack dilakukan melalui prosedur yang dapat direproduksi, bukan mengambil image `latest` secara otomatis.

## Simulasi portabilitas yang menjadi release gate

Setiap kandidat rilis harus melewati latihan berikut menggunakan tag/image yang sama dengan kandidat deploy:

1. Instalasi bersih pada VPS Linux x86_64 dengan data sintetis dan konfigurasi baru.
2. Instalasi kedua pada Linux VM yang mewakili on-premise; validasi domain internal/TLS, SMTP yang dikonfigurasi, akses Storage, serta pembatasan jaringan.
3. Jalankan migrasi schema dari versi sebelumnya dan pastikan proses dapat dilanjutkan atau dipulihkan setelah kegagalan.
4. Buat backup lengkap, pulihkan ke environment kedua yang terisolasi, lalu cocokkan jumlah record per tenant, hubungan santri-wali, transaksi, file, dan kebijakan akses.
5. Uji login dan role/tenant isolation, RLS, upload/download berkas privat, reset password, serta operasi utama tanpa Firebase.
6. Simulasikan kegagalan koneksi SMTP/Storage/database dan pastikan aplikasi menampilkan error yang dapat ditindaklanjuti tanpa merusak transaksi.
7. Buktikan upgrade serta rollback operasional melalui restore backup dan dokumentasikan waktu pemulihan.

Gunakan data sintetis saja. Catat versi image, versi migrasi, konfigurasi non-rahasia, hasil rekonsiliasi, waktu pemulihan, dan masalah yang ditemukan. Jangan menandai profil environment sebagai didukung sebelum hasilnya disetujui.

## Kriteria selesai

- Instalasi baru dapat dilakukan hanya dari release bundle dan panduan operator.
- Backup dapat dipulihkan pada host berbeda tanpa mengubah kode aplikasi.
- Koneksi, domain, SMTP, Storage, dan secret dapat diganti lewat konfigurasi.
- Image dan migrasi yang sama lulus acceptance di setiap profil yang disebut didukung.
- Tidak ada ketergantungan runtime Firebase atau layanan vendor bersama setelah cutover.
- Dokumentasi menyebut dengan jelas profil yang diuji, versi yang diuji, dan batas dukungannya.
