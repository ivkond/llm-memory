# ADR-0014: Query Degrades to Citations on LLM Failure

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/ARCHITECTURE.md`
  - `.planning/codebase/INTEGRATIONS.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

`wiki_query` has two stages: retrieval and LLM synthesis. Retrieval can still provide useful citations when the LLM provider is unavailable.

## Decision

If search succeeds but LLM answer synthesis fails, `wiki_query` returns raw citations with an empty or degraded answer instead of failing the whole operation.

RM-0011 extends this rule: synthesized answers are surfaced only when citation faithfulness is verified against the returned numbered citation excerpts. If citation references are invalid, claims are unsupported, or verifier output is unavailable/malformed, `wiki_query` suppresses `answer` and returns citations with a machine-readable `citation_check` status (`unsupported`, `unknown`, or `skipped`).

## Consequences

- Users and agents still receive useful evidence during provider outages.
- LLM failure is visible but not catastrophic for read workflows.
- Callers must handle empty/degraded answer text and inspect `citation_check` for verification state.
- Mutating LLM workflows such as ingest/lint still fail safely instead of persisting low-confidence output.

## Alternatives considered

- Fail the whole query on LLM error: rejected because citations are still valuable.
- Return cached prior answers: rejected because answer cache invalidation is out of scope.
- Silently hide LLM failure: rejected because callers need to know synthesis did not happen.

## Implementation notes

`QueryService` catches LLM failures after retrieval and preserves citations.

## Open questions

None.
