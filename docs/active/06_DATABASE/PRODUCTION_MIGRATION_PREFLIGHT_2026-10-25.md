# Preflight Migrasi Produksi Supabase — 25 Oktober 2026

## Cakupan dan batas

Pemeriksaan ini bersifat baca-saja untuk project Supabase `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`. Tidak ada migrasi, impor, perubahan aturan, atau penulisan data yang dijalankan. Semua angka di bawah adalah hitungan agregat; tidak berisi identitas atau payload pengguna.

Sumber kode yang ditinjau adalah PR #13, branch `codex/supabase-runtime-cutover-20261022`, head `18be5a983262783284dfb309a76205dc300ecc97`. PR masih Open/Draft dan belum siap merge atau deploy.

## Riwayat migrasi live

Query baca-saja pada `supabase_migrations.schema_migrations` menghasilkan:

- 47 migrasi tercatat.
- Versi pertama: `20260603000000`.
- Versi terbaru: `20261206000000`.
- Tidak ada versi `20261207000000` atau setelahnya di database.
- Branch PR berisi 26 migration file sesudah versi live tersebut, dari `20261207000000` sampai `20270101000000`.

### File yang masih pending

| Versi | File |
| --- | --- |
| 20261207000000 | `library_legacy_catalog_import.sql` |
| 20261208000000 | `hris_legacy_employees_import.sql` |
| 20261209000000 | `cooperative_tenant_business_day.sql` |
| 20261210000000 | `cooperative_supplier_import_status.sql` |
| 20261211000000 | `library_circulation_legacy_import.sql` |
| 20261212000000 | `cooperative_sale_idempotency_wallet.sql` |
| 20261213000000 | `marketplace_mutation_payload_guard.sql` |
| 20261214000000 | `donation_mutation_payload_guard.sql` |
| 20261215000000 | `laundry_mutation_payload_guard.sql` |
| 20261216000000 | `tahfidz_session_result_integrity.sql` |
| 20261217000000 | `tahfidz_target_tenant_business_date.sql` |
| 20261218000000 | `cbt_server_authoritative_deadline.sql` |
| 20261219000000 | `academic_request_idempotency_guard.sql` |
| 20261220000000 | `inventory_adjustment_payload_guard.sql` |
| 20261221000000 | `healthcare_request_idempotency_guard.sql` |
| 20261222000000 | `ga_inventory_event_payload_guard.sql` |
| 20261223000000 | `cbt_request_payload_guard.sql` |
| 20261224000000 | `lms_request_payload_guard.sql` |
| 20261225000000 | `lms_submission_grade_integrity.sql` |
| 20261226000000 | `lms_learning_record_integrity.sql` |
| 20261227000000 | `lms_progress_integrity.sql` |
| 20261228000000 | `boarding_attendance_active_students.sql` |
| 20261229000000 | `boarding_attendance_retry_after_status_change.sql` |
| 20261230000000 | `cooperative_financial_legacy_import.sql` |
| 20261231000000 | `cooperative_supplier_payload_idempotency.sql` |
| 20270101000000 | `profiles_user_directory_indexes.sql` |

## Hasil preflight data yang diperiksa

Semua pemeriksaan di bawah menghasilkan 0 temuan pada saat query dijalankan:

- Duplikasi ISBN setelah normalisasi untuk unique index katalog Perpustakaan.
- Sesi ujian Tahfidz berstatus selesai tanpa nilai dan hasil yang valid.
- Baris ledger dompet yang melanggar batas tipe/tanda entry yang akan diberlakukan.
- Benturan `client_request_id` lintas record Marketplace dan event Donasi yang akan di-backfill ke ledger idempotensi.
- ID request atau actor yang kosong pada record/event Marketplace, Donasi, Laundry, serta pemasok Koperasi yang menjadi sumber backfill.

Snapshot agregat terkait:

| Data live | Jumlah |
| --- | ---: |
| Produk Koperasi | 0 |
| Pemasok Koperasi | 0 |
| Dompet Koperasi | 15 |
| Dompet dengan saldo bukan nol | 0 |
| Ledger dompet Koperasi | 0 |
| Penjualan Koperasi / item penjualan | 0 / 0 |
| Buku Perpustakaan / sirkulasi | 0 / 0 |

