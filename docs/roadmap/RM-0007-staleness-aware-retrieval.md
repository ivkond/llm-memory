# RM-0007: Staleness-aware retrieval

- Status: Proposed
- Priority: P0
- Area: retrieval
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0014 (consistency checks and repair)
  - RM-0050 (performance of stale-index detection)
  - RM-0009 (optional claim-level model)

## Problem

Make retrieval staleness-aware by honoring page or claim metadata such as status, update time, supersession links, and confidence.

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

RM-0007 owns retrieval semantics for stale, superseded, low-confidence, or outdated memory. RM-0014 checks consistency; RM-0050 optimizes stale-index detection performance.

## Dependencies

Depends on page/claim metadata from RM-0005/RM-0006 and any accepted RM-0009 claim model.

## Risks and trade-offs

- Over-engineering could make solo local usage harder.
- Under-specifying the behavior could leave reliability or memory-quality gaps hidden until later.

## Open questions

None.

## Implementation status (2026-05-13)

- Page-level staleness-aware retrieval is implemented:
  - query-time freshness policy supports `prefer_fresh` and `exclude_stale`;
  - citations include freshness metadata (`freshness_status`, `freshness_reasons`, `confidence`, `supersedes`);
  - adapter metadata propagation and CLI/MCP query controls are in place.
- Claim-level staleness-aware retrieval remains deferred pending RM-0009.
