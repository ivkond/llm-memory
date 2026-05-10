# RM-0060: Full release quality gates

- Status: Proposed
- Priority: P2
- Area: release
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0040 (static-analysis lint gate)
  - RM-0041 (formatting checks)
  - RM-0043 (CI quality gates)
  - RM-0027 (npm publishing pipeline)
  - RM-0061 (release artifact verification)
  - RM-0062 (Claude Code artifact verification)
  - RM-0058/RM-0059/RM-0063 (superseded process slices)

## Problem

Re-run the full quality gate set before release: install/build/typecheck, lint/format checks, unit/adapter/integration tests, and coverage if configured.

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

RM-0060 is the release checklist aggregator. It should collect evidence from concrete quality gates, publishing, and artifact checks rather than duplicate their implementation.

## Dependencies

Depends on concrete gate/artifact items RM-0040, RM-0041, RM-0043, RM-0061, RM-0062, and the publishing lane in RM-0027.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
