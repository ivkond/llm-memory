# RM-0010: Contradiction detection

- Status: Proposed
- Priority: P1
- Area: retrieval
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - ADR-0022 page-level unresolved conflict detection
- Related items:
  - RM-0024 (superseded health-check duplicate)
  - RM-0026 (reports contradiction diagnostics)

## Problem

Extend `wiki_lint` or related maintenance flows with contradiction detection, unresolved-conflict reporting, and safeguards against silently smoothing over conflicting knowledge.

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

RM-0010 owns the contradiction detection capability. Health/status presentation is consumed by RM-0026/RM-0016 rather than tracked as a separate detector.

## Dependencies

RM-0005 provenance metadata and either RM-0009 claims or a simpler page-level comparison model.

## Risks and trade-offs

- Over-engineering could make solo local usage harder.
- Under-specifying the behavior could leave reliability or memory-quality gaps hidden until later.

## Open questions

None.