Hasil ini membantu memeriksa prasyarat pada snapshot saat ini. Hasil bukan jaminan untuk data yang masuk setelah pemeriksaan; ulangi preflight segera sebelum penerapan.

## Operasi yang memerlukan perhatian saat upgrade

- **Library katalog (`20261207`):** menambah metadata sumber impor dan mengganti index ISBN dengan index ISBN yang dinormalisasi. Migrasi memakai `DROP INDEX IF EXISTS`; temuan duplikasi ISBN harus ditangani sebelum validasi ulang.
- **HRIS (`20261208`):** menambah metadata legacy pada pegawai dan RPC impor. Migrasi tidak mengirim undangan Auth atau membuat kredensial.
- **Marketplace/Donasi/Laundry (`20261213`–`20261215`) dan pemasok (`20261231`):** membuat ledger request idempoten privat dan mengisi ulang hasil request historis. Pemeriksaan actor/request ID dan benturan saat ini bersih. Tabel baru membatasi akses langsung; mutasi dilayani RPC server-side.
- **Tahfidz (`20261216`):** memvalidasi constraint untuk ujian yang sudah selesai. Ini dapat menggagalkan upgrade jika ada record lama yang melanggar; hitungan live saat pemeriksaan adalah 0.
- **LMS (`20261225`–`20261226`):** membuat ledger audit/idempotensi immutable dan mengganti signature beberapa RPC. `DROP FUNCTION` menghapus signature lama, sehingga versi server harus di-deploy dalam urutan yang kompatibel dengan kontrak RPC baru.
- **Koperasi finansial (`20261230`):** memperbarui aturan ledger dan menambahkan kolom sequence, tabel audit impor, serta RPC apply yang atomik. Mendefinisikan RPC **tidak** menjalankan impor arsip. Import membutuhkan Admin tenant, persetujuan kelengkapan snapshot, pemetaan eksplisit, wallet tujuan kosong, saldo yang dapat direkonsiliasi, dan feature flag terpisah yang tetap default `false`. Stok saat ini tidak dikurangi dan HPP historis yang tidak tersedia tetap tidak diketahui.
- Migrasi lain dalam rentang ini mengganti RPC operasional dengan validasi payload, actor, tenant, tanggal bisnis, status record, dan kunci idempotensi yang lebih ketat.

## Bukti uji dan batas verifikasi

GitHub Actions run [40156275760](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40156275760) berhasil pada head PR di atas. Kedua job lulus: frontend/build/runtime customer-managed dan test database pada Supabase lokal terisolasi, termasuk penerapan migration, pgTAP, NIS serentak, API auth/tenant, Storage, serta backup/restore.

CI tersebut menguji database kosong sintetis. CI tidak membuktikan upgrade terhadap isi produksi. Hasil baca-saja preflight di atas meningkatkan bukti untuk upgrade, tetapi belum menjalankan migrasi di staging atau produksi.

## Urutan sebelum penerapan

1. Amankan backup yang dapat dipulihkan dan uji restore ke environment terpisah.
2. Ulangi query versi migrasi, duplicate/constraint checks, orphan actor checks, serta hitungan Koperasi tepat sebelum upgrade.
3. Bandingkan checksum/source migration PR dengan artefak yang akan diterapkan; jangan menyatukan file versi lain atau menjalankan `db push --include-all` tanpa rekonsiliasi.
4. Jalankan seluruh 26 migration terlebih dahulu di staging yang disalin/dibuat dari skema dan data sintetis yang representatif. Pastikan aplikasi server dengan signature RPC baru dipasang dalam urutan deploy yang disetujui.
5. Periksa hasil migration, privileges/RLS, fungsi/RPC, Storage, serta postflight counts. Feature flag impor tetap mati.
6. Jalankan preview migrasi Firebase per tenant dan rekonsiliasi datanya. Apply impor, rotasi secret, pengujian login final, merge, dan deploy adalah release actions terpisah; dokumen ini tidak menyetujuinya.

