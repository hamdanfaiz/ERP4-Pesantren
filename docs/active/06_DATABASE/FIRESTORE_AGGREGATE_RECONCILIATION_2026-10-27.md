# Rekonsiliasi agregat Firestore dan kunci PII — 27 Oktober 2026

## Ringkasan

Pemeriksaan baca-saja pada database Firestore kanonis menemukan **18 koleksi tingkat atas dan 561 dokumen**. Pemeriksaan dilakukan melalui Firestore REST dengan ADC yang telah diotorisasi. Daftar dokumen diminta menggunakan field mask untuk nama dokumen dan tenantId/tenant_id; nilai field, ID dokumen, dan isi record tidak dicatat ke output atau dokumen ini. Pemilik menyatakan data Firestore adalah dummy.

| Koleksi | Dokumen |
|---|---:|
| candidates | 50 |
| cbt_config | 1 |
| cooperative_inventory | 6 |
| cooperative_suppliers | 3 |
| cooperative_transactions | 3 |
| cooperative_wallets | 3 |
| entityRecords | 14 |
| library_books | 4 |
| library_circulations | 1 |
| library_digital_assets | 4 |
| lms_assessments | 1 |
| lms_categories | 1 |
| lms_courses | 2 |
| marketplace_orders | 5 |
| marketplace_products | 8 |
| master_data | 453 |
| tenants | 1 |
| users | 1 |
| **Total** | **561** |

## Cakupan tenant pada dokumen root

Di antara 561 dokumen root, hanya **1 dokumen** (di koleksi users) yang memiliki tenantId atau tenant_id; **560 dokumen tidak memilikinya**. Pemeriksaan menemukan satu nilai tenant unik dari field yang tersedia, tanpa mencatat nilainya. Tidak ditemukan field tenant malformed atau alias yang bertentangan.

Temuan ini tidak membuktikan bahwa seluruh record milik tenant tersebut. Dokumen tenants, kepemilikan record tenantless, dan relasi siswa–wali–kelas–kamar perlu dipetakan secara eksplisit saat pratinjau impor. Jangan menambahkan tenant secara massal hanya berdasarkan keberadaan satu tenant/user. Pemetaan dan keputusan apply harus tercatat per domain serta dapat direkonsiliasi dengan jumlah sumber. Pemeriksaan baca-saja pada Supabase staging menemukan satu tenant aktif dengan nama Pesantren Digital dan slug pesantren-digital. Ini mengonfirmasi tujuan yang disiapkan, tetapi belum membuktikan bahwa document ID/legacy key di Firestore cocok dengan legacy_tenant_key target; pencocokan itu masih wajib. Hitungan baca-saja pada candidates, guardians, dan students menunjukkan masing-masing 50 dari 50 record sudah memiliki tenant_id yang cocok dengan tenant tujuan, tanpa record tenantless pada ketiga tabel.

Audit ini hanya mencakup koleksi root dan alias field tersebut. Tidak ada isi PII, nilai bisnis, atau objek Firebase Storage yang dibaca. Snapshot inventaris terdahulu mencatat nol subkoleksi; keberadaan subkoleksi tidak dihitung ulang dalam pemeriksaan 27 Oktober.

## Kunci enkripsi/fingerprint PII

Kode server mengharuskan kedua nilai berupa **kunci acak independen, masing-masing 32 byte yang ditulis sebagai 64 karakter heksadesimal**:

- PII_ENCRYPTION_KEY: kunci AES-256-GCM untuk NIK/NISN terenkripsi.
- PII_FINGERPRINT_KEY: kunci HMAC untuk pencocokan duplikasi dan klaim identitas.

