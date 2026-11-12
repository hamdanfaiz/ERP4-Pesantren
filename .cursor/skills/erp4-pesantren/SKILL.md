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
- The only database for this checkout is Production PTSAS `ptsasgdvgrbdtgyqieie` at `https://ptsasgdvgrbdtgyqieie.supabase.co`.
- Do not connect to, query, migrate, or copy data into staging VQE `vqemuyzveuirlkvdggjd`. Ignore leftover `STAGING_` keys and older notes that tell an agent to use staging.

## Runtime

- `npm run dev` starts `tsx server.ts` and serves the React app.
- Module flags in `.env` are fail-closed. A flag that is `false` keeps that module off.
- Do not apply the full unrecorded migration gap to Production just to make the ledger count match. Academic work and the objects it calls are authorized on Production by `.cursor/rules/academic-production.mdc`.

Skills for this checkout live in `.cursor/skills`.

## Academic report card

Semester report cards, the KKTP threshold, homeroom comments, and publication follow `.cursor/rules/academic-report-card.mdc`. Finish the Academic module and the related objects its screens call on Production PTSAS, as required by `.cursor/rules/academic-production.mdc`. The report-card migration is already applied; do not apply `supabase/migrations/20270309000000_academic_report_card.sql` again. Do not turn on `SUPABASE_ACADEMIC_RUNTIME_ENABLED` while those called objects are still missing.
