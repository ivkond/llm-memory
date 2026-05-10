# RM-0024: Health check contradiction detection

- Status: Superseded
- Priority: P1
- Area: maintenance
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0010 (supersedes this detector)
  - RM-0026 (diagnostic reporting surface)

## Problem

Detect contradictions between wiki pages as part of LLM-enhanced health checks.

## Goal

Preserve traceability for the former health-check contradiction item while implementation proceeds through RM-0010.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not record durable architecture decisions here; create or update an ADR when a decision is accepted.

## Proposed scope

- Do not implement a standalone contradiction detector here.
- Treat health-check presentation as acceptance criteria for RM-0010 and RM-0026.

## Acceptance criteria

- The item is either implemented, intentionally deferred, superseded, or decomposed into smaller roadmap items.
- Relevant documentation, tests, or release notes are updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.

## Design notes

Superseded by RM-0010. RM-0010 owns contradiction detection; RM-0026 owns health diagnostics reporting.

## Dependencies

Superseded by RM-0010.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
