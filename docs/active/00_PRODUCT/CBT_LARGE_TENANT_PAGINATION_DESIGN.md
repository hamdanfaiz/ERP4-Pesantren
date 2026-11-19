# Rancangan CBT untuk Tenant Besar

**Status (13 November 2026):** branch `codex/cbt-scale-main-20261113` berbasis `main` pada `ae9633e` menyatukan paginasi soal, roster, penugasan, sesi ujian/kalender, ringkasan server, dan penyimpanan pengaturan tenant. Enam RPC/migrasi bernomor `20270321000000`–`20270326000000` melengkapi API tersebut. Lint, build, uji unit CBT, uji pemetaan pesan, preflight sumber migrasi, cakupan CI, dan pemeriksaan autentikasi route lulus lokal. pgTAP dan API round-trip belum dijalankan lokal karena Docker tidak tersedia; harus lulus di CI sebelum rehearsal staging. Belum ada perubahan database VQE atau PTSAS.
**Dasar:** implementasi lama pada PR #95–#102 ditinjau ulang dan dipindahkan ke urutan migrasi `main` setelah versi `20270320000000`; PR lama tetap bukan basis yang aman untuk digabung langsung.

## Kondisi saat ini

Snapshot awal membatasi soal 2.000, ujian 500, penugasan 5.000, percobaan 5.000, santri 2.000, dan kelas 500. Snapshot CBT saat ini sengaja hanya berisi pengaturan, referensi, dan agregat paket; daftar operasional dimuat server-side per halaman. Soal, roster, penugasan/hasil, sesi ujian, dan kalender memakai keyset tenant-scoped. Batas 500 peserta dan 500 soal per sesi masih berlaku dan perlu dipantau sebagai batas produk.

Endpoint Admin `GET /api/cbt/admin` tidak memuat daftar sesi. `GET /api/cbt/admin/exams` mengembalikan halaman maksimal 100 sesi dengan urutan stabil `starts_at DESC, id ASC`; cursor AES-GCM terikat tenant, ukuran halaman, dan rentang kalender. Rentang kalender dibatasi maksimal 33 hari dan dihitung pada zona waktu tenant sebelum dikirim ke API. `POST /api/cbt/admin/assignments/page` memberi halaman hasil/pemantauan maksimal 100 item, tenant-scoped dan dicari di server.

Agregat dashboard dan ringkasan paket dihitung PostgreSQL, bukan dari sampel di browser. Uji helper 10.000 baris hanya mengukur algoritme agregasi lokal; bukti skala database harus berasal dari fixture pgTAP/CI dan pengukuran staging.

## Bagian yang sudah dibuat pada branch

- `GET /api/cbt/admin/summary` memeriksa autentikasi, profil Admin/permission melalui guard CBT yang ada, dan mengambil tenant dari profil server.
- Fungsi Postgres `get_cbt_admin_dashboard_summary(uuid)` menghitung jumlah dan rasio secara tenant-scoped serta membatasi pratinjau menjadi lima jadwal dan lima hasil. Fungsi memakai `SECURITY INVOKER`; `EXECUTE` dicabut dari `PUBLIC`, `anon`, dan `authenticated`, lalu diberikan hanya kepada `service_role`.
- Indeks ringkasan mendukung pengelompokan penugasan per ujian dan pratinjau percobaan terakhir. Tes pgTAP meliputi angka, tenant lain, tenant tidak valid, hak eksekusi fungsi, dan indeks.
- UI meminta snapshot detail dan ringkasan secara terpisah. Jika snapshot detail gagal tetapi fungsi ringkasan tersedia, angka dasbor tetap dapat ditampilkan; layar daftar tetap memberi tahu bahwa data detail belum berhasil dimuat.
- Route `GET /api/cbt/admin/questions`, `/exams`, `/summary`, `POST /students/page`, `/assignments/page`, dan `PUT /settings` telah ditambahkan/dirapikan di Express. Setiap route mewajibkan Auth, profil aktif, role Admin/SuperAdmin, izin CBT, dan tenant dari profil server; semua respons memakai `Cache-Control: no-store`.
- Halaman soal dan ujian dibatasi 50 item (maksimum API 100); roster, aktivitas, kalender, dan builder juga memuat halaman server. Cursor diikat pada tenant, filter/mode, urutan, dan batas tanggal. Token roster, aktivitas, dan sesi memakai AES-GCM dengan kunci server. Respons roster/aktivitas meminimalkan PII.
- Dashboard dan ringkasan paket memakai RPC agregat; snapshot kompatibilitas tidak lagi mengunduh daftar soal, santri, sesi, atau hasil. UI tidak lagi menampilkan instruksi perpindahan/development kepada pengguna akhir.
- Enam pgTAP baru memeriksa batas halaman, pencarian/filter, isolasi tenant, privilege fungsi, traversal dataset sintetis besar, agregat, dan pengaturan dengan validasi/concurrency. Uji SQL/API ini menunggu CI; mesin lokal tidak memiliki Docker.
- `npm run test:trusted-proxy-hops` belum memberi hasil lokal karena sandbox menolak koneksi socket `127.0.0.1` (`EACCES`); pemeriksaan yang sama tetap ada di workflow CI dan harus lulus di sana.
- Enam migrasi dibuat dengan Supabase CLI `2.122.0` lalu diberi versi berurutan setelah `20270320000000`. Perubahan hanya file source. Status VQE/Production belum diperiksa atau diubah.
- Build lulus dengan peringatan chunk PDF yang sudah ada (sekitar 1,46 MB). Peringatan itu tidak menggagalkan build.

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
- penugasan berdasarkan `tenant_id`, `assigned_at`, ID, serta trigram untuk pencarian nama ujian/kelas;
- percobaan berdasarkan `tenant_id`, waktu pengumpulan, ID, dan assignment.

