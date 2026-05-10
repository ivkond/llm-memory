# RM-0002: Recovery and diagnostics commands

- Status: Proposed
- Priority: P0
- Area: operations
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0001 (operation journal)
  - RM-0016 (status aggregator)
  - RM-0026 (health diagnostics reporting)
  - RM-0037 (quality metrics candidate)

## Problem

Add recovery and diagnostic commands such as `doctor`, `recover`, `repair-index`, `recover-worktrees`, and `verify-state` to reconcile Git state, worktrees, indexes, archives, and runtime state.

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

RM-0002 owns actionable recovery commands and repair flows, not the status aggregation surface.

## Dependencies

Depends on RM-0001 for operation history. Consumes health signals from RM-0014/RM-0026 but owns recovery and repair commands.

## Risks and trade-offs

- Over-engineering could make solo local usage harder.
- Under-specifying the behavior could leave reliability or memory-quality gaps hidden until later.

## Open questions

None.
