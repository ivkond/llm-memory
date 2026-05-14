# Architecture Decision Records

This directory contains accepted and proposed architecture decision records for LLM Wiki.

## Rules

- ADRs record durable decisions: what was chosen, why, alternatives, and consequences.
- Product development, deferred work, and follow-up improvements live in [`../ROADMAP.md`](../ROADMAP.md).
- Historical planning artifacts in `.planning/` and `docs/superpowers/` are source documents, not the canonical home for new decisions.
- Older source documents may use `@llm-wiki/*`; current packages use `@ivkond-llm-wiki/*`.

## Index

| ADR                                                             | Title                                               | Status   |
| --------------------------------------------------------------- | --------------------------------------------------- | -------- |
| [0001](0001-markdown-in-git-source-of-truth.md)                 | Markdown in Git as source of truth                  | Accepted |
| [0002](0002-local-solo-workstation-scope.md)                    | Local solo workstation scope                        | Accepted |
| [0003](0003-verbatim-log-and-consolidation.md)                  | Verbatim log and later consolidation                | Accepted |
| [0004](0004-typescript-pnpm-esm-monorepo.md)                    | TypeScript pnpm ESM monorepo                        | Accepted |
| [0005](0005-clean-architecture-ports-adapters.md)               | Clean Architecture with ports and adapters          | Accepted |
| [0006](0006-common-composition-root-thin-transports.md)         | Common composition root and thin transports         | Accepted |
| [0007](0007-local-file-persistence-rebuildable-search-cache.md) | Local file persistence and rebuildable search cache | Accepted |
| [0008](0008-git-worktrees-for-mutating-operations.md)           | Git worktrees for mutating operations               | Accepted |
| [0009](0009-re2-sanitization.md)                                | RE2-based sanitization                              | Accepted |
| [0010](0010-layered-configuration.md)                           | Layered configuration                               | Accepted |
| [0011](0011-deterministic-recall-without-llm.md)                | Deterministic recall without LLM                    | Accepted |
| [0012](0012-hybrid-bm25-vector-search-rrf.md)                   | Hybrid BM25 + vector search with RRF                | Accepted |
| [0013](0013-vercel-ai-sdk-provider-adapters.md)                 | Vercel AI SDK provider adapters                     | Accepted |
| [0014](0014-query-degrades-to-citations-on-llm-failure.md)      | Query degradation to citations on LLM failure       | Accepted |
| [0015](0015-seven-mcp-tools.md)                                 | Seven MCP tools                                     | Accepted |
| [0016](0016-streamable-http-mcp-transport.md)                   | Streamable HTTP MCP transport                       | Accepted |
| [0017](0017-mcp-json-response-envelope.md)                      | MCP JSON response envelope                          | Accepted |
| [0018](0018-unified-commander-cli.md)                           | Unified Commander CLI                               | Accepted |
| [0019](0019-claude-code-hooks-over-mcp-http.md)                 | Claude Code hooks over MCP HTTP                     | Accepted |
| [0020](0020-adrs-as-canonical-decision-home.md)                 | ADRs as canonical decision home                     | Accepted |
| [0021](0021-verbatim-entry-metadata-schema.md)                  | Verbatim entry metadata schema                      | Accepted |
| [0022](0022-local-operation-journal-runtime-state.md)           | Local operation journal runtime state               | Accepted |
| [0023](0023-local-review-proposals-and-seven-tool-schema-evolution.md) | Local review proposals and seven-tool schema evolution | Accepted |