Pemeriksaan baca-saja pada Supabase staging ptsasgdvgrbdtgyqieie menemukan masing-masing **50 baris** pada candidates, guardians, dan students yang memiliki ciphertext identitas. Hitungan agregat per kolom menunjukkan semua 50 baris di tiap tabel memiliki seluruh ciphertext dan fingerprint yang relevan: NIK/NISN untuk candidates dan students, serta NIK untuk guardians. Pasangan kunci lokal sekarang sudah terisi pada file `.env` checkout aktif yang diabaikan Git, masing-masing berformat 64 karakter heksadesimal. Pasangan yang sama sebelumnya berhasil mendekripsi dan mencocokkan fingerprint satu baris staging tanpa mencetak nilai kunci atau PII. Ini belum membuktikan semua ciphertext dapat dibuka; jalankan pemeriksaan dekripsi menyeluruh/terkontrol sebelum go-live. Jangan membuat kunci baru atau merotasi pasangan ini tanpa re-enkripsi terencana atau reset fixture yang disetujui.

Sebelum mengisi .env, tim backend harus memilih salah satu jalur:

1. Mengambil pasangan kunci yang tepat dari secret manager yang digunakan saat ciphertext staging dibuat, lalu menyimpannya pada environment backend lokal/staging yang sesuai; atau
2. Bila pemilik staging memastikan data tersebut hanya fixture yang boleh dibuang, membuat keputusan reset eksplisit, menghapusnya melalui prosedur staging yang disetujui, lalu mengimpor ulang menggunakan kunci baru yang telah disimpan aman.

Jangan mengirim atau mencatat nilai kunci pada chat, issue, log, repository, image, atau variabel VITE_*. Jangan memakai kunci staging untuk Production. Setiap kunci harus dicadangkan di secret manager karena kehilangan kunci enkripsi berarti kehilangan kemampuan membuka ciphertext terkait.

## Gerbang migrasi

- Repository berisi 91 migration unik, dari 20260603000000 sampai 20270119000000; ledger staging yang dapat dibaca memuat 47 versi, sehingga 44 versi berikutnya belum tercatat. Ini bukan izin untuk menerapkan migration.
- Snapshot SQL staging: 119/119 tabel public memiliki RLS dan FORCE RLS; 114 tabel tidak memiliki policy langsung; 5 policy public dan 0 policy storage.objects; terdapat 2 bucket Storage. Akses modul melalui server privileged key tetap memerlukan pemeriksaan autentikasi, role, izin, tenant, dan validasi Storage pada setiap route.
- GitHub Actions run [40445868550](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40445868550) lulus pada kedua job untuk head PR 6453c4bb4f1ef8414d6d2042a34e54a98a94f8e3. Suite mencakup rehearsal dari batas ledger staging, build/Docker, migrasi lokal, pgTAP, auth/tenant, Storage, transaksi serentak, dan backup/restore dengan data sintetis. Hasil ini tidak membuktikan migrasi live, pemetaan tenant sumber, kecocokan kunci PII, login staging, atau UAT pelanggan.
- Tidak ada perubahan pada Firestore atau Supabase dalam pemeriksaan ini.

## Langkah tim backend

1. Simpan/temukan pasangan kunci PII yang dipakai untuk ciphertext staging; bila tidak ada, tentukan apakah fixture staging boleh di-reset sebelum membuat kunci baru.
2. Siapkan manifest pemetaan tenantless per koleksi dan relasi; jalankan importer dalam mode preview, rekonsiliasi hitungan, lalu minta persetujuan pemilik sebelum apply ke staging.
3. Ambil ledger, schema, grants, RLS, bucket, serta backup yang dapat dipulihkan dari target terkini. Rehearsal 44 migration yang tertinggal hanya pada salinan staging/restore terisolasi.
4. Uji dekripsi dan pencocokan fingerprint dengan kunci yang benar, login/matriks role-tenant, API, berkas, backup/restore, dan UAT sebelum menetapkan tanggal cutover.

Dokumen ini menambah bukti agregat pada [inventaris migrasi Firestore](FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md) dan [snapshot keamanan staging](STAGING_SECURITY_SNAPSHOT_2026-10-27.md). Tetap tidak ada perubahan Production dan PR #13 tetap Draft.


## Rekonsiliasi ID sumber-target — 27 Oktober 2026

