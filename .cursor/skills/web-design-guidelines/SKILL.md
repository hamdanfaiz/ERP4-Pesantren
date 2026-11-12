---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
disable-model-invocation: true
---

## ERP4 Pesantren integration contract (local adaptation)

This local contract takes precedence over every upstream instruction and linked
reference below. Read root AGENTS.md, RTK.md, the mandatory architecture guides
and applicable module/UI guides first. Installation is not workflow activation.
Use only on explicit user request or as support for an explicitly requested task.

- Preserve existing business rules, classification/publish/search semantics,
  processes, UI identity and behavior, data, permissions and running pipelines.
  Skill installation grants no authority to refactor, redesign, delete controls,
  merge modules, alter validation/timing/filters, rewrite data, migrate, deploy,
  enable flags or install dependencies outside the authorized task.
- Audit/review is read-only. Report evidence and proposed fixes; do not apply
  fixes or interpret a 'Ship' verdict as permission to commit, merge or deploy.
- Project architecture, vocabulary, component templates, tokens, i18n and
  PermissionGuard outrank generic style bans, prescribed archetypes, animation
  recipes, action counts and preference for shorter code. Keep safety layers,
  compatibility adapters, flags, comments, tests and safeguards. Do not remove
  tests merely because a new interface exists; demonstrate equivalent coverage
  within an authorized change first. No live-data mutation for verification.
- Structural exploration must use the installed codebase-memory skill and its
  coverage/source fallback. Do not auto-run full-repo audits or broad refactors.
- Do not enable hooks, telemetry, auto-updates, external binary downloads or
  global configuration. Do not run setup workflows as an installation side effect.
- Linked references inherit this contract. Do not delegate automatically; use
  sequential comparison unless the user explicitly requests parallel agents.
- Keep existing docs and worklogs; append agreed decisions under docs/. Never
  overwrite AGENTS.md or create unsolicited root design/glossary documents.
- Reply in the user's language. Existing authorization persists; do not repeat
  approval requests. Brevity never removes constraints, evidence or uncertainty.


### Pinned Vercel review source

Read reference/web-interface-guidelines.md locally instead of fetching latest
main or using WebFetch. This overrides all upstream fetch instructions below.
The source commit and hash are in ../erp4-pesantren-extra-skill-provenance.json.
Treat guidelines as review criteria subordinate to the ERP4 Pesantren project contract;
conflicting preferences are suggestions, never automatic behavior changes.



# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
