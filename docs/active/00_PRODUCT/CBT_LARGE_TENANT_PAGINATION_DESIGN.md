# Rancangan CBT untuk Tenant Besar

**Status:** stack CBT PR #97–#98 memisahkan agregat, ringkasan paket, dan bank soal. Branch lanjutan `codex/cbt-student-roster-pages-20261113` menambahkan roster santri berhalaman dan menghilangkan batas pemuatan 2.000 santri dari snapshot. CI pada kode implementasi commit 7e9c1310 lulus; migrasi belum diterapkan ke staging atau Production.  
**Dasar:** stack CBT PR #95–#98 dan branch lanjutan roster santri.

## Kondisi saat ini

Snapshot sebelum PR #97 membatasi soal 2.000, ujian 500, penugasan 5.000, percobaan 5.000, santri 2.000, dan kelas 500. Stack CBT menghapus pemuatan seluruh bank soal dari snapshot, kemudian branch roster ini menghapus pemuatan seluruh daftar santri. Batas snapshot ujian 500, penugasan 5.000, percobaan 5.000, dan batas 500 peserta per sesi masih berlaku.

Endpoint Admin `GET /api/cbt/admin` membentuk snapshot ujian, penugasan, dan percobaan dengan batas masing-masing 500, 5.000, dan 5.000. Label santri pada hasil diambil hanya untuk ID peserta yang memang ada di penugasan; seluruh roster tidak lagi dibaca bersama snapshot. Bank soal dan roster dipindahkan ke endpoint terpisah yang berhalaman. Snapshot masih dapat gagal bila batas ujian, penugasan, atau percobaan terlampaui.

PR #96 mengurangi kerja CPU saat menghitung jumlah penugasan dan hasil per ujian dengan indeks satu lintasan. Perubahan itu tidak menghapus batas snapshot. Uji helper 10.000 baris menguji agregasi di memori, bukan query database dan bukan paginasi.

## Bagian yang sudah dibuat pada branch

- `GET /api/cbt/admin/summary` memeriksa autentikasi, profil Admin/permission melalui guard CBT yang ada, dan mengambil tenant dari profil server.
- Fungsi Postgres `get_cbt_admin_dashboard_summary(uuid)` menghitung jumlah dan rasio secara tenant-scoped serta membatasi pratinjau menjadi lima jadwal dan lima hasil. Fungsi memakai `SECURITY INVOKER`; `EXECUTE` dicabut dari `PUBLIC`, `anon`, dan `authenticated`, lalu diberikan hanya kepada `service_role`.
- Indeks ringkasan mendukung pengelompokan penugasan per ujian dan pratinjau percobaan terakhir. Tes pgTAP meliputi angka, tenant lain, tenant tidak valid, hak eksekusi fungsi, dan indeks.
- UI meminta snapshot detail dan ringkasan secara terpisah. Jika snapshot detail gagal tetapi fungsi ringkasan tersedia, angka dasbor tetap dapat ditampilkan; layar daftar tetap memberi tahu bahwa data detail belum berhasil dimuat.
- Branch bertingkat setelah PR #97 menambahkan `GET /api/cbt/admin/questions` dengan ukuran halaman bawaan 50 dan maksimum 100, pencarian literal, filter status dan referensi tenant, serta keyset `created_at DESC, id ASC`. Cursor mengikat tenant, ukuran halaman, dan filter aktif. Bank soal tidak lagi seluruhnya diunduh bersama snapshot.
- Branch roster CBT menambahkan `POST /api/cbt/admin/students/page` dengan halaman bawaan 50 dan maksimum 100, pencarian tenant-scoped atas nama atau NIS, urutan keyset stabil nama/ID, dan respons label minimum tanpa NIS. Token keyset dienkripsi serta diautentikasi menggunakan AES-256-GCM dengan kunci server; token terikat tenant dan filter sehingga nama tidak terlihat pada token. Pencarian dikirim dalam body POST agar NIS tidak muncul pada URL/log.
- Tab Bank Soal memakai pencarian/filter server-side dan tombol muat berikutnya. Builder ujian memuat soal aktif per mata pelajaran dan jenjang secara berhalaman serta menjaga pilihan saat halaman berikutnya dimuat. Perubahan filter tenant atau mata pelajaran membatalkan permintaan lama.
- Ringkasan paket diperoleh dari fungsi Postgres agregat berdasarkan template referensi tenant, termasuk jumlah aktif/arsip, mata pelajaran, dan jenjang. Katalog paket kosong tetap disediakan oleh UI melalui referensi aktif.
- Fungsi halaman dan agregat memakai `SECURITY INVOKER`, `search_path` eksplisit, tenant aktif, dan hak eksekusi hanya untuk `service_role`; route Admin tetap memeriksa autentikasi/role/permission. Search trigram dan indeks keyset mendukung query utama.
- Tes pgTAP menelusuri lebih dari 2.000 record sintetis per halaman dan memeriksa urutan timestamp yang sama, pencarian, filter referensi tenant, agregat paket, dan privilege. Workflow GitHub Actions pada commit 7e9c1310 lulus, termasuk lint, build, test API/tenant, migration preflight, dan pgTAP.
- Migrasi roster lulus pada database Supabase lokal/CI, tetapi belum diterapkan ke staging atau Production dan belum dibandingkan dengan DDL Production aktual. Batas peserta 500 per sesi adalah kendala kapasitas yang masih harus ditangani terpisah.

