---
name: erp4-pesantren
description: >-
  ERP4 Pesantren project map. Use when an agent works in this repository and
  needs the React plus Supabase runtime, the gitignored env file, or the
  Supabase project that this checkout is configured to use.
---

# ERP4 Pesantren

This repository is the ERP4 Pesantren application. The interface is React (Vite). The API is the Express server in `server.ts`. Auth, Postgres, and Storage are Supabase.

## Environment

- The process reads the gitignored `.env` at the repository root. `fromoutside/.env` is the source copy that was aligned into that file.
- Browser configuration is `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only.
- `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, and the PII keys stay on the server. Do not print them, commit them, or copy them into a `VITE_` variable.
- Production is PTSAS `ptsasgdvgrbdtgyqieie`; staging rehearsal is VQE `vqemuyzveuirlkvdggjd` for the release path authorized by the owner on 13 November 2026.
- Verify the target project ref before any database connection. Keep staging and Production credentials separate; never copy dummy data between them.

## Runtime

- `npm run dev` starts `tsx server.ts` and serves the React app.
- Module flags in `.env` are fail-closed. A flag that is `false` keeps that module off.
- Do not apply the full unrecorded migration gap to Production just to make the ledger count match. Prefer local/CI checks, VQE staging rehearsal, dependency reconciliation, and recoverable backup evidence. A direct Production release is allowed only when the same release gates are independently proven against Production, the exact reviewed migration set is known, and the backend team has supplied recoverable backup evidence. Academic work and the objects it calls are authorized on Production by `.cursor/rules/academic-production.mdc`.

Skills for this checkout live in `.cursor/skills`.

## Multi-agent handoff (read first)

- Mandatory: `docs/active/00_PRODUCT/AGENT_START_HERE.md`
- Relasi & Ekosistem + Analitik + OpenWA (13 Nov 2026): `docs/active/00_PRODUCT/CHECKPOINT_2026-11-13_RELASI_EKOSISTEM_OPENWA.md`
- Cursor rules: `.cursor/rules/agent-start-here.mdc` (always), `.cursor/rules/relasi-ekosistem-openwa.mdc` (when touching those modules)
- WhatsApp: OpenWA Easy API via `WA_GATEWAY_ENDPOINT` / tenant `waGatewayEndpoint` + `WA_GATEWAY_API_KEY`. Do not embed wa-automate in the Express process.

## UI consistency (agent rules)

- Loading while data is in flight: `.cursor/rules/ui-loading-skeleton.mdc` — use `ERPLoadingSkeleton` from `src/components/ERPDesignSystem.tsx`.
- Feedback after user actions: `.cursor/rules/ui-action-notifications.mdc` — inline `role="status"` / `role="alert"` banners.

## Academic report card

Semester report cards, the KKTP threshold, homeroom comments, and publication follow `.cursor/rules/academic-report-card.mdc`. Finish the Academic module and the related objects its screens call on Production PTSAS, as required by `.cursor/rules/academic-production.mdc`. The report-card migration is already applied; do not apply `supabase/migrations/20270309000000_academic_report_card.sql` again. Do not turn on `SUPABASE_ACADEMIC_RUNTIME_ENABLED` while those called objects are still missing.