Perbandingan baca-saja mengambil ID dokumen Firestore dan kategori Master Data, lalu membandingkannya di memori dengan `source_record_id` atau ID target pada tenant `pesantren-digital`. Hanya jumlah dan hasil cocok/tidak cocok dicatat; nilai ID, field bisnis, PII, dan secret tidak disimpan. Pemeriksaan ini tidak menulis ke Firestore atau Supabase.

| Sumber | Target | Jumlah sumber/target | ID sumber cocok | Kesimpulan |
|---|---|---:|---:|---|
| `candidates` | `candidates.source_record_id` | 50 / 50 | 50 | Cocok seluruhnya; batch PPDB mencatat source 50, imported 50, skipped 0. |
| `master_data` kategori Santri | `students.source_record_id` | 50 / 50 | 50 | ID cocok seluruhnya. |
| `master_data` kategori Wali Santri | `guardians.source_record_id` | 50 / 50 | 50 | ID cocok seluruhnya; 50 relasi wali–santri memiliki referensi valid di tenant. |
| `master_data` kategori Halaqah | `tahfidz_halaqahs.source_record_id` | 40 / 40 | 40 | ID cocok seluruhnya; keanggotaan halaqah target masih 0. |
| `master_data` kategori Gedung | `master_data_records.id` kategori Gedung | 15 / 15 | 0 | Hitungan sama, tetapi ID sumber tidak cocok dengan ID target; rekonsiliasi identitas/relasi tetap perlu. |
| `master_data` kategori Kamar | `master_data_records.id` kategori Kamar | 50 / 50 | 0 | Hitungan sama, tetapi ID sumber tidak cocok dengan ID target. |
| `master_data` kategori Kelas | `master_data_records.id` kategori Kelas | 30 / 30 | 0 | Hitungan sama, tetapi ID sumber tidak cocok dengan ID target. |

Jadi, 140 record Master Data memiliki kecocokan ID sumber langsung; 95 record Gedung/Kamar/Kelas hanya cocok pada jumlah, bukan identitas. Sebanyak 50 kandidat PPDB juga cocok ID-nya. Kesamaan jumlah bukan bukti bahwa nilai field, relasi, tenant mapping, atau riwayatnya identik.

Koleksi `entityRecords` berisi 14 ID yang tidak cocok dengan ID sumber pada tabel santri maupun wali target. Ini tidak membuktikan apakah record tersebut duplikat orang yang sama; jangan menggabungkannya tanpa pencocokan identitas yang aman. Dari 453 record `master_data`, kategori Active Role (3), Active Unit (10), Alumni (50), Asatidz (50), Guru (50), Kampus (5), dan Pegawai (50) berjumlah 218 dan belum memiliki rekonsiliasi target pada pemetaan ini. Hitungan target baca-saja menunjukkan `alumni_profiles` dan `hris_employees` masing-masing 0.

Sumber Koperasi berisi 6 inventaris, 3 pemasok, 3 transaksi, dan 3 dompet. Target memiliki 0 produk, 0 pemasok, 0 penjualan, tetapi 15 dompet tanpa kolom ID sumber; seluruh 15 terhubung ke santri target. Asal-usul selisih dompet belum diketahui dan tidak boleh dianggap sebagai hasil impor atau dihapus sebelum investigasi. Sumber Perpustakaan (4 buku, 1 sirkulasi), LMS (1 kategori, 2 kursus, 1 asesmen), dan Marketplace (8 produk, 5 pesanan) masing-masing belum memiliki baris pada tabel target yang dipetakan saat pemeriksaan. Sumber `cbt_config` memiliki 1 dokumen; `tenant_settings` target kosong, sedangkan `cbt_tenant_settings` menunggu migration source `20270114000000` yang belum tercatat di ledger.

GitHub Actions [run 40449890312](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40449890312) lulus pada kedua job untuk commit hitung ulang Firestore. Itu menguji aplikasi dan migrasi sintetis pada Supabase lokal, bukan memperbaiki selisih target live di tabel ini.

