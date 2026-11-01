# Tinjauan Performance Advisor VQE — 1 November 2026

## Cakupan

Pemeriksaan ini hanya membaca metadata skema, Advisor, log, dan katalog PostgreSQL pada staging VQE (`vqemuyzveuirlkvdggjd`). Tidak ada migration, indeks, data, konfigurasi Auth, maupun Production PTSAS yang diubah.

## Temuan terverifikasi

Snapshot Supabase Performance Advisor pada 1 November 2026 sekitar 11:22 UTC melaporkan:

| Temuan | Jumlah | Tingkat | Penilaian |
| --- | ---: | --- | --- |
| Foreign key tanpa indeks penutup | 258 | INFO | Perlu ditinjau berdasarkan bentuk FK, query nyata, dan volume data. |
| Indeks belum terpakai | 98 | INFO | Belum aman dihapus karena VQE belum mewakili beban operasional pelanggan. |
| Indeks duplikat | 1 | WARN | Pada `document_records`; migration penghapusan sudah ada di source, belum tercatat pada ledger VQE. |

Query katalog baca-saja tambahan menemukan 522 constraint foreign key di schema `public`:

- 285 FK tidak memiliki indeks B-tree valid, siap pakai, non-partial yang kolom kuncinya diawali urutan kolom FK.
- 27 dari 285 memiliki indeks partial dengan prefix yang sama; indeks partial hanya mencakup baris yang memenuhi predikatnya, sehingga tidak otomatis menjadi cakupan penuh untuk semua baris FK.
- 258 tidak memiliki prefix indeks B-tree yang cocok, sama dengan jumlah Performance Advisor.
- Bentuk FK tersebut tersebar pada 148 tabel. Setelah prefix kandidat yang lebih pendek dan tertutup kandidat lebih panjang pada tabel yang sama disisihkan, tersisa 284 prefix kandidat. Angka ini adalah inventaris struktur, bukan instruksi untuk membuat 284 indeks.

Log VQE dalam 24 jam terakhir memuat aktivitas PostgreSQL dan layanan lain, tetapi tidak menyediakan sampel workload pesantren yang representatif. Statistik indeks dari staging kosong/rendah trafik tidak cukup untuk memilih indeks yang harus dihapus atau memastikan query mana yang paling sering digunakan.

### Indeks duplikat

Source PR #40 memiliki `supabase/migrations/20270227000000_remove_redundant_document_number_index.sql`, yang mempertahankan indeks nomor dokumen ternormalisasi dan menghapus indeks lama yang duplikat. Ledger VQE yang diperiksa masih berakhir pada `20270226000000` (130 migration); migration `20270227000000` belum diterapkan di staging pada snapshot ini. Terapkan hanya melalui urutan migration yang telah dipreflight dan uji ulang Advisors setelah CI/staging menyetujuinya. Jangan menjalankan ulang DDL di luar ledger.

### Temuan keamanan terkait

Security Advisor mencatat 162 tabel RLS-enabled tanpa policy dan satu peringatan bahwa Leaked Password Protection belum aktif. Jangan menambahkan policy umum hanya untuk menghilangkan INFO: tabel service-only harus tetap tertutup bagi akses browser langsung. CI PR #40 menambahkan invariant bahwa tabel tanpa policy tidak boleh memberi privilege tabel langsung kepada `anon` atau `authenticated`; tetap jalankan tes endpoint server, role, tenant, dan Storage karena `service_role` melewati RLS. Leaked Password Protection perlu diaktifkan dan diverifikasi operator secara manual di Authentication settings pada staging sebelum uji akun; Production tetap harus direview terpisah.

## Tindakan yang direkomendasikan untuk skala besar

1. **Jangan membuat seluruh indeks FK sekaligus.** Ambil query top-N dari fitur yang sudah dimigrasikan (daftar santri, pencarian, akademik, Tahfidz, tagihan, dan laporan), lalu jalankan `EXPLAIN (ANALYZE, BUFFERS)` memakai data sintetis bertingkat yang menyerupai tenant kecil, sedang, dan besar.
2. Catat baseline dan target p95/p99, throughput, penggunaan buffer, waktu tulis, ukuran indeks, dan dampak insert/update/delete. Pemilik produk dan tim backend harus menetapkan SLO sebelum benchmark; Advisor sendiri tidak menentukan target produk.
3. Prioritaskan indeks untuk pola filter/join tenant yang terbukti sering digunakan, FK yang terlibat pada penghapusan/perubahan parent, serta query yang tetap memindai banyak baris. Periksa prefix komposit, unique constraint yang sudah ada, soft-delete predicate, dan indeks yang sudah tumpang tindih agar tidak menambah indeks duplikat.
4. **Jangan menghapus 98 indeks yang tampak belum terpakai** sebelum workload staging representatif mencatat penggunaan dan konsekuensi constraint/cascade ditinjau. Indeks memberi biaya penulisan dan ruang, tetapi ketiadaan penggunaan pada staging bukan bukti bahwa production tidak memerlukannya.
5. Untuk tabel yang sudah berisi data, rencanakan pembangunan indeks dengan strategi yang tidak memblokir penulisan. Pastikan cara migrasi yang dipilih mendukung `CREATE INDEX CONCURRENTLY` di luar transaksi; jangan memasukkannya ke migration transaksional tanpa verifikasi runner.
6. Jalankan kembali Performance/Security Advisor setelah perubahan staging, cek validitas indeks serta hasil uji tenant/role, lalu minta review sebelum membuat perubahan Production. Jangan menyalakan deploy otomatis sebagai pengganti persetujuan cutover.

## Referensi resmi

- [Supabase Advisors](https://supabase.com/docs/guides/observability/advisors): temuan bersifat deterministik, namun harus dibandingkan dengan log dan workload sebelum remediasi.
- [Managing Indexes in Postgres](https://supabase.com/docs/guides/database/postgres/indexes): indeks mempercepat query tetapi menambah biaya tulis dan ruang; pembangunan indeks dapat mengunci tabel, sedangkan opsi concurrent memiliki batas transaksi.
- [Database Linter — unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- [Database Linter — unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- [Database Linter — duplicate indexes](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).

**Status:** audit staging selesai; remediasi indeks dan benchmark volume pesantren masih terbuka. Tidak ada perubahan pada Production PTSAS.
