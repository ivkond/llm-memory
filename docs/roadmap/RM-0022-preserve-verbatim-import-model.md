# RM-0022: Preserve verbatim import model

- Status: Proposed
- Priority: P1
- Area: memory-model
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0005 (general verbatim metadata foundation)
  - RM-0020 (import umbrella)
  - RM-0021 (native import adapters)
  - RM-0023 (per-agent import state)

## Problem

Preserve the current import model where external agent memories become verbatim entries under `log/{agent}/raw/`, then flow through lint and consolidation, while using the general metadata model from RM-0005.

## Goal

Keep imports auditable as raw source records without duplicating the general verbatim metadata design owned by RM-0005.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not record durable architecture decisions here; create or update an ADR when a decision is accepted.

## Proposed scope

- Apply RM-0005 metadata requirements to imported records.
- Define import-specific invariants for `log/{agent}/raw/`, source identity, replay safety, and later lint/consolidation.
- Avoid source adapters writing directly to canonical pages.

## Acceptance criteria

- The item is either implemented, intentionally deferred, superseded, or decomposed into smaller roadmap items.
- Relevant documentation, tests, or release notes are updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.

## Design notes

This item was extracted from `docs/ROADMAP.md` so the roadmap can remain an index while detailed work items evolve independently.

## Dependencies

Depends on RM-0005 for the general verbatim metadata model.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
