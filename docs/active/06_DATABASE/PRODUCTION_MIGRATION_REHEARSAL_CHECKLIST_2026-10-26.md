# Checklist rehearsal migrasi Supabase Production — 26 Oktober 2026

## Tujuan dan batas

Snapshot ledger baca-saja yang tercatat pada 26 Oktober 2026 pukul 04:04 UTC untuk project `ptsasgdvgrbdtgyqieie` memuat 47 migration sampai `20261206000000`. Head PR #13 saat ini (`a0607e30a7b0eb2f81d743cfc6b161fa7af083d6`) berisi 90 file migration sampai `20270118000000`. Jika ledger lama itu belum berubah, selisih aritmetisnya 43 migration; angka tersebut **bukan hitungan pending terkini**. Dashboard project sekarang menampilkan “Last Migration: Unknown”, dan akses baca-terprogram ke ref target belum tersedia, sehingga ledger serta kecocokan schema Production belum terverifikasi. Baca ulang ledger target sebelum rehearsal; jangan menerapkan migration berdasarkan snapshot lama.

Catatan di bawah mempertahankan beberapa snapshot lama (85/86, lalu 87/88 file dan 40/41 migration pending) sebagai riwayat pemeriksaan. Source sekarang berisi 90 file migration; jumlah pending live belum diketahui sampai ledger target dibaca ulang.

Dokumen ini adalah rencana pemeriksaan berbasis source. Query Production pada pembaruan terbaru hanya membaca metadata migration dan tabel, bukan isi data operasional. Tidak ada migration atau perubahan schema/data Production yang diterapkan. Lulusnya CI pada database kosong tidak menggantikan rehearsal menggunakan salinan backup yang representatif.

## Gerbang sebelum rehearsal

1. Pastikan source dan target benar: commit yang akan diuji, project ref, branch, versi PostgreSQL, extension, serta ledger migration.
2. Ambil backup dengan metode yang dapat dipulihkan. Pulihkan ke proyek/instance terpisah dan verifikasi akses serta kelengkapan tabel sebelum menjalankan migration.
3. Lakukan pemeriksaan ulang ledger memakai [runbook preflight](MIGRATION_PREFLIGHT_RUNBOOK.md). Hentikan bila versi asing, duplikat, atau urutan migration berbeda ditemukan.
4. Rekam hitungan agregat per tenant/tabel dan pemeriksaan integritas berikut tanpa menyalin PII ke log. Catat waktu eksekusi, ukuran tabel, lock, penggunaan disk, dan pesan gagal.
5. Jalankan seluruh migration dalam urutan source pada salinan terisolasi. Jangan menjalankan satu migration yang gagal berulang-ulang tanpa memulihkan baseline rehearsal atau memahami alasan kegagalannya.

## Pemeriksaan data khusus

Pemeriksaan di bawah harus dijalankan pada salinan staging sebelum migration terkait. Hasil yang tidak kosong perlu ditinjau dan direkonsiliasi; jangan menghapus atau mengubah data otomatis untuk membuat migration lolos.

### ISBN katalog Perpustakaan — `20261207000000`

Migration membuang indeks unik lama dan membangun indeks unik atas ISBN yang dinormalisasi untuk buku aktif. Duplikat yang sebelumnya berbeda hanya karena kapitalisasi, spasi, atau tanda hubung dapat menggagalkan indeks baru.

```sql
SELECT tenant_id,
       regexp_replace(upper(btrim(isbn)), '[[:space:]-]+', '', 'g') AS isbn_normalized,
       count(*) AS row_count
FROM public.library_books
WHERE isbn IS NOT NULL AND btrim(isbn) <> '' AND status = 'active'
GROUP BY tenant_id, regexp_replace(upper(btrim(isbn)), '[[:space:]-]+', '', 'g')
HAVING count(*) > 1;
```

### Hasil ujian Tahfidz — `20261216000000`

Constraint baru mensyaratkan ujian selesai mempunyai nilai 0–100 dan hasil `pass` atau `retest`. Query ini harus mengembalikan nol baris:

```sql
SELECT tenant_id, id
FROM public.tahfidz_sessions
WHERE kind = 'exam' AND status = 'completed'
  AND (score IS NULL OR score NOT BETWEEN 0 AND 100
       OR outcome IS NULL OR outcome NOT IN ('pass', 'retest'));
```

### Koperasi — `20261230000000`

Migration mengubah makna `cost_price` yang tidak diketahui menjadi `NULL`, memberi identity sequence pada ledger saldo, dan memperketat jenis serta tanda transaksi. Periksa baris yang tidak akan memenuhi aturan sebelum menerapkan:

```sql
SELECT tenant_id, id, entry_type, amount_delta, sale_id
FROM public.cooperative_wallet_ledger
WHERE entry_type NOT IN ('top_up', 'purchase', 'adjustment', 'opening_balance')
   OR (entry_type IN ('top_up', 'opening_balance') AND (amount_delta <= 0 OR sale_id IS NOT NULL))
   OR (entry_type = 'purchase' AND (amount_delta >= 0 OR sale_id IS NULL))
   OR (entry_type = 'adjustment' AND sale_id IS NOT NULL);
```

Tinjau juga apakah ada item penjualan dengan biaya historis tidak tersedia. Migration menyimpan ketidakpastian itu secara eksplisit; biaya historis tidak boleh direka.

### Pemetaan akun Wali — `20270102000000`

Migration hanya membuat tautan akun bagi profil Wali aktif yang terhubung ke tepat satu Wali aktif melalui relasi Santri yang aktif. Pemetaan ambigu dibiarkan belum tertaut. Setelah rehearsal, hitung jumlah tautan dan jumlah profil Wali yang belum dapat dipetakan per tenant; jangan mencocokkan hanya dari nama.

### Indeks direktori pengguna — `20270101000000`

Migration membangun indeks B-tree dan trigram biasa pada `profiles`; file migration sendiri memperingatkan bahwa `CREATE INDEX` biasa mengizinkan baca tetapi memblokir tulis pada tabel selama build. Untuk instalasi berskala besar, jadwalkan maintenance window dan ukur durasi/lock pada salinan berukuran representatif. Periksa ketersediaan `pg_trgm` dan schema extension. Jangan memindahkan perintah `CREATE INDEX CONCURRENTLY` ke dalam transaksi tanpa mendesain ulang cara migration dijalankan.

Selain direktori pengguna, beberapa migration lain membuat indeks pada tabel operasional dan ledger. Ukur waktu serta dampak lock setiap build indeks terhadap ukuran data realistis, termasuk indeks unik ISBN, ledger Koperasi, akun Wali, audit nilai LMS, dan riwayat kamar.

### Snapshot penempatan kamar saat cutover — `20270109000000`

Migration memasukkan satu snapshot bagi setiap Santri yang kini mempunyai `room_id` atau `building_id`. Ia tidak membuat riwayat perpindahan lama dan tidak mengarang aktor. Sebelum dan sesudah migration, bandingkan jumlah Santri yang memiliki penempatan dengan jumlah event `baseline_snapshot` per tenant; tinjau jumlah penempatan tanpa nama ruang/gedung yang cocok. Uji pemanggilan ulang pada salinan terisolasi untuk memastikan tidak menggandakan snapshot.

### Tagihan dan berkas kandidat PPDB Admin — `20270110000000`–`20270113000000`

- `20270110000000`: pastikan kandidat yang diterima tetap mengarah ke tagihan kandidat yang sama setelah `master_student_id` terisi; tagihan tidak boleh terduplikasi untuk pasangan kandidat/jenis pembayaran. Uji penerbitan dan penyelesaian tagihan pada tenant sintetis.
- `20270111000000` dan `20270113000000`: pastikan tabel audit akses/unggah memakai RLS `FORCE`, tidak memiliki grant browser, dan hanya menerima operasi service role yang dirutekan oleh backend. Bucket `ppdb-documents` harus tetap privat; uji bahwa pengguna `anon` dan `authenticated` tidak dapat membaca objek secara langsung.
- `20270112000000`: uji batch Admin 1–100 calon, atribusi actor/tenant, retry identik, konflik request ID, NIK/NISN/nomor pendaftaran yang bentrok, serta rollback seluruh batch bila satu baris gagal.
- Snapshot Firestore kanonis pada pemeriksaan 26 Oktober berisi 0 dokumen `financeBillings`. Jangan membuat tagihan atau ledger historis sintetis; bila sumber berubah, lakukan preview dan rekonsiliasi baru sebelum import.

### Konfigurasi CBT legacy — `20270114000000`

- Pastikan satu dokumen konfigurasi saja dipetakan ke tenant melalui `legacy_tenant_key`; jangan mengimpor konfigurasi ke tenant yang tidak cocok atau menyimpulkan pemetaan dari nama.
- Uji preview tanpa membocorkan nilai konfigurasi, retry dengan fingerprint identik, penolakan perubahan setelah impor, field asing, duplikasi label tanpa peka kapitalisasi, skor bukan angka, skor di luar rentang, dan presisi di atas dua angka desimal.
- Verifikasi nilai `autoGrading=false` ditahan sampai runtime Supabase mendukung penilaian manual. Konfigurasi yang berhasil diimpor hanya mengisi nilai bawaan form; soal CBT belum dapat diimpor karena koleksi `cbt_questions` tidak ditemukan dalam snapshot sumber.
- Pastikan tabel pengaturan memakai RLS `FORCE`, tidak memberi akses `anon`/`authenticated`, dan RPC hanya dapat dieksekusi `service_role`. Jalankan pgTAP pada Supabase lokal terisolasi; jangan menerapkan migration ke Production.
- CI run [40259337791](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40259337791) pada commit `bae87128cd3d04aa367b1f7f9ba967773858cd87` telah berhasil pada kedua job, termasuk migration dan pgTAP CBT di Supabase lokal. Rehearsal menggunakan salinan backup Production tetap belum dilakukan.

