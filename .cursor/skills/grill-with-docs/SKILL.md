---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
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



Call the Skill tool twice, for "grilling" and "domain-modeling".
