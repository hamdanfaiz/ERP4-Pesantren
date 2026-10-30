# PPDB legacy import checkpoint

## Source preflight

The Firestore source was read using local Application Default Credentials. The review was read-only; no Firestore or Supabase records were changed.

The candidates collection contains 50 records. All records have a name, registration ID, stage, gender, date of birth, application date, NIK, NISN, phone, and email. The identifier fields are text, all NIK values have 16 digits, all NISN values have 10 digits, and the source contains no duplicate registration IDs, NIKs, or NISNs. Stage counts are:

| Stage | Records |
| --- | ---: |
| Registered | 9 |
| Document Review | 11 |
| Entry Exam | 6 |
| Interview | 7 |
| Accepted | 8 |
| Rejected | 9 |

The legacy `dateApplied` values are ISO-8601 UTC timestamps in the shape `YYYY-MM-DDTHH:mm:ss.sssZ`. All 50 values use that exact representation. The importer validates the UTC suffix, timestamp fields, and calendar date, then stores the UTC calendar date. The timestamp values themselves are not included in this report.

The Firestore users registry currently yields one distinct tenant key. Candidate documents are tenantless, so the importer requires the target tenant's legacy_tenant_key to match the source registry and requires an explicit exact source-tenant confirmation. It will not infer tenant ownership from the target Admin session alone.

## Implemented guardrails

- POST /api/ppdb/legacy/import is disabled unless SUPABASE_PPDB_IMPORT_ENABLED=true.
- Firestore reads still pass through the local-development-only LEGACY_FIREBASE_ADMIN_ENABLED gate.
- Preview output contains counts and issue categories only. It does not return names, contact details, or identity numbers.
- NIK and NISN are encrypted server-side; keyed fingerprints support uniqueness checks without storing plaintext.
- The database function imports a complete batch atomically, checks active Admin role, PPDB permission, tenant mapping, row identity conflicts, and batch replay.
- Source record IDs and keyed row fingerprints make replays idempotent. A changed source row already imported under the same Firestore document ID blocks the batch for manual reconciliation.
- Candidate document flags default to false because no legacy document assets were verified. No Firebase Storage files are imported.

## Current PPDB state

The PPDB import is complete for the candidate collection. The endpoint feature flag remains disabled; the one-time migration used the reviewed server-side importer and database RPC directly.

## Initial read-only target preflight (2026-10-23)

## Read-only target preflight (2026-10-23)

The selected Supabase target is project `ptsasgdvgrbdtgyqieie`; the local `SUPABASE_URL` matches it. At the time of this preflight, no Supabase or Firestore writes had been performed.

- The target had one active tenant. Its slug exactly matched the single tenant key in the Firestore users registry, but `legacy_tenant_key` was empty.
- The target `candidates` table had zero rows and the import metadata columns were absent.
- One active Admin profile existed for the matched tenant. The local `.env` did not yet contain `PII_ENCRYPTION_KEY` or `PII_FINGERPRINT_KEY`.
- A raw Firestore REST read confirmed all 50 `dateApplied` fields use ISO-8601 UTC timestamps. The importer and SQL contract were corrected to match this source format.

## Rollback-only database validation (2026-10-23)

- Connected to the approved Supabase project through its session pooler with the CA certificate linked from that project's dashboard. Certificate verification remained enabled.
- Executed the complete PPDB import migration with its terminal `COMMIT` replaced by `ROLLBACK`.
- Verified the import metadata table and candidate source columns were absent both before and after the transaction. No Supabase schema or data changed during this dry-run.
- The first live-source preview rejected the dates because the old importer expected a slash-separated format. The importer, test fixture, and SQL contract were corrected to the exact ISO-8601 UTC representation found in Firestore.

## Applied migration and data import (2026-10-23)

- Applied `20261205000000_data_api_default_privilege_hardening.sql` and `20261206000000_ppdb_legacy_candidate_import.sql` to the selected Supabase project using a TLS-verified session-pooler connection.
- Repaired Supabase migration history for those two already-applied versions. The remote history now contains the same 47 migration versions as this checkout; the local SQL files remain the source of truth.
- Set the active tenant's `legacy_tenant_key` to the exact single key from the Firestore users registry after confirming it matched the tenant slug.
- Generated 256-bit `PII_ENCRYPTION_KEY` and `PII_FINGERPRINT_KEY` values and stored them only in the ignored local `.env`. They were not printed or committed. Keep both values stable and copy them to the trusted backend secret store before deploying; losing them prevents decrypting the protected identity fields.
- A fresh preview reported 50 valid rows, zero invalid rows, zero source duplicates, and zero conflicts with the empty target.
- Imported all 50 candidates in one atomic batch. Verification confirmed all NIK and NISN values have ciphertext and keyed fingerprints, no plaintext identity values were sent, and one audit batch was recorded.
- The feature flag remains disabled. Candidate document flags remain false, and no Firebase Storage files were imported.

## Remaining Firestore snapshot inventory

The read-only inventory found 561 documents across 18 top-level collections. At the time of this PPDB checkpoint, the 50 candidates above were the only operational records imported. A later Master Data migration is recorded in [MASTER_DATA_LEGACY_IMPORT_CHECKPOINT.md](MASTER_DATA_LEGACY_IMPORT_CHECKPOINT.md).

| Firestore collection | Documents |
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

At the time of this inventory, 511 documents remained after the PPDB import. Subsequent Master Data/Tahfidz imports moved 235 more documents, leaving 276 across the remaining Master Data categories and other collections. Each remaining module still needs explicit source-to-tenant mapping, field validation, duplicate handling, and target-table reconciliation. This does not claim a full Firebase cutover; backend migration routes still use Firebase Admin for approved legacy-source reads.

The top-level operational documents are tenantless in this snapshot; only the `users` registry has a `tenantId` field. The Tahfidz migration route now has a guarded fallback for tenantless rows and fails closed unless the registry contains exactly the target tenant key. Other module import routes that query Firestore by `tenantId` still will not discover tenantless rows. Each remaining importer needs its own verified tenant mapping and validation before apply.

## Local verification (2026-10-23)

- `npm run test:ppdb-legacy-import`: passed, 9 preview/import guard cases after updating the verified Firestore date format.
- `npm run lint`: passed.
- `npm run build`: passed. The active browser build now has zero Firebase-named chunks after removing obsolete Settings and Master Data Firestore paths. Vite still reports a 3.00 MB main JavaScript chunk; bundle splitting/performance remains a separate production-readiness task.
- `node scripts/test-production-dependencies.mjs`: passed; Firebase packages are development-only.
- `npm run test:legacy-firebase-gate`: passed; Firebase Admin can initialize only in explicitly enabled local development.
- `node scripts/test-production-runtime.mjs`: passed after simulating production dependency absence; server serves the built frontend and `/api/users` remains protected.
- SQL migrations and pgTAP were not run locally because Supabase CLI, Docker, and `psql` are unavailable. The rollback-only SQL validation above passed against the selected Supabase target; the GitHub workflow defines the full pgTAP checks, but the current uncommitted changes have not been pushed, so there is no CI result for this checkpoint.

The production smoke check temporarily moved only the local `node_modules/firebase` and `node_modules/firebase-admin` development packages and restored them afterward. `package-lock.json` remains unchanged; the development packages are present again.
