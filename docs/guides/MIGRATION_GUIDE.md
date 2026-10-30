# Panduan Migrasi Firebase ke Supabase dan Rilis ERP4 Pesantren

## Tujuan dan batas

Panduan ini mengatur perpindahan runtime dan data operasional dari Firebase ke Supabase untuk setiap instalasi ERP4 Pesantren. Instalasi dapat memakai proyek Supabase yang dikelola pelanggan atau stack Supabase mandiri; aplikasi ERP tidak menyediakan operasi SaaS bersama.

Perpindahan runtime dan pemindahan data adalah dua pekerjaan berbeda. Branch cutover mengarahkan runtime aktif ke Supabase, tetapi itu tidak membuktikan data Firebase pelanggan sudah dipindahkan, semua modul sudah lengkap, atau project Supabase live telah cocok dengan migrasi kode. Feature flag Supabase tetap tertutup sampai gate data, schema, identitas, dan keamanan di bawah lulus.

## Sumber kebenaran teknis

- Revisi Git yang ditinjau dan CI-nya lulus adalah sumber kode untuk setiap rilis. Catat commit SHA dan image tag yang sama pada artefak build.
- Berkas supabase/migrations/*.sql adalah urutan perubahan schema yang dapat direproduksi. Jangan mengedit histori yang telah diterapkan; buat migrasi maju.
- Project Supabase tiap pelanggan adalah sumber data runtime untuk tenant tersebut. firebase-blueprint.json dan Firestore lama hanya referensi/materi migrasi, bukan schema runtime.
- Status tiap domain harus dicocokkan dengan docs/active/05_ARCHITECTURE/SUPABASE_RUNTIME_CUTOVER_STATUS.md, migration SQL, API, UI, dan feature flags pada commit yang sedang dirilis. Status dokumentasi tidak menggantikan pemeriksaan runtime.
- Jangan memakai secret key atau password database di browser, variabel VITE_*, source control, issue, atau chat. Publishable key boleh berada di browser; secret key hanya di server/secret manager.

## Arsitektur cutover

Browser menggunakan Supabase Auth dan publishable key, lalu memanggil API aplikasi. API memverifikasi access token, membaca profil aktif dan tenant dari Supabase, dan menggunakan database/storage Supabase dengan hak server. Tenant selalu berasal dari profil tepercaya, bukan parameter tenant yang dikirim browser.

Firebase tidak menjadi fallback runtime. Pada branch remediation, koneksi Firebase Admin dan implementasi importer Firestore di server telah dihapus, sedangkan endpoint lama menjawab HTTP 410. `firebase-admin` tidak lagi menjadi dependency aplikasi. Source layar Firebase lama dan Firebase client dependency pengembangan masih ditinjau terpisah; guard CI memastikan jalur frontend aktif tidak memuat SDK tersebut. Data Firestore pemilik saat ini dinyatakan dummy dan tidak perlu disalin. Untuk pelanggan yang kelak membawa arsip riil, proses ETL harus menjadi alat terpisah yang berizin, terisolasi, dapat diulang dengan aman, serta direkonsiliasi; jalur itu bukan bagian dari runtime ERP.

## Urutan migrasi yang diwajibkan

### 1. Tetapkan sumber Firebase dan ruang lingkup data

1. Pastikan project Firebase yang benar dengan project ID, tenant, environment, pemilik, dan izin baca/export. Jangan menyimpulkan sumber hanya dari nama project.
2. Inventaris Auth, setiap koleksi Firestore, subkoleksi, Storage bucket/object, dan data yang hanya tersimpan di browser. Catat jumlah, rentang tanggal, tenant pemilik, referensi silang, serta kategori data pribadi/keuangan.
3. Bedakan data operasional dari fixture/demo, data duplikat, arsip, dan mock UI. Jangan mengimpor fixture sebagai transaksi nyata.
4. Buat export/backup sumber yang tidak berubah, simpan checksum, waktu, dan identitas pengambilannya. Lindungi backup PII sesuai kebijakan pelanggan.
5. Jika sumber atau akses tidak dapat diverifikasi, hentikan migrasi data dan minta pemilik proyek menyediakan export resmi atau akses baca-saja yang sesuai.

### 2. Siapkan target dan rencana pemulihan

1. Pastikan project/ref Supabase milik pelanggan yang benar, environment non-produksi, region, konfigurasi Auth/redirect, email, domain, bucket, dan pemilik administrasinya.
2. Ambil dan uji backup database serta Storage. Tetapkan RPO/RTO, retensi, enkripsi, akses operator, dan prosedur restore yang benar-benar pernah dijalankan.
3. Simpan versi kode, daftar migration, dan database migration history sebelum perubahan. Bandingkan migration lokal dengan target dan selesaikan perbedaan histori sebelum ada penerapan.
4. Terapkan migrasi lebih dahulu pada stack lokal/preview, lalu environment staging milik pelanggan. Jangan menerapkan schema produksi hanya karena CI hijau.
5. Siapkan rencana rollback: image aplikasi sebelumnya, backup database dan Storage yang tervalidasi, langkah menutup feature flags, serta keputusan bagaimana menangani write baru selama rollback.

### 3. Peta tenant, identitas, dan relasi

1. Petakan setiap tenant lama ke satu UUID tenant Supabase yang disetujui. Simpan tabel pemetaan yang dapat diaudit.
2. Setiap record tenant-scoped harus memiliki tenant yang dapat dibuktikan. Tolak atau karantina record tanpa tenant, tenant ganda, atau pemetaan ambigu; jangan menebak tenant dari nama atau data lain.
3. Cocokkan santri, wali, pegawai, pengajar, kelas, kamar, akun, dan referensi transaksi dengan kunci stabil. NIS dan identitas unik harus diklaim lewat constraint/RPC transaksional, bukan pemeriksaan UI saja.
4. Jangan memindahkan password plaintext atau menganggap Firebase UID otomatis cocok dengan Supabase Auth UID. Petakan identitas secara eksplisit, undang/reset akun melalui Auth, verifikasi alamat email, lalu uji akses setelah pemilik akun menetapkan password.
5. Data pribadi seperti NIK/NISN hanya diproses melalui jalur server yang menggunakan enkripsi/fingerprint yang sesuai. Jangan menaruh PII mentah di log, URL, preview, browser storage, atau audit metadata.

### 4. Preview, rekonsiliasi, lalu apply per domain

Untuk setiap domain, gunakan urutan read-only preview → koreksi peta → persetujuan pemilik data → apply → rekonsiliasi.

Preview wajib menunjukkan jumlah sumber/tujuan, create/skip/conflict/error, referensi konflik yang tidak membocorkan PII, checksum/fingerprint sumber, tenant, dan waktu snapshot. Apply harus menolak bila snapshot berubah, dijalankan ulang secara aman (idempotent), terisolasi tenant, menggunakan transaksi untuk relasi/invariant, tidak menimpa data tujuan tanpa kebijakan eksplisit, serta mencatat pelaksana dan hasil.

Jalankan impor dalam batch terbatas. Setelah tiap batch, cocokkan jumlah, kunci, status, relasi, saldo/ledger, total stok/okupansi, dan file. Simpan record yang tidak dapat dipetakan dalam antrean rekonsiliasi; jangan menghapus sumber atau melewati konflik agar angka terlihat cocok.

Importer aplikasi hanya berlaku untuk domain yang memang memiliki implementasi preview/apply pada revisi rilis tersebut. Catatan cutover membedakan sumber historis dari fixture/in-memory yang tidak persisten. Untuk domain tanpa importer yang diverifikasi, tim backend harus membuat dan menguji proses ETL terpisah sebelum memindahkan data.

### 5. Migrasi file dan akun

- Salin file dari bucket sumber ke bucket Supabase yang sesuai melalui proses server-side. Pertahankan relasi tenant, pemilik, tipe MIME, ukuran, checksum, dan klasifikasi akses. Uji download dengan role yang berhak serta penolakan akses lintas tenant/anon.
- Bukti pembayaran, dokumen PPDB, dan berkas sensitif harus tetap pada bucket privat. Jangan membuat bucket publik untuk mempermudah verifikasi.
- Pindahkan identitas akun melalui undangan/reset password yang aman; jangan ekspor hash/password sebagai mekanisme login lintas-provider.
- Pertahankan referensi ID sumber hanya untuk audit/rekonsiliasi sesuai kebijakan, bukan sebagai otoritas akses runtime.

### 6. Verifikasi sebelum feature flag

Sebelum membuka flag untuk satu domain, buktikan pada environment staging/non-produksi:

- migrasi target sesuai urutan dan RLS aktif pada seluruh tabel tenant-scoped;
- akses role yang diizinkan dan penolakan untuk role lain, akun suspended, tenant lain, sesi invalid, serta parameter tenant palsu;
- alur UI/API baca dan tulis, validasi, idempotensi, transaksi, race condition ID unik, audit, dan error/retry;
- rekonsiliasi data/file terhadap snapshot sumber dan hasil preview yang disetujui;
- backup serta pemulihan database dan Storage pada environment pemulihan;
- halaman login dan alur per role, browser desktop/mobile, navigasi, tabel/form, keadaan kosong/error/loading, serta aksesibilitas inti;
- observabilitas, alert, retensi log tanpa PII berlebih, konfigurasi SMTP/redirect, batas upload, rate limit, dan kapasitas.

Tes lokal sintetis dan CI memberi bukti untuk skenario yang tercakup pada commit tersebut. Tes itu bukan bukti login atau data pelanggan live, bukan bukti seluruh modul berjalan, dan bukan pengganti uji restore pelanggan.

### 7. Cutover produksi per domain

1. Jadwalkan window cutover dan komunikasikan penghentian/perubahan write pada sistem lama.
2. Ambil backup final dan snapshot/checksum sumber. Jalankan preview final dan dapatkan persetujuan pemilik data.
3. Apply hanya importer/migrasi yang telah ditinjau; catat SHA kode, migration history, hasil batch, serta rekonsiliasi.
4. Aktifkan flag backend dan frontend untuk satu domain hanya setelah API/schema/tenant/role tersedia; verifikasi health dan transaksi dengan akun berizin.
5. Pantau error, audit, antrean konflik, volume, Storage, dan hasil rekonsiliasi. Jika gate gagal, tutup flag dan ikuti rollback yang sudah diuji.
6. Lanjutkan domain berikutnya setelah domain sebelumnya stabil. Jangan membuka semua flag sekaligus.

Setelah pemilik sistem menyetujui periode retensi dan arsip tervalidasi, batasi Firebase ke akses arsip/migrasi yang diperlukan. Hapus adapter/dependensi legacy hanya setelah tidak ada tugas rekonsiliasi yang bergantung padanya dan bukti retensi/export telah disimpan.

## Pengujian kode pada checkout

Ikuti versi Bun dan perintah pada workflow commit yang sedang ditinjau. Workflow CI saat ini memeriksa typecheck/build, dependency Firebase production, gate Firebase Admin, migration/pgTAP pada Supabase lokal, race NIS, API auth/tenant, Finance Storage HTTP, backup/restore sintetis, serta image/Compose Docker. Jalankan di environment sintetis; jangan masukkan kredensial project pelanggan ke CI.

    bun install --frozen-lockfile
    bun run lint
    bun run build
    supabase start
    npm run test:db
    npm run test:db:nis-race
    npm run test:api:auth-tenant
    npm run test:api:finance-storage
    npm run test:db:backup-restore
    supabase stop --no-backup

Jika salah satu langkah gagal, jangan gunakan continue-on-error untuk menutupi kegagalan. Simpan log yang sudah disanitasi, perbaiki, dan ulangi pada commit yang sama sebelum review lanjut.

## Deployment mandiri (VPS/on-premise)

Container aplikasi ERP membutuhkan Docker Compose, TLS reverse proxy, backup/monitoring, dan endpoint Supabase yang dapat dijangkau browser serta container. docker-compose.yml menjalankan aplikasi web/API; itu tidak otomatis menyediakan atau mengoperasikan PostgreSQL, Supabase Auth, Storage, SMTP, backup Supabase, TLS, atau operasi pemulihan. Pelanggan yang memilih on-premise harus menyediakan dan mengoperasikan stack Supabase yang didukung secara terpisah, lalu menguji upgrade/restore pada environment mereka.

Ikuti docs/guides/CUSTOMER_MANAGED_DEPLOYMENT.md untuk parameter container dan hardening. Rilis harus menunjuk commit SHA, image digest, migration set, dan konfigurasi customer yang sama. Simpan image sebelumnya untuk rollback. Jangan menyimpan secret/database password di image atau repo.

## Kriteria go-live

Go-live baru dapat disetujui bila sumber Firebase dan data yang akan dipindahkan sudah direkonsiliasi; migration history target cocok; migrasi/import tervalidasi dan dapat dipulihkan; login, matriks role/tenant, modul dan file lulus di environment target; secret telah dirotasi; serta backup, operasi dan deployment mandiri sudah diuji oleh pemilik environment. Jika satu bukti belum tersedia, tandai gate tersebut terbuka—jangan menyatakan sistem siap produksi berdasarkan kelulusan build saja.
