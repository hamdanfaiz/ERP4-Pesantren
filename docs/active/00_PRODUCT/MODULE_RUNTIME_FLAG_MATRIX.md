# Matriks Runtime Modul dan Visibilitas — 22 November 2026

## Tujuan

Dokumen ini menjelaskan mengapa modul atau sebagian alurnya dapat terlihat belum tersedia pada sebuah deployment ERP4 Pesantren, serta flag mana yang mengendalikan API server dan bagian antarmuka. Sumber pemeriksaan adalah `.env.example`, `server.ts`, `src/publicRuntimeConfigKeys.ts`, dan penggunaan konfigurasi runtime oleh halaman klien pada branch integrasi.

Pada source yang diperiksa, terdapat **38 gerbang runtime sisi server**. Nilai contoh semuanya `false` agar fitur gagal secara aman sebelum database, tenant, autentikasi, izin, Storage, dan alur terkait siap. Nilai contoh ini bukan bukti bahwa semua modul gagal di semua environment; nilai environment staging dan produksi dapat berbeda.

## Cara kerja gerbang

- `SUPABASE_*_RUNTIME_ENABLED` dan flag server serupa mengizinkan atau menolak operasi API. Flag ini hanya disetel pada environment server.
- `VITE_*` yang tercantum pada `src/publicRuntimeConfigKeys.ts` dapat dikirim ke browser melalui `/runtime-config.json`. Flag tersebut hanya mengendalikan bagian UI tertentu; flag browser **tidak** memberi izin, membuka API, atau menggantikan pemeriksaan role/tenant.
- Nilai `SUPABASE_SECRET_KEY`, kunci enkripsi PII, password database, dan credential server lain tidak boleh berawalan `VITE_`, masuk ke browser, atau di-commit.
- Sidebar dapat tetap menampilkan menu sementara API ditutup. Status menu yang terlihat bukan bukti bahwa alur baca/tulis sudah berfungsi.

## Impor data arsip

Impor arsip Firestore bukan alur provisioning yang didukung. Deklarasi sakelar arsip yang tidak dipakai telah dihapus dari `.env.example`, Docker Compose, dan allowlist konfigurasi browser agar operator tidak mengira mengaktifkannya akan menyalin data. Route arsip yang dipertahankan untuk kompatibilitas di `server.ts` mengembalikan HTTP 410 dengan kode `LEGACY_ARCHIVE_IMPORT_REMOVED`; kontrol impor lama di antarmuka tetap ditutup oleh `legacyArchiveImportEnabled = false`.


Impor CSV manual Data Induk adalah alur berbeda dan tetap didukung: Admin memakai template CSV melalui layar transfer data dan API tenant Supabase. Buat record awal melalui formulir ERP atau gunakan impor CSV tersebut. Jangan menyalakan atau menggunakan impor arsip Firestore untuk mengisi tenant baru.
## Matriks gerbang server

Semua flag di kolom **API/server** ditetapkan pada environment server. Pada `.env.example` nilainya `false`.

