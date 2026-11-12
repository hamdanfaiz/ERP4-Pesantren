# Rancangan CBT untuk Tenant Besar

**Status:** rancangan pekerjaan lanjutan; belum diimplementasikan dan belum membuktikan skala produksi.  
**Dasar:** source PR #96, branch `codex/cbt-tenant-settings-20261112`.

## Kondisi saat ini

Endpoint Admin `GET /api/cbt/admin` membentuk satu snapshot dengan membaca soal, ujian, penugasan, percobaan, santri, dan kelas. Pembacaan memakai batas 2.000 soal, 500 ujian, 5.000 penugasan, 5.000 percobaan, 2.000 santri, dan 500 kelas. Jika satu batas terlampaui, seluruh snapshot ditolak. Penolakan ini mencegah statistik parsial terlihat benar.

PR #96 mengurangi kerja CPU saat menghitung jumlah penugasan dan hasil per ujian dengan indeks satu lintasan. Perubahan itu tidak menghapus batas snapshot. Uji helper 10.000 baris menguji agregasi di memori, bukan query database dan bukan paginasi.

## Target perilaku

Dashboard Admin harus menampilkan agregat tenant yang akurat tanpa memuat seluruh record ke aplikasi. Layar yang menampilkan record memakai halaman kecil dan filter di server. Respons setiap request tetap tenant-scoped dan memuat hanya kolom yang diperlukan.

### Ringkasan server

Sediakan endpoint terautentikasi `GET /api/cbt/admin/summary` yang mengembalikan setidaknya:

- jumlah soal aktif dan total sesi ujian;
- sesi yang berlangsung dan sesi mendatang;
- jumlah penugasan, penugasan selesai, persentase penyelesaian;
- jumlah percobaan bernilai, rata-rata nilai, jumlah keputusan lulus/gagal, dan persentase kelulusan;
- jumlah penugasan per status untuk pemantauan;
- lima jadwal terdekat dan lima hasil terakhir untuk pratinjau.

Agregat dihitung langsung di Postgres dengan kolom yang diperlukan. Waktu yang digunakan mengikuti zona waktu tenant dan batas sesi yang berlaku. Respons memuat waktu pembuatan ringkasan sehingga UI dapat menyebut kapan data diperbarui.

### Daftar berhalaman

Pisahkan daftar soal, sesi ujian, roster santri, pemantauan, dan hasil. Setiap endpoint:

- menggunakan ukuran halaman bawaan 50 dan batas maksimum 100;
- menerima filter yang relevan di server: pencarian, status, mata pelajaran, jenjang, kelas, dan sesi;
- mengembalikan `items`, `hasMore`, dan `nextCursor`; UI menyediakan tombol muat berikutnya dan mempertahankan pilihan yang sudah dibuat;
- memakai keyset pagination dengan urutan deterministik dan kolom pengikat unik;
- menurunkan `tenantId` dari profil actor aktif di server, bukan dari parameter klien;
- mengembalikan error berbahasa Indonesia bila cursor atau filter tidak valid.

Gunakan cursor yang terikat pada jenis daftar, versi urutan, dan filter. Server tetap mengulang pemeriksaan role, permission modul CBT, status profil, dan tenant pada setiap request. Untuk pencarian bebas, batasi panjang teks dan gunakan indeks yang sesuai setelah pola query ditetapkan.

Paket soal dan jumlahnya dihitung sebagai agregat per referensi kategori, bukan dengan mengunduh seluruh bank soal. Hitungan peserta per ujian dihitung secara batch untuk halaman ujian, bukan dengan query N+1.

## Keamanan dan integrasi

- Semua filter dan join mencantumkan `tenant_id`; join antar-record juga memastikan tenant sama.
- Route Admin memanggil pemeriksaan actor/role/permission yang sudah dipakai route CBT.
- Bila RPC Postgres dipilih, gunakan `SECURITY INVOKER`, schema dan `search_path` yang eksplisit, revoke `EXECUTE` dari `PUBLIC`, `anon`, dan `authenticated`, lalu berikan akses hanya ke role backend yang diperlukan.
- Jangan mengembalikan `correct_answer` atau `explanation` pada route peserta. Endpoint Admin boleh memuat kunci hanya untuk pengguna yang lolos pemeriksaan Admin.
- Semua respons memakai `Cache-Control: no-store`; cursor tidak menggantikan autentikasi atau filter tenant.
- Jangan menambah grant akses langsung untuk browser ke tabel CBT.

## Indeks dan query plan

Tinjau query plan pada database uji untuk kombinasi tenant, filter, dan urutan setiap daftar. Migrasi indeks harus mengikuti query nyata. Kandidat yang perlu diperiksa:

- soal berdasarkan `tenant_id`, status, mata pelajaran, jenjang, kategori, dan urutan halaman;
- sesi ujian berdasarkan `tenant_id`, jadwal, status, dan kunci urutan halaman;
- penugasan berdasarkan `tenant_id`, `assigned_at`, ID, status, dan exam;
- percobaan berdasarkan `tenant_id`, waktu pengumpulan, ID, dan assignment.

Periksa indeks komposit yang sudah ada sebelum menambah indeks. Catat ukuran tambahan dan query yang akan memakainya.

## Uji penerimaan

Jalankan di Supabase lokal/CI dengan fixture sintetis. Tidak ada migrasi atau data Production yang boleh disentuh.

1. Buat dataset di atas semua batas snapshot lama: lebih dari 2.000 soal, 500 sesi, 5.000 penugasan dan percobaan, 2.000 santri, serta 500 kelas.
2. Bandingkan setiap agregat dashboard terhadap hasil hitung fixture independen; sertakan nilai kosong, lulus/gagal, status dibatalkan, dan sesi lintas pergantian hari tenant.
3. Telusuri semua halaman sampai habis; pastikan tidak ada ID ganda atau hilang pada dataset tetap, filter pencarian tepat, dan cursor dengan filter berbeda ditolak.
4. Uji penolakan pengguna non-Admin, permission CBT yang dicabut, profil nonaktif, tenant berbeda, dan cursor tidak valid.
5. Pastikan route tidak mengirim seluruh data ke browser; soal per halaman maksimal 100 dan payload ringkasan hanya berisi data pratinjau.
6. Jalankan typecheck, build, API auth/tenant, pgTAP, migration preflight, dan regresi CBT yang sudah ada.
7. Catat waktu/row count query, rencana eksekusi dan pemakaian indeks pada dataset uji. Hasil belum diterima bila query dashboard memuat seluruh riwayat.

## Urutan pengerjaan

1. Tetapkan kontrak response dan urutan/cursor per daftar.
2. Tambah fungsi ringkasan dan endpoint daftar setelah memeriksa skema, route guard, serta indeks.
3. Ubah UI CBT agar dashboard memakai agregat dan tab daftar memuat halaman terpisah.
4. Tambahkan migrasi indeks yang dibutuhkan dan uji row-level tenant/permission.
5. Jalankan suite lokal/CI, lalu ukur query dengan fixture di atas batas lama.
6. Perbarui batas skala pada kesiapan komersial hanya setelah bukti penerimaan tersedia.

Pekerjaan ini melengkapi, bukan menggantikan, UAT browser, rekonsiliasi Production, backup/restore Production, dan simulasi instalasi pelanggan yang ditangani bersama tim backend.