## Target perilaku

Dashboard Admin harus menampilkan agregat tenant yang akurat tanpa memuat seluruh record ke aplikasi. Layar yang menampilkan record memakai halaman kecil dan filter di server. Respons setiap request tetap tenant-scoped dan memuat hanya kolom yang diperlukan.

### Ringkasan server

Endpoint `GET /api/cbt/admin/summary` di branch mengembalikan agregat server berikut:

- jumlah soal aktif dan total sesi ujian;
- sesi yang berlangsung dan sesi mendatang;
- jumlah penugasan, penugasan selesai, persentase penyelesaian;
- jumlah percobaan bernilai, rata-rata nilai, jumlah keputusan lulus/gagal, dan persentase kelulusan;
- jumlah penugasan per status untuk pemantauan;
- lima jadwal terdekat dan lima hasil terakhir untuk pratinjau.

Agregat dihitung langsung di Postgres dengan kolom yang diperlukan. Waktu sesi dibandingkan sebagai timestamp absolut; UI tetap menampilkan jadwal dalam zona waktu tenant. Respons memuat waktu pembuatan ringkasan.

### Daftar berhalaman

Pisahkan daftar soal, sesi ujian, roster santri, pemantauan, dan hasil. Setiap endpoint:

- menggunakan ukuran halaman bawaan 50 dan batas maksimum 100;
- menerima filter yang relevan di server: pencarian, status, mata pelajaran, jenjang, kelas, dan sesi;
- mengembalikan `items`, `hasMore`, dan `nextCursor`; UI menyediakan tombol muat berikutnya dan mempertahankan pilihan yang sudah dibuat;
- memakai keyset pagination dengan urutan deterministik dan kolom pengikat unik;
- menurunkan `tenantId` dari profil actor aktif di server, bukan dari parameter klien;
- mengembalikan error berbahasa Indonesia bila cursor atau filter tidak valid.

Gunakan cursor terenkripsi dan terikat pada jenis daftar, versi urutan, tenant, dan filter. Server tetap mengulang pemeriksaan role, permission modul CBT, status profil, dan tenant pada setiap request. Jangan menaruh nama atau NIS plaintext di cursor yang masuk ke URL/log. Untuk pencarian bebas, batasi panjang teks dan gunakan indeks yang sesuai setelah pola query ditetapkan.

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
4. Telusuri lebih dari 2.000 santri melewati halaman; uji pencarian nama/NIS, pencarian literal atas `%`/`_`, nama ganda, status arsip, batas ukuran, cursor yang diubah, filter berbeda, serta tenant berbeda. Respons tidak memuat NIS.
5. Uji penolakan pengguna non-Admin, permission CBT yang dicabut, profil nonaktif, dan tenant berbeda.
6. Pastikan route tidak mengirim seluruh data ke browser; soal/santri per halaman maksimal 100 dan payload ringkasan hanya berisi data pratinjau.
7. Jalankan typecheck, build, API auth/tenant, pgTAP, migration preflight, dan regresi CBT yang sudah ada.
8. Catat waktu/row count query, rencana eksekusi dan pemakaian indeks pada dataset uji. Hasil belum diterima bila query dashboard memuat seluruh riwayat.

## Urutan pengerjaan

1. Tetapkan kontrak response dan urutan/cursor per daftar.
2. Tambah fungsi ringkasan dan endpoint daftar setelah memeriksa skema, route guard, serta indeks.
3. Ubah UI CBT agar dashboard memakai agregat dan tab daftar memuat halaman terpisah.
4. Tambahkan migrasi indeks yang dibutuhkan dan uji row-level tenant/permission.
5. Jalankan suite lokal/CI, lalu ukur query dengan fixture di atas batas lama.
6. Perbarui batas skala pada kesiapan komersial hanya setelah bukti penerimaan tersedia.

Pekerjaan ini melengkapi, bukan menggantikan, UAT browser, rekonsiliasi Production, backup/restore Production, dan simulasi instalasi pelanggan yang ditangani bersama tim backend.
