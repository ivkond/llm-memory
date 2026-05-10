# RM-0061: Release artifact verification

- Status: Proposed
- Priority: P2
- Area: release
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0060 (release checklist aggregator)
  - RM-0027 (npm publishing pipeline)
  - RM-0062 (Claude Code artifact verification)

## Problem

Confirm release artifacts and package names match current workspace package names before npm publication.

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

RM-0061 remains a concrete artifact verification child item under RM-0060, linked to npm publishing.

## Dependencies

Depends on RM-0027 package publishing setup and feeds RM-0060 release readiness.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
