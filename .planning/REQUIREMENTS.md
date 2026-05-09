# Requirements: LLM Wiki

**Defined:** 2026-04-12
**Core Value:** Every fact an AI agent learns persists, consolidates, and becomes retrievable across sessions

## v1 Requirements

Requirements for Solo MVP. Each maps to roadmap phases.

### Transport -- MCP Server

- [x] **MCP-01**: MCP server starts via HTTP transport (Streamable HTTP) and responds to tool list request
- [x] **MCP-02**: `wiki_query` tool available via MCP with full search + LLM synthesis
- [x] **MCP-03**: `wiki_recall` tool available via MCP with deterministic context loading
- [x] **MCP-04**: `wiki_remember_fact` tool available via MCP with sanitization
- [x] **MCP-05**: `wiki_remember_session` tool available via MCP with deduplication
- [x] **MCP-06**: `wiki_ingest` tool available via MCP with worktree isolation
- [x] **MCP-07**: `wiki_lint` tool available via MCP with phase selection
- [x] **MCP-08**: `wiki_status` tool available via MCP (read-only diagnostic)

### Transport -- CLI

- [x] **CLI-01**: `llm-wiki init` creates wiki directory structure with git + default configs
- [x] **CLI-02**: `llm-wiki ingest <source>` ingests file/URL into wiki
- [x] **CLI-03**: `llm-wiki lint [--phases]` runs consolidation/promote/health
- [x] **CLI-04**: `llm-wiki import` sweeps configured agent memory stores
- [x] **CLI-05**: `llm-wiki search <query>` performs hybrid search and displays results
- [x] **CLI-06**: `llm-wiki status` displays wiki health/stats

### Integration -- Claude Code

- [x] **HOOK-01**: SessionStart hook calls `wiki_recall` and injects context
- [x] **HOOK-02**: Stop hook calls `wiki_remember_session` with session summary
- [x] **SKILL-01**: `/wiki` guide skill explains available MCP tools and workflow

### Wiring -- Composition Root

- [x] **WIRE-01**: Single composition root instantiates all adapters and injects into services
- [x] **WIRE-02**: Configuration loaded via ConfigLoader (shared + local + env overrides)

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
| WIRE-01 | Phase 1 | Complete |
| WIRE-02 | Phase 1 | Complete |
| MCP-01 | Phase 1 | Complete |
| MCP-02 | Phase 2 | Complete |
| MCP-03 | Phase 2 | Complete |
| MCP-08 | Phase 2 | Complete |
| MCP-04 | Phase 3 | Complete |
| MCP-05 | Phase 3 | Complete |
| MCP-06 | Phase 3 | Complete |
| MCP-07 | Phase 3 | Complete |
| CLI-01 | Phase 4 | Complete |
| CLI-02 | Phase 4 | Complete |
| CLI-03 | Phase 4 | Complete |
| CLI-04 | Phase 4 | Complete |
| CLI-05 | Phase 4 | Complete |
| CLI-06 | Phase 4 | Complete |
| HOOK-01 | Phase 5 | Complete |
| HOOK-02 | Phase 5 | Complete |
| SKILL-01 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

## Evidence Basis (2026-05-09 Reconciliation)

- Baseline traceability matrix approved and QA-accepted: HAR-40.
- Baseline gate evidence captured and accepted: HAR-35.
- Infra/archive + toolchain blocker fixed and validated via patch/commit artifact chain: HAR-41.
- MCP-02..08 contract and smoke verification completed/reviewed/validated: HAR-37.
- CLI-01..06 command coverage completed/reviewed/validated: HAR-36.
- HOOK-01/02 and SKILL-01 hook/skill validation completed on published branch `agent/coder/fdc252b5` at `5648953`, with Sentinel + Probe acceptance and Harbor readiness: HAR-38.
- Release-process caveat remains separate from requirement completion: some child issues note PR/branch publishability process risk even when functional validation passed.

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-05-09 after HAR-39 evidence-chain reconciliation*
