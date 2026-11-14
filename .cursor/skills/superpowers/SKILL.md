---
name: superpowers
description: Index of the vendored Superpowers skill library (plan, test, debug, review). Explicit use only.
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


The library is in `library/`. Read only the skill the user named.

| Skill | Path |
| --- | --- |
| using-superpowers | library/using-superpowers/SKILL.md |
| brainstorming | library/brainstorming/SKILL.md |
| writing-plans | library/writing-plans/SKILL.md |
| executing-plans | library/executing-plans/SKILL.md |
| test-driven-development | library/test-driven-development/SKILL.md |
| systematic-debugging | library/systematic-debugging/SKILL.md |
| verification-before-completion | library/verification-before-completion/SKILL.md |
| requesting-code-review | library/requesting-code-review/SKILL.md |
| receiving-code-review | library/receiving-code-review/SKILL.md |
| using-git-worktrees | library/using-git-worktrees/SKILL.md |
| subagent-driven-development | library/subagent-driven-development/SKILL.md |
| dispatching-parallel-agents | library/dispatching-parallel-agents/SKILL.md |
| finishing-a-development-branch | library/finishing-a-development-branch/SKILL.md |
| writing-skills | library/writing-skills/SKILL.md |
| diagnosing-superpowers | library/diagnosing-superpowers/SKILL.md |

Upstream `using-superpowers` tells an agent to invoke skills before every reply. That instruction does not apply in this checkout. `AGENTS.md` remains the contract.
