# Visibilitas Menu dan Kesiapan Modul

> **Status saat ini (9 November 2026):** PR #38, PR #39, dan PR konsolidasi #40 telah ditutup setelah merge ke `main`. PR #40 mengonsolidasikan perubahan runtime Supabase, relasi tenant, menu, Naming Series, impor-ekspor, dan modul terkait. Merge ini tidak berarti UAT hosting, rekonsiliasi DDL Production, backup/restore Production, atau cutover sudah selesai. PR #91 tetap Draft/Open untuk perapihan pesan dan UI; lihat [checkpoint terbaru](CHECKPOINT_2026-11-08_CI_AND_STAGING.md).

Panduan ini membedakan tiga hal yang sering terlihat sama di aplikasi: menu yang tersedia untuk role, halaman yang sudah memiliki jalur Supabase, dan API modul yang diaktifkan operator. Inventaris AI Studio memiliki 26 modul utama; rilis awal menampilkan 25 karena PPOB sengaja dikeluarkan dari rilis.

## Cara membaca menu

Sidebar memuat modul rilis awal yang diizinkan bagi role tersebut. Pengujian `test:supabase-runtime-no-firebase` mencocokkan 26 rute Supabase; PPOB dan modul ekosistem di luar rilis awal dikecualikan dari menu operasional.

| Role | Cakupan menu dasar |
| --- | --- |
| Superadmin | Semua modul, termasuk Pengaturan platform. |
| Admin Pesantren | Semua modul tenant, kecuali Pengaturan platform. Izin modul eksplisit `false` pada profil dapat membatasi menu tertentu. |
| Ustadz, Santri, Wali Santri | Hanya modul yang ditetapkan bagi role masing-masing. |

Jika role Admin tidak melihat menu tenant yang diharapkan, sidebar menampilkan daftar **modul dibatasi oleh izin akun** bila profil pengguna secara eksplisit menolak modul itu. Minta Superadmin memeriksa Manajemen Pengguna dan izin modul profil. Jangan mengubah role menjadi Superadmin untuk mengatasi izin tenant; Pengaturan adalah wewenang lintas-tenant.

Menu yang terlihat berarti role boleh membuka modul menurut RBAC. Itu tidak membuktikan seluruh transaksi, migrasi data lama, upload, atau integrasi modul telah siap. Data Induk hanya memuat Santri, Struktur (Gedung/Kamar/Kelas/Peta Struktur), Aturan Penomoran, dan Jejak Audit. Data lain dimiliki langsung oleh modul terkait, tanpa kartu atau tombol pengalihan di Data Induk:

| Data | Modul pemilik |
| --- | --- |
| Wali Santri dan Donatur | Relasi Wali & Donatur |
| Guru/Asatidz, Mata Pelajaran, dan Kurikulum | Akademik Formal |
| Pegawai | Sumber Daya Manusia |
| Alumni | Data Alumni |
| Yayasan dan unit pesantren/sekolah | Manajemen Multi-Unit |
| Halaqah | Tahfidz |
| Pemesanan fasilitas | Sarana & Prasarana |

### Status submenu agar tidak tampak hilang

