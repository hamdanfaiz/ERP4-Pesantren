# Customer-managed deployment (Docker)

This package runs the ERP web application and API in a hardened container. It connects to a separate Supabase project selected by the customer. It does not install or operate PostgreSQL, Supabase Auth, Storage, or the Supabase API gateway; on-premise customers must provide a supported Supabase endpoint reachable from both user browsers and the application container.

## Requirements

- Docker Engine with Docker Compose v2 on a VPS or on-premise Linux host.
- A Supabase API endpoint and database controlled by the customer or their hosting provider.
- Applied and verified database migrations before enabling any `SUPABASE_*_RUNTIME_ENABLED` feature flag.
- The Document Digital workflow requires `20270117000000_document_center_core.sql` and a reviewed private Storage bucket before setting `SUPABASE_DOCUMENT_RUNTIME_ENABLED=true`.
- Document attachments are PDF-only and limited to 25 MiB; OCR and digital-signature workflows are not included in this runtime slice.
- A TLS reverse proxy and a DNS name for production access. Keep port 3000 private to that proxy or the trusted network.

## Configure

Create an ignored `.env` file in the repository root (it is excluded from the Docker build context) with these values:

```dotenv
VITE_SUPABASE_URL=https://supabase.example.org
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SUPABASE_URL=https://supabase.example.org
SUPABASE_SECRET_KEY=sb_secret_replace_me
ERP4_HTTP_PORT=3000
```

`VITE_SUPABASE_URL` must be reachable from each user's browser. `SUPABASE_URL` must be reachable from the container and may use a private address. The publishable key is embedded in the browser build; the secret key is passed only to the server container. Never put a secret key in a `VITE_` variable or commit `.env`.

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
