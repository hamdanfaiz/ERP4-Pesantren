# Checklist rehearsal migrasi Supabase Production — 26 Oktober 2026

## Tujuan dan batas

Ledger Production dibaca ulang secara baca-saja: 47 migration tercatat sampai `20261206000000`, sedangkan source PR #13 pada head `91f71708ac3461b505255fbfe281d92a102f7328` memiliki 85 file sampai `20270113000000`. Sebanyak 38 migration berikutnya harus direhearsal pada environment terisolasi sebelum rencana upgrade Production dibuat.

Dokumen ini adalah rencana pemeriksaan berbasis source. Tidak ada query data operasional Production, migrasi, atau perubahan database yang dijalankan untuk menyusunnya. Lulusnya CI pada database kosong tidak menggantikan rehearsal menggunakan salinan backup yang representatif.

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

## Pemeriksaan setelah migration

- Ledger staging cocok persis dengan semua 85 file source dan `preflight:db-migrations` menyatakan tidak ada migration tertunda.
- Tidak ada constraint gagal, foreign key yatim, perubahan jumlah yang tidak dijelaskan, atau tenant lintas batas.
- pgTAP dan suite integrasi lulus pada schema hasil upgrade, bukan hanya pada database kosong.
- API utama, login Admin/Wali, penyimpanan berkas, transaksi Koperasi/Keuangan, Tahfidz, dan riwayat asrama diuji dengan data sintetis tenant-scoped.
- Backup sebelum rehearsal berhasil dipulihkan lagi; ukur durasi restore dan simpan hasil agregat serta log yang sudah disanitasi.
- Rekam setiap penyimpangan dan koreksi dalam migration baru. Jangan mengedit migration yang sudah tercatat di environment mana pun.

## Keputusan rilis

Rehearsal sukses hanya membuktikan upgrade pada snapshot dan ukuran data yang diuji. Sebelum Production, pemilik operasi tetap harus menyetujui jendela pemeliharaan, backup/restore, rencana pemulihan, rekonsiliasi data, versi source, serta hasil UAT. Dokumen ini tidak mengotorisasi penerapan Production.