Jangan menerapkan migration produksi hanya berdasarkan keberhasilan CI pada database kosong.


## Pembaruan validasi branch PR — 25 Oktober 2026

- Snapshot database pada dokumen ini tetap merupakan hasil baca-saja saat preflight awal; angka live harus dibaca ulang sebelum upgrade.
- Perbandingan 15 commit dari head preflight awal `18be5a983262783284dfb309a76205dc300ecc97` ke head PR `a650c91ec211040cd02a55b26a06d3ceb30ce7a6` tidak menemukan perubahan pada `supabase/migrations/**`. Karena itu, inventaris 26 migrasi pending pada head terbaru tetap sama, tetapi hal ini tidak menggantikan uji upgrade di staging.
- CI untuk head kode `a650c91ec211040cd02a55b26a06d3ceb30ce7a6`, [run 40162903438](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40162903438), lulus untuk frontend/build/Docker serta Supabase lokal, pgTAP, API auth/tenant, NIS concurrency, Storage, dan backup/restore sintetis.
- Dokumen preflight ini diperbarui setelahnya dalam commit dokumentasi `ba28dc7fc2da1b48f2df2283eca062bc879cae83`; kedua job CI pada [run 40163482514](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40163482514) lulus. Pemeriksaan Supabase Preview dilewati karena branch PR belum terhubung ke Supabase Branch.
- CI tersebut tidak menjalankan migrasi pada Production dan tidak membuktikan kinerja upgrade terhadap data Production. PR #13 tetap Draft; backup yang dapat dipulihkan, staging, rekonsiliasi data, login Admin, rotasi secret, dan UAT tetap menjadi gerbang sebelum go-live.

## Revalidasi baseline Production — 26 Oktober 2026

Pemeriksaan ini menggantikan angka migrasi pada snapshot sebelumnya; query dilakukan melalui SQL Editor dashboard proyek `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`, dan hanya membaca metadata migrasi.

- `supabase_migrations.schema_migrations` berisi 47 versi. Semuanya cocok dengan 47 file pertama pada repository sampai `20261206000000`; tidak ada versi awal yang hilang.
- Repository pada head PR #13 `a40f0e0dfd5ff41ff6674a6e7ea759904ecc89fc` memiliki 80 file migrasi, dengan versi terbaru `20270108000000`. Dengan demikian, 33 migrasi setelah `20261206000000` belum diterapkan ke Production.
- Tujuh versi tambahan yang belum tercantum pada inventaris snapshot lama adalah:

  | Versi | File |
  | --- | --- |
  | 20270102000000 | `guardian_accounts_and_invitations.sql` |
  | 20270103000000 | `guardian_finance_access.sql` |
  | 20270104000000 | `guardian_boarding_access.sql` |
  | 20270105000000 | `communication_guardian_audience.sql` |
  | 20270106000000 | `boarding_room_assignment_history.sql` |
  | 20270107000000 | `tahfidz_roster_keyset_pagination.sql` |
  | 20270108000000 | `tahfidz_dashboard_follow_up_summary.sql` |

- Supabase connector yang tersedia pada sesi ini hanya menampilkan project `vqemuyzveuirlkvdggjd`, bukan target `ptsasgdvgrbdtgyqieie`. Pemeriksaan baseline di atas dilakukan baca-saja melalui dashboard yang sudah terbuka; tidak ada migrasi, perubahan schema, atau data yang ditulis.

**Keputusan:** jangan jalankan 33 migrasi itu ke Production dari pemeriksaan ini. Perubahan guardian, akses Finance/Asrama, riwayat kamar, dan query Tahfidz memerlukan rehearsal upgrade pada staging serta backup yang sudah diuji restore. Flag runtime tetap mengikuti nilai default off sampai urutan migrasi dan versi server disetujui.

## Migration lanjutan riwayat penempatan — 26 Oktober 2026

