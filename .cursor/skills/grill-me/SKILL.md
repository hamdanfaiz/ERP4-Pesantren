---
name: grill-me
description: A relentless interview to sharpen a plan or design. In this checkout the interview is the existing grilling skill.
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


Upstream `grill-me` says to use the grilling skill. In this project that skill is already installed:

Read [`grilling/SKILL.md`](../grilling/SKILL.md).

For a design that must stay tied to existing documents, read [`grill-with-docs/SKILL.md`](../grill-with-docs/SKILL.md) as well.
