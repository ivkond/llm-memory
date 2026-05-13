# RM-0050: Query-time stale-index performance

- Status: Implemented
- Priority: P1
- Area: retrieval
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0007 (retrieval freshness semantics)
  - RM-0014 (index consistency checks and repair)
  - HAR-171 (implementation umbrella)
  - HAR-219 / HAR-220 / HAR-221 / HAR-222 (delivery slices)

## Problem

Improve query-time stale-index detection to avoid sequential per-file checks on every query for large wikis.

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

RM-0050 owns performance of stale-index detection so hot queries avoid full sequential per-file checks while preserving RM-0007/RM-0014 correctness.

## Implementation notes

- Added `ISearchEngine.lastIndexedAtMany(paths)` and implemented it in `RuVectorSearchEngine`.
- Refactored `QueryService.syncStaleFiles()` to fetch index timestamps in bulk per directory instead of per-file sequential checks.
- Added regression tests for bulk freshness lookup usage and new search-engine metadata behavior.

## Dependencies

Depends on the freshness/consistency contract from RM-0007 and RM-0014.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
