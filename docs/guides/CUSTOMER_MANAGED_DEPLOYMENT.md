# Customer-managed deployment (Docker)

This package runs the ERP web application and API in a hardened container. It connects to a separate Supabase project selected by the customer. It does not install or operate PostgreSQL, Supabase Auth, Storage, or the Supabase API gateway; on-premise customers must provide a supported Supabase endpoint reachable from both user browsers and the application container.

## Requirements

- Docker Engine with Docker Compose v2 on a VPS or on-premise Linux host.
- A Supabase API endpoint and database controlled by the customer or their hosting provider.
- Applied and verified database migrations before enabling any `SUPABASE_*_RUNTIME_ENABLED` feature flag.
- The Document Digital workflow requires `20270117000000_document_center_core.sql` and a reviewed private Storage bucket before setting `SUPABASE_DOCUMENT_RUNTIME_ENABLED=true`.
- Document attachments are PDF-only and limited to 25 MiB; OCR and digital-signature workflows are not included in this runtime slice.
- A TLS reverse proxy and a DNS name for production access. Keep port 3000 private to that proxy or the trusted network.

### Kepercayaan reverse proxy

Server tidak mempercayai header IP terusan dari klien secara bawaan pada instalasi mandiri. Docker Compose memakai `TRUST_PROXY_HOPS=0`; biarkan 0 jika koneksi mencapai aplikasi langsung. Jika satu reverse proxy yang dikelola operator (misalnya Nginx) meneruskan koneksi, set nilai `1`; gunakan jumlah yang tepat untuk rantai proxy yang benar-benar dipercaya. Jangan memakai nilai `true` atau mempercayai proxy yang tidak dikelola operator.

Pada Cloud Run, aplikasi memakai satu hop secara otomatis saat `TRUST_PROXY_HOPS` tidak diisi dan `K_SERVICE` tersedia. Operator dapat mengatur `TRUST_PROXY_HOPS` secara eksplisit bila topologi mereka berbeda. Nilai harus berupa bilangan bulat 0–10; nilai invalid menghentikan startup agar pembatasan IP tidak diam-diam memakai konfigurasi yang keliru.

## Configure

Create an ignored `.env` file in the repository root (it is excluded from the Docker build context) with these values:

```dotenv
VITE_SUPABASE_URL=https://supabase.example.org
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SUPABASE_URL=https://supabase.example.org
SUPABASE_SECRET_KEY=sb_secret_replace_me
ERP4_HTTP_PORT=3000
# Server-side PII keys: generate independent random values before enabling workflows that require them.
# PII_FINGERPRINT_KEY is also required for durable server-side Finance/PPDB abuse limits.
PII_ENCRYPTION_KEY=
PII_FINGERPRINT_KEY=
SUPABASE_LEGACY_FINGERPRINT_KEY=

# Feature gates stay off until the matching database and tenant checks are complete.
SUPABASE_MASTER_DATA_RUNTIME_ENABLED=false
VITE_SUPABASE_MASTER_DATA_RUNTIME_ENABLED=false
SUPABASE_TAHFIDZ_RUNTIME_ENABLED=false
VITE_SUPABASE_TAHFIDZ_RUNTIME_ENABLED=false
```

`VITE_SUPABASE_URL` must be reachable from each user's browser. `SUPABASE_URL` must be reachable from the container and may use a private address. The publishable key is embedded in the browser build; the secret key is passed only to the server container. Never put a secret key in a `VITE_` variable or commit `.env`.

## Provision the first tenant and Admin

For a fresh database, apply and verify the reviewed migrations first. Migration `20270121000000_tenant_admin_bootstrap.sql` adds a server-only RPC; it does not import Firestore records, create sample operational data, or enable runtime flags.

The trusted operator needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the ignored `.env` file or the host's secret manager. Configure Supabase Auth email delivery and allowlist the application's invite redirect URL before sending an invitation. Optionally set `SUPABASE_AUTH_REDIRECT_URL`, `BOOTSTRAP_TENANT_TYPE`, and `BOOTSTRAP_TENANT_TIME_ZONE` in that operator environment. The default time zone is `Asia/Jakarta`.

Run once from the repository root:

```sh
npm run provision:tenant-admin -- pesantren-digital "Pesantren Digital" admin@example.org "Nama Admin"
```

The script first checks the tenant slug, status, settings, and profile count so it does not send an invitation for an occupied or suspended tenant. It then invites the Admin through Supabase Auth and atomically creates the tenant and its first `profiles` row. It never accepts or stores a password. The Admin sets a password through the Auth invitation. Repeating the same command is a no-op after it verifies the existing active tenant/Admin profile. The bootstrap RPC is denied to `anon` and `authenticated`; it is not a public tenant-signup endpoint.

After the Admin can sign in, create synthetic operational records manually in Master Data. Application writes must use the tenant UUID from the authenticated profile and database relationships must refer to records within that same tenant. Wali access is provisioned through the tenant's verified guardian invitation flow; do not create a Wali-to-Santri link from browser-supplied IDs.

If the database transaction fails after Auth sends the invitation, the script attempts to remove that pending Auth user. If Auth cleanup also fails, stop and reconcile that account before retrying. Do not enable module flags just because tenant bootstrap succeeded; each module still needs its own migration, RLS, and workflow verification.

The Compose file uses an explicit allowlist for browser build flags and server runtime flags; all feature and import gates default to `false`. Browser `VITE_` flags are compiled into the static frontend, so rebuild the image after changing one. Server `SUPABASE_` flags take effect after recreating the service. Enable both sides of a module only after its migrations, tenant data, Auth/profile setup, RLS, and any Storage policies are verified in that deployment. Keep every import/apply flag off during normal operation; use it only for a reviewed, time-bounded migration procedure. Public PPDB is an externally reachable intake route and requires its own abuse, privacy, and tenant configuration review before activation. PII and legacy fingerprint keys are server-only; do not prefix them with `VITE_`.

## Build and run

From the repository root:

```sh
docker compose -f docker-compose.yml up --build -d
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs --tail=100 erp4-pesantren
```

Compose sets `NODE_ENV=production` and disables the legacy Firebase Admin and settings-cleanup gates. The container runs as the unprivileged `node` user, has a read-only root filesystem, and drops Linux capabilities. `/health/live` confirms the process is running; `/health/ready` confirms the Supabase profile store responds and is used by the container health check. Health responses disclose no credentials or database error details.

## Operations and release gates

- Back up the customer's Supabase database and Storage separately. This Compose file does not configure scheduled backups or prove a customer's recovery objectives.
- Apply migrations from the reviewed source revision using the agreed Supabase deployment process. Do not enable runtime flags until the migration history, tenant data, RLS, Auth profiles, and Storage policies have been checked in that customer's non-production environment.
- The user-directory migration builds ordinary GIN indexes on `profiles`; for a large existing profile table, estimate duration and disk use on a staging copy, then schedule a maintenance window because writes to `profiles` wait while each index is built.
- Put the service behind TLS and configure firewall rules. Do not expose the Supabase secret key, database password, or database port to browsers.
- To update, build the selected source revision and replace the container only after its CI run passes. Keep the prior image available for rollback.
- The current CI image smoke test proves container build/startup and that Firebase packages are absent from the production image. It does not prove authentication against a customer Supabase project, migrate customer data, or establish on-premise readiness for a complete Supabase stack.

The Supabase credentials previously shared in chat must be rotated before any real deployment. Store replacement values in the host's secret manager or an ignored local `.env` file.

