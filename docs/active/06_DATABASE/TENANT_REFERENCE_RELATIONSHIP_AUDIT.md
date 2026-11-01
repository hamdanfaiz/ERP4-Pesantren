# Audit Relasi Referensi Tenant

Status: perubahan kode sudah diterapkan dan diuji pada VQE staging (`vqemuyzveuirlkvdggjd`). Production PTSAS (`ptsasgdvgrbdtgyqieie`) tidak disentuh.

Checkpoint 1 November 2026: ledger VQE dan repo masing-masing memiliki 119 migration dengan versi dan nama yang cocok. SQL katalog versi `20261101015832` telah dicocokkan dengan ledger staging; penguatan kontrak `20270215000000` sudah tercatat di staging.

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

VQE memiliki 58 pilihan aktif dalam 13 domain umum. `academic_subject` dan `facility_resource` sengaja tidak diberi contoh karena isi kurikulum, ruang, dan fasilitas bersifat khusus setiap pesantren; Admin mengisinya melalui katalog. Tidak ada record operasional contoh yang dibuat.

## Relasi lintas modul

| Modul / data | Relasi yang ditegakkan |
| --- | --- |
| Akademik | Kelas mengarah ke `master_data_records`; mata pelajaran, kurikulum, jenis penilaian, dan ruang mengarah ke `tenant_reference_items`. Santri, pengajar, dan unit diverifikasi dari tenant. |
| Pemesanan fasilitas | `facility_bookings.facility_reference_id` mengarah ke fasilitas aktif tenant. |
| Keuangan | Tagihan mengarah ke jenis tagihan; pengeluaran dan rincian anggaran mengarah ke kategori pengeluaran. Pengeluaran baru wajib terhubung ke unit aktif dan nama bagian diturunkan dari unit, bukan diketik. |
| Marketplace, koperasi, pemasok | Setiap record memiliki kategori referensi domain yang sesuai. |
| Perpustakaan | Buku mengarah ke kategori buku tenant. |
| UKS | Obat mengarah ke kategori dan satuan obat tenant. |
| Sarana & Prasarana | Aset dan inventaris mengarah ke kategori; inventaris juga mengarah ke satuan tenant. |
| HRIS | Pegawai mengarah ke `organization_units`; unit kerja tidak lagi berupa label bebas. |

## Isolasi dan kontrol akses

- `tenant_reference_items` memakai RLS `ENABLE` dan `FORCE`, tanpa akses tabel langsung untuk `anon`/`authenticated`.
- API server melakukan pemeriksaan profil, role, tenant, dan izin modul sebelum mengelola atau membaca katalog.
- ID pilihan diverifikasi terhadap tenant aktif. Trigger kembali memeriksa status dan pasangan label/ID saat transaksi disimpan.
- Perubahan kategori atau unit yang tidak valid ditolak oleh backend/database, bukan hanya oleh validasi browser.
- Nilai lama tanpa pasangan pasti tidak otomatis disambungkan ke kategori yang sekadar mirip.

## Pemeriksaan staging

`supabase/tests/tenant_reference_relationships.test.sql` memiliki 49 assertion pgTAP. Semuanya lulus pada VQE staging, termasuk pemeriksaan RLS/grant, foreign key tenant/domain, trigger validasi, canonicalisasi label, penolakan kategori bebas/salah-domain/salah-tenant/nonaktif, penolakan deskripsi yang hanya mengulang nama, penolakan pengeluaran tanpa unit, dan alur sukses yang menurunkan kategori serta unit dari ID pilihan. Fixture dibuat dalam transaksi lalu di-rollback; pemeriksaan pascauji menemukan nol fixture yang tertinggal.

Pemeriksaan lokal lulus: `npm run lint`, `npm run build`, `npm run test:migration-preflight`, dan `git diff --check`. Build menghasilkan peringatan ukuran chunk besar dari paket PDF; ini bukan kegagalan build dan dapat dioptimalkan terpisah.

Audit data staging menemukan nol record tanpa relasi pada kolom kategori/unit yang diperiksa di Akademik, Keuangan, Marketplace, Koperasi, Perpustakaan, UKS, Sarana & Prasarana, serta unit kerja HRIS. Deskripsi katalog staging juga tidak memiliki konflik.

## Batas tahap dan penerapan

Kategori, satuan, unit kerja, kelas, fasilitas, dan jenis tagihan yang berperan sebagai pilihan kini tersimpan sebagai ID tenant/domain dan ditampilkan sebagai pilihan terdaftar. Teks naratif seperti nama barang, penulis, uraian, lokasi fisik, penanggung jawab, catatan, serta deskripsi tetap teks karena itu nilai kejadian/data, bukan kategori referensi. Bila lokasi fisik atau penanggung jawab perlu laporan lintas modul, tindak lanjutnya adalah FK ke master gedung/ruang dan pegawai HRIS.

Staging lulus untuk kontrak relasi kategori, tetapi satu transaksi pengeluaran yang valid belum dapat diverifikasi melalui antarmuka karena tenant staging belum mempunyai unit organisasi operasional. Suite pgTAP membuat unit sementara untuk menguji jalur database dan membatalkannya. UAT UI dan alur bisnis penuh masih menjadi gerbang sebelum Production.

Production baru dapat menerima migration setelah review tim backend, UAT antarmuka, serta uji transaksi dengan unit organisasi staging selesai. Jangan menerapkan migration secara manual di Production.
