# Audit Relasi Referensi Tenant

Status: perubahan kode dan dua migration telah diterapkan pada VQE staging (`vqemuyzveuirlkvdggjd`). Production PTSAS (`ptsasgdvgrbdtgyqieie`) tidak disentuh.

Checkpoint 1 November 2026: ledger VQE dan repo masing-masing memiliki 121 migration dengan versi dan nama yang cocok, termasuk `20270216000000` (relasi pilihan operasional) dan `20270217000000` (indeks FK). SQL katalog versi `20261101015832` telah dicocokkan dengan ledger staging; penguatan kontrak `20270215000000` tetap tercatat. Dua entri migrasi baru diselaraskan ke versi repo setelah tool staging membuat versi berdasarkan waktu server.

## Kontrak pilihan data

- Satu pilihan baku disimpan sebagai `id`, `tenant_id`, dan domain yang jelas.
- `name` adalah penyebutan yang tampil di form dan laporan; `description` wajib minimal 8 karakter dan menjelaskan arti atau aturan pakai secara berbeda dari nama.
- Modul transaksi mengirim ID pilihan, bukan label bebas. Backend memeriksa ID aktif dalam tenant, lalu meneruskan nama kanonis.
- Trigger Postgres mengisi foreign key dan label kanonis pada record. Foreign key mengikat tenant dan domain sehingga kategori dari tenant lain atau domain lain tidak dapat dipakai.
- Referensi yang sudah dipakai dapat dinonaktifkan; foreign key mencegah penghapusan fisik yang merusak histori.
- Form dan constraint database menolak deskripsi kurang dari 8 karakter atau yang hanya mengulang nama pilihan.
- Backfill hanya menautkan label lama yang cocok secara pasti. Nilai historis yang tidak cocok tetap terbaca tanpa relasi; sistem tidak menebak.
- Teks naratif seperti uraian, alasan, catatan, keluhan, dan deskripsi bukan kategori. Isian naratif tersebut tetap berupa teks.

## Domain katalog tenant

Katalog mendukung pilihan berikut:

| Domain | Pemakaian |
| --- | --- |
| `academic_subject` | Mata pelajaran pada jadwal, jurnal KBM, dan penilaian |
| `academic_curriculum` | Kurikulum jadwal akademik |
| `academic_assessment_type` | Jenis penilaian santri |
| `academic_grade_level` | Jenjang untuk kelas, PPDB, santri, tagihan, LMS, dan CBT |
| `cbt_question_template` | Paket atau templat soal CBT |
| `hris_job_title` | Jabatan pegawai HRIS |
| `facility_resource` | Ruang/fasilitas pada jadwal dan pemesanan |
| `finance_fee_type` | Jenis tagihan santri dan PPDB |
| `finance_expense_category` | Kategori pengeluaran dan rincian anggaran |
| `marketplace_product_category` | Kategori produk marketplace |
| `cooperative_product_category` | Kategori produk koperasi |
| `cooperative_supplier_category` | Kategori pemasok koperasi |
| `library_book_category` | Kategori buku perpustakaan |
| `healthcare_medicine_category` | Kategori obat dan perlengkapan UKS |
| `healthcare_medicine_unit` | Satuan stok obat UKS |
| `ga_asset_category` | Kategori aset/fasilitas GA |
| `ga_inventory_category` | Kategori persediaan GA |
| `ga_inventory_unit` | Satuan inventaris GA |

Admin tenant mengelola nama dan deskripsi melalui Data Induk → Kategori & Referensi. Migrasi menambahkan pilihan standar; Admin tetap dapat mengubah dan menambah pilihan tenant.

