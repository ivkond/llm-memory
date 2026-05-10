# RM-0037: Wiki quality metrics

- Status: Proposed
- Priority: P2
- Area: maintenance
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0002 (recovery/diagnostics workstream)
  - RM-0016 (status aggregator)
  - RM-0026 (health diagnostics reporting)
  - RM-0008 (retrieval evaluation)

## Problem

Consider wiki quality metrics based on recall/query frequency.

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

RM-0037 is a metrics candidate for the diagnostics/health workstream, not a replacement for recovery commands or status reporting.

## Dependencies

Should follow basic diagnostics/reporting foundations in RM-0016 and RM-0026.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
