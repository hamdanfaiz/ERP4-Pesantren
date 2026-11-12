---
name: playwright
description: Check a local web page with Playwright when the user asks for a Playwright test. Reuse the Vite server that is already running.
disable-model-invocation: true
license: Upstream guidance is Anthropic webapp-testing (anthropics/skills).
---

## ERP4 Pesantren project integration (local adaptation)

This block takes precedence over the upstream text below. Read root AGENTS.md
before using this skill. Having the files in the checkout does not turn the
workflow on. Use it only when the user explicitly asks for this skill.

- Do not change business rules, classification, publish or search meaning, UI,
  data, permissions, or running pipelines.
- Do not install hooks, workers, browsers, plugins, or MCP servers because this
  skill is present. Do not run an installer.
- Do not create git worktrees, delete tests, deploy, or rewrite production
  configuration unless the user asked for that step.


This project's browser check already uses the operator's running Vite and the Cursor browser. Read `docs/guides/local-vite-browser-agent-access.md` first.

- Do not run `npm run dev` or another Vite while one is already listening.
- Do not download Playwright browsers or add a dependency unless the user asks for a Playwright script.
- Do not point a test at production data writes.

When a Playwright script is requested, wait until the page is idle, then read the rendered page before choosing selectors. Prefer the existing app origin. A static HTML file can be read directly.
