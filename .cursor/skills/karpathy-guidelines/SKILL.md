---
name: karpathy-guidelines
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria.
license: MIT
disable-model-invocation: true
---

## ERP4 Pesantren integration contract (local adaptation)

This local contract takes precedence over every upstream instruction below.
Read root AGENTS.md, RTK.md, the mandatory architecture guides and applicable
module/UI guides first. Installation is not workflow activation. Use only on
explicit user request or as support for an explicitly requested task.

- Preserve existing business rules, classification/publish/search semantics,
  processes, UI identity and behavior, data, permissions and running pipelines.
  Skill installation grants no authority to refactor, redesign, delete controls,
  merge modules, alter validation/timing/filters, rewrite data, migrate, deploy,
  enable flags or install dependencies outside the authorized task.
- "Simplicity First" never justifies removing safety layers, compatibility
  adapters, feature flags, existing error handling, comments, tests or
  safeguards. Project architecture, vocabulary, component templates, tokens,
  i18n and PermissionGuard outrank generic preference for shorter code.
- "Surgical Changes" does not narrow mandatory project work such as required
  docs, progress entries, i18n pairs or role seeds for the authorized change.
- "Think Before Coding" questions apply to real blockers only. Existing
  authorization persists; do not repeat approval requests already answered.
- "Goal-Driven Execution" loops stay inside the authorized scope. Verification
  never authorizes live-data mutation, production writes, SQL application, flag
  changes, deployment, or commits. Report failed or skipped checks plainly.
- Structural exploration must use the installed codebase-memory skill and its
  coverage/source fallback. Do not auto-run full-repo audits or broad refactors.
- Do not enable hooks, telemetry, auto-updates or global configuration. Do not
  delegate automatically. Keep existing docs and worklogs; never overwrite
  AGENTS.md or create root CLAUDE.md/guideline files from this skill.
- Reply in the user's language.

The source commit and hash are in ../erp4-pesantren-extra-skill-provenance.json.


# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
