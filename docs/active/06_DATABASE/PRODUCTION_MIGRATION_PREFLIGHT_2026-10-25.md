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
