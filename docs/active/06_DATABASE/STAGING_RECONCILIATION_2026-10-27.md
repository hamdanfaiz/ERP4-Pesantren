# Rekonsiliasi staging Supabase dan data legacy — 27 Oktober 2026

## Cakupan dan batas pemeriksaan

Pemeriksaan ini menggunakan konektor Supabase staging dengan query baca-saja. Tidak ada migration, data, policy, bucket, atau feature flag yang diubah. Tidak ada isi PII atau nilai secret yang dicatat.

- Target staging: `ptsasgdvgrbdtgyqieie`.
- Tenant aktif: `pesantren-digital`.
- Source Firestore: inventaris terakhir yang tercatat pada 26 Oktober 2026, yaitu 18 koleksi root dan 561 dokumen. Hitungan source pada dokumen [inventaris migrasi Firestore](FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md) belum dihitung ulang dalam pemeriksaan ini.
- Checkout yang digunakan untuk pemeriksaan lokal: branch `codex/master-data-student-search-20261026`, commit `b71ee0c`, dengan perubahan lokal belum di-commit. Hasil lokalnya bukan bukti bahwa PR #13 pada head GitHub yang berbeda memiliki isi byte-identik.

## Rekonsiliasi migration

| Ukuran | Hasil baca-saja |
| --- | ---: |
| File migration di checkout | 91 |
| Versi pada ledger staging | 47 |
| Versi terakhir pada ledger staging | `20261206000000` |
| Versi terakhir di checkout | `20270119000000` |
| Versi lokal yang belum tercatat di ledger | 44 |

44 versi yang belum tercatat berada setelah `20261206000000`, dimulai `20261207000000` dan berakhir `20270119000000`. Daftar ini **bukan instruksi untuk menerapkan migration**. Ledger tidak membuktikan keadaan lengkap schema, grant, policy, trigger, atau data. Rekonsiliasi schema dan rehearsal pada backup yang dapat dipulihkan tetap wajib sebelum apply.

## Baseline keamanan staging

- Ada 119 tabel `public`; seluruh 119 mengaktifkan RLS dan `FORCE ROW LEVEL SECURITY`.
- Ada lima policy `SELECT`: `candidate_documents` dan `candidates` dibatasi tenant aktif, Admin, serta izin PPDB; `profiles` membatasi profil sendiri atau Admin tenant dengan izin pengguna; `tenants` membatasi tenant aktif; `user_profiles` membatasi UID sendiri.
- Pemeriksaan privilege pada empat tabel perwakilan menunjukkan `anon` tidak punya hak baca/tulis; `authenticated` hanya punya hak `SELECT` pada tabel yang dipakai policy dan tidak punya hak tulis; `service_role` punya CRUD. Karena backend memakai role istimewa, setiap endpoint tetap harus memverifikasi token, status profil, tenant, role, dan permission sebelum query.
- Ada dua bucket Storage (`ppdb-documents`, `erp4-private-finance-proofs`); keduanya privat dan saat diperiksa belum memiliki policy pada `storage.objects`. Akses file harus melalui route backend yang terotorisasi sampai policy Storage teruji.

## Data legacy yang terverifikasi pada staging

Hitungan berikut berasal dari tabel tenant `pesantren-digital`; query hanya mengembalikan agregat.

| Domain | Target saat diperiksa |
| --- | ---: |
| Gedung / Kamar / Kelas | 15 / 50 / 30 |
| Santri legacy | 50 |
| Santri dengan NIK dan NISN terenkripsi serta fingerprint | 50 / 50 |
| Santri dengan NIS | 0 |
| Wali legacy dengan NIK terlindungi | 50 |
| Relasi wali–santri | 50 |
| Halaqah legacy | 40 |
| Keanggotaan halaqah hasil impor legacy | 0 |
| Kandidat PPDB dengan ID sumber | 50 |

