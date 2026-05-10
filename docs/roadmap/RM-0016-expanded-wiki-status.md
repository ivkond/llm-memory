# RM-0016: Expanded wiki status diagnostics

- Status: Proposed
- Priority: P2
- Area: operations
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0002 (recovery commands)
  - RM-0014 (index consistency signals)
  - RM-0026 (health diagnostics reporting)
  - RM-0037 (quality metrics candidate)

## Problem

Expand `wiki_status` to report raw and unconsolidated record counts, stale index state, pending or failed operations, last maintenance timestamps, contradictions, orphan pages, and broken links.

## Goal

The memory system handles this concern as a first-class product capability rather than an implicit behavior or operational assumption.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not introduce hosted or team-enterprise requirements unless a separate ADR or roadmap item accepts that scope.

## Proposed scope

- Define the detailed behavior for this capability.
- Update the relevant core, infrastructure, common, MCP, or CLI surfaces as needed.
- Add tests and documentation appropriate to the affected package boundaries.

## Acceptance criteria

- The capability is implemented or explicitly decomposed into smaller accepted roadmap items.
- Relevant tests or verification checks cover the expected behavior.
- User-facing documentation or status output is updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.

## Design notes

RM-0016 owns the `wiki_status` aggregation surface. It should summarize signals without duplicating detector or repair logic.

## Dependencies

Depends on detector/reporting signals from RM-0014, RM-0026, RM-0001, and related health items.

## Risks and trade-offs

- Over-engineering could make solo local usage harder.
- Under-specifying the behavior could leave reliability or memory-quality gaps hidden until later.

## Open questions

None.
