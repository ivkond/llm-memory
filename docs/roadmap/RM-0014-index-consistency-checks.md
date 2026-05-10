# RM-0014: Search and index consistency checks

- Status: Proposed
- Priority: P1
- Area: operations
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0007 (retrieval freshness semantics)
  - RM-0016 (status aggregator)
  - RM-0050 (stale-index performance)

## Problem

Add search and index consistency checks that compare Git-tracked Markdown files, BM25 index state, vector index state, and runtime state.

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

RM-0014 owns index consistency checks and repair guidance. It should not define retrieval ranking semantics or query-time performance strategy.

## Dependencies

Depends on the freshness contract from RM-0007 when consistency findings affect retrieval behavior.

## Risks and trade-offs

- Over-engineering could make solo local usage harder.
- Under-specifying the behavior could leave reliability or memory-quality gaps hidden until later.

## Open questions

None.
