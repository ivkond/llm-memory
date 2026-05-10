# ADR-0003: Verbatim Log and Later Consolidation

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/ARCHITECTURE.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

Agents should record useful facts immediately without deciding whether each fact belongs in long-term structured pages. Runtime capture must be fast and reliable; structure, deduplication, and promotion can happen later.

## Decision

Use a two-layer memory model. Raw memories are appended as verbatim entries under `log/{agent}/raw/*.md` with `consolidated: false`. `wiki_lint` later consolidates entries into `wiki/` and `projects/`, promotes cross-project patterns, and marks processed entries as consolidated.

## Consequences

- `remember` operations stay fast and do not call an LLM.
- Duplicate or low-value entries are allowed at capture time and filtered later.
- The `consolidated` marker and unconsolidated count become important invariants.
- Lint/consolidation must be safe and recoverable.

## Alternatives considered

- Write structured pages immediately: rejected due to latency and runtime classification risk.
- Store only summaries: rejected because raw evidence and auditability are lost.
- Deduplicate on every write: rejected because it complicates the hot path.

## Implementation notes

`RememberService` writes verbatim entries. `LintService` processes consolidation, promote, and health phases.

## Open questions

None.
