# Pendaftaran Mandiri Portal Wali

## Perilaku

- Calon wali mengisi email yang dapat diakses pada formulir PPDB. Server menormalisasi email dan menyimpannya bersama data kandidat.
- Saat akun diterima dan proses onboarding membuat data Wali, migrasi menyalin email kontak kandidat ke catatan Wali. Migrasi juga mengisi email pada catatan lama yang masih kosong jika email PPDB tersedia.
- Wali memilih **Daftar akun sendiri** pada halaman masuk, lalu membuat kata sandinya di Supabase Auth. ERP tidak menerima atau menyimpan kata sandi tersebut.
- Supabase mengirim tautan konfirmasi email. Setelah tautan dibuka, server memeriksa sesi Auth, status konfirmasi email, tenant aktif yang ditetapkan oleh konfigurasi server, dan catatan Wali yang cocok.
- Penautan berlangsung di dalam satu fungsi database. Fungsi tidak menerima NIS, ID santri, tenant, atau peran dari browser. Hanya catatan Wali aktif dalam tenant yang memiliki email terverifikasi sama yang dapat ditautkan.
- Satu alamat email keluarga dapat menghubungkan beberapa catatan Wali pada santri bersaudara dalam tenant yang sama. Akun kedua tidak dapat mengambil relasi yang telah terhubung ke akun lain.
- Jika data cocok tidak ditemukan, akun tetap tidak memiliki profil ERP dan tidak memperoleh akses ke modul. Sekretariat harus memperbaiki data kontak PPDB; sistem tidak menampilkan nama atau data anak kepada pendaftar.
- Undangan Admin yang sudah ada tetap tersedia untuk kasus transisi atau pemulihan terkontrol.

## Konfigurasi untuk environment pelanggan

Atur di server/secret manager, bukan di variabel klien:

- `SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED=true` untuk membuka endpoint konfigurasi portal wali.
- `PUBLIC_PPDB_TENANT_ID` menunjuk tenant Supabase yang dipakai oleh instalasi tersebut.
- `PUBLIC_APP_URL` menunjuk URL HTTPS aplikasi. URL balik email yang dikirim adalah URL ini dengan `guardianRegistration=1`.
- `SUPABASE_URL` dan `SUPABASE_SECRET_KEY` hanya tersedia pada server.
- `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` boleh tersedia pada aplikasi klien.

Pada Supabase Auth, aktifkan provider Email, wajibkan konfirmasi email, konfigurasikan SMTP untuk environment pelanggan, dan masukkan URL balik aplikasi persis seperti yang ditampilkan pada `PUBLIC_APP_URL` ke daftar URL redirect yang diizinkan. Uji tautan konfirmasi pada domain deployment sebelum membuka pendaftaran.

`PUBLIC_PPDB_ENABLED=true` hanya diperlukan bila pesantren juga membuka penerimaan calon santri. Portal pendaftaran Wali dapat tetap tersedia secara terpisah.

## Migrasi dan bukti uji

Migrasi `20270205000000_guardian_self_registration.sql` membuat fungsi tautan berhak akses `service_role` saja, mengisi kontak wali dari data PPDB, dan mengizinkan satu akun Wali tertaut ke beberapa catatan Wali dalam tenant yang sama. Browser tidak mendapat hak baca ke tabel penautan.

`supabase/tests/guardian_self_registration.test.sql` memeriksa konfirmasi email, peran Wali saja, penautan saudara, penolakan untuk email yang tidak cocok, penolakan konflik akun, dan pembatasan izin RPC.

Migrasi ini belum diterapkan ke Supabase pelanggan. Sebelum dibuka, tim deployment harus menerapkan migrasi melalui prosedur staging/produksi yang telah direkonsiliasi, mengonfigurasi Auth/SMTP/redirect, menguji skenario pendaftaran memakai data sintetis, dan memastikan proses pemulihan akun lewat tautan reset Supabase.
