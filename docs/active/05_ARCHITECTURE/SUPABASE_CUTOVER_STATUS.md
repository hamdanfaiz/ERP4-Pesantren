# Status Cutover Supabase ERP4 Pesantren

**Snapshot:** 22 Oktober 2026  
**Source inspected:** branch `backend/supabase-masterdata-structures-ui`, draft PR #11  
**Purpose:** keep implementation and backend handoff aligned while the application moves from Firebase-first to Supabase-only.

## Decision

Supabase is the target database, authentication, and file-storage platform. Each customer installation must be able to use its own managed Supabase project or a self-hosted Supabase stack. The app must not require a shared SaaS tenant operated by the ERP vendor.

A GitHub-Supabase integration only connects repository workflows to a Supabase project. It does not change the database or authentication used at runtime. Application code, schema migrations, environment variables, data imports, and deployment configuration each need a cutover.

## Verified current state

| Area | Current state | Cutover status |
| --- | --- | --- |
| Frontend authentication | `src/contexts/AuthContext.tsx` signs in with Firebase Auth and reads profiles from Firestore `users/{uid}`. | Firebase still required |
| Backend authentication | `server.ts` verifies Firebase ID tokens and uses Firebase Admin for profile and legacy data access. | Firebase still required |
| Public PPDB | Uses a trusted Supabase API and tenant-scoped SQL schema in the stacked PPDB migration branches. | Supabase path exists; live migration and final verification pending |
| Admin PPDB | Candidate workflow and document upload have Supabase API paths in PR #7. They still use Firebase Auth/profile verification. | Partial cutover |
| Master Data onboarding | Supabase tenant, master-data, student, guardian, and onboarding foundation is in PR #8. Legacy records still need an explicit, reconciled import. | Schema/runtime foundation; not full module cutover |
| Finance schema | Tenant-scoped billing runtime and legacy billing import preview/apply are in PR #9. | Partial cutover |
| PPDB Finance | New PPDB billing, payment review, and proof-file paths use Supabase in PR #10. General finance operations, old bills, and old proof files still use Firebase. | Partial cutover |
| File storage | New PPDB documents and finance proofs use private Supabase Storage paths. Legacy Firebase Storage references remain, including `FIREBASE_STORAGE_BUCKET` in `.env.example`. | Partial cutover |
| Operational modules | Direct Firebase/Firestore use was confirmed in Dashboard, Academic, Alumni, Boarding, CBT, CBT Student, Communication, Donation, Finance, General Affairs, Healthcare, LMS, Library, Marketplace, Master Data, Tahfidz, Settings migration utilities, and User Management. Master Data now has gated Supabase API paths for Santri plus Gedung/Kamar/Kelas read/write/archive/import; the cutover flag remains off, other Master Data categories remain Firebase-backed, and Supabase Auth still is not used. | Partial cutover |
| Other modules | Some pages have no direct Firebase import, but may still use mocks, browser state, or shared hooks. They need a data-source audit before being called Supabase-ready. | Not yet verified |

The module inventory is a source scan, not a claim that every screen or workflow has been tested.

## Required order

1. **Finish backend contracts:** tenant-scoped schema, role/profile model, module permissions, guardian-to-student links, and server-side authorization. Keep service-role credentials on the backend only.
2. **Migrate reference data:** provide preview, idempotent apply, error reporting, and row-count/reconciliation for tenants, students, guardians, classes, rooms, and staff. Preserve source IDs for traceability.
3. **Move modules one by one:** replace direct Firestore, browser-local operational storage, and mock operational records with tenant-scoped Supabase APIs. Each module cutover must have one write source and clear legacy-read/import behavior.
4. **Move identity:** replace Firebase Auth with Supabase Auth after dependent module paths can accept Supabase sessions. Import accounts where supported; use a controlled first-login migration or forced password reset where password hashes cannot be moved safely. Never copy plaintext passwords.
5. **Move remaining files:** migrate Firebase Storage objects into private Supabase buckets, preserve owner/tenant metadata, and verify that URLs and access policies do not expose files publicly.
6. **Remove Firebase:** delete browser/server Firebase SDK usage, Firebase Admin configuration, Firestore rules, Firebase Storage config, and Firebase-specific setup only after code search and module acceptance checks show no runtime dependency.
7. **Package for customer environments:** build and verify the profiles in [Deployment Portability](DEPLOYMENT_PORTABILITY.md): customer-owned managed Supabase with app on customer VPS, and fully self-hosted Supabase on Linux VPS/on-premise. Container image, Compose installer, environment templates, versioned migrations, health checks, SMTP setup, and backup/restore are release requirements, not verified capabilities yet.
8. **Run final verification:** role/tenant matrix, RLS policies, migration reconciliation, PPDB registration, concurrent unique IDs, finance ledger integrity, private uploads, backup restoration, login, and responsive UI. Run the same release candidate that will be deployed.

## Master Data cutover prerequisite

The existing Supabase onboarding schema makes PPDB-created students require a 10-digit NIS, NIK, class, and room. The repository's example records also contain shorter NIS values and optional placement fields. A legacy import therefore must preserve valid existing identifiers and records that still need class/room assignment, without inventing a PPDB candidate or discarding the source record.

