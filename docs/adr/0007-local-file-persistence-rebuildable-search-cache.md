# ADR-0007: Local File Persistence and Rebuildable Search Cache

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/codebase/INTEGRATIONS.md`
  - `.planning/codebase/ARCHITECTURE.md`
  - `.planning/codebase/STACK.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

The project needs durable canonical knowledge, local runtime state, and fast search. Search indexes must not become irreplaceable state.

## Decision

Persist canonical knowledge as files under the wiki root. Persist runtime state in `.local/state.yaml`. Persist search cache under `.local/search.db/` using `bm25.json` and `vectors.db`. Treat search data as derived and rebuildable from Markdown.

## Consequences

- Backup and review focus on Git-tracked Markdown/config.
- Corrupted or stale search cache can be rebuilt.
- Staleness detection is required before query/status operations.
- `.local/` remains machine-specific and gitignored.

## Alternatives considered

- Single embedded database for everything: rejected because it weakens Markdown/Git source-of-truth semantics.
- Remote search service: rejected as unnecessary for solo local usage.
- In-memory-only search index: rejected due to rebuild/startup cost.

## Implementation notes

`FsFileStore`, `YamlStateStore`, and `RuVectorSearchEngine` implement the storage model.

## Open questions

None.
