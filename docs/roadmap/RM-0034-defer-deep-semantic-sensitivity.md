# RM-0034: Defer deep semantic sensitivity analysis

- Status: Deferred
- Priority: P2
- Area: scope
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0035 (privacy/sensitivity deferred-scope theme)
  - RM-0036 (privacy/sensitivity deferred-scope theme)

## Problem

Keep deep semantic sensitivity analysis beyond pattern-based sanitization deferred.

## Goal

The roadmap concern is tracked independently with enough context to design, prioritize, implement, defer, or supersede it without expanding `docs/ROADMAP.md`.

## Non-goals

- Do not implement this scope unless the item status changes from Deferred.
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

Part of a deferred privacy/sensitivity scope theme. Keep deferred unless a security/privacy ADR narrows and accepts this product scope.

## Dependencies

None while Deferred; related privacy/sensitivity items should be reviewed together if any status changes.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
