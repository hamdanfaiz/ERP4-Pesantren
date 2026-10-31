# Paritas Menu dan Pemindahan Data

**Status:** implementasi lanjutan pada branch PR #38  
**Tanggal:** 31 Oktober 2026

## Ringkasan temuan menu

Daftar ALL_SYSTEM_MODULE_IDS, navigasi di Sidebar.tsx, dan switch halaman di App.tsx mencakup 26 modul berikut. Pusat Analitik adalah entri navigasi khusus yang dirender terpisah di bawah grup Analitik.

| Modul | Menu | Halaman |
| --- | --- | --- |
| dashboard | Ringkasan | SupabaseDashboardOverview |
| master-data | Data Induk (Master Data) | MasterDataManager |
| users | Manajemen Pengguna | UserManagementView |
| ppdb | Penerimaan Santri (PPDB) | SupabasePpdbManager |
| cbt | Ujian Berbasis Komputer (CBT) | SupabaseCBTManager atau layar Santri |
| tahfidz | Tahfidz | TahfidzManager |
| boarding | Asrama | SupabaseBoardingManager |
| academic | Akademik Formal | SupabaseAcademicManager |
| lms | LMS Pembelajaran | SupabaseLMSManager |
| library | Perpustakaan | SupabaseLibraryManager |
| finance | Keuangan & Tagihan | SupabaseFinanceManager |
| communication | Pusat Komunikasi | SupabaseCommunicationHub |
| healthcare | Kesehatan (UKS) | SupabaseHealthcareManager |
| cooperative | Koperasi & Kantin | SupabaseCooperativeManager |
| laundry | Laundry | SupabaseLaundryManager |
| enterprise | Manajemen Multi-Unit | SupabaseEnterpriseUnitsManager |
| erp | Keuangan & Anggaran (ERP) | SupabaseFinanceBudgetManager |
| hris | Sumber Daya Manusia (HCM) | SupabaseHrisManager |
| ga | Sarana & Prasarana | SupabaseGeneralAffairManager |
| document | Dokumen Digital | SupabaseDocumentManager |
| alumni | Data Alumni | SupabaseAlumniManager |
| crm | Relasi Wali & Donatur | SupabaseCrmManager |
| donation | Donasi & Wakaf | SupabaseDonationManager |
| marketplace | Marketplace | SupabaseMarketplaceManager |
| intelligence | Pusat Data Analitik | SupabaseDashboardOverview analitik |
| settings | Pengaturan | SettingsManager, Super Admin |

Rute dan entri menu tersedia bukan bukti bahwa seluruh fitur modul sudah aktif di setiap lingkungan. Endpoint operasional memakai feature flag server dan beberapa flag secara sengaja bernilai false secara bawaan. Jika flag atau migrasi belum siap, modul dapat terlihat tetapi API menolak permintaan. Aktifkan per modul hanya setelah migrasi dan UAT di lingkungan non-produksi.

## Perbedaan yang disengaja

- Admin pesantren mendapat modul tenant yang diizinkan oleh RBAC. Pengaturan global platform tetap khusus Super Admin.
- RBAC memberi Admin akses dasar ke seluruh modul tenant. Izin per akun yang secara eksplisit bernilai false tetap menyembunyikan menu tersebut; Sidebar sekarang menampilkan daftar izin Admin yang menyebabkan menu disembunyikan agar Superadmin dapat meninjaunya di Manajemen Pengguna, tanpa melemahkan penjagaan rute.
- PPOB dan payment gateway tidak termasuk rilis awal sesuai keputusan pemilik produk; menu simulasi dan izin lamanya tidak dihidupkan kembali.
- Pada runtime Supabase, tab Data Induk yang saat ini tersambung langsung ke backend mencakup Santri, struktur Gedung/Kamar/Kelas, Peta Struktur baca-saja, dan Pemesanan Fasilitas. Panel Data Induk menyediakan pintasan ke modul yang sekarang menangani Wali, Guru/Asatidz, Pegawai, Alumni, Akademik, unit, dan Halaqah. Kesesuaian setiap detail formulir lama dengan modul tujuan belum seluruhnya dibuktikan. Jejak Audit lama belum memiliki sumber backend tenant yang setara; data contoh atau log browser tidak ditampilkan sebagai data operasional.
- Data alumni dikelola lewat modul Data Alumni, bukan tab Alumni lama di Data Induk.
- Master Data kini ditampilkan sebagai **Data Induk (Master Data)** agar mudah ditemukan melalui nama yang dikenal sebelumnya.

## Pemindahan data manual pada Data Induk

Ekspor dan impor baru menggunakan API server Supabase, role Admin/Super Admin, dan tenant dari profil sesi. tenantId, ID internal Supabase, role, maupun permission dari berkas tidak dipercaya sebagai pemilih tenant.

- Templat CSV tersedia untuk Santri serta masing-masing jenis struktur. Templat memakai header tetap, UTF-8, dan tanpa record contoh.
- Ekspor mengambil semua data tenant yang diizinkan, bukan hanya halaman tabel saat ini. Batas ekspor satu berkas adalah 20.000 Santri atau 10.000 struktur; jika batas terlampaui, server menolak ekspor agar tidak menghasilkan berkas terpotong.
- Ekspor NIK/NISN dan kontak dimatikan secara bawaan. Admin harus memilihnya dan mengonfirmasi peringatan sebelum berkas sensitif dibuat. Nilai NIK/NISN hanya didekripsi di backend saat diminta; nilai yang diimpor dienkripsi dan diberi fingerprint di backend.
- Pratinjau memvalidasi header, format, ID, NIS/NIK/NISN berulang di berkas dan yang sudah terdaftar, serta relasi kelas/gedung/kamar. RPC memeriksa konflik database di tenant aktif. Record yang telah ada dilewati; tidak ada overwrite maupun penghapusan.
- Impor dibatasi 250 baris per berkas. Santri memakai RPC transaksi append-only yang menegakkan keunikan NIS/NIK/NISN saat commit. Struktur memakai RPC create-only dan diterapkan oleh migration `20270213000000_master_data_import_create_only.sql`; konflik bersamaan dilewati tanpa menimpa record. Tiap baris disimpan terpisah. Jika satu baris gagal setelah pratinjau, hasil menampilkan kegagalan per baris dan baris yang berhasil tidak otomatis dibatalkan.
- Struktur harus dimasukkan lebih dahulu sebelum impor Santri yang merujuk kelas, gedung, atau kamar. Kamar memakai parentId yang merujuk ID Gedung.

## Batas verifikasi

Build dan UAT antarmuka memerlukan dependency proyek dan konfigurasi Supabase staging yang aman. Jangan gunakan preview localhost:4179 untuk uji tulis sebelum servernya terbukti menunjuk ke proyek staging; konfigurasi `.env` checkout kanonis yang diperiksa sebelumnya menunjuk ke Production. Migration baru belum diterapkan melalui perubahan ini dan harus dijalankan serta diverifikasi di staging sebelum fitur impor struktur digunakan. Perubahan ini tidak menjalankan impor/ekspor ke database live.
