---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
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



Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
