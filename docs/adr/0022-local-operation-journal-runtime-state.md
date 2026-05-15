# ADR-0022: Local operation journal runtime state

- Status: Accepted
- Date: 2026-05-14
- Source documents:
  - `docs/roadmap/RM-0001-operation-journal.md`
  - `docs/roadmap/RM-0002-recovery-diagnostics.md`

## Context

RM-0001 needs a durable operation journal so interrupted write flows can be inspected and resumed locally. The runtime already stores machine-local operational artifacts in `.local/` (for example state and search database). We need a first implementation slice that keeps this journal local, redacted, and resilient to malformed or partially-written data.

## Decision

Use `.local/operations/` as machine-local operational state for the operation journal.

- Persist operation records as append-only JSON lines in `.local/operations/journal.jsonl`.
- Operation types for this capability are:
  - `remember_fact`
  - `remember_session`
  - `import`
  - `ingest`
  - `lint`
  - `consolidate`
  - `promote`
  - `reindex`
  - `archive`
- Baseline statuses are:
  - `running`
  - `succeeded`
  - `failed`
  - `interrupted`
  - `blocked_or_conflict`
- Persist only safe metadata:
  - request metadata fields that are non-content and non-secret (for example request IDs or source tags)
  - touched paths
  - worktree metadata
  - commit SHA
  - sanitized error information
  - disabled and resume reasons
- Never persist raw remembered content, prompts, API keys, or full external file contents in the journal.
- Load behavior is fault-tolerant:
  - malformed records are skipped and surfaced as degraded reasons
  - trailing partial-write fragments are treated as degraded load, not fatal
  - storage/path safety failures surface a visible disabled reason
- RM-0001 owns the journal foundation and diagnostics surface; RM-0002 owns broader recovery UX and advanced resume flows that build on this foundation.

## Consequences

- Journal data stays local-first and aligned with existing `.local/` operational state.
- Basic recovery diagnostics become available immediately without blocking on full resume orchestration.
- Consumers must tolerate degraded journal snapshots and handle disabled reasons.

## Alternatives considered

- Keep operation state in memory only: rejected because interruptions lose state.
- Store journal records under wiki content directories: rejected because operational logs are not wiki knowledge content.
- Use a relational database first: rejected for this slice to keep implementation small and local-file-first.

## Implementation notes

- Core types and port define operation record semantics and safe metadata shape.
- Infra adapter owns filesystem persistence, path safety checks, append/load behavior, and degraded/disabled reporting.
- Composition root wires the adapter for future service instrumentation.

## Open questions

None.
