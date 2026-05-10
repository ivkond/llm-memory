# ADR-0012: Hybrid BM25 + Vector Search with RRF

- Status: Accepted
- Date: 2026-05-10
- Source documents:
  - `.planning/PROJECT.md`
  - `.planning/codebase/ARCHITECTURE.md`
  - `.planning/codebase/INTEGRATIONS.md`
  - `.planning/codebase/STACK.md`
  - `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Context

Agents need exact-match retrieval for names, APIs, and errors, plus semantic retrieval for concepts. Search must remain embedded and local for the solo MVP.

## Decision

Use hybrid search: MiniSearch BM25 for sparse lexical retrieval, RuVector HNSW for dense vector retrieval, and Reciprocal Rank Fusion with `k=60` to combine results.

## Consequences

- Retrieval covers both lexical and semantic cases.
- Search remains local and file-backed.
- Embeddings and native RuVector support are required for vector search.
- Index rebuild and staleness checks are mandatory.

## Alternatives considered

- BM25 only: rejected due to weaker semantic retrieval.
- Vector only: rejected due to weaker exact/API/error matching.
- External search service: rejected as too operationally heavy for solo local scope.
- SQLite FTS5 plus vector extension: rejected in favor of an embedded hybrid npm package.

## Implementation notes

`RuVectorSearchEngine` combines MiniSearch and RuVector and persists `bm25.json` plus `vectors.db`.

## Open questions

None.