| Modul/alur | API/server | Flag UI yang terkait | Ketergantungan dan batas yang tercatat di source |
| --- | --- | --- | --- |
| Dasbor | `SUPABASE_DASHBOARD_RUNTIME_ENABLED` | — | Membaca ringkasan tenant dari backend. |
| Akademik Formal | `SUPABASE_ACADEMIC_RUNTIME_ENABLED` | — | Impor arsip lama tidak tersedia; data operasional dibuat langsung di tenant. |
| Data Induk | `SUPABASE_MASTER_DATA_RUNTIME_ENABLED` | `VITE_SUPABASE_MASTER_DATA_RUNTIME_ENABLED` | Perlu migrasi prasyarat, profil tenant, kunci identitas terenkripsi, dan tinjauan Auth/RLS. Data awal dapat dibuat lewat formulir. |
| Struktur/Asrama | `SUPABASE_BOARDING_RUNTIME_ENABLED` | `VITE_SUPABASE_BOARDING_RUNTIME_ENABLED` | Tenant dan profil harus tersedia sebelum alur dipakai. |
| Asrama — Perizinan | `SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED` | `VITE_SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED` | Perlu migrasi, relasi profil, tenant, serta pemeriksaan role/tenant. |
| Asrama — Kedisiplinan | `SUPABASE_BOARDING_DISCIPLINE_RUNTIME_ENABLED` | `VITE_SUPABASE_BOARDING_DISCIPLINE_RUNTIME_ENABLED` | Perlu migrasi, profil/izin yang berkaitan, dan uji pencatatan insiden. |
| Asrama — Kehadiran | `SUPABASE_BOARDING_ATTENDANCE_RUNTIME_ENABLED` | `VITE_SUPABASE_BOARDING_ATTENDANCE_RUNTIME_ENABLED` | Sesi bertanggal serta perubahan status tenant-scoped dan tercatat. |
| Asrama — Penugasan | `SUPABASE_BOARDING_ASSIGNMENTS_RUNTIME_ENABLED` | `VITE_SUPABASE_BOARDING_ASSIGNMENTS_RUNTIME_ENABLED` | Data snapshot historis harus memiliki tanggal representasi yang ditetapkan Admin. |
| Asrama — Operasional Fasilitas | `SUPABASE_BOARDING_FACILITY_OPS_RUNTIME_ENABLED` | `VITE_SUPABASE_BOARDING_FACILITY_OPS_RUNTIME_ENABLED` | Perlu migrasi dan uji alur audit fasilitas/tiket tenant-scoped. |
| PPDB — pendaftaran publik | `SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED` bersama `PUBLIC_PPDB_ENABLED` dan `PUBLIC_PPDB_TENANT_ID` | — | Flag server mengizinkan endpoint; dua nilai `PUBLIC_PPDB_*` menentukan apakah penerimaan dibuka dan tenant tujuan. Pendaftaran akun Wali tidak otomatis berarti penerimaan calon santri dibuka. |
| PPDB — administrasi | `SUPABASE_PPDB_RUNTIME_ENABLED` | `VITE_SUPABASE_PPDB_RUNTIME_ENABLED` | Perlu migrasi PPDB, profil tenant, serta alur Storage privat diuji. |
| PPDB — dokumen | `SUPABASE_PPDB_DOCUMENTS_RUNTIME_ENABLED` | `VITE_SUPABASE_PPDB_DOCUMENTS_RUNTIME_ENABLED` | Alur dokumen bergantung pada PPDB; perlu migrasi, policy/Storage privat, dan uji staging. |
| PPDB — onboarding santri diterima | `SUPABASE_PPDB_ONBOARDING_RUNTIME_ENABLED` | `VITE_SUPABASE_PPDB_ONBOARDING_RUNTIME_ENABLED` | Perlu gerbang PPDB, Data Induk, dan Asrama aktif bersamaan beserta kontrak migrasinya. |
| PPDB — tagihan kandidat | `SUPABASE_PPDB_FINANCE_BILLS_ENABLED` | `VITE_SUPABASE_PPDB_FINANCE_BILLS_ENABLED` | Perlu migrasi `20270110000000`, runtime Keuangan dan PPDB, serta rehearsal terisolasi. |
| Komunikasi — pengumuman | `SUPABASE_COMMUNICATION_RUNTIME_ENABLED` | `VITE_SUPABASE_COMMUNICATION_ANNOUNCEMENTS` | Layar runtime hanya menyediakan pengumuman tenant; helpdesk, permintaan izin, dan template belum termasuk alur ini. Perlu migrasi, tenant/profil, serta API tersedia. |
| Pengaturan Pesantren | `SUPABASE_SYSTEM_SETTINGS_RUNTIME_ENABLED` | `VITE_SUPABASE_SYSTEM_SETTINGS` | Perlu migrasi pengaturan dan akun SuperAdmin yang sesuai. Konfigurasi awal dimasukkan di aplikasi. |
| Penilaian pencarian | `SUPABASE_SEARCH_FEEDBACK_RUNTIME_ENABLED` | — | Hanya menyimpan metadata tenant/pengguna/rating; teks pencarian mentah tidak disimpan. |
| CBT | `SUPABASE_CBT_RUNTIME_ENABLED` | — | Mencakup bank soal, ujian, percobaan, dan penilaian sisi server sesuai alur yang sudah tersedia. |
| LMS | `SUPABASE_LMS_RUNTIME_ENABLED` | — | Mencakup katalog, pendaftaran kursus, tugas, pengumpulan, dan kemajuan sesuai alur yang tersedia. |
| Kesehatan/UKS | `SUPABASE_HEALTHCARE_RUNTIME_ENABLED` | — | Akses data medis dan stok dibatasi; wajib meninjau role/RLS sebelum dibuka. |
| Keuangan | `SUPABASE_FINANCE_RUNTIME_ENABLED` | — | Uji transaksi dan ledger tenant diperlukan sebelum aktivasi. |
| Keuangan — anggaran | `SUPABASE_FINANCE_BUDGET_RUNTIME_ENABLED` | — | Gerbang tambahan di atas modul Keuangan; tinjau akses dan alur anggaran. |
| Keuangan — bukti pembayaran | `SUPABASE_FINANCE_PROOF_STORAGE_RUNTIME_ENABLED` bersama runtime Keuangan | — | Perlu bucket privat, policy Storage, dan uji unggah/akses tenant. |
| Manajemen Multi-Unit | `SUPABASE_ENTERPRISE_UNITS_RUNTIME_ENABLED` | — | Mengaktifkan operasi yang mendukung unit/organisasi pada jalur terkait; validasi skema dan izin unit. |
| Tahfidz | `SUPABASE_TAHFIDZ_RUNTIME_ENABLED` | `VITE_SUPABASE_TAHFIDZ_RUNTIME_ENABLED` | Perlu migrasi Tahfidz, tenant/Admin dan profil Auth, serta uji role dan alur setoran. Impor lama tidak dibutuhkan untuk tenant baru. |
| Tahfidz — target massal | `SUPABASE_TAHFIDZ_RUNTIME_ENABLED` dan `SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED` | `VITE_SUPABASE_TAHFIDZ_RUNTIME_ENABLED` dan `VITE_SUPABASE_TAHFIDZ_BULK_TARGETS_ENABLED` | Gerbang massal berdiri terpisah dari layar Tahfidz umum. Aktifkan hanya setelah migrasi `20270328000000_tahfidz_bulk_daily_target_write_api` dan `20270402000000_tahfidz_bulk_target_precision_guard` diverifikasi di staging; uji transaksi serentak all-or-nothing, role, tenant, keanggotaan halaqah, serta idempotensi. |
| Data Alumni | `SUPABASE_ALUMNI_RUNTIME_ENABLED` | — | Perlu migrasi dan uji alur kelulusan pada tenant. |
| Perpustakaan | `SUPABASE_LIBRARY_RUNTIME_ENABLED` | — | Perlu uji katalog, sirkulasi, stok, dan relasi santri dengan record tenant baru. |
| Perpustakaan — aset digital | `SUPABASE_LIBRARY_DIGITAL_ASSETS_ENABLED` | — | Gerbang tambahan untuk aset digital; validasi Storage dan policy secara khusus. |
| Sumber Daya Manusia | `SUPABASE_HRIS_RUNTIME_ENABLED` | — | Source mencakup direktori pegawai, kehadiran manual, dan pengajuan/ulasan cuti oleh Admin. Payroll, biometrik, rekrutmen, dan beberapa kemampuan lain belum termasuk. |
| Sarana & Prasarana — pemesanan | `SUPABASE_FACILITY_BOOKINGS_RUNTIME_ENABLED` | — | Pemeriksaan bentrok bersifat tenant-scoped; uji transaksi pemesanan diperlukan. |
| Inventaris GA | `SUPABASE_GA_ASSETS_RUNTIME_ENABLED` | — | RPC tenant-scoped dan ledger append-only; uji izin serta transaksi stok diperlukan. |
| Marketplace | `SUPABASE_MARKETPLACE_RUNTIME_ENABLED` | — | Katalog dan reservasi stok memakai RPC transaksional tenant-scoped. |
| Koperasi | `SUPABASE_COOPERATIVE_RUNTIME_ENABLED` | — | Perlu migrasi serta uji kontrol ledger dan transaksi sebelum aktivasi. |
| Donasi/Wakaf | `SUPABASE_DONATION_RUNTIME_ENABLED` | — | Data donor, kampanye, penerimaan, dan aset wakaf memakai RPC tenant-scoped. Data contoh lama jangan diperlakukan sebagai histori keuangan. |
| Dokumen Digital | `SUPABASE_DOCUMENT_RUNTIME_ENABLED` | — | Surat tenant-scoped, transisi review tercatat, dan lampiran PDF privat; perlu migrasi serta verifikasi non-production. |
| CRM | `SUPABASE_CRM_RUNTIME_ENABLED` | — | Kontak, interaksi, dan analitik tenant-scoped; juga mendukung siaran WhatsApp melalui OpenWA. Pengiriman hanya untuk Admin/SuperAdmin dengan izin CRM, maksimal 50 kontak yang menyetujui informasi (`granted`) dan memiliki nomor valid. Memerlukan endpoint OpenWA di Pengaturan tenant atau `WA_GATEWAY_ENDPOINT`/`OPENWA_BASE_URL`, serta `WA_GATEWAY_API_KEY` pada environment server. Kunci tidak dikirim ke browser. Ledger idempotensi batch belum tersedia; jangan otomatis mengulang pengiriman dengan hasil gateway yang ambigu. |
| Laundry | `SUPABASE_LAUNDRY_RUNTIME_ENABLED` | — | Perlu migrasi `20261204000000` dan verifikasi non-production. |

