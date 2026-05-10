# ADR-0011: Deterministic Recall Without LLM

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/ARCHITECTURE.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

Session-start recall must be fast, reproducible, and client-independent. At that point there may be no user query, so relevance scoring is ambiguous.

## Decision

`wiki_recall` is pure file listing. It resolves the project from `cwd`, lists project pages and shared wiki pages, sorts deterministically by `updated` descending, splits budget 70% project and 30% wiki, and includes unconsolidated count. It does not call an LLM or search engine.

## Consequences

- Same wiki state and cwd produce identical output.
- Recall has no provider dependency at session start.
- Recall is progressive disclosure, not synthesized answering.
- Follow-up relevance requires `wiki_query`.

## Alternatives considered

- LLM-generated session context: rejected because it is slower, non-deterministic, and provider-dependent.
- Search-based recall without a query: rejected because ranking would be arbitrary.
- Load all pages: rejected because it does not scale with context budgets.

## Implementation notes

`RecallService` owns recall budget splitting and deterministic ordering.

## Open questions

None.