- Perbaikan kode PR #13 menambahkan migration `20270109000000_boarding_room_history_baseline.sql`, sehingga repository memuat 81 migration sampai `20270109000000`.
- Baseline Production pada pembacaan metadata sebelumnya adalah 47 versi sampai `20261206000000`. Jika ledger belum berubah sejak pembacaan itu, 34 migration repository setelahnya masih pending; status live harus dibaca ulang sebelum rehearsal atau penerapan. Pemeriksaan sesi ini tidak menulis atau membaca ulang database Production.
- CI `40240448804` pada commit kode `de3ae340d0c11bc8bc927c33314884daee21f648` menguji migration tersebut pada Supabase lokal yang terisolasi dan seluruh 52 assertion riwayat penempatan kamar lulus, bersama job frontend/Docker dan rangkaian uji lain. Hasil ini bukan bukti upgrade berhasil pada skema/data Production.
- Migration membuat satu snapshot kondisi saat cutover bagi setiap santri yang masih memiliki gedung/kamar, sambil mempertahankan event sebelumnya. Snapshot tidak mengklaim menyimpan perpindahan sebelum tanggal cutover dan tidak menetapkan aktor historis.

**Keputusan:** jangan jalankan migration Production. Baca ulang ledger, siapkan backup dan uji restore, lalu lakukan rehearsal lengkap pada staging yang mewakili skema/data sebelum rencana upgrade disetujui.

## Alat pembanding ledger read-only — 26 Oktober 2026

- PR #13 kini menyediakan [runbook pemeriksaan ledger](MIGRATION_PREFLIGHT_RUNBOOK.md) dan `scripts/preflight-supabase-migrations.mjs`. Mode target menerima `SUPABASE_DB_URL`; mode lokal mengambil URL dari `supabase status -o env`. Keduanya hanya memilih versi migration dalam transaksi read-only dan tidak menjalankan SQL migration.
- CI run `40241264730` pada commit kode `36e67a278055a9b5720cd9c54789a197e533eafb` menjalankan mode lokal sesudah stack Supabase terisolasi siap. Ledger lokal cocok dengan 81 file migration dan suite penuh selesai sukses.
- Pemeriksaan Production tidak diulang saat menambahkan alat ini. Angka 47 versi hingga `20261206000000` tetap hanya baseline baca-saja sebelumnya; operator harus menjalankan preflight ulang dengan URL target yang benar, lalu memeriksa staging dan backup. Jangan menganggap jumlah pending lama sebagai keadaan live terkini.


## Konfirmasi ulang ledger Production — 26 Oktober 2026

Query langsung baca-saja pada SQL Editor project `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`, mengembalikan 47 versi: `20260603000000` sampai `20261206000000`. Daftar versinya cocok seluruhnya dengan file pada head repository PR #13 `a2de822fdc835e5661c9f61071a59fbf373bd87e`.

- Source berisi 81 file migration sampai `20270109000000`.
- 34 migration yang belum tercatat pada ledger Production adalah versi harian dari `20261207000000` sampai `20270109000000`, termasuk migration Januari 2027 yang menambah akun/undangan dan akses Wali, riwayat kamar, paginasi roster Tahfidz, ringkasan tindak lanjut, serta baseline kamar saat cutover.
- Tidak ditemukan versi Production yang asing terhadap source. Query hanya membaca metadata migration; tidak ada DDL, DML, import, atau perubahan Production.

**Keputusan:** angka 34 pending sekarang terkonfirmasi pada Production, tetapi jangan menerapkannya langsung. Jalankan alat `preflight:db-migrations` untuk cek ulang sebelum setiap rehearsal, lakukan rehearsal lengkap pada staging terisolasi yang dipulihkan dari backup, dan validasi hasilnya sebelum menyusun rencana upgrade Production.

Audit statis atas migration pending dan pemeriksaan data yang perlu dijalankan pada salinan staging tersedia di [checklist rehearsal](PRODUCTION_MIGRATION_REHEARSAL_CHECKLIST_2026-10-26.md). Query pemeriksaan tersebut tidak dijalankan pada data Production.

## Revalidasi ledger target pada head PR #13 — 26 Oktober 2026

Halaman **Database → Migrations** pada project `ptsasgdvgrbdtgyqieie`, branch `main / PRODUCTION`, dibaca kembali melalui dashboard Supabase. Daftar tetap berisi 47 versi dari `20260603000000` sampai `20261206000000`; tidak terlihat versi yang hilang atau versi asing. Pemeriksaan hanya membaca daftar migration dan tidak menjalankan SQL.

- Head PR #13 saat pemeriksaan: `91f71708ac3461b505255fbfe281d92a102f7328`, masih Open/Draft.
- Source sekarang memiliki 85 file migration. Dibanding 47 versi pada target, **38 migration masih pending**, mulai `20261207000000_library_legacy_catalog_import.sql` sampai `20270113000000_admin_ppdb_document_upload.sql`.
- Empat migration baru sejak rekonsiliasi sebelumnya (`20270109000000`) adalah `20270110000000_ppdb_candidate_finance_bills.sql`, `20270111000000_ppdb_document_access_audit.sql`, `20270112000000_admin_ppdb_candidate_create.sql`, dan `20270113000000_admin_ppdb_document_upload.sql`.
- Konektor Supabase pada sesi ini hanya memberi akses ke project lain (`vqemuyzveuirlkvdggjd`); target dikonfirmasi melalui halaman dashboard target yang sudah login. ADC Firestore tidak berhasil menerbitkan access token pada percobaan hitung ulang koleksi, sehingga hitungan Firestore terbaru selain pemeriksaan `financeBillings` 0 dokumen belum dapat diverifikasi ulang.
- GitHub Actions run [`40256254007`](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40256254007) untuk checkpoint sebelumnya selesai sukses pada kedua job: frontend/build/runtime serta migration, API auth/tenant, dan pgTAP. Bukti ini tetap memakai Supabase lokal terisolasi, bukan target Production.

**Keputusan:** jangan terapkan 38 migration ke branch Production. Project staging yang benar-benar terpisah dan dapat dipulihkan belum tersedia; project `vqemuyzveuirlkvdggjd` tidak dipakai sebagai staging karena bukan target dan belum disetujui untuk tujuan itu. Lanjutkan audit code dan CI terisolasi; sebelum upgrade, sediakan staging/backup yang dapat diuji restore, lalu jalankan preflight, rehearsal lengkap, dan postflight di sana.

## Pembaruan source PR #13 — jalur impor pengaturan CBT

Perubahan berikutnya menambahkan migration `20270114000000_cbt_tenant_settings_import.sql`; source PR #13 kini memiliki 86 file migration. Dengan baseline ledger 47 versi yang terakhir dibaca, terdapat 39 migration source yang perlu diperhitungkan pada preflight berikutnya. **Ledger target belum dibaca ulang pada pembaruan ini**, jadi 47/39 adalah hitungan terhadap baseline historis, bukan verifikasi Production terkini.

Migration ini membuat pengaturan CBT per tenant dengan RLS paksa dan tanpa grant browser, lalu menyediakan RPC `service_role` untuk satu impor bertanda fingerprint. Jalur aplikasi hanya menerima satu dokumen `cbt_config` yang dipetakan tepat ke `legacy_tenant_key`; konfigurasi penilaian manual, field asing, duplikasi daftar, tipe skor yang salah, serta skor berpresisi lebih dari dua angka desimal ditolak. Preview tidak mengembalikan isi konfigurasi. Koleksi `cbt_questions` tetap belum ditemukan pada sumber Firestore.

CI terisolasi run [40259337791](https://github.com/hamdanfaiz/ERP4-Pesantren/actions/runs/40259337791) sukses pada commit `bae87128cd3d04aa367b1f7f9ba967773858cd87`: kedua job lulus, termasuk penerapan migration dan pgTAP pada Supabase lokal, build, API/tenant tests, serta Docker customer-managed. Ini bukan rehearsal pada snapshot data Production. Tidak ada migration atau data yang diterapkan ke Production. Sediakan staging terpisah yang dapat dipulihkan sebelum menjalankan rehearsal penuh; jalankan ulang `preflight:db-migrations` agar angka ledger tidak dianggap mutakhir.
