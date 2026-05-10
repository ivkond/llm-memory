# RM-0021: Native memory import adapters for additional agents

- Status: Proposed
- Priority: P1
- Area: integrations
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0020 (import umbrella)
  - RM-0022 (verbatim import invariant)
  - RM-0023 (per-agent import state)
  - RM-0038 (later source expansion)

## Problem

Add native memory import adapters for Cursor, Codex, KiloCode, and OpenCode.

## Goal

The roadmap concern is tracked independently with enough context to design, prioritize, implement, defer, or supersede it without expanding `docs/ROADMAP.md`.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not record durable architecture decisions here; create or update an ADR when a decision is accepted.

## Proposed scope

- Preserve the intent of the original roadmap entry.
- Refine detailed behavior, affected packages, and verification steps when this item is selected for implementation.
- Link implementation PRs, ADRs, or follow-up items back to this record.

## Acceptance criteria

- The item is either implemented, intentionally deferred, superseded, or decomposed into smaller roadmap items.
- Relevant documentation, tests, or release notes are updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.

## Design notes

This item was extracted from `docs/ROADMAP.md` so the roadmap can remain an index while detailed work items evolve independently.

## Dependencies

Depends on RM-0020 sequencing, RM-0022 import-model constraints, and RM-0023 state tracking.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