VQE memiliki 58 pilihan aktif dalam 13 domain umum. Saat audit terakhir, `academic_subject`, `academic_grade_level`, `cbt_question_template`, dan `hris_job_title` belum memiliki pilihan aktif pada tenant staging. Nilai jenjang, mata pelajaran, templat CBT, dan jabatan bergantung pada kebijakan masing-masing pesantren; Admin mengisinya melalui Data Induk → Kategori & Referensi dengan deskripsi yang menjelaskan cakupan. Dropdown terkait sengaja tidak menerima teks bebas dan penyimpanan ditolak sampai pilihan tenant tersedia. Tidak ada record operasional contoh yang dibuat.

## Relasi lintas modul

| Modul / data | Relasi yang ditegakkan |
| --- | --- |
| Akademik | Kelas mengarah ke `master_data_records`; mata pelajaran, kurikulum, jenis penilaian, dan ruang mengarah ke `tenant_reference_items`. Santri, pengajar, dan unit diverifikasi dari tenant. |
| PPDB, Data Induk, Santri, dan Keuangan | Satu `academic_grade_level` digunakan bersama. Kandidat tertaut ke kelas, gedung, dan kamar tenant; kelas wajib sesuai jenjang. Santri mewarisi jenjang dari calon santri atau kelas, dan tagihan tertaut ke santri/kandidat serta jenjang yang sama. |
| CBT dan LMS | Soal/ujian CBT menaut ke mata pelajaran, jenjang, dan templat soal; kursus LMS menaut ke kategori kursus dan jenjang sasaran (opsional: semua jenjang). Daftar teks lama dari impor konfigurasi CBT tidak dipakai sebagai pilihan operasional; runtime hanya membaca katalog referensi tenant. |
| HRIS | Pegawai menaut ke `organization_units` dan jabatan pada `hris_job_title`; jabatan tidak diketik sebagai label lepas. |
| Pemesanan fasilitas | `facility_bookings.facility_reference_id` mengarah ke fasilitas aktif tenant. |
| Keuangan | Tagihan mengarah ke jenis tagihan; pengeluaran dan rincian anggaran mengarah ke kategori pengeluaran. Pengeluaran baru mengirim ID kategori, lalu backend mengambil nama kanonis; unit aktif diverifikasi lebih dahulu dan nama bagian diturunkan dari unit. |
| Marketplace, koperasi, pemasok | Setiap record memiliki kategori referensi domain yang sesuai. |
| Perpustakaan | Buku mengarah ke kategori buku tenant. |
| UKS | Obat mengarah ke kategori dan satuan obat tenant. |
| Sarana & Prasarana | Aset dan inventaris mengarah ke kategori; inventaris juga mengarah ke satuan tenant. |
| HRIS | Pegawai mengarah ke `organization_units` dan katalog jabatan tenant. |

## Isolasi dan kontrol akses

- `tenant_reference_items` memakai RLS `ENABLE` dan `FORCE`, tanpa akses tabel langsung untuk `anon`/`authenticated`.
- API server melakukan pemeriksaan profil, role, tenant, dan izin modul sebelum mengelola atau membaca katalog.
- ID pilihan diverifikasi terhadap tenant aktif. Trigger kembali memeriksa status dan pasangan label/ID saat transaksi disimpan.
- Perubahan kategori atau unit yang tidak valid ditolak oleh backend/database, bukan hanya oleh validasi browser.
- Nilai lama tanpa pasangan pasti tidak otomatis disambungkan ke kategori yang sekadar mirip.

## Pemeriksaan staging

`supabase/tests/tenant_reference_relationships.test.sql` memiliki 49 assertion pgTAP, sedangkan `supabase/tests/tenant_operational_choice_relationships.test.sql` menambah 9 assertion: FK tenant calon santri ke kelas/gedung/kamar, sinkronisasi jenjang dan label, serta penolakan kelas bebas, jenjang yang tidak cocok, kamar dari gedung lain, dan referensi tenant lain. Supabase CLI tidak tersedia di workspace, sehingga skrip pgTAP belum dieksekusi melalui `supabase test db`; cabang perilaku utama telah diuji langsung sebagai transaksi sintetis di VQE dan di-rollback.

