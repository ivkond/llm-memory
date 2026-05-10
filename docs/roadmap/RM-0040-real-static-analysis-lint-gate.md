# RM-0040: Real static-analysis lint gate

- Status: Proposed
- Priority: P1
- Area: quality
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0041 (formatting checks)
  - RM-0043 (CI quality gates)
  - RM-0060 (release checklist aggregator)

## Problem

Ensure linting is a real static-analysis gate, not only TypeScript compilation.

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

RM-0040 owns the concrete static-analysis/lint gate; RM-0060 only aggregates it into release readiness.

## Dependencies

Feeds RM-0043 and RM-0060 when lint/static analysis is part of CI and release verification.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