Flag yang mengatur fitur inti dapat bergantung pada lebih dari satu nilai. Contohnya, tagihan PPDB memerlukan gerbang PPDB dan Keuangan; onboarding santri memerlukan PPDB, Data Induk, dan Asrama. Mengaktifkan hanya flag antarmuka dapat menampilkan kontrol yang kemudian ditolak API.

## Urutan aktivasi yang disarankan per environment

1. Pastikan source/image yang akan dijalankan sama dengan commit yang sudah ditinjau dan diuji.
2. Periksa konfigurasi environment aktif melalui secret manager/host; jangan menyalin file `.env` ke Git atau membagikannya. Pastikan project ref, URL publik, dan rahasia server mengarah ke environment yang benar.
3. Cocokkan migration ledger serta skema aktual dengan source. Terapkan migrasi hanya setelah ditinjau oleh pemilik database; jangan mengatasi perbedaan ledger dengan `migration repair` atau `db push` massal.
4. Siapkan tenant, profil Auth, role/izin, dan policy database. Untuk modul berkas, verifikasi bucket privat dan Storage policies.
5. Aktifkan satu kelompok modul pada staging: pertama flag server, lalu hanya flag UI pasangan yang diperlukan. Restart/redeploy agar proses membaca konfigurasi baru.
6. Uji login, role/tenant, baca, buat, ubah, validasi duplikasi, dan kegagalan akses lintas tenant. Tinjau log server serta efek samping transaksi.
7. Catat hasil dan versi environment. Hanya modul yang lulus gerbang tersebut yang boleh dibuka di Production.