Migration `20260610000000_legacy_master_data_import.sql` prepares provenance keys for legacy student/guardian rows and allows legacy records to retain missing NIS, identity, or placement values. The branch now also contains an Admin-only preview/apply endpoint and Master Data screen for a tenant-scoped legacy snapshot import. It encrypts NIK/NISN before writes, detects conflicts, preserves resolvable guardian links, and reports rows requiring reconciliation. Each record is committed independently; an apply run may therefore partially succeed, and failed rows must be reconciled before cutover. Imports are idempotent by source record ID and can be previewed/retried after correcting conflicts. Import is opt-in through `LEGACY_MASTER_DATA_IMPORT_ENABLED=true`, requires a prior backup and a planned maintenance window, and has **not** been run against live data. The SQL migration has also **not** been applied to the project. This is a one-time import path, not ongoing synchronization or a module cutover.

Migration `20260611000000_student_room_assignment.sql` adds a tenant-scoped RPC and permission-checked room assignment/removal endpoint. Its transaction serializes room changes, checks capacity, configured gender, and stored-versus-recorded occupancy, and is executable only by `service_role`. The boarding snapshot carries the legacy source ID and Supabase UUID. `MasterDataManager` has flag-gated read/create/update/archive/import paths for both Santri and Gedung/Kamar/Kelas. Migration `20260612000000_master_data_student_runtime.sql` adds a tenant-scoped student upsert and soft-archive RPC: NIS and identity fingerprints are checked transactionally, NIK/NISN are encrypted server-side, and existing room assignments are revalidated through the room RPC. These paths use `VITE_SUPABASE_BOARDING_CUTOVER`, which remains `false`. The UI paths are implemented but have not been switched on: SQL migrations are not applied, no tenant snapshot has been imported/reconciled, and no live database verification has occurred. Requests still authenticate with Firebase ID tokens and the server still reads Firebase profiles. Other Master Data categories and many modules remain Firebase-backed.

Keep the live cutover flag disabled until the new SQL migrations are applied to a non-production environment, the tenant snapshot is imported and reconciled, and the Santri/structure/placement flows pass acceptance checks as one coherent source. The UI and APIs are wired behind the flag, but they are not verified against an applied database. Firebase still supplies login tokens and profile authorization; the remaining Master Data categories, academic UI, and other modules still use Firebase or local/mock state. Do not enable a Supabase boarding snapshot while Santri edits still go to Firestore.

## Tahfidz follow-up

The Tahfidz runtime schema is in migrations `20260613000000_tahfidz_tenant_runtime.sql` and `20260614000000_legacy_auth_identity_bridge.sql`. Migration `20260615000000_tahfidz_legacy_import.sql` adds source provenance and one atomic, idempotent import RPC for tenant halaqahs and current student assignments. The setoran function grant signature was corrected to match its UUID actor parameter. All three migrations are source artifacts only; **none has been applied to Supabase**.

The backend now has tenant-scoped snapshot and setoran endpoints, plus an Admin/SuperAdmin preview/apply endpoint at `POST /api/tahfidz/migrate`. Preview reads only this tenant's `master_data` Halaqah and `entityRecords` Santri, maps santri to canonical Supabase students by legacy source record ID or unique NIS, and reports unresolved/duplicate mappings and existing assignment conflicts. Apply runs the whole imported configuration in one transaction, preserves Firebase source IDs, refuses to overwrite changed rows, and requires the exact preview fingerprint, an explicit confirmation string, and `SUPABASE_TAHFIDZ_IMPORT_ENABLED=true`. The import flag and runtime flag are both `false` by default.

The Tahfidz screen now exposes the Admin migration preview and guarded apply flow. It also has an opt-in runtime path through `VITE_SUPABASE_TAHFIDZ_CUTOVER=false`: halaqah, roster, and setoran reads use `GET /api/tahfidz/snapshot`; setoran writes use `POST /api/tahfidz/records` and refresh from the backend after success. The UI sends canonical Supabase student/halaqah IDs and keeps an idempotency key stable across retries. When this frontend path is selected, its roster, group cards, and record list do not fall back to sample rows; an in-page status identifies the still-simulated target, schedule, gamification, and chart sections.

Migration `20260616000000_tahfidz_recorder_assignment_guard.sql` tightens the recording RPC: active Admin/SuperAdmin profiles remain tenant-scoped, while an Ustadz can record only for an active halaqah assigned to that profile. The runtime endpoints remain disabled under `SUPABASE_TAHFIDZ_RUNTIME_ENABLED=false`; the frontend and backend flags are both false by default. The APIs still verify Firebase tokens and Firestore profiles, and each recorder must have an active legacy Firebase-to-Supabase profile mapping. Halaqah and roster creation/editing, targets, charts, achievements, exams, and Supabase Auth cutover are not implemented in this runtime phase.

Next continuation: apply the Tahfidz migrations only in a non-production environment, provision tenant/profile/legacy identity mappings, run the import preview and reconcile all unresolved rows, then enable both runtime flags only for a controlled pilot. After that, migrate targets and persisted metrics, add halaqah write APIs, and complete Supabase Auth role/tenant authorization before retiring the temporary Firebase identity bridge. Do not apply migrations or enable flags in production before backup, import preview, and reconciliation are approved.
 
## Current release gate

The application is **not Supabase-only and is not ready for customer production deployment**. The stacked PRs are draft, and their migrations have not been applied to the live Supabase project. Login, Firebase/Supabase integration, database RLS, storage, and final release-candidate tests remain pending by design. The repository does not yet contain a validated customer deployment bundle (Dockerfile/Compose installer, upgrade/restore scripts), and no VPS or on-premise profile has passed the simulations in `DEPLOYMENT_PORTABILITY.md`. Until then, all environment profiles are planned targets, not supported production environments.