Pemeriksaan lokal lulus: `npm run lint`, `npm run build`, `npm run test:migration-preflight`, `npm run test:supabase-runtime-no-firebase`, `npm run test:supabase-finance-unit-scope`, PPDB public/CSV/onboarding, CBT settings, HRIS legacy import, Master Data CSV/pagination, Academic portal/jadwal, serta tes Tahfidz, akses wali, RBAC, perpustakaan, alumni, dan koperasi yang dijalankan pada tahap ini. Tes integrasi loopback `test:trusted-proxy-hops` dan `test:runtime-config-http` tidak dapat bind/connect pada sandbox saat ini (`EACCES`); jalankan keduanya di CI atau lingkungan build backend sebelum promosi. Build menghasilkan peringatan ukuran chunk besar dari paket PDF; ini bukan kegagalan build dan dapat dioptimalkan terpisah. `npm run test:db`/suite pgTAP penuh belum dijalankan karena Supabase CLI lokal tidak tersedia.

Data operasional PPDB, struktur, santri, dan tagihan VQE tetap kosong; migrasi tidak memindahkan atau membuat data operasional. Pemeriksaan staging terakhir menemukan seluruh 14 foreign key relasi tenant/domain yang ditargetkan, nol nama yang sama dengan deskripsi, dan nol fixture uji tertinggal. Advisor Supabase masih menampilkan temuan baseline: perlindungan password bocor belum aktif, 158 tabel dengan RLS tanpa policy eksplisit (akses tetap melalui backend tepercaya), serta 259 FK yang belum berindeks pada seluruh proyek. Temuan ini tidak dibuka atau diubah oleh migration relasi ini.

Pemeriksaan visual menemukan tab browser `http://localhost:4179/` masih menampilkan form lama dengan jenjang bebas dan tanpa tab Kategori & Referensi. Port tersebut tidak memiliki proses server aktif dan worktree ini tidak memiliki `.env`/`.env.local`; karena itu tab tersebut merupakan tampilan yang sudah dimuat sebelumnya, bukan bukti UI dari source branch ini. Pada source branch, jenjang Santri, kelas, gedung, kamar, mata pelajaran, paket soal, dan jabatan menggunakan pilihan ber-ID; tab Kategori & Referensi hanya tersedia ketika runtime Master Data Supabase diaktifkan. UAT antarmuka yang valid perlu menjalankan source branch ini dengan konfigurasi lokal khusus VQE yang aman, lalu memastikan form tersebut tampil dari server yang aktif.

## Batas tahap dan penerapan

Kategori, satuan, unit kerja, kelas, fasilitas, jenjang, mata pelajaran, templat CBT, jabatan, dan jenis tagihan yang berperan sebagai pilihan kini tersimpan sebagai ID tenant/domain dan ditampilkan sebagai pilihan terdaftar. Pilihan status dan tipe proses yang memang berupa protokol tetap dibatasi enum/check constraint. Teks naratif seperti nama barang, penulis, uraian, lokasi fisik, penanggung jawab, catatan, serta deskripsi tetap teks karena itu nilai kejadian/data, bukan kategori referensi. Daftar teks konfigurasi CBT dari arsip lama tetap sebagai provenance impor; backend tidak lagi memuatnya sebagai daftar pilihan runtime.

Staging lulus untuk kontrak relasi yang diubah, tetapi UAT antarmuka dan alur bisnis penuh seluruh modul belum selesai. PTSAS Production MCP saat ini menolak akses baca; tidak ada migration Production yang dijalankan. Sebelum promosi, tim perlu memastikan akses baca/migration yang benar untuk PTSAS, melakukan preflight ledger Production, mengisi katalog tenant sintetis di VQE, dan menjalankan suite Supabase lokal/CI serta UAT modul penuh.

Production baru dapat menerima migration setelah UAT antarmuka, seluruh uji staging, preflight/rehearsal ledger Production, dan review tim backend selesai. Jangan menerapkan migration secara manual di Production sebelum gerbang tersebut lulus.