Jangan menyalakan semua gerbang sekaligus untuk mengembalikan menu. Itu dapat membuka endpoint yang migrasi, data tenant, izin, atau policy-nya belum siap. Jika menu terlihat tetapi layanan belum tersedia, catat nama modul dan status responsnya; perubahan flag harus menjadi keputusan konfigurasi release setelah prasyaratnya lulus.

## Catatan deployment Hostinger staging — 23 November 2026

Operator melaporkan 11 flag server untuk PPDB, Keuangan, UKS, Koperasi, Multi-Unit, HRIS, Pemesanan Fasilitas, Aset GA, Donasi, dan Marketplace tidak terlihat pada Environment variables Hostinger staging. Source memuat flag tersebut di `.env.example` dan `server.ts`; jika nilainya kosong atau setelah spasi dipangkas dan huruf dinormalisasi tidak bernilai `true`, gerbang API tetap tertutup. Ini bukan alasan untuk membuka semua gerbang sekaligus.

### Lokasi dan prosedur konfigurasi

1. Pilih website staging `lightgreen-jay-425688.hostingersite.com` pada hPanel, lalu buka pengaturan aplikasi → **Environment variables**. Pastikan website ini memakai proyek VQE staging `vqemuyzveuirlkvdggjd`; jangan menerapkan langkah ini pada domain Production.
2. Tambahkan hanya flag modul yang prasyaratnya telah lulus. Gunakan nilai `true` huruf kecil. Untuk flag pasangan `VITE_*`, atur hanya bila UI perlu menampilkan alur terkait. Jangan menaruh secret server dengan awalan `VITE_`.
3. Klik **Apply changes**, lalu restart aplikasi Node.js dari Dashboard website staging. Dalam ERP ini, `SUPABASE_*` dibaca saat server mulai dan flag `VITE_*` yang diizinkan disajikan saat runtime melalui `/runtime-config.json` oleh `server.ts`; perubahan flag tidak memerlukan build/deploy ulang selama commit aplikasi yang sedang berjalan sudah menyediakan endpoint tersebut. Deploy ulang hanya jika source/build berubah atau deployment aktif belum memuat implementasi runtime-config ini. Jangan menampilkan atau mengirim dump environment.
4. Uji satu modul dengan data sintetis: baca, simpan, baca ulang, validasi relasi, role, dan penolakan tenant lain. Catat commit deployment dan hasilnya. Jika gagal, kembalikan flag modul itu menjadi `false`, lalu restart aplikasi staging.

