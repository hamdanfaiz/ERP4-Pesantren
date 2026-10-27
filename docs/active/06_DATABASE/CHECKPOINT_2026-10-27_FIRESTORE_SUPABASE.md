> **STATUS TERKINI — 27 Oktober 2026:** Dokumen ini memuat pemeriksaan historis dan telah disupersede untuk tindakan saat ini. Pemilik memutuskan data Firestore dummy **tidak perlu disalin**; jangan jalankan importer, rekonsiliasi jumlah, atau penghapusan data staging sebagai release gate. Ikuti [checkpoint schema dan logic tanpa salin data](./CHECKPOINT_NO_DATA_COPY_SCHEMA_READINESS_2026-10-27.md) untuk status PR/head, angka migration terbaru, kriteria relasi tenant, dan langkah berikutnya.

# Checkpoint Migrasi Firestore → Supabase — 27 Oktober 2026

Dokumen ini mencatat pemeriksaan baca-saja terbaru atas sumber Firestore kanonis dan target Supabase staging. Tidak ada payload identitas atau kredensial yang dicatat.

> **Keputusan ruang lingkup 27 Oktober:** seluruh data Firestore ini dummy dan tidak perlu dipindahkan. Tabel hitungan/coverage berikut bersifat historis, bukan target migrasi atau release gate. Fokusnya adalah relasi dan perilaku aplikasi Supabase menggunakan database lokal serta fixture sintetis; pemilik dapat memasukkan data contoh manual nanti. Tidak ada impor atau penghapusan data staging yang diminta.

## Status cutover

- Firestore kanonis `graphite-ship-q5xj8 / ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8` masih menyimpan 18 koleksi root dan 561 dokumen.
- Supabase target `ptsasgdvgrbdtgyqieie` memiliki 47 versi migration pada ledger, terakhir `20261206000000`. Head PR #13 yang diverifikasi saat ini (`540bf7d45e36b4f6cda09ef026c7bd4ae080f74e`) memiliki 92 file migration sampai `20270120000000`; 45 versi belum tercatat pada target.
- PR #13 masih Open/Draft pada head `540bf7d45e36b4f6cda09ef026c7bd4ae080f74e`; GitHub Actions run [40454742884](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40454742884) lulus di database lokal sintetis. `main` belum berpindah dari runtime Firebase.
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

## Catatan arsip historis — bukan gerbang kelengkapan produk

- 218 dokumen `master_data` di luar struktur, santri, wali, dan halaqah yang sudah memiliki row target masih memerlukan pemetaan per kategori. Relasi Alumni tidak boleh dicocokkan dari email saja.
- Koleksi `entityRecords` berisi record Santri/Wali yang dapat tumpang tindih dengan `master_data`; jangan menggandakan tanpa ID relasi yang tervalidasi.
- Data Koperasi memerlukan rekonsiliasi produk, dompet, saldo, transaksi, dan ledger. Jangan menyalin saldo sebagai saldo operasional tanpa jurnal pembuka yang cocok.
- Koleksi sirkulasi Perpustakaan memiliki peminjam berbentuk teks tanpa kunci Santri terverifikasi. Empat dokumen `library_digital_assets` adalah metadata; keberadaan byte sumber belum dibuktikan.
- Data LMS membutuhkan pemetaan instruktur ke profil Supabase yang aktif. Produk/pesanan Marketplace pada snapshot sebelumnya teridentifikasi sebagai seed browser dan harus ditinjau sebelum diperlakukan sebagai transaksi.
- `cbt_config` memiliki importer bertahap; bank soal `cbt_questions` tidak terlihat pada database kanonis. Database Firestore lain yang memuatnya belum disetujui sebagai sumber.
- Kredensial dan sesi Firebase tidak dimigrasikan. Akun harus diprovisikan kembali melalui Supabase Auth; profil saja bukan bukti akun login aktif.

Catatan konflik dan record yang belum dapat dipetakan tetap berguna sebagai jejak audit, tetapi tidak perlu dimasukkan ke Supabase karena pemilik produk memutuskan tidak menyalin data dummy.

## Urutan tindakan berikutnya

1. Selesaikan autentikasi MCP Supabase project-scoped agar pemeriksaan dan tindakan tulis dapat dilakukan pada target yang benar.
2. Ambil backup target staging yang dapat dipulihkan sebelum perubahan DDL/data. Paket Free tidak menyediakan backup project terjadwal menurut pemeriksaan dashboard sebelumnya.
3. Tinjau dan jalankan migration tertinggal secara bertahap pada staging; jangan melakukan `migration repair` atau `db push` tanpa preflight lineage dan hasil pemulihan.
4. Validasi relasi dan transaksi dengan fixture sintetis yang dapat diulang; jangan jalankan importer pada Firestore untuk menyalin data.
5. Audit RLS/tenant, uji login serta modul dengan role yang sesuai, dan pastikan runtime tidak memakai Firebase. Data dummy dapat dibuat manual setelah fungsi stabil.

**Kesimpulan checkpoint:** perpindahan runtime ke Supabase tetap menjadi sasaran; salinan data Firestore tidak diperlukan. Skema Supabase, migrasi yang belum tercatat, login/UAT, dan penghentian ketergantungan runtime Firebase tetap harus diverifikasi. Tidak ada data yang dihapus.
