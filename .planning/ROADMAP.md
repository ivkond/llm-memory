# Roadmap: LLM Wiki Solo MVP (v1.0)

## Overview

Milestones 1-3 built the complete domain and infrastructure layers (store, recall, query, ingest, search, lint, import, archive -- 135 tests passing). This milestone wires those services to transports (MCP server, CLI, Claude Code hooks) so the wiki becomes usable. The composition root comes first as the foundation, then MCP tools are exposed in two waves (read-only then mutating), followed by CLI and Claude Code integration.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Composition Root and MCP Bootstrap** - Wire all adapters via DI and start MCP server with Streamable HTTP transport
- [ ] **Phase 2: MCP Read Tools** - Expose query, recall, and status as read-only MCP tools
- [ ] **Phase 3: MCP Write Tools** - Expose remember, ingest, and lint as mutating MCP tools
- [ ] **Phase 4: CLI** - Command-line interface for all wiki operations
- [ ] **Phase 5: Claude Code Integration** - Session hooks and guide skill for Claude Code

## Phase Details

### Phase 1: Composition Root and MCP Bootstrap
**Goal**: Services are wired with real adapters and MCP server starts and responds to requests
**Depends on**: Nothing (first phase)
**Requirements**: WIRE-01, WIRE-02, MCP-01
**Success Criteria** (what must be TRUE):
  1. Single composition root instantiates all adapters (config, search, git, LLM, sanitizer) and injects them into services via constructor
  2. Configuration loads from shared config, local overrides, and environment variables in correct precedence
  3. MCP server starts on a configured HTTP port and responds to `tools/list` with the expected 7 tool names
**Plans**: TBD

Plans:
- [ ] 01-01: TBD

### Phase 2: MCP Read Tools
**Goal**: Agent can query wiki, recall context, and check status through MCP without modifying any data
**Depends on**: Phase 1
**Requirements**: MCP-02, MCP-03, MCP-08
**Success Criteria** (what must be TRUE):
  1. Agent calling `wiki_query` with a natural-language question receives search results with LLM-synthesized answer (or raw citations on LLM failure)
  2. Agent calling `wiki_recall` with a project scope receives deterministic context sorted by recency within the token budget
  3. Agent calling `wiki_status` receives wiki health metrics (page counts, index health, project list)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: MCP Write Tools
**Goal**: Agent can store facts, record sessions, ingest sources, and run lint through MCP with full safety guarantees
**Depends on**: Phase 2
**Requirements**: MCP-04, MCP-05, MCP-06, MCP-07
**Success Criteria** (what must be TRUE):
  1. Agent calling `wiki_remember_fact` stores a sanitized verbatim entry (secrets redacted) and receives confirmation
  2. Agent calling `wiki_remember_session` stores a session summary with deduplication by session_id
  3. Agent calling `wiki_ingest` with a file path or URL triggers worktree-isolated ingestion and receives the resulting page path
  4. Agent calling `wiki_lint` with optional phase selection runs consolidation/promote/health in worktree isolation and receives a report
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: CLI
**Goal**: Developer can perform all wiki operations from the terminal without needing MCP
**Depends on**: Phase 1
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06
**Success Criteria** (what must be TRUE):
  1. Running `llm-wiki init` in an empty directory creates the wiki directory structure with git repo and default configs
  2. Running `llm-wiki ingest <file-or-url>` ingests the source and displays the resulting wiki page path
  3. Running `llm-wiki lint` runs all lint phases (or selected phases via `--phases`) and displays the report
  4. Running `llm-wiki import` sweeps configured agent memory stores and displays count of imported entries
  5. Running `llm-wiki search <query>` displays ranked search results with snippets
  6. Running `llm-wiki status` displays wiki health summary (page counts, index health)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Claude Code Integration
**Goal**: Claude Code sessions automatically load wiki context on start and persist learnings on stop
**Depends on**: Phase 2, Phase 3
**Requirements**: HOOK-01, HOOK-02, SKILL-01
**Success Criteria** (what must be TRUE):
  1. On SessionStart, the hook calls `wiki_recall` for the current project and injects the returned context into the session
  2. On Stop, the hook calls `wiki_remember_session` with a summary of the session
  3. Running `/wiki` in Claude Code displays a guide explaining available MCP tools and recommended workflow
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5
Note: Phase 4 depends only on Phase 1, so it could execute in parallel with Phases 2-3.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Composition Root and MCP Bootstrap | 0/0 | Not started | - |
| 2. MCP Read Tools | 0/0 | Not started | - |
| 3. MCP Write Tools | 0/0 | Not started | - |
| 4. CLI | 0/0 | Not started | - |
| 5. Claude Code Integration | 0/0 | Not started | - |
