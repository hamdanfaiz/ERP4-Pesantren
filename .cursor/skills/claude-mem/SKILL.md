---
name: claude-mem
description: Notes what claude-mem is. The worker, hooks, and MCP are not installed in this checkout.
disable-model-invocation: true
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


claude-mem is a separate session-memory product. It compresses tool activity into local observations and can inject them into a later session. Its data normally lives in `~/.claude-mem`.

This checkout does not install that product.

- Do not run `npx claude-mem install`.
- Do not add its hooks, worker, or MCP server.
- Do not send project files or secrets to a remote memory service.

Project memory for other agents stays in `AGENTS.md`, `docs/`, and `.agents/skills/`.
