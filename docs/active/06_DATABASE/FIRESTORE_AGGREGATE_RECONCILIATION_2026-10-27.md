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

Pemeriksaan baca-saja pada Supabase staging ptsasgdvgrbdtgyqieie menemukan masing-masing **50 baris** pada candidates, guardians, dan students yang memiliki ciphertext identitas. Hitungan agregat per kolom menunjukkan semua 50 baris di tiap tabel memiliki seluruh ciphertext dan fingerprint yang relevan: NIK/NISN untuk candidates dan students, serta NIK untuk guardians. Karena nilai kunci lokal di .env masih kosong, **jangan membuat/memasang kunci acak baru ke lingkungan yang membaca baris-baris tersebut**: ciphertext lama tidak dapat didekripsi dengan kunci lain, dan fingerprint lama tidak akan cocok dengan fingerprint baru.

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
