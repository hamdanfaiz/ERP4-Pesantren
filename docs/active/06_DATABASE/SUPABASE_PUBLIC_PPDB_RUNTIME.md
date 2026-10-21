# Supabase Public PPDB Runtime

**Status:** draft implementation; not applied to any Supabase database and not enabled for production.

## Scope

This slice moves the public PPDB configuration and submission API from Firebase Admin to Supabase. It adds transactional registration ID allocation, tenant-scoped identity claims, encrypted NIK/NISN fields, shared database-backed rate limiting, and private document uploads.

This does not complete the Firebase migration. Firebase Auth, profile authorization, the PPDB admin screen, finance, academic records, boarding, communications, and the other operational modules still use Firebase. The PPDB admin screen currently reads Firebase, so it will not see records created by this endpoint. Keep `PUBLIC_PPDB_ENABLED=false` until the PPDB admin API/UI and legacy data migration also target Supabase.

## Server-only environment

Configure these values in the app server environment for each installation:

| Variable | Requirement |
| --- | --- |
| `SUPABASE_URL` | Supabase project API URL, or the URL of the self-hosted Supabase API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key held only by the server; never add it to Vite/client variables or source control |
| `PUBLIC_PPDB_TENANT_SLUG` | Exact active tenant slug in `public.tenants` |
| `PUBLIC_PPDB_ENABLED` | Must remain `false` until the activation gates below pass |
| `PII_ENCRYPTION_KEY` | 32-byte AES key encoded as 64 hexadecimal characters |
| `PII_FINGERPRINT_KEY` | Independent 32-byte HMAC key encoded as 64 hexadecimal characters |
| `PPDB_RATE_LIMIT_KEY` | Independent 32-byte HMAC key encoded as 64 hexadecimal characters |

The service-role key bypasses RLS, so the code uses it only from `server/supabasePublicPpdb.ts`. Do not put it in `VITE_*` variables. Supabase's security guidance explains that secret/service-role keys belong only on trusted servers: https://supabase.com/docs/guides/database/secure-data

NIK and NISN are encrypted with AES-256-GCM. Stored ciphertext is `12-byte IV || 16-byte authentication tag || ciphertext`; fingerprints use HMAC-SHA-256 with a separate key and are used only for duplicate detection. Keep both keys in a durable secret manager and back them up securely. Losing or rotating either key without a controlled re-encryption/re-fingerprinting process can make identity data unreadable or duplicate checks inconsistent.

## Database and Storage boundary

The migration adds private candidate document paths, the shared `identity_claims` registry, a shared PPDB rate-limit table, and two server-only PostgreSQL functions. Registration counter updates, candidate creation, document metadata, and identity claims happen in one database transaction. Database uniqueness remains the final guard for concurrent submissions.

Uploaded PPDB documents are restricted to PDF/JPEG/PNG and 2 MB per file. The `ppdb-documents` bucket is private. There are no anonymous or authenticated browser policies in this slice; uploads are made by the trusted server. Supabase private buckets enforce access through Storage RLS: https://supabase.com/docs/guides/storage/security/access-control

Uploads happen before the database transaction. The server deletes already-uploaded objects when a subsequent upload or database write fails. A client disconnect can still leave an orphaned object, so production operations need a periodic Storage-to-database reconciliation job.

## Activation gates

Do not set `PUBLIC_PPDB_ENABLED=true` until all of these are complete:

1. Review and apply the foundation migration, then this migration, in a non-production Supabase environment.
2. Provision the active tenant and verify its PPDB settings.
3. Migrate Firebase candidates and existing student identity records into Supabase, encrypting personal identifiers in a trusted migration process and seeding `identity_claims`; reconcile counts and duplicates.
4. Migrate the PPDB admin screen and its read/update workflows to Supabase so admissions staff can see and process incoming submissions.
5. Configure the server-only keys above, verify the bucket is private, and retain a recoverable backup.
6. Complete the final security, concurrent-registration, upload, restore, role/tenant, and responsive test stage.

The SQL migrations in this branch have not been applied. No production credentials are stored in this repository. Do not merge this PR or enable public PPDB while the admin/data migration gates remain open.