Periksa indeks komposit yang sudah ada sebelum menambah indeks. Catat ukuran tambahan dan query yang akan memakainya.

## Uji penerimaan

Jalankan di Supabase lokal/CI dengan fixture sintetis. Rehearsal staging hanya setelah CI lolos. Tidak ada migrasi/data Production tanpa preflight, urutan dependensi, dan bukti pemulihan yang ditinjau tim backend.

1. Buat dataset di atas semua batas snapshot lama: lebih dari 2.000 soal, 500 sesi, 5.000 penugasan dan percobaan, 2.000 santri, serta 500 kelas.
2. Bandingkan setiap agregat dashboard terhadap hasil hitung fixture independen; sertakan nilai kosong, lulus/gagal, status dibatalkan, dan sesi lintas pergantian hari tenant.
3. Telusuri semua halaman sampai habis; pastikan tidak ada ID ganda atau hilang pada dataset tetap, filter pencarian tepat, dan cursor dengan filter berbeda ditolak.
4. Telusuri lebih dari 2.000 santri melewati halaman; uji pencarian nama/NIS, pencarian literal atas `%`/`_`, nama ganda, status arsip, batas ukuran, cursor yang diubah, filter berbeda, serta tenant berbeda. Respons tidak memuat NIS.
5. Telusuri lebih dari 5.000 assignment melewati halaman hasil; pastikan tidak ada ID ganda/hilang, cursor stabil pada timestamp sama, pencarian literal nama/kelas/ujian, mode monitor hanya mengembalikan status aktif, serta halaman terikat tenant/filter. Verifikasi agregat per ujian terhadap fixture.
6. Uji penolakan pengguna non-Admin, permission CBT yang dicabut, profil nonaktif, dan tenant berbeda.
7. Pastikan route tidak mengirim seluruh data ke browser; soal/santri/aktivitas per halaman maksimal 100 dan payload ringkasan hanya berisi data pratinjau.
8. Jalankan typecheck, build, API auth/tenant, pgTAP, migration preflight, dan regresi CBT yang sudah ada; semua required GitHub checks harus hijau pada commit yang sama.
9. Catat waktu/row count query, rencana eksekusi dan pemakaian indeks pada dataset uji. Hasil belum diterima bila dashboard atau daftar operasi memuat seluruh riwayat.

## Urutan pengerjaan

1. Tetapkan kontrak response dan urutan/cursor per daftar.
2. Tambah fungsi ringkasan dan endpoint daftar setelah memeriksa skema, route guard, serta indeks.
3. Ubah UI CBT agar dashboard memakai agregat dan tab daftar memuat halaman terpisah.
4. Tambahkan migrasi indeks yang dibutuhkan dan uji row-level tenant/permission.
5. Jalankan suite lokal/CI, lalu ukur query dengan fixture di atas batas lama.
6. Perbarui batas skala pada kesiapan komersial hanya setelah bukti penerimaan tersedia.

Urutan rilis yang diutamakan adalah source/build lokal → CI → staging VQE → Production PTSAS. Pemilik juga mengizinkan rilis langsung ke Production bila sama-sama terbukti aman; ini tetap mensyaratkan set migrasi yang persis, rekonsiliasi dependensi/drift, seluruh required CI, pemeriksaan keamanan, dan bukti backup/restore yang dapat dipulihkan. Perubahan ini belum memenuhi gerbang rilis dan belum diterapkan ke database mana pun.
