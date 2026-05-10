# RM-0038: Additional import sources

- Status: Proposed
- Priority: P2
- Area: integrations
- Source roadmap item: `../ROADMAP.md`
- Related ADRs:
  - None
- Related items:
  - RM-0020 (import umbrella)
  - RM-0021 (first-wave native adapter item)
  - RM-0022 (verbatim import invariant)
  - RM-0023 (per-agent import state)

## Problem

Consider additional import sources beyond the v2 adapter set, such as Qwen, Antigravity, Kiro, and Amp.

## Goal

The roadmap concern is tracked independently with enough context to design, prioritize, implement, defer, or supersede it without expanding `docs/ROADMAP.md`.

## Non-goals

- Do not change unrelated roadmap scope.
- Do not record durable architecture decisions here; create or update an ADR when a decision is accepted.

## Proposed scope

- Preserve the intent of the original roadmap entry.
- Refine detailed behavior, affected packages, and verification steps when this item is selected for implementation.
- Link implementation PRs, ADRs, or follow-up items back to this record.

## Acceptance criteria

- The item is either implemented, intentionally deferred, superseded, or decomposed into smaller roadmap items.
- Relevant documentation, tests, or release notes are updated when behavior changes.
- Any durable architecture decision discovered during design is recorded as an ADR.

## Design notes

This is a concrete child item under the RM-0020 import umbrella for later source expansion beyond the first native-adapter wave.

## Dependencies

Depends on the RM-0020 import umbrella and should follow RM-0021/RM-0022/RM-0023 unless a source becomes release-critical.

## Risks and trade-offs

- Leaving the item under-specified may hide implementation risk until late in the release cycle.
- Over-specifying too early may constrain a simpler implementation.

## Open questions

None.
