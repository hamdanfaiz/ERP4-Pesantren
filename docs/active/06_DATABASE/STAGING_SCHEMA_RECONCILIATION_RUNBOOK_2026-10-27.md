# Runbook rekonsiliasi schema staging Supabase

**Tanggal:** 27 Oktober 2026  
**PR cutover:** [#13](https://github.com/hamdanfaiz/ERP4-Pesantren/pull/13)  
**Project staging:** `ptsasgdvgrbdtgyqieie`  
**Status akses pada audit:** katalog dan ledger dapat dibaca; MCP staging tidak menyediakan operasi tulis.

## Keputusan ruang lingkup

Pemilik memastikan data Firestore adalah data dummy dan **tidak perlu disalin ke Supabase**. Jangan menjalankan ekspor, importer, rekonsiliasi jumlah record, atau menghapus data staging demi menyamakan isi. Data contoh akan dibuat manual setelah alur aplikasi dan database stabil.

Fokus pekerjaan adalah source migration, relasi dan constraint tenant, izin, fungsi transaksi, idempotensi, serta alur API. Fixture CI/local bersifat sintetis dan bukan salinan Firestore.

## Temuan staging baca-saja

Snapshot katalog dan source PR #13 menunjukkan:

- Source PR #13 berisi **96 migration**, terakhir `20270124000000_finance_proof_upload_rate_limit.sql`.
- Ledger staging berisi **47 versi**, terakhir `20261206000000`; **49 versi source tidak tercatat**. Metadata migration `20261205000000` dan `20261206000000` juga kosong.
- Staging saat ini memiliki 119 tabel publik; 119/119 mengaktifkan dan memaksa RLS. Dari 118 tabel tenant, 118 mewajibkan `tenant_id`. Seluruh 243 FK antartabel tenant yang diperiksa memasangkan `tenant_id` pada kedua sisi.
- Pencocokan objek yang dideklarasikan dalam 49 migration yang belum tercatat menemukan **30 tabel belum ada** pada staging. Di antara 78 nama fungsi yang dibuat/diganti oleh migration tersebut, **43 nama belum ada**. Pemeriksaan nama fungsi tidak membuktikan bahwa 35 fungsi yang namanya ada memiliki signature atau definisi terbaru.
- Jadi, jumlah tabel dan RLS saat ini belum membuktikan staging memiliki keseluruhan runtime PR #13. Modul yang belum lengkap di staging mencakup beberapa tabel dan fungsi untuk Wali, riwayat kamar, Tahfidz, PPDB, Finance, LMS, dokumen, CRM, serta idempotensi transaksi.

### 30 tabel yang belum ada

`cbt_tenant_settings`, `cooperative_financial_import_batches`, `cooperative_financial_import_records`, `cooperative_supplier_mutation_requests`, `crm_contact_audit_events`, `crm_contacts`, `crm_interactions`, `crm_mutation_requests`, `document_attachment_upload_requests`, `document_attachments`, `document_records`, `document_workflow_events`, `donation_mutation_requests`, `guardian_account_invitations`, `guardian_user_accounts`, `hris_employee_import_batches`, `laundry_mutation_requests`, `library_book_import_batches`, `library_circulation_import_batches`, `library_digital_asset_upload_requests`, `library_digital_assets`, `lms_learning_record_requests`, `lms_submission_grade_events`, `lms_submission_requests`, `marketplace_mutation_requests`, `ppdb_candidate_creation_requests`, `ppdb_document_access_events`, `ppdb_document_upload_events`, `ppdb_document_upload_requests`, dan `student_room_assignment_history`.

Sebagian tabel terkait pencatatan importer lama. Kehadiran tabel atau fungsi importer tidak berarti importer harus dipanggil. Beberapa migration juga memuat fungsi runtime penting, sehingga nama file yang mengandung kata `import` saja tidak cukup untuk menentukan bahwa seluruh migration aman dilewati.

## Efek data yang perlu ditinjau sebelum penerapan

Migration berikut memiliki operasi tambahan terhadap data Supabase yang sudah ada. Ini bukan penyalinan data Firestore:

- `20261214000000_donation_mutation_payload_guard.sql` mengisi ledger request idempotensi dari audit Donation/Waqf.
- `20261215000000_laundry_mutation_payload_guard.sql` mengisi ledger request dari event Laundry.
- `20261231000000_cooperative_supplier_payload_idempotency.sql` mereservasi request ID yang sudah tersimpan pada pemasok.
- `20270102000000_guardian_accounts_and_invitations.sql` menautkan profil Wali ke data Wali yang cocok secara unik dan aktif.
- `20270109000000_boarding_room_history_baseline.sql` memanggil fungsi yang membuat snapshot baseline dari penempatan kamar/gedung santri yang sudah ada.
- `20270116000000_private_library_digital_assets.sql` dan `20270117000000_document_center_core.sql` membuat atau memperbarui konfigurasi bucket Storage privat.

Jangan menerapkan migration ini pada staging hanya karena CI lokal lulus. Tim harus meninjau efeknya terhadap isi staging yang sekarang, mengambil backup yang dapat dipulihkan, lalu merehearsal di salinan/environment uji.

## Urutan tindakan untuk tim backend

1. **Pastikan target.** Jalankan semua perintah dari checkout PR #13 yang benar dan pastikan ref `ptsasgdvgrbdtgyqieie` adalah staging. Jangan gunakan project produksi.
2. **Simpan pemulihan.** Ambil backup yang dapat dipulihkan untuk database dan konfigurasi Storage; lakukan verifikasi restore di environment uji. Jangan menjalankan reset remote.
3. **Bandingkan versi.** Dengan Supabase CLI yang sudah terautentikasi dan proyek tertaut, jalankan:
   ```powershell
   supabase migration list
   ```
   Output membandingkan timestamp migration lokal dan remote. Ia tidak membuktikan bahwa DDL objek yang dicatat sudah sama dengan source.
4. **Tinjau dry-run.** Jalankan:
   ```powershell
   supabase db push --dry-run
   ```
   Periksa seluruh migration yang akan dijalankan dan efek DDL/backfill. Dry-run adalah pratinjau urutan yang akan diterapkan; ia bukan bukti bahwa semua migration aman pada schema yang mungkin berubah manual.
5. **Rekonsiliasi schema sebelum menulis.** Bandingkan tabel, kolom, constraint, index, trigger, policy, grant, signature dan definisi fungsi, serta bucket/policy Storage dengan efek setiap migration. Jangan menandai seluruh 49 versi sebagai applied untuk membuat angka ledger cocok.
6. **Rehearsal schema-only.** Terapkan migration pada database lokal/branch uji yang dapat dibuang atau dipulihkan, jalankan pgTAP dan API auth/tenant dari CI, lalu cocokkan schema hasil dengan source. CI terbaru lulus dengan fixture sintetis dan menguji upgrade dari ledger batas secara lokal; itu belum menggantikan rehearsal pada staging.
7. **Terapkan hanya setelah review.** Bila tim menyetujui schema dan efek backfill, terapkan migration secara berurutan di staging dengan backup tersedia, lalu audit ulang tabel, function definitions, RLS/grants, Storage, dan smoke test. Jangan menyalakan importer legacy.
8. **Buat data uji baru.** Setelah runtime siap, buat data dummy baru lewat alur UI/API normal, bukan dari Firestore.

### Batas penggunaan `migration repair`

Gunakan `supabase migration repair --status applied <timestamp>` **hanya** jika tim telah membuktikan migration itu sudah diterapkan lengkap secara manual dan seluruh hasil schema cocok dengan migration source. Perintah ini hanya mengubah ledger, bukan menjalankan SQL. Jika dipakai untuk menutupi migration yang objeknya belum ada, staging akan tampak sinkron tetapi runtime tetap rusak.

Jangan menjalankan `supabase db reset --linked`; perintah tersebut menghapus schema remote dan membangunnya ulang. Jangan menggunakan `--include-seed` pada staging yang berisi data yang ingin dipertahankan.

## Referensi CLI

- [Alur kerja development lokal Supabase](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Referensi `supabase db push` dan `--dry-run`](https://supabase.com/docs/reference/cli/supabase-db-push)
- [Referensi `supabase migration list`](https://supabase.com/docs/reference/cli/supabase-migration-list)

## Gate yang masih terbuka

- 49 versi migration belum tercatat pada ledger staging, dan ada dua metadata migration kosong.
- 30 tabel yang dideklarasikan migration tersebut belum ada di staging; 43 dari 78 nama fungsi juga belum ada.
- Schema diff dan definisi fungsi secara penuh belum diperoleh melalui akses MCP saat ini.
- Migration backfill/Storage perlu rehearsal dan persetujuan tim sebelum diterapkan.
- Login live, matriks role/tenant, Storage, UAT lintas modul, backup/restore, dan environment VPS/on-prem belum seluruhnya dibuktikan di staging.

Tidak ada data Firestore yang disalin dan tidak ada perubahan database staging yang dilakukan dalam audit ini.
