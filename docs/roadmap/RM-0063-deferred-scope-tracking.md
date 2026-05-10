# RM-0063: Deferred scope tracking before release

- Status: Superseded
- Priority: P2
- Area: release
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0060 (supersedes this process slice)
  - RM-0030 (deferred scope boundary)
  - RM-0034/RM-0035/RM-0036 (privacy/sensitivity deferred-scope theme)

## Problem

Deferred scope tracking before release is a release-checklist concern, not standalone product work.

## Goal

Preserve traceability while RM-0060 owns the release checklist aggregation.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not record durable architecture decisions here; create or update an ADR when a decision is accepted.

## Proposed scope

- Do not implement this as a standalone release/process item.
- Carry any remaining checklist value into RM-0060.

## Acceptance criteria

- The item is either implemented, intentionally deferred, superseded, or decomposed into smaller roadmap items.
- Relevant documentation, tests, or release notes are updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.

## Design notes

Superseded by RM-0060 because this process slice adds no independent product value beyond the release checklist.

## Dependencies

Superseded by RM-0060.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