Pasangan `PII_ENCRYPTION_KEY` dan `PII_FINGERPRINT_KEY` pada `.env` lokal yang diabaikan Git telah diuji terhadap ciphertext dan fingerprint satu record staging tanpa menampilkan nilai identitas atau kunci. Kedua kunci sekarang tersedia pada `.env` checkout aktif. Simpan salinannya hanya pada secret manager backend untuk environment yang memakai data tersebut; jangan commit atau menaruhnya di variabel frontend.

## Status source-to-target berdasarkan inventaris terakhir

Inventaris source yang tercatat menghitung 453 dokumen `master_data`, 50 kandidat PPDB, dan 58 dokumen pada koleksi root lain. Catatan impor sebelumnya mengidentifikasi 235 dari 453 dokumen `master_data` dan 50 kandidat sebagai record yang telah diterapkan; total yang tercakup 285 dari 561 dokumen, sehingga 276 masih belum tercakup atau belum layak diterapkan. Hitungan target saat ini mengonfirmasi jumlah inti di tabel Supabase, tetapi tidak menggantikan fingerprint-per-record dan rekonsiliasi ulang terhadap snapshot Firestore terbaru.

Temuan yang memerlukan keputusan data, bukan tebakan importer:

1. Sumber Santri tidak menyediakan NIS. Jangan membuat NIS atau reservasi secara otomatis; tetapkan kebijakan penomoran lalu jalankan alur reservasi transaksional.
2. Kamar/Gedung belum memiliki relasi induk dan pembatasan gender yang terverifikasi; penempatan asrama harus ditahan sampai Admin merekonsiliasi struktur.
3. Halaqah belum memiliki ustadz, jadwal, target yang disahkan, atau keanggotaan santri; 40 data saat ini masih data legacy provisional.
4. Data Alumni tidak aman dipasangkan ke Santri melalui email saja. Minta pemetaan dan tanggal kelulusan yang diverifikasi.
5. Kandidat PPDB sudah memiliki 50 ID sumber dan PII terlindungi, tetapi pemeriksaan ini hanya mengonfirmasi agregat, bukan rekonsiliasi isi per baris.
6. Berkas Storage lama belum terbukti dapat dipulihkan; metadata koleksi bukan pengganti byte file.

Rincian kategori dan jalur impor lain tercatat pada [checkpoint Master Data](MASTER_DATA_LEGACY_IMPORT_CHECKPOINT.md) dan [inventaris migrasi](FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md). Preview atau keberadaan importer tidak membuktikan data sudah diterapkan.

## Gerbang yang masih terbuka

1. Tim backend membandingkan keseluruhan schema, indeks, constraint, fungsi, grant, RLS, Storage, dan ledger pada target dengan source migration.
2. Siapkan baseline staging yang dapat dipulihkan dari backup dan jalankan rehearsal upgrade di environment non-production. Project target berada pada paket Free; jangan menganggap backup terjadwal tersedia.
3. Hitung ulang Firestore, buat fingerprint snapshot, dan jalankan preview per domain. Cocokkan setiap relasi dan data sensitif; pertahankan seed/fixture, akun Auth, transaksi, dan byte file sebagai kategori terpisah.
4. Terapkan hanya domain yang lolos preview, dengan batch atomik dan hitungan sebelum/sesudah. Rekonsiliasi duplikasi, tenant, status, serta total keuangan.
5. Uji end-to-end Supabase Auth, matriks role/tenant, API server, PPDB publik, upload/download berkas, NIS serentak, laporan, backup/restore, dan responsif pada staging representatif.
6. Rotasi secret key/password database yang pernah dibagikan sebelum go-live. Siapkan secret manager, observabilitas, prosedur rollback, dan dokumentasi instalasi pelanggan.

**Keputusan saat ini:** staging memiliki pondasi schema dengan RLS ketat dan sebagian data legacy sudah terimpor. ERP belum terbukti sepenuhnya lepas dari Firebase, belum seluruh 561 dokumen direkonsiliasi, dan belum siap go-live. Jangan menerapkan 44 migration hanya berdasarkan selisih ledger.