### Urutan gerbang yang diperiksa

| Modul | Flag API/server | Prasyarat sebelum nilai `true` |
| --- | --- | --- |
| PPDB administrasi | `SUPABASE_PPDB_RUNTIME_ENABLED` | Migrasi dan profil tenant tersedia; alur dokumen privat ditinjau. Bila UI memerlukan runtime, setel `VITE_SUPABASE_PPDB_RUNTIME_ENABLED` juga. |
| Keuangan | `SUPABASE_FINANCE_RUNTIME_ENABLED` | Alur transaksi, ledger tenant, role, dan pembacaan ulang selesai diuji. |
| Anggaran | `SUPABASE_FINANCE_BUDGET_RUNTIME_ENABLED` | Keuangan aktif dan izin akses anggaran ditinjau. |
| UKS | `SUPABASE_HEALTHCARE_RUNTIME_ENABLED` | Akses data kesehatan dan pembatasan role/tenant ditinjau. |
| Koperasi | `SUPABASE_COOPERATIVE_RUNTIME_ENABLED` | Ledger serta transaksi tenant sudah lulus uji. |
| Multi-Unit | `SUPABASE_ENTERPRISE_UNITS_RUNTIME_ENABLED` | Relasi unit organisasi dan izin unit sudah tersedia dan diuji. |
| Sumber Daya Manusia | `SUPABASE_HRIS_RUNTIME_ENABLED` | Profil pegawai, kehadiran, cuti, dan batas role sudah diperiksa. |
| Pemesanan Fasilitas | `SUPABASE_FACILITY_BOOKINGS_RUNTIME_ENABLED` | Konflik jadwal dan penyimpanan transaksi sudah diuji. |
| Aset GA | `SUPABASE_GA_ASSETS_RUNTIME_ENABLED` | Mutasi stok tenant dan izin sudah diverifikasi. |
| Donasi/Wakaf | `SUPABASE_DONATION_RUNTIME_ENABLED` | Kampanye dan pencatatan tenant sudah diverifikasi; data dummy tidak dianggap histori keuangan. |
| Marketplace | `SUPABASE_MARKETPLACE_RUNTIME_ENABLED` | Reservasi stok dan transaksi serentak sudah diuji. |

### Gerbang tambahan yang tidak boleh ikut terbuka otomatis

- Bukti pembayaran memiliki flag tersendiri `SUPABASE_FINANCE_PROOF_STORAGE_RUNTIME_ENABLED`; buka hanya setelah bucket privat, akses berkas tenant, dan unggah/baca ulang lulus.
- Dokumen PPDB dan onboarding memiliki flag terpisah: `SUPABASE_PPDB_DOCUMENTS_RUNTIME_ENABLED` dan `SUPABASE_PPDB_ONBOARDING_RUNTIME_ENABLED`. Tagihan kandidat memerlukan `SUPABASE_PPDB_FINANCE_BILLS_ENABLED` bersama PPDB dan Keuangan.
- Pendaftaran PPDB publik adalah perubahan berbeda. Jangan aktifkan `SUPABASE_PUBLIC_PPDB_RUNTIME_ENABLED`, `PUBLIC_PPDB_ENABLED`, atau `PUBLIC_PPDB_TENANT_ID` hanya untuk membuka layar administrasi PPDB.
- Variabel `SUPABASE_URL`, publishable key, secret key, dan dua kunci PII harus tetap mengarah ke VQE yang tepat. Secret key, password database, serta kunci PII hanya di environment server; jangan menyalin nilainya ke tiket, chat, atau browser.

## Pemeriksaan konsistensi source

Guard `npm run test:customer-deployment-flags` memeriksa allowlist konfigurasi browser, `.env.example`, Docker Compose, error publik yang aman, dan beberapa gerbang UI. Guard tersebut bukan bukti bahwa environment Production sudah memuat semua variabel, bahwa API/database setiap modul lulus UAT, atau bahwa Production siap menerima migrasi.

Lihat juga [Visibilitas Menu dan Kesiapan Modul](MODULE_VISIBILITY_AND_RUNTIME_FLAGS.md) untuk cakupan menu/role dan batas fitur, serta [checkpoint integrasi](CHECKPOINT_2026-11-15_CURRENT_MAIN_INTEGRATION.md) untuk status sumber dan gerbang yang belum selesai.