### Pencarian PPDB Admin — `20270115000000`

- Migration menambahkan indeks B-tree dan empat indeks trigram untuk pencarian nama, nomor pendaftaran, sekolah asal, dan telepon. Jadwalkan pembangunan indeks saat aktivitas tulis rendah dan ukur lock/durasi pada salinan berukuran representatif.
- Pastikan `pg_trgm` tersedia pada schema `extensions`; SQL memilih schema extension yang sebenarnya untuk operator class.
- Uji batas halaman maksimum 250, cursor keyset `(created_at, id)`, pencarian minimum 3 dan maksimum 100 karakter, escape `%`, `_`, dan `\`, filter tahap yang valid, serta isolasi tenant.
- RPC `list_admin_ppdb_candidates_page` berstatus `SECURITY INVOKER` dan hanya diberi grant ke `service_role`; pastikan endpoint server memverifikasi Admin aktif, tenant, serta izin PPDB sebelum memanggilnya.
- Migration menambahkan indeks biasa, bukan `CONCURRENTLY`; jangan jalankan pada Production sebelum dampak lock terhadap pendaftaran aktif diperkirakan dari rehearsal.

### Aset digital Perpustakaan privat — `20270116000000`

- Pastikan bucket `erp4-private-library-assets` tetap privat, pembatasan ukuran/MIME cocok dengan kontrak migration, metadata dan reservasi upload memakai RLS `FORCE`, dan browser tidak mendapat grant langsung ke tabel atau RPC.
- Sebelum mengaktifkan `SUPABASE_LIBRARY_DIGITAL_ASSETS_ENABLED`, uji pada salinan non-produksi: unggah PDF/EPUB/MP3/M4A yang valid; tolak ekstensi, MIME, tanda tangan berkas, ukuran, dan SHA-256 yang tidak cocok; pastikan berkas invalid dibuang dari Storage dan tidak menghasilkan metadata.
- Uji Admin/Ustadz yang memiliki izin, role tanpa izin, profil nonaktif, tenant berbeda, retry reservasi/finalisasi, serta konflik saat request ID yang sama dipakai untuk isi berkas berbeda. Pastikan API hanya mengeluarkan tautan unduh singkat dan tautan kedaluwarsa ditolak.
- Dengan flag mati, katalog dan peminjaman tetap harus bekerja tanpa membaca tabel aset yang belum dipasang. Aktifkan flag hanya setelah migration, pgTAP, serta uji Storage bertanda tangan di non-produksi lulus.
- CI run [40277948722](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40277948722) pada head kode `e13943ea77e79375e848d297150e95c9ce1ec8f5` lulus pada job frontend dan migrasi/pgTAP Supabase lokal. Check Supabase Preview dilewati; tidak ada bukti upgrade pada backup Production atau pengujian Storage lewat proyek pelanggan.
- Audit sumber tidak menemukan byte berkas Perpustakaan lama yang dapat dipulihkan. Migration ini tidak mengimpor metadata lama atau mengarang isi berkas.

## Pemeriksaan setelah migration

- Ledger staging cocok persis dengan semua file source pada commit yang direhearsal dan `preflight:db-migrations` menyatakan tidak ada migration tertunda.
- Tidak ada constraint gagal, foreign key yatim, perubahan jumlah yang tidak dijelaskan, atau tenant lintas batas.
- pgTAP dan suite integrasi lulus pada schema hasil upgrade, bukan hanya pada database kosong.
- API utama, login Admin/Wali, penyimpanan berkas, transaksi Koperasi/Keuangan, Tahfidz, dan riwayat asrama diuji dengan data sintetis tenant-scoped.
- Backup sebelum rehearsal berhasil dipulihkan lagi; ukur durasi restore dan simpan hasil agregat serta log yang sudah disanitasi.
- Rekam setiap penyimpangan dan koreksi dalam migration baru. Jangan mengedit migration yang sudah tercatat di environment mana pun.

## Keputusan rilis

Rehearsal sukses hanya membuktikan upgrade pada snapshot dan ukuran data yang diuji. Sebelum Production, pemilik operasi tetap harus menyetujui jendela pemeliharaan, backup/restore, rencana pemulihan, rekonsiliasi data, versi source, serta hasil UAT. Dokumen ini tidak mengotorisasi penerapan Production.
