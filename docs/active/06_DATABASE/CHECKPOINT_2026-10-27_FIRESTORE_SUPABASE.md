# Checkpoint Migrasi Firestore → Supabase — 27 Oktober 2026

Dokumen ini mencatat pemeriksaan baca-saja terbaru atas sumber Firestore kanonis dan target Supabase staging. Tidak ada payload identitas atau kredensial yang dicatat.

## Status cutover

- Firestore kanonis `graphite-ship-q5xj8 / ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8` masih menyimpan 18 koleksi root dan 561 dokumen.
- Supabase target `ptsasgdvgrbdtgyqieie` memiliki 47 versi migration pada ledger, terakhir `20261206000000`. Branch sumber PR #13 memiliki 91 file migration sampai `20270119000000`; 44 versi belum tercatat pada target.
- PR #13 masih Open/Draft pada head `360c22ef1e020881d7bb9836a774aed33de8f857`. `main` belum berpindah dari runtime Firebase.
- Koneksi MCP Supabase dengan izin tulis belum terautentikasi. Pemeriksaan target dalam checkpoint ini menggunakan konektor baca-saja. Tidak ada migration, data, atau feature flag yang ditulis.

## Rekonsiliasi jumlah data

Firestore dihitung ulang melalui `listCollectionIds` dan agregasi count tanpa mengambil payload dokumen:

| Koleksi | Jumlah | Koleksi | Jumlah |
|---|---:|---|---:|
| `candidates` | 50 | `cbt_config` | 1 |
| `cooperative_inventory` | 6 | `cooperative_suppliers` | 3 |
| `cooperative_transactions` | 3 | `cooperative_wallets` | 3 |
| `entityRecords` | 14 | `library_books` | 4 |
| `library_circulations` | 1 | `library_digital_assets` | 4 |
| `lms_assessments` | 1 | `lms_categories` | 1 |
| `lms_courses` | 2 | `marketplace_orders` | 5 |
| `marketplace_products` | 8 | `master_data` | 453 |
| `tenants` | 1 | `users` | 1 |
| **Total** | **561** | **Koleksi root** | **18** |

Target staging memiliki row pada tabel berikut:

| Tabel tujuan | Baris |
|---|---:|
| `candidates` | 50 |
| `candidate_documents` | 50 |
| `master_data_records` | 95 |
| `students` | 50 |
| `guardians` | 50 |
| `guardian_students` | 50 |
| `tahfidz_halaqahs` | 40 |
| `profiles` / `tenants` | 1 / 1 |
| `cooperative_wallets` | 15 |

`master_data_records` + `students` + `guardians` + `tahfidz_halaqahs` membentuk 235 tujuan dari 453 dokumen `master_data`; bersama 50 kandidat, sekitar 285 dari 561 dokumen sumber (51%) sudah memiliki landing terstruktur yang cocok. Ini ukuran cakupan hitungan, bukan bukti ekuivalensi atau kelengkapan data setiap modul. Sekitar 276 dokumen root belum memiliki hasil migrasi terstruktur yang direkonsiliasi. Row wallet staging tidak dihitung sebagai hasil impor wallet legacy.

## Tenant

ID registry Firestore `tenants` yang dibaca adalah `pesantren-digital`. Query baca-saja Supabase membuktikan `public.tenants.legacy_tenant_key` sama dengan ID tersebut untuk tenant slug yang sama. Ini menutup mismatch mapping yang tercatat pada checkpoint sebelumnya, tetapi belum membuktikan setiap record legacy aman untuk diterapkan.

## Pekerjaan data yang masih tertahan

- 218 dokumen `master_data` di luar struktur, santri, wali, dan halaqah yang sudah memiliki row target masih memerlukan pemetaan per kategori. Relasi Alumni tidak boleh dicocokkan dari email saja.
- Koleksi `entityRecords` berisi record Santri/Wali yang dapat tumpang tindih dengan `master_data`; jangan menggandakan tanpa ID relasi yang tervalidasi.
- Data Koperasi memerlukan rekonsiliasi produk, dompet, saldo, transaksi, dan ledger. Jangan menyalin saldo sebagai saldo operasional tanpa jurnal pembuka yang cocok.
- Koleksi sirkulasi Perpustakaan memiliki peminjam berbentuk teks tanpa kunci Santri terverifikasi. Empat dokumen `library_digital_assets` adalah metadata; keberadaan byte sumber belum dibuktikan.
- Data LMS membutuhkan pemetaan instruktur ke profil Supabase yang aktif. Produk/pesanan Marketplace pada snapshot sebelumnya teridentifikasi sebagai seed browser dan harus ditinjau sebelum diperlakukan sebagai transaksi.
- `cbt_config` memiliki importer bertahap; bank soal `cbt_questions` tidak terlihat pada database kanonis. Database Firestore lain yang memuatnya belum disetujui sebagai sumber.
- Kredensial dan sesi Firebase tidak dimigrasikan. Akun harus diprovisikan kembali melalui Supabase Auth; profil saja bukan bukti akun login aktif.

Record yang belum dapat dipetakan harus masuk karantina/arsip tenant-scoped atau ditahan dengan alasan yang tercatat; jangan membuat nilai pengganti untuk menyatakan semua 561 record berhasil.

## Urutan tindakan berikutnya

1. Selesaikan autentikasi MCP Supabase project-scoped agar pemeriksaan dan tindakan tulis dapat dilakukan pada target yang benar.
2. Ambil backup target staging yang dapat dipulihkan sebelum perubahan DDL/data. Paket Free tidak menyediakan backup project terjadwal menurut pemeriksaan dashboard sebelumnya.
3. Tinjau dan jalankan migration tertinggal secara bertahap pada staging; jangan melakukan `migration repair` atau `db push` tanpa preflight lineage dan hasil pemulihan.
4. Jalankan preview aktual setiap importer, tinjau jumlah, fingerprint, konflik, identitas dan relasi; apply hanya batch yang lolos.
5. Reconcile semua kategori sumber, audit RLS/tenant, uji login dan modul, lalu cutover runtime. Pertahankan Firestore sampai rollback dan rekonsiliasi selesai; setelah itu pensiunkan jalur Firebase.

**Kesimpulan checkpoint:** sumber Firestore belum dipensiunkan dan migrasi belum lengkap. Tidak ada data yang dihapus.