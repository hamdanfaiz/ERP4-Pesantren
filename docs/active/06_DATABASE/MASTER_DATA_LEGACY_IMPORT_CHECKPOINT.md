# Master Data legacy import checkpoint

**Data checkpoint:** 23 October 2026 (snapshot target historis; lihat revalidasi 26 Oktober di bawah)
**Source:** Firestore project `graphite-ship-q5xj8`, database `ai-studio-erp4pesantren-a116e14b-1aa6-4667-8bdb-f0af384ccfa8`
**Target:** Supabase project `ptsasgdvgrbdtgyqieie`, tenant `pesantren-digital`

## Result

The tenant binding was checked against the single Firestore user-registry key and the active Supabase tenant's `legacy_tenant_key`; the values matched exactly. Before import, the target contained no legacy structures, students, or guardians.

The migration imported 235 of the 453 `master_data` documents across Master Data, student/guardian, and Tahfidz tables:

| Firestore category | Source | Imported | Result |
| --- | ---: | ---: | --- |
| `Gedung` | 15 | 15 | Imported |
| `Kamar` | 50 | 50 | Imported; restrictions need reconciliation |
| `Kelas` | 30 | 30 | Imported |
| `Santri` | 50 | 50 | Imported; NIS absent in source |
| `Wali Santri` | 50 | 50 | Imported and linked to students |
| `Halaqah` | 40 | 40 | Imported to Tahfidz; teacher/target values are provisional |
| **Total** | **235** | **235** | **No import errors** |

The other 218 `master_data` documents are `Alumni` (50), `Asatidz` (50), `Guru` (50), `Kampus` (5), `Pegawai` (50), `Staff` (2), `System` (1), and `Unit` (10). Pegawai has a reviewed preview and prepared HRIS importer. Alumni identity/date mapping is blocked by the audit below; the other categories still need mapping/reconciliation. This live inventory supersedes the earlier category labels `Active Role` and `Active Unit`.

## Mapping and data handling

- `master_data` rows have no `tenantId`. The only source registry has one tenant key; the importer used it only after an exact match with the active Supabase tenant mapping.
- Firestore document IDs differ from the embedded business `id` field. Structures use the embedded business ID as their Master Data key. Students and guardians use the Firestore document ID as their immutable `source_record_id` for traceability and replay safety.
- The 50 guardian records each matched exactly one student by a unique `studentName`; all 50 links were written to `guardian_students`.
- NIK and NISN for all 50 students, and NIK for all 50 guardians, were encrypted server-side and stored with keyed fingerprints. Plaintext identity values were not stored in `details` or sent to the database RPC.
- The legacy Santri schema has no `nis` field. All 50 imported students therefore have `nis = NULL`, and the migration created no NIS reservations. Assign NIS through the normal transactional NIS flow after confirming the school's numbering policy; do not invent values during data import.
- The legacy Santri rows contain a dormitory label, not a verified room or building ID. The importer preserves it as `details.legacyDormitory`; it does not assign unverified room/building links.
- None of the 50 Kamar rows or their parent Gedung records has an explicit gender restriction or parent-building reference. An exact-value audit found no room-location-to-building match, no student dormitory-to-room/building match, and no grade-to-class match. Those records imported with a warning; room assignment/onboarding must remain blocked until an Admin configures the restrictions and parent links.
- No source class ID exists on the legacy Santri records. Their grade is retained, but class placement needs reconciliation.
- The 40 Tahfidz Halaqah rows have no ustadz, schedule, or structured daily target. They were imported as `legacy_import` with the existing migration defaults (`Belum ditentukan`, one page/day); an Admin must review these values before operational use. Seven `entityRecords` Santri rows have no halaqah field and could not be linked; no Tahfidz memberships were created.

## Verification

The read-only preview reported 95 structures and 50 students planned, zero source or target conflicts, and 50 unresolved room-gender warnings. The live import then reported 95 structures and 50 students imported, zero skipped rows, and zero errors.

A follow-up TLS-verified database query confirmed:

- 15 buildings, 50 rooms, and 30 classes;
- 50 legacy students and 50 legacy guardians, each with a source key;
- 50 guardian/student links;
- 50 students with protected NIK and 50 with protected NISN;
- 50 guardians with protected NIK;
- 50 students have no unverified room/building assignment;
- all 50 students are missing NIS in the legacy source, so no legacy NIS reservations exist;
- 40 legacy Tahfidz Halaqahs, with 40 provisional teacher/target values and zero imported memberships;
- the earlier PPDB import remains at 50 candidates with its audit batch.

## Additional module previews (read-only)

- **Academic, CBT, Healthcare, General Affairs, facility bookings:** the tenant-scoped snapshots returned zero source records, so no import was applied.
- **LMS:** 1 category, 2 courses, and 1 assessment were previewed. The two courses cannot be imported until each instructor is mapped to an active Supabase `Ustadz` profile; no such profiles currently exist. No LMS rows were written.
- **Marketplace:** 8 products and 5 orders were previewed. The importer recognized all 13 as seeded browser examples and requires an Admin review; none were written as operational catalog or sales data.
- A stable `SUPABASE_LEGACY_FINGERPRINT_KEY` was generated in the ignored local `.env` so server-side legacy importers can create replay-safe fingerprints. Keep it unchanged and provision it in the trusted server secret store before deployment. Its value is not in Git.

Legacy reads now use a shared tenant-scope guard: tenantless rows are included only when every bounded `users` registry record maps to the exact active tenant legacy key; conflicting tenant fields, ambiguous registries, over-limit snapshots, and invalid limits stop before preview/apply. Five synthetic guard cases passed. This guard also covers the remaining module import routes; it does not make fixture or unmapped data eligible for import by itself.

## Remaining cutover work

Pada checkpoint target 23 Oktober, 276 dari 561 dokumen Firestore belum dimigrasikan: 218 kategori di atas ditambah 58 dokumen di koleksi root lain. Angka 276 **historis dan belum diverifikasi ulang pada target**; kode importer dan status preview sejak saat itu berubah. Runtime flags tetap tidak aktif, dan Firebase Admin hanya boleh dipakai untuk pembacaan arsip yang disetujui. Checkpoint ini bukan bukti Firebase sudah dipensiunkan atau produk siap produksi.

### Remaining root collection inventory

The Firestore `listCollectionIds` audit counted 18 root collections and 561 documents. The residual 58 documents outside `master_data` and the already imported PPDB `candidates` collection are:

> Catatan: status ketersediaan importer pada tabel berikut menggambarkan checkpoint 23 Oktober. Untuk status source code terbaru, lihat tabel **Rekonsiliasi status importer — 26 Oktober 2026** pada [inventaris migrasi](FIRESTORE_TO_SUPABASE_MIGRATION_INVENTORY.md). Tidak ada apply baru yang dapat disimpulkan hanya dari keberadaan importer.

| Collection | Rows | Review status |
| --- | ---: | --- |
| `cbt_config` | 1 | Tenantless configuration; no tenant-scoped importer exists yet. |
| `cooperative_inventory` | 6 | Browser seed records; no reviewed importer yet. |
| `cooperative_suppliers` | 3 | Browser seed records; contact fields need reviewed mapping. |
| `cooperative_transactions` | 3 | Do not treat as posted finance until IDs, wallet links, and ledger semantics are reconciled. |
| `cooperative_wallets` | 3 | Balances cannot be copied as real balances without reconciling source transactions. |
| `entityRecords` | 14 | Seven Santri and seven Wali rows; no NIS/relationship key or halaqah assignment was verified. |
| `library_books` | 4 | Importer and tenant-scoped Admin RPC are prepared; preview has 4 ready rows and 2 ISBN check-digit warnings. Migration is not yet applied and no rows have been written. |
| `library_circulations` | 1 | Borrower has no verified student ID; no importer yet. |
| `library_digital_assets` | 4 | Metadata exists, but file bytes are not present in this collection and Storage migration is separate. |
| `lms_categories`, `lms_courses`, `lms_assessments` | 4 | LMS preview blocks two courses until their instructors map to active Ustadz profiles. |
| `marketplace_products`, `marketplace_orders` | 13 | All 13 are browser seeds requiring Admin review; not imported. |
| `tenants`, `users` | 2 | Source tenant registry/mapping records; not operational module rows. |

Together with the 218 remaining `master_data` categories, this reconciles all 276 pending documents. It does not authorize loading example wallet balances, transactions, or file metadata as production data. A module importer should be added only after its identity, relationship, privacy, and accounting rules are explicit.

### Library catalog preview — 23 October 2026

The target tenant currently has zero `library_books`. The legacy collection has four tenantless book rows, which the source registry maps to the exact active tenant legacy key. A read-only preview found four structurally valid rows, no duplicate source ISBNs, no target ISBN conflicts, and no duplicate title/author pairs. Two source ISBN values fail their check digit; the preview preserves their normalized values and raises `isbn_check_digit_needs_review` warnings instead of silently dropping or rewriting them. All four rows are eligible for import after the new migration is applied and an authenticated tenant Admin explicitly applies the preview. No Supabase write has occurred.

The prepared importer stores HMAC source IDs/fingerprints, validates tenant and role again in the database RPC, applies the full snapshot atomically, and records replay-safe batches. Runtime and import flags stay disabled. Circulation remains blocked because its borrower cannot be matched to a verified student ID; digital assets remain blocked because source file bytes are absent. Remaining unmigrated count is still 276 until an approved catalog import succeeds.

Ten synthetic importer checks pass for canonical ISBN handling, non-blocking check-digit warnings, malformed ISBN rejection, duplicate source/target conflicts, source fingerprint replay/change detection, title/author review, and invalid copy counts. The migration contract assertions are registered in `supabase/tests/library_legacy_import.test.sql` for the isolated Supabase CI suite; they were not executed locally because Supabase CLI/Docker are unavailable here.

### HRIS Pegawai preview — 23 October 2026

The source registry again resolves all tenantless `master_data` records to the exact `pesantren-digital` legacy key. Filtering `type = Pegawai` yields 50 rows; the target tenant currently has zero HRIS employees. Source employee numbers and emails are unique, all required fields pass validation, and no target conflicts were found. Status mapping yields 13 active, 22 inactive, and 15 alumni mapped to `terminated` with warnings; original status and other legacy attributes are retained in restricted `legacy_details`. No Auth accounts are created and no data was written.

`src/server/supabaseHrisImport.ts`, endpoint `POST /api/hris/legacy/employees/import`, and migration `20261208000000_hris_legacy_employees_import.sql` are prepared behind `SUPABASE_HRIS_IMPORT_ENABLED=false`. Eleven synthetic preview cases pass. The 19 database contract checks are in `supabase/tests/hris_legacy_import.test.sql`; they still require the isolated Supabase CI/local CLI run before applying the migration. The remaining 276-document count does not change until a migration apply succeeds.

### Alumni identity and date reconciliation — 23 October 2026

A read-only comparison found 50 source `Alumni` rows and 50 imported Supabase students. Email comparison alone creates 50 unique candidate pairs, but none of those pairs has the same normalized name or phone; only 22 of 50 also have matching gender. Email therefore is not a safe relationship key for this dataset. All 50 source rows contain a valid graduation year, but do not contain a verified graduation date required by the current Alumni contract. The target still has zero `alumni_profiles`; no source Alumni row was applied.

The 50 imported Santri statuses are 15 `Active`, 14 `Inactive`, and 21 `Alumni`. The 21 legacy-Alumni-status students had no formal Alumni profile and were previously excluded from the Admin graduation form. The form/API logic now makes a non-archived student selectable until a profile exists, shows the stored status, asks the Admin to choose a date from a verified graduation document, and uses the tenant timezone for its default date and current-year metric. This does not attach the mismatched source Alumni records automatically. Do not join by email alone or infer a specific date from graduation year; collect a verified mapping/date or correct the source records first.

