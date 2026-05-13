# RM-0062: Claude Code artifact verification

- Status: Implemented
- Priority: P2
- Area: release
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - ADR-0019 (`../adr/0019-claude-code-hooks-over-mcp-http.md`)
- Related items:
  - RM-0060 (release checklist aggregator)
  - RM-0061 (release artifact verification)
  - RM-0027 (npm publishing pipeline)

## Problem

Confirm Claude Code hook and skill artifacts are intentionally present or intentionally removed before release.

## Goal

The roadmap concern is tracked independently with enough context to design, prioritize, implement, defer, or supersede it without expanding `docs/ROADMAP.md`.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not record durable architecture decisions here; create or update an ADR when a decision is accepted.

## Proposed scope

- Preserve the intent of the original roadmap entry.
- Refine detailed behavior, affected packages, and verification steps when this item is selected for implementation.
- Link implementation PRs, ADRs, or follow-up items back to this record.

## Implementation status

- Policy selected: Claude Code artifacts remain intentionally absent from release outputs.
- Added release verification script: `scripts/verify-claude-artifacts.mjs`.
- Added regression tests: `scripts/verify-claude-artifacts.test.mjs`.
- Wired release gate in `.github/workflows/release.yml` before package packing.

## Acceptance criteria

- The item is either implemented, intentionally deferred, superseded, or decomposed into smaller roadmap items.
- Relevant documentation, tests, or release notes are updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.

## Design notes

RM-0062 remains a concrete Claude Code artifact verification child item under RM-0060 unless later merged with RM-0061.

## Dependencies

Feeds RM-0060 and may depend on RM-0061 when Claude Code artifacts are packaged or published.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