- Lima bagian Asrama—Perizinan, Kedisiplinan, Kehadiran, Penugasan, dan Fasilitas—tetap ditampilkan. Bagian yang belum tersedia menampilkan status dan keterangan singkat untuk pengguna tanpa menyebut nama flag, server, atau langkah operator; layar tidak lagi kosong.
- Akademik menampilkan E-Rapor sebagai belum tersedia. Konflik Jadwal memiliki pemeriksaan dan penyuntingan jadwal; hasil pemindaian dibatasi pada data yang berhasil diperiksa dan pengaturan ulang jadwal tetap menjadi keputusan operator.
- CBT menampilkan semua area referensi; Dasbor, Kalender Ujian, Paket Ujian, Pemantauan Langsung, dan Pengaturan menjelaskan bagian yang belum memiliki alur tersimpan. Bank Soal, Sesi Ujian, dan Hasil memakai fungsi Supabase yang tersedia.
- LMS menampilkan Dashboard, Kursus, Kategori, Pustaka Video, Tugas/Penilaian, Pengumpulan, Ulasan Sebaya, dan Pengajar. Tab yang dikelola lewat Kursus mengarahkan ke halaman tersebut; yang belum tersedia menampilkan status, tanpa data contoh.
- HCM menampilkan seluruh sembilan area referensi; payroll, pelacakan, shift, kinerja, rekrutmen, dan analitik memberi keterangan bahwa API belum tersedia.
- Perpustakaan Digital tetap terlihat saat Storage ditutup dan menampilkan status kesiapan tanpa daftar/unggah palsu.
- Bagian Sarana & Prasarana mempertahankan semua tab. Aset & Inventaris dan Pemesanan Fasilitas memiliki alur Supabase; Pemeliharaan, Pengadaan, Kendaraan & Logistik, Kebersihan, serta Dapur & Katering masih menampilkan status belum tersedia.
- Jejak Audit Data Induk memakai API tenant untuk perubahan Santri dan Struktur. API memeriksa profil aktif, tenant, role Admin, dan izin Data Induk; halaman ini bukan audit global semua modul. Log berisi metadata perubahan, bukan nilai identitas atau isi record.
- Jika menu utama hilang bagi Admin, periksa izin `modulePermissions` akun terlebih dahulu. Jika submenu hilang atau layarnya kosong, periksa ketersediaan modul. Petunjuk konfigurasi backend disimpan pada handoff teknis; jangan menaikkan role atau membuka konfigurasi server hanya untuk membuat menu tampak.

Audit pembanding lengkap menu AI Studio dan runtime Supabase dicatat di [Audit Kesesuaian Menu dan Fitur](AI_STUDIO_REFERENCE_PARITY_AUDIT_2026-10-31.md). Temuan UI yang diperbaiki pada PR #39: modul Asrama sebelumnya mengembalikan layar kosong ketika seluruh gerbang submodul `false`, sehingga fitur tampak hilang. Asrama dan submenu yang diperbaiki memakai komponen tab bersama. Status ini menjaga visibilitas tanpa mengaktifkan API atau menganggap fitur sudah lolos UAT.

## Menu dan API punya sakelar berbeda

- `SUPABASE_*_RUNTIME_ENABLED` adalah sakelar server yang menegakkan ketersediaan API. Default di Compose dan `.env.example` tetap `false`; API menolak operasi bila sakelar belum dibuka.
- `VITE_SUPABASE_*_RUNTIME_ENABLED` hanya mengendalikan tampilan sebagian fitur dan tidak memberi hak akses atau mengaktifkan API. Komponen yang memakai `supabaseRuntimeEnabled` selalu memilih jalur Supabase karena `SUPABASE_ONLY_RUNTIME=true`; beberapa halaman, seperti PPDB, tetap memakai nilai VITE untuk menampilkan alur tertentu. Selaraskan tampilan dengan sakelar server saat mengonfigurasi environment.
- Hanya nama `VITE_SUPABASE_*` yang tercantum di [`src/publicRuntimeConfigKeys.ts`](../../../src/publicRuntimeConfigKeys.ts) boleh dikirim melalui `/runtime-config.json` ke browser. Daftar tersebut tidak boleh memuat secret, service-role key, password, atau kunci PII.
- Flag impor arsip juga tetap mati. Pengaktifan modul operasional tidak berarti impor Firestore boleh dilakukan.
- Guard `test:customer-deployment-flags` sekarang memastikan daftar flag frontend di Compose dan `.env.example` sama persis dengan allowlist browser.

> Jangan mengaktifkan semua flag sekaligus. Untuk setiap modul, ikuti status dan prasyarat pada [status cutover runtime Supabase](../05_ARCHITECTURE/SUPABASE_RUNTIME_CUTOVER_STATUS.md), tinjau migrasi, tenant dan profil, RLS/Storage, lalu uji alur modul pada staging. Menu yang muncul tidak boleh dianggap bukti UAT atau bukti kelayakan produksi.

## Checkpoint implementasi

Perbaikan visibilitas Data Induk dan disclosure izin Admin dikirim pada PR [#39](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/39), lalu masuk ke `main` melalui PR konsolidasi [#40](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/40). Perubahan Production PTSAS tidak termasuk merge tersebut. UAT hosting, pemeriksaan hak role/tenant, dan pembuktian persistence tetap harus diselesaikan sebelum sistem dinyatakan siap rilis.
