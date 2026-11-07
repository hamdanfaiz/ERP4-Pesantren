# Audit Relasi Referensi Tenant

Status checkpoint 1 November 2026: kontrak referensi yang dirinci di bawah sudah diterapkan pada VQE staging (`vqemuyzveuirlkvdggjd`). Penambahan penomoran otomatis dan relasi operasional ada di [checkpoint Naming Series](./CHECKPOINT_2026-11-01_NAMING_SERIES.md). Migration tambahan untuk ID struktur dan kode NIS per jenjang masih lokal dan belum diterapkan. Production PTSAS (`ptsasgdvgrbdtgyqieie`) tidak disentuh.

Checkpoint 1 November 2026: snapshot staging/repo sebelumnya menemukan ledger VQE mencatat migration penomoran pertama dengan versi berbeda: remote-only `20261101041832`, source-only `20270218000000`, keduanya bernama `operational_relationships_and_naming_series`. Migration kedua `20270219000000_naming_series_master_data_ids.sql` belum diterapkan. Gunakan runbook Naming Series untuk menyelaraskan history; jangan mengulang DDL pertama atau menerapkan ke Production.

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

Admin tenant mengelola nama dan deskripsi melalui Data Induk → Kategori & Referensi. Setiap `academic_grade_level` aktif juga memerlukan `nis_grade_code` dua digit yang unik dalam tenant; kode dikunci setelah terbit NIS. Migrasi menambahkan pilihan standar; Admin tetap dapat mengubah dan menambah pilihan tenant.

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

`supabase/tests/tenant_reference_relationships.test.sql` memiliki 49 assertion pgTAP, sedangkan `supabase/tests/tenant_operational_choice_relationships.test.sql` menambah 9 assertion: FK tenant calon santri ke kelas/gedung/kamar, sinkronisasi jenjang dan label, serta penolakan kelas bebas, jenjang yang tidak cocok, kamar dari gedung lain, dan referensi tenant lain. `supabase/tests/tenant_naming_series.test.sql` mencakup isolasi/privilege, alokasi seri, idempotensi, validasi konfigurasi, dan relasi baru. Supabase CLI tidak dapat menjalankan pgTAP di workspace karena Docker tidak tersedia; suite lengkap harus berjalan di CI atau lingkungan tim backend.

Pemeriksaan lokal terkait checkpoint ini lulus: `npm run lint`, `npm run build`, `npm run test:migration-preflight`, `npm run test:ppdb-csv-import`, `npm run test:ppdb-onboarding-rooms`, dan `npm run test:hris-legacy-import`. Build menghasilkan peringatan ukuran chunk besar dari paket PDF; ini bukan kegagalan build. Pemeriksaan lokal lain yang disebut di checkpoint terdahulu tidak otomatis membuktikan perubahan terbaru. `supabase test db`/pgTAP penuh belum dijalankan karena Docker tidak tersedia.

Data operasional PPDB, struktur, santri, dan tagihan VQE tetap kosong; migrasi tidak memindahkan atau membuat data operasional. Pemeriksaan staging terakhir menemukan seluruh 14 foreign key relasi tenant/domain yang ditargetkan, nol nama yang sama dengan deskripsi, dan nol fixture uji tertinggal. Advisor Supabase masih menampilkan temuan baseline: perlindungan password bocor belum aktif, 158 tabel dengan RLS tanpa policy eksplisit (akses tetap melalui backend tepercaya), serta 259 FK yang belum berindeks pada seluruh proyek. Temuan ini tidak dibuka atau diubah oleh migration relasi ini.

Pemeriksaan visual menemukan tab browser `http://localhost:4179/` masih menampilkan form lama dengan jenjang bebas dan tanpa tab Kategori & Referensi. Port tersebut tidak memiliki proses server aktif dan worktree ini tidak memiliki `.env`/`.env.local`; karena itu tab tersebut merupakan tampilan yang sudah dimuat sebelumnya, bukan bukti UI dari source branch ini. Pada source branch, jenjang Santri, kelas, gedung, kamar, mata pelajaran, paket soal, dan jabatan menggunakan pilihan ber-ID; tab Kategori & Referensi hanya tersedia ketika runtime Master Data Supabase diaktifkan. UAT antarmuka yang valid perlu menjalankan source branch ini dengan konfigurasi lokal khusus VQE yang aman, lalu memastikan form tersebut tampil dari server yang aktif.

## Batas tahap dan penerapan

Kategori, satuan, unit kerja, kelas, fasilitas, jenjang, mata pelajaran, templat CBT, jabatan, dan jenis tagihan yang berperan sebagai pilihan kini tersimpan sebagai ID tenant/domain dan ditampilkan sebagai pilihan terdaftar. Pilihan status dan tipe proses yang memang berupa protokol tetap dibatasi enum/check constraint. Teks naratif seperti nama barang, penulis, uraian, lokasi fisik, penanggung jawab, catatan, serta deskripsi tetap teks karena itu nilai kejadian/data, bukan kategori referensi. Daftar teks konfigurasi CBT dari arsip lama tetap sebagai provenance impor; backend tidak lagi memuatnya sebagai daftar pilihan runtime.

Pemeriksaan post-migration baca-saja untuk relasi dan naming di VQE menemukan enam foreign key baru tervalidasi, tiga seri default, empat tabel naming dengan RLS+FORCE, tanpa hak baca langsung untuk browser, dan akses RPC alokasi hanya untuk `service_role`. UAT antarmuka dan alur bisnis penuh belum selesai; ledger migration terbaru juga belum cocok. Sebelum promosi, tim perlu menyelaraskan ledger staging, menjalankan suite Supabase lokal/CI dan UAT penuh, memastikan akses baca/migration yang benar untuk PTSAS, serta melakukan preflight ledger Production.

Production baru dapat menerima migration setelah UAT antarmuka, seluruh uji staging, preflight/rehearsal ledger Production, dan review tim backend selesai. Jangan menerapkan migration secara manual di Production sebelum gerbang tersebut lulus.
