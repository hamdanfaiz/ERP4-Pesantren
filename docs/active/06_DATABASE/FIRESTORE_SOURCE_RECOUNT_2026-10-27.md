# Hitung ulang sumber Firestore kanonis — 27 Oktober 2026

## Metode dan batas pemeriksaan

- Project: `graphite-ship-q5xj8`.
- Database kanonis ERP4: `ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`, sesuai konfigurasi aplikasi.
- ADC yang telah disetujui digunakan hanya untuk permintaan baca Firestore REST.
- Pemeriksaan mencantumkan database yang tersedia, ID koleksi root, dan nama dokumen melalui field mask `__name__`; isi dokumen, nilai PII, dan kredensial tidak dicatat atau disimpan.
- Tidak ada write ke Firestore/Supabase, ekspor payload, perubahan schema, atau apply migration.

Project memuat sembilan database Firestore. Pemeriksaan count dibatasi pada database ERP4 yang ditunjuk konfigurasi, bukan database lain di project.

## Hasil

Ditemukan **18 koleksi root dengan 561 dokumen**. Hitungan ini sama dengan inventaris tanggal 23 Oktober 2026.

| Koleksi root | Dokumen |
| --- | ---: |
| `candidates` | 50 |
| `cbt_config` | 1 |
| `cooperative_inventory` | 6 |
| `cooperative_suppliers` | 3 |
| `cooperative_transactions` | 3 |
| `cooperative_wallets` | 3 |
| `entityRecords` | 14 |
| `library_books` | 4 |
| `library_circulations` | 1 |
| `library_digital_assets` | 4 |
| `lms_assessments` | 1 |
| `lms_categories` | 1 |
| `lms_courses` | 2 |
| `marketplace_orders` | 5 |
| `marketplace_products` | 8 |
| `master_data` | 453 |
| `tenants` | 1 |
| `users` | 1 |
| **Total** | **561** |

Pemeriksaan ini hanya menghitung dokumen root. Inventaris 23 Oktober sebelumnya mencatat pemeriksaan `listCollectionIds` pada 561 dokumen root dan tidak menemukan subkoleksi. Hitung ulang kali ini tidak mengulang pemeriksaan subkoleksi.

## Implikasi migrasi

- **561 dokumen adalah jumlah sumber**, bukan jumlah yang sudah berhasil dimigrasikan.
- Dokumen sebelumnya mencatat 285 record sebagai cakupan impor historis; angka target tersebut perlu direkonsiliasi ulang per ID sumber terhadap database Supabase saat ini.
- Snapshot root ini tidak memeriksa perubahan isi sejak inventaris sebelumnya. Sebelum apply, buat snapshot konsisten dan preview per domain dengan pemetaan tenant/relasi serta fingerprint yang tidak membuka PII.
- Jangan mengimpor kata sandi atau sesi dari koleksi `users`. Jangan mengarang detail item Marketplace, transaksi, NIS, relasi santri, atau byte berkas yang tidak ada/terverifikasi di sumber.
- Terapkan hanya koleksi/domain yang lolos rekonsiliasi target, uji tenant, dan jalur rollback yang dapat dipulihkan.

## Status

Hasil ini memperbarui bukti jumlah koleksi sumber. Ia tidak mengubah status bahwa target Supabase belum selesai direkonsiliasi, data belum dibuktikan lengkap, dan PR cutover belum siap merge/go-live.