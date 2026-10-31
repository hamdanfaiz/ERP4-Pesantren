# Visibilitas Menu dan Kesiapan Modul

Panduan ini membedakan tiga hal yang sering terlihat sama di aplikasi: menu yang tersedia untuk role, halaman yang sudah memiliki jalur Supabase, dan API modul yang diaktifkan operator. Inventaris AI Studio memiliki 26 modul utama; rilis awal menampilkan 25 karena PPOB sengaja dikeluarkan dari rilis.

## Cara membaca menu

Sidebar memuat modul rilis awal yang diizinkan bagi role tersebut. Pengujian `test:supabase-runtime-no-firebase` mencocokkan 26 rute Supabase; PPOB dan modul ekosistem di luar rilis awal dikecualikan dari menu operasional.

| Role | Cakupan menu dasar |
| --- | --- |
| Superadmin | Semua modul, termasuk Pengaturan platform. |
| Admin Pesantren | Semua modul tenant, kecuali Pengaturan platform. Izin modul eksplisit `false` pada profil dapat membatasi menu tertentu. |
| Ustadz, Santri, Wali Santri | Hanya modul yang ditetapkan bagi role masing-masing. |

Jika role Admin tidak melihat menu tenant yang diharapkan, sidebar menampilkan daftar **modul dibatasi oleh izin akun** bila profil pengguna secara eksplisit menolak modul itu. Minta Superadmin memeriksa Manajemen Pengguna dan izin modul profil. Jangan mengubah role menjadi Superadmin untuk mengatasi izin tenant; Pengaturan adalah wewenang lintas-tenant.

Menu yang terlihat berarti role boleh membuka modul menurut RBAC. Itu tidak membuktikan seluruh transaksi, migrasi data lama, upload, atau integrasi modul telah siap. Pada Data Induk, kategori yang sekarang memiliki sumber di modul lain ditampilkan sebagai pengarah. Kategori Jejak Audit tetap diberi keterangan belum tersedia sampai API audit tenant Supabase disediakan; data contoh atau log lokal tidak ditampilkan sebagai audit operasional.

### Status submenu agar tidak tampak hilang

- Lima bagian Asrama—Perizinan, Kedisiplinan, Kehadiran, Penugasan, dan Fasilitas—tetap ditampilkan. Jika gerbang servernya masih tertutup, bagian itu menampilkan status belum aktif dan nama gerbang yang harus disiapkan; layar tidak lagi kosong.
- Akademik kini menampilkan E-Rapor dan Konflik Jadwal sebagai status belum tersedia, tanpa membuka formulir Penilaian pada tab yang belum punya API.
- CBT menampilkan semua area referensi; Dashboard, Kalender, Paket, Pemantauan Langsung, dan Pengaturan menjelaskan bagian backend yang belum ada. Bank Soal, Sesi Ujian, dan Hasil tetap menggunakan fungsi Supabase yang tersedia.
- LMS menampilkan Dashboard, Kursus, Kategori, Pustaka Video, Tugas/Penilaian, Pengumpulan, Ulasan Sebaya, dan Pengajar. Tab yang dikelola lewat Kursus mengarahkan ke halaman tersebut; yang belum tersedia menampilkan status, tanpa data contoh.
- HCM menampilkan seluruh sembilan area referensi; payroll, pelacakan, shift, kinerja, rekrutmen, dan analitik memberi keterangan bahwa API belum tersedia.
- Perpustakaan Digital tetap terlihat saat Storage ditutup dan menampilkan status kesiapan tanpa daftar/unggah palsu.
- Bagian Sarana & Prasarana juga mempertahankan semua tab. Saat ini hanya Aset & Inventaris yang memiliki alur Supabase; tab lain menampilkan status API yang belum tersedia.
- Tombol Data Induk yang dikelola modul lain mengarahkan pengguna ke sumbernya. Jejak Audit tetap menunjukkan batasan API audit.
- Jika menu utama hilang bagi Admin, periksa izin `modulePermissions` akun terlebih dahulu. Jika submenu hilang atau layarnya kosong, periksa status runtime pada modul itu. Jangan menaikkan role atau membuka gerbang server hanya untuk membuat menu tampak.

Audit pembanding lengkap menu AI Studio dan runtime Supabase dicatat di [Audit Kesesuaian Menu dan Fitur](AI_STUDIO_REFERENCE_PARITY_AUDIT_2026-10-31.md). Temuan UI yang diperbaiki pada PR #39: modul Asrama sebelumnya mengembalikan layar kosong ketika seluruh gerbang submodul `false`, sehingga fitur tampak hilang. Asrama dan submenu yang diperbaiki memakai komponen tab bersama. Status ini menjaga visibilitas tanpa mengaktifkan API atau menganggap fitur sudah lolos UAT.

## Menu dan API punya sakelar berbeda

- `SUPABASE_*_RUNTIME_ENABLED` adalah sakelar server. Semua default di Compose dan `.env.example` tetap `false`; API menolak operasi bila gerbang belum dibuka.
- Hanya nama `VITE_SUPABASE_*` yang tercantum di [`src/publicRuntimeConfigKeys.ts`](../../../src/publicRuntimeConfigKeys.ts) boleh dikirim melalui `/runtime-config.json` ke browser. Daftar tersebut tidak boleh memuat secret, service-role key, password, atau kunci PII.
- Flag impor arsip juga tetap mati. Pengaktifan modul operasional tidak berarti impor Firestore boleh dilakukan.
- Beberapa flag `VITE_SUPABASE_*_RUNTIME_ENABLED` lama di `.env.example` tidak pernah masuk daftar publik maupun dibaca aplikasi. Flag inert tersebut telah dihapus supaya operator tidak mengira pengaturan itu dapat mengaktifkan halaman.
- Guard `test:customer-deployment-flags` sekarang memastikan daftar flag frontend di Compose dan `.env.example` sama persis dengan allowlist browser.

> Jangan mengaktifkan semua flag sekaligus. Untuk setiap modul, ikuti status dan prasyarat pada [status cutover runtime Supabase](../05_ARCHITECTURE/SUPABASE_RUNTIME_CUTOVER_STATUS.md), tinjau migrasi, tenant dan profil, RLS/Storage, lalu uji alur modul pada staging. Menu yang muncul tidak boleh dianggap bukti UAT atau bukti kelayakan produksi.

## Checkpoint implementasi

Perbaikan visibilitas Data Induk dan disclosure izin Admin dikirim pada PR [#39](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/39), yang masih Draft/Open dan bertumpu pada PR #38. Production PTSAS tidak disentuh. Audit halaman yang memerlukan Auth, API staging, hak role, serta data sintetis masih harus diselesaikan sebelum perubahan dinyatakan siap digabung.
