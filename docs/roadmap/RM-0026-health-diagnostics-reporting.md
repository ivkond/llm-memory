# RM-0026: Health diagnostics reporting

- Status: Proposed
- Priority: P1
- Area: maintenance
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0002 (recovery commands consume diagnostics)
  - RM-0010 (contradiction diagnostics)
  - RM-0016 (status aggregator)
  - RM-0037 (quality metrics candidate)

## Problem

Report health issues through `wiki_lint` or status-style diagnostics without silently modifying unrelated content.

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

RM-0026 owns non-mutating health/lint diagnostic reporting with severity and machine-readable output.

## Dependencies

Consumes detector outputs such as RM-0010 and RM-0014. Feeds RM-0016 and recovery guidance in RM-0002.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
