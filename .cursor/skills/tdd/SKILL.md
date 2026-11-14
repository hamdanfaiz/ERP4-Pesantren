---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
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



# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `GLOSSARY.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?" Give each proposed seam a one-line note on what it catches and what it misses.

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "codebase-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.
