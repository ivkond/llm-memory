# RM-0017: Backup, snapshot, and restore commands

- Status: Proposed
- Priority: P2
- Area: operations
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - None

## Problem

Add backup, snapshot, restore, export, and snapshot-verification commands for explicit operational safety beyond Git history alone.

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

This item comes from the LLM memory hardening backlog and should preserve the core product direction: local-first, Git-backed, Markdown-based, self-maintaining LLM memory.

## Dependencies

None identified yet.

## Risks and trade-offs

- Over-engineering could make solo local usage harder.
- Under-specifying the behavior could leave reliability or memory-quality gaps hidden until later.

## Open questions

None.
