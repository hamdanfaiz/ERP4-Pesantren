---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a GLOSSARY.md, or recording or editing an ADR.
disable-model-invocation: true
---

## ERP4 Pesantren project integration (local adaptation)

This block takes precedence over the upstream workflow below. Read repository
AGENTS.md and its mandatory architecture/domain guides before using this skill.
Installation is not activation. Use only when explicitly requested by the user,
or as a supporting skill of an explicitly requested workflow.

- Preserve business rules, classification and publish/search meaning, existing
  UI identity, data, permissions, and running pipelines. This skill grants no
  permission to redesign, delete/rewrite data, deploy, enable flags, install
  packages, or run migrations outside the user's authorized task.
- Existing project components, templates, tokens, i18n and permission guards
  outrank generic design recommendations. Review requests remain read-only.
- Test only approved behavior at relevant public boundaries. Existing session
  authorization remains valid; do not repeatedly ask for the same approval.
  Use isolated fixtures, never production writes for a red test. Do not delete
  working code to restart a TDD cycle or weaken tests to force a pass.
- Keep existing architecture records and worklogs; append agreed decisions.
  Put new glossary/design records under docs/ using existing conventions,
  never create extra root documents or overwrite project rules.
- Do not enable hooks, auto-updates, telemetry, or external binary downloads as
  a side effect. Impeccable's optional engine is not preinstalled by this task;
  use its documented manual context fallback when it is unavailable.
- Resolve skill paths from the installed directory under .agents/skills;
  do not assume CLAUDE_PLUGIN_ROOT or a Skill tool exists. For grill-with-docs,
  read ../grilling/SKILL.md and ../domain-modeling/SKILL.md directly if needed.
  Optional codebase-design/code-review references are not installed; follow
  repository architecture and review guidance rather than fetching new skills.
- Do not spawn agents unless current user/repository instructions authorize it.
  Concise communication must retain all constraints, negations and evidence.



# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `GLOSSARY.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Most repos have a single context:

```
/
├── GLOSSARY.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `GLOSSARY-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── GLOSSARY-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── GLOSSARY.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── GLOSSARY.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. If no `GLOSSARY.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `GLOSSARY.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update GLOSSARY.md inline

When a term is resolved, update `GLOSSARY.md` right there. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

`GLOSSARY.md` should be totally devoid of implementation details. Do not treat `GLOSSARY.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
