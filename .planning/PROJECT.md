# LLM Wiki

## What This Is

A personal knowledge base for AI agents implementing Andrej Karpathy's LLM Wiki pattern. Markdown files in git are the single source of truth; LLM handles structuring, cross-referencing, promoting, and deduplication. Primary consumer is Claude Code via MCP, with developer access through CLI and Obsidian.

## Core Value

Every fact an AI agent learns persists, consolidates, and becomes retrievable across sessions — without manual bookkeeping.

## Requirements

### Validated

- ✓ **STORE-01**: Agent can store verbatim facts with sanitization (redact secrets) — M1
- ✓ **STORE-02**: Agent can store session summaries with deduplication by session_id — M1
- ✓ **RECALL-01**: Agent can recall project context deterministically (no LLM, recency-sorted) — M1
- ✓ **RECALL-02**: Recall splits budget 70/30 between project and wiki pages — M1
- ✓ **QUERY-01**: Agent can query wiki with hybrid search (BM25 + vector, RRF fusion) — M2
- ✓ **QUERY-02**: Query gracefully degrades on LLM failure (returns raw citations) — M2
- ✓ **INGEST-01**: External sources (file/URL) processed into wiki pages via worktree — M2
- ✓ **INGEST-02**: Worktree isolation — main branch untouched until successful merge — M2
- ✓ **STATUS-01**: Wiki health and statistics reporting (pages, projects, index health) — M2
- ✓ **LINT-01**: Consolidate verbatim entries into wiki/project pages via LLM — M3
- ✓ **LINT-02**: Promote cross-project patterns from projects/ to wiki/patterns/ — M3
- ✓ **LINT-03**: Health check (orphans, stale pages, broken links) — M3
- ✓ **LINT-04**: Lint runs in worktree isolation (INV-9), marks entries consolidated (INV-5) — M3
- ✓ **IMPORT-01**: Sweep Claude Code native memory into verbatim log — M3
- ✓ **ARCHIVE-01**: Archive consolidated verbatim entries to .archive/ via 7zip — M3
- ✓ **SANIT-01**: RE2-based sanitization with redact/warn/block modes — M1
- ✓ **SEARCH-01**: Index rebuildable from markdown files with identical results (INV-6) — M2

### Active

- [ ] **MCP-01**: MCP server exposing 7 tools (query, recall, remember_fact, remember_session, ingest, lint, status) via stdio + HTTP transport
- [ ] **CLI-01**: CLI tool with commands: init, ingest, lint, import, search, status
- [ ] **HOOK-01**: Claude Code hooks — auto wiki_recall on SessionStart, auto wiki_remember_session on Stop
- [ ] **SKILL-01**: Claude Code `/wiki` guide skill (explains MCP tools, no tool duplication)
- [ ] **WIRE-01**: Composition root wiring all services with real adapters via DI
- [ ] **INIT-01**: `llm-wiki init` creates wiki directory structure, git repo, default configs

### Out of Scope

- Multi-agent memory readers (Cursor, Codex, KiloCode, OpenCode, Qwen) — M3 built the IAgentMemoryReader port, adapters are flat tasks after MVP
- LLM-driven health checks (contradictions, missing concept pages) — requires LLM pass, not covered by invariants
- Team/Enterprise features (shared repos, ACL, federation) — post-MVP
- Scheduling (cron/interval for lint/import) — transport concern, CLI can add later
- Archive retention policies — pruning old archives deferred
- npm publish / CI/CD — post-MVP, not needed for solo use
- Scope expressions (`wiki/project+projects/project`) — backlog
- Offline mode (local LLM via node-llama.cpp) — backlog

## Context

- TypeScript monorepo (pnpm workspaces): `@llm-wiki/core` (domain + ports + services) and `@llm-wiki/infra` (adapters)
- Clean/Hexagonal Architecture with strict dependency direction: Infra → Application → Domain
- Domain has zero external deps (except RE2 for sanitization)
- All persistence is file-based (markdown + YAML + search DB), no relational DB
- Git worktrees provide transactional semantics for mutating operations (ingest, lint)
- 13 invariants defined in design spec, all tested
- 135 tests passing (unit + integration + e2e)
- Design spec: `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

## Constraints

- **Tech stack**: TypeScript, pnpm monorepo, ESM-only, Node 20+ — established, no changes
- **Architecture**: Clean Architecture with ports/adapters — must maintain strict layering
- **Transport packages**: `@llm-wiki/mcp-server`, `@llm-wiki/cli`, `@llm-wiki/claude-code` are thin wrappers over core services — no business logic in transport
- **MCP SDK**: `@modelcontextprotocol/sdk` — reference implementation
- **Solo use**: Target is local workstation, no server deployment

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Rust | MCP SDK maturity, markdown ecosystem, AI SDK compatibility | ✓ Good |
| AI SDK (Vercel) for LLM/embeddings | TypeScript-native, 100+ providers, single API | ✓ Good |
| RuVector for hybrid search | Embedded, Rust performance, npm package | ✓ Good |
| 7 MCP tools max | Research shows 5-7 optimal; beyond that attention dilution | — Pending |
| Verbatim log + consolidation | Over-extract at runtime, filter at consolidation | ✓ Good |
| Git worktree for all mutations | Isolation from concurrent agent writes | ✓ Good |
| Deterministic recall (no LLM) | Fast, reproducible, client-independent | ✓ Good |
| Three-layer config (shared + local + state) | Team reproducibility, clean secret separation | ✓ Good |
| Migrate from superpowers to GSD | Structured workflow with phases, planning, verification | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after initialization (GSD migration)*
