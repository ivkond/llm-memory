# RM-0020: Import integrations umbrella

- Status: Proposed
- Priority: P1
- Area: integrations
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0021 (native agent import adapter child item)
  - RM-0022 (import-model constraint)
  - RM-0023 (per-agent import state)
  - RM-0038 (additional import source child item)

## Problem

Coordinate memory import integration work across native agents, additional sources, provenance constraints, state tracking, and source safety.

## Goal

Use this item as the import workstream umbrella so concrete source-specific work remains in child roadmap items.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not introduce hosted or team-enterprise requirements unless a separate ADR or roadmap item accepts that scope.

## Proposed scope

- Define the shared import-adapter contract and sequencing.
- Track cross-cutting import concerns such as provenance, idempotency, state, and source-safety dependencies.
- Keep source-specific implementation in RM-0021 and RM-0038.

## Acceptance criteria

- The capability is implemented or explicitly decomposed into smaller accepted roadmap items.
- Relevant tests or verification checks cover the expected behavior.
- User-facing documentation or status output is updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.

## Design notes

RM-0020 is an epic/umbrella, not an independent adapter implementation. Its children provide concrete source support.

## Dependencies

Depends on RM-0005 provenance metadata and RM-0015/RM-0048 source hardening before broad untrusted imports.

## Risks and trade-offs

- Over-engineering could make solo local usage harder.
- Under-specifying the behavior could leave reliability or memory-quality gaps hidden until later.

## Open questions

None.
