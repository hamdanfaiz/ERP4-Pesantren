# Visibilitas Menu dan Kesiapan Modul

Panduan ini membedakan tiga hal yang sering terlihat sama di aplikasi: menu yang tersedia untuk role, halaman yang sudah memiliki jalur Supabase, dan API modul yang diaktifkan operator.

## Cara membaca menu

Sidebar memuat 26 tujuan modul yang terdaftar pada aplikasi. Pengujian `test:supabase-runtime-no-firebase` mencocokkan setiap tujuan dengan rute Supabase dan menu; PPOB dan modul ekosistem di luar rilis awal dikecualikan.

| Role | Cakupan menu dasar |
| --- | --- |
| Superadmin | Semua modul, termasuk Pengaturan platform. |
| Admin Pesantren | Semua modul tenant, kecuali Pengaturan platform. Izin modul eksplisit `false` pada profil dapat membatasi menu tertentu. |
| Ustadz, Santri, Wali Santri | Hanya modul yang ditetapkan bagi role masing-masing. |

Jika role Admin tidak melihat menu tenant yang diharapkan, sidebar menampilkan daftar **modul dibatasi oleh izin akun** bila profil pengguna secara eksplisit menolak modul itu. Minta Superadmin memeriksa Manajemen Pengguna dan izin modul profil. Jangan mengubah role menjadi Superadmin untuk mengatasi izin tenant; Pengaturan adalah wewenang lintas-tenant.

Menu yang terlihat berarti role boleh membuka modul menurut RBAC. Itu tidak membuktikan seluruh transaksi, migrasi data lama, upload, atau integrasi modul telah siap. Pada Data Induk, kategori yang sekarang memiliki sumber di modul lain ditampilkan sebagai pengarah. Kategori Jejak Audit tetap diberi keterangan belum tersedia sampai API audit tenant Supabase disediakan; data contoh atau log lokal tidak ditampilkan sebagai audit operasional.

## Menu dan API punya sakelar berbeda

- `SUPABASE_*_RUNTIME_ENABLED` adalah sakelar server. Semua default di Compose dan `.env.example` tetap `false`; API menolak operasi bila gerbang belum dibuka.
- Hanya nama `VITE_SUPABASE_*` yang tercantum di [`src/publicRuntimeConfigKeys.ts`](../../../src/publicRuntimeConfigKeys.ts) boleh dikirim melalui `/runtime-config.json` ke browser. Daftar tersebut tidak boleh memuat secret, service-role key, password, atau kunci PII.
- Flag impor arsip juga tetap mati. Pengaktifan modul operasional tidak berarti impor Firestore boleh dilakukan.
- Beberapa flag `VITE_SUPABASE_*_RUNTIME_ENABLED` lama di `.env.example` tidak pernah masuk daftar publik maupun dibaca aplikasi. Flag inert tersebut telah dihapus supaya operator tidak mengira pengaturan itu dapat mengaktifkan halaman.
- Guard `test:customer-deployment-flags` sekarang memastikan daftar flag frontend di Compose dan `.env.example` sama persis dengan allowlist browser.

> Jangan mengaktifkan semua flag sekaligus. Untuk setiap modul, ikuti status dan prasyarat pada [status cutover runtime Supabase](../05_ARCHITECTURE/SUPABASE_RUNTIME_CUTOVER_STATUS.md), tinjau migrasi, tenant dan profil, RLS/Storage, lalu uji alur modul pada staging. Menu yang muncul tidak boleh dianggap bukti UAT atau bukti kelayakan produksi.

## Checkpoint implementasi

Perbaikan visibilitas Data Induk dan disclosure izin Admin dikirim pada PR [#39](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/39), yang masih Draft/Open dan bertumpu pada PR #38. Production PTSAS tidak disentuh. Audit halaman yang memerlukan Auth, API staging, hak role, serta data sintetis masih harus diselesaikan sebelum perubahan dinyatakan siap digabung.
