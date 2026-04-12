# Requirements: LLM Wiki

**Defined:** 2026-04-12
**Core Value:** Every fact an AI agent learns persists, consolidates, and becomes retrievable across sessions

## v1 Requirements

Requirements for Solo MVP. Each maps to roadmap phases.

### Transport -- MCP Server

- [ ] **MCP-01**: MCP server starts via HTTP transport (Streamable HTTP) and responds to tool list request
- [ ] **MCP-02**: `wiki_query` tool available via MCP with full search + LLM synthesis
- [ ] **MCP-03**: `wiki_recall` tool available via MCP with deterministic context loading
- [ ] **MCP-04**: `wiki_remember_fact` tool available via MCP with sanitization
- [ ] **MCP-05**: `wiki_remember_session` tool available via MCP with deduplication
- [ ] **MCP-06**: `wiki_ingest` tool available via MCP with worktree isolation
- [ ] **MCP-07**: `wiki_lint` tool available via MCP with phase selection
- [ ] **MCP-08**: `wiki_status` tool available via MCP (read-only diagnostic)

### Transport -- CLI

- [ ] **CLI-01**: `llm-wiki init` creates wiki directory structure with git + default configs
- [ ] **CLI-02**: `llm-wiki ingest <source>` ingests file/URL into wiki
- [ ] **CLI-03**: `llm-wiki lint [--phases]` runs consolidation/promote/health
- [ ] **CLI-04**: `llm-wiki import` sweeps configured agent memory stores
- [ ] **CLI-05**: `llm-wiki search <query>` performs hybrid search and displays results
- [ ] **CLI-06**: `llm-wiki status` displays wiki health/stats

### Integration -- Claude Code

- [ ] **HOOK-01**: SessionStart hook calls `wiki_recall` and injects context
- [ ] **HOOK-02**: Stop hook calls `wiki_remember_session` with session summary
- [ ] **SKILL-01**: `/wiki` guide skill explains available MCP tools and workflow

### Wiring -- Composition Root

- [ ] **WIRE-01**: Single composition root instantiates all adapters and injects into services
- [ ] **WIRE-02**: Configuration loaded via ConfigLoader (shared + local + env overrides)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Multi-Agent Import

- **IMPORT-V2-01**: Cursor memory reader adapter
- **IMPORT-V2-02**: Codex memory reader adapter
- **IMPORT-V2-03**: KiloCode memory reader adapter
- **IMPORT-V2-04**: OpenCode memory reader adapter

### LLM-Enhanced Health

- **HEALTH-V2-01**: Detect contradictions between wiki pages
- **HEALTH-V2-02**: Identify mentioned concepts without their own page

### Infrastructure

- **INFRA-V2-01**: npm publish pipeline with CI/CD
- **INFRA-V2-02**: Archive retention policy (prune old archives)
- **INFRA-V2-03**: Scheduling (cron/interval for lint/import)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Team/Enterprise (shared repos, ACL, federation) | Architecture doesn't block it, but not needed for solo MVP |
| Scope expressions (`wiki/a+projects/b`) | Complex query syntax, standard scope cascade sufficient |
| Offline mode (node-llama.cpp) | Requires significant effort, cloud LLM sufficient for solo |
| MCP stdio transport | HTTP (Streamable HTTP) chosen as primary transport |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIRE-01 | Phase 1 | Pending |
| WIRE-02 | Phase 1 | Pending |
| MCP-01 | Phase 1 | Pending |
| MCP-02 | Phase 2 | Pending |
| MCP-03 | Phase 2 | Pending |
| MCP-08 | Phase 2 | Pending |
| MCP-04 | Phase 3 | Pending |
| MCP-05 | Phase 3 | Pending |
| MCP-06 | Phase 3 | Pending |
| MCP-07 | Phase 3 | Pending |
| CLI-01 | Phase 4 | Pending |
| CLI-02 | Phase 4 | Pending |
| CLI-03 | Phase 4 | Pending |
| CLI-04 | Phase 4 | Pending |
| CLI-05 | Phase 4 | Pending |
| CLI-06 | Phase 4 | Pending |
| HOOK-01 | Phase 5 | Pending |
| HOOK-02 | Phase 5 | Pending |
| SKILL-01 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after roadmap creation*
