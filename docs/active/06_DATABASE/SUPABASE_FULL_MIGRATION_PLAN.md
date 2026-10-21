# Rencana Migrasi Penuh ERP4 Pesantren dari Firebase ke Supabase

## Tujuan akhir

Runtime produk menggunakan Supabase Auth, PostgreSQL, Row Level Security (RLS), dan Supabase Storage. Tidak ada ketergantungan runtime pada Firebase Auth, Firestore, Firebase Storage, Firebase Admin SDK, konfigurasi applet Firebase, atau Firestore Rules.

Aplikasi yang sama dapat dipasang dengan Supabase terkelola maupun Supabase self-hosted. Perbedaan environment hanya melalui konfigurasi runtime dan prosedur operasi, bukan fork kode aplikasi.

## Status berdasarkan branch yang ditinjau

- Branch `main` masih memakai Firebase pada login/profil, server API, serta banyak halaman dan service operasional.
- [PR #1](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/1) menambahkan fondasi tenant, profil, kandidat PPDB, checklist dokumen, RLS, dan counter transaksi. Migrasinya belum diterapkan ke database.
- [PR #3](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/3) menambahkan provisioning user melalui Supabase Auth, tetapi belum dihubungkan ke UI dan alur autentikasi aplikasi.
- [PR #5](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/5) memindahkan pendaftaran publik PPDB ke Supabase; panel admin dan modul lain masih bergantung pada Firebase.
- [PR #4](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/4) menyediakan container aplikasi, tetapi runtime database dan autentikasinya masih Firebase.

Tidak ada bukti bahwa migrasi tersebut telah diterapkan ke project Supabase produksi. PR di atas masih perlu review dan penggabungan terencana.

## Keputusan arsitektur

- **Identitas:** Supabase Auth; profil aplikasi berada di `public.profiles` dan terikat ke `auth.users`.
- **Otorisasi:** role, tenant, status akun, dan izin modul divalidasi di server serta RLS. Tenant tidak boleh dipercaya dari input client.
- **Data:** tabel PostgreSQL per domain dengan `tenant_id`, constraint, transaksi, indeks, serta migration SQL yang dapat diulang pada environment baru.
- **Operasi istimewa:** backend Node aplikasi menggunakan secret Supabase hanya di server. Secret/service-role key tidak pernah masuk bundle frontend.
- **Berkas:** bucket private, path berawalan tenant dan entitas, kebijakan Storage RLS, serta prosedur pemindahan dan backup berkas.
- **Distribusi:** satu image aplikasi dan migration set yang sama; URL Supabase, publishable key, secret backend, email, domain, dan konfigurasi Storage berasal dari environment runtime.

## Urutan migrasi

### 1. Bekukan baseline dan inventaris dependensi

- Pertahankan `main` sebagai baseline yang dapat dipulihkan.
- Inventaris setiap pemakaian Firebase pada autentikasi, API, halaman, service, upload, notifikasi, konfigurasi, rules, dan alur background.
- Petakan koleksi Firestore, bentuk record, relasi, tenant, transaksi, serta berkas ke tabel dan bucket Supabase.
- Identifikasi setiap alur baca/tulis per modul sebelum memindahkan implementasi.

### 2. Siapkan identitas dan profil Supabase

- Review tabel `tenants` dan `profiles`, aturan role, permission, status, relasi wali-santri, serta provisioning.
- Tentukan pencocokan identitas lama secara eksplisit. Jangan menyatukan akun hanya karena alamat email sama; gunakan pemetaan UID yang tervalidasi.
- Selama modul lama masih berjalan, simpan relasi UID Firebase lama ke profil Supabase agar backend dapat mengotorisasi operasi migrasi dengan tenant dari profil.
- Rencanakan aktivasi akun Supabase melalui undangan atau reset kata sandi bila kredensial lama tidak dapat dipindahkan dengan aman.
- Jangan mengaktifkan login Supabase sebagai satu-satunya jalur sebelum modul yang tersisa tidak lagi mensyaratkan sesi Firebase.

### 3. Pindahkan data dan layanan per modul

Urutan awal yang disarankan:

1. Master Data dan struktur pesantren sebagai sumber relasi utama.
2. PPDB: kandidat, dokumen, seleksi, penerimaan, dan onboarding.
3. Akademik, Tahfidz, asrama, dan komunikasi.
4. Keuangan, transaksi, bukti pembayaran, laporan, dan rekonsiliasi.
5. User management serta modul lain yang masih memakai Firestore atau Firebase Storage.

Untuk tiap modul, sediakan schema migration, API/repository Supabase, validasi tenant, permission, constraint transaksi, strategi impor, serta mekanisme rekonsiliasi. Alihkan modul hanya setelah seluruh operasinya mempunyai sumber backend Supabase.

### 4. Cutover autentikasi

- Pindahkan login, pemulihan kata sandi, perubahan kata sandi, refresh sesi, endpoint server, dan UI manajemen pengguna ke Supabase Auth.
- Validasi profil aktif, tenant aktif, role, dan permission dari sumber Supabase.
- Jalankan cutover tenant bertahap dengan prosedur rollback dan rekonsiliasi data yang terdokumentasi.
- Pastikan semua alur aplikasi dan API menerima token Supabase dan tidak memerlukan Firebase ID token.

### 5. Hapus Firebase dan tutup migrasi

Hapus SDK, Firebase Admin, variabel dan file konfigurasi Firebase, Firestore Rules/indexes, kredensial server, serta jalur kompatibilitas setelah pemeriksaan repository menunjukkan nol pemakaian runtime.

Simpan ekspor arsip Firebase hanya sesuai kebijakan retensi dan prosedur akses arsip; arsip tidak boleh menjadi fallback runtime tersembunyi.

## Persyaratan environment dan komersialisasi

- Contoh konfigurasi disediakan untuk Supabase Cloud dan self-hosted, tanpa menyimpan credential nyata.
- `SUPABASE_URL` dan publishable/anon key boleh dipakai oleh frontend; secret/service-role hanya pada backend.
- Build image tidak mengandung URL atau secret khusus pelanggan. Konfigurasi tenant/pelanggan diberikan saat runtime.
- Dokumentasikan versi PostgreSQL/Supabase yang didukung, kebutuhan host, HTTPS/reverse proxy, SMTP, object storage, backup database dan berkas, restore, upgrade/rollback, rotasi secret, serta monitoring.
- Deployment self-hosted memerlukan proses operasi pelanggan untuk patch keamanan, backup, pemulihan, dan pemantauan.

## Gerbang sebelum produksi

1. Semua migrasi dapat diterapkan pada database kosong dan diperiksa tanpa mengubah database produksi.
2. Setiap tabel tenant-scoped memakai `tenant_id`; kebijakan RLS diuji lintas tenant dan lintas role.
3. Impor Firebase bersifat idempotent, menghasilkan laporan konflik, dan mencocokkan jumlah serta relasi record dan berkas.
4. Login Supabase, undangan/reset, hak akses, PPDB, NIS unik bersamaan, transaksi keuangan, Storage, backup/restore, serta tampilan responsif lulus pengujian.
5. Instalasi bersih, upgrade, pemindahan antar host, dan restore diuji dengan data sintetis.
6. Pencarian akhir membuktikan tidak ada referensi Firebase runtime dan build yang diuji berasal dari commit yang akan dirilis.

Sesuai arahan pemilik produk, pengujian akhir yang memerlukan login dan akses Firebase/Supabase dijalankan setelah implementasi selesai. Migrasi produksi dan aktivasi layanan publik tetap menunggu gerbang tersebut.
