# LLM Wiki - Design Specification

## Overview

LLM Wiki is a global knowledge base for AI agents and developers, implementing Andrej Karpathy's LLM Wiki pattern with multi-project support, verbatim memory consolidation, and MCP integration.

**Core idea:** markdown files as source of truth, LLM handles the "bookkeeping" (structuring, cross-referencing, promoting, deduplication), git provides versioning and audit trail.

**Primary consumers:** AI agents (Claude Code, Copilot, Cursor, Codex, etc.) via MCP, developer as secondary consumer via CLI and Obsidian.

## Architecture

### Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript | MCP SDK maturity, markdown ecosystem (unified/remark), AI SDK compatibility |
| LLM/Embedding client | [AI SDK](https://ai-sdk.dev/) (Vercel) | TypeScript-native, 100+ providers, single API for completions + embeddings |
| Vector DB | [RuVector](https://github.com/ruvnet/ruvector) | Rust core, embedded npm package, hybrid search (sparse+dense), HNSW, sub-ms queries |
| MCP | `@modelcontextprotocol/sdk` | Reference implementation, stdio + HTTP transport |
| Git | `simple-git` or child_process | Commit, squash, worktree, conflict resolution |

### Package Structure

```
@llm-wiki/core                    # Business logic, zero transport dependencies
  WikiEngine                      # CRUD wiki pages, frontmatter, crossrefs
  SearchEngine                    # BM25 + vector hybrid search via RuVector
  ConsolidationEngine             # Verbatim -> wiki, promote, contradiction detection
  LlmClient                      # Interface -> AI SDK (OpenAI/Anthropic/Ollama/etc.)
  EmbeddingClient                 # Interface -> AI SDK embeddings
  GitManager                      # Commit, squash, conflict resolution, worktree
  ProjectResolver                 # git remote -> project name mapping
  LogManager                      # Append verbatim, mark consolidated, archive
  ConfigManager                   # settings.yaml, agent configs

@llm-wiki/mcp-server              # MCP transport layer (thin wrapper over core)
  MCP transport (stdio + HTTP)
  7 MCP tools -> core

@llm-wiki/cli                     # CLI entry point (thin wrapper over core)
  init, ingest, lint, import, search, status

@llm-wiki/claude-code             # Claude Code integration layer
  hooks/session-start              # Auto wiki_recall
  hooks/stop                       # Auto wiki_remember_session
  skill/wiki                       # Guide skill (no tool duplication)
```

**Dependency graph:**

```
claude-code --> mcp-server --> core
                                ^
cli ----------------------------+
```

`core` has zero knowledge of MCP, CLI, or Claude Code.

## Data Structure

### Wiki Directory Layout

```
~/.llm-wiki/                              # configurable path, git repo
  schema.md                               # meta-prompt: structuring rules for LLM
  index.md                                # auto-generated catalog of all pages
  log.md                                  # append-only operation journal

  wiki/                                   # consolidated knowledge (shared)
    concepts/                             #   DDD, CQRS, Clean Architecture...
    tools/                                #   Go, PostgreSQL, Docker...
    patterns/                             #   best/worst practices
    decisions/                            #   ADR-like records

  projects/                               # per-project knowledge
    {project-name}/
      _config.md                          #   git remote, description, metadata
      architecture.md                     #   architectural decisions
      quirks.md                           #   non-obvious things
      practices.md                        #   project-specific practices

  log/                                    # verbatim layer (per agent)
    {agent-name}/
      raw/                                #   unprocessed session entries
        {date}-{session-id}.md

  .archive/                               # 7zip archives after consolidation
    {year}-{month}-{agent}.7z

  .config/                                # configuration
    settings.yaml                         #   LLM endpoint, paths, thresholds
    search.db                             #   RuVector storage
    agents/                               #   per-agent import configs
      claude-code.yaml
      cursor.yaml
```

### Wiki Page Format

```markdown
---
title: Testcontainers vs database mocks
created: 2026-04-09
updated: 2026-04-09
confidence: 0.9
sources:
  - projects/cli-relay/practices.md
  - projects/other-app/practices.md
supersedes: null
tags: [testing, postgresql, integration-tests]
---

## Summary

...

## Details

...

## See also

- [PostgreSQL connection pooling](../tools/postgresql.md)
- [Testing patterns](../patterns/testing.md)
```

### Verbatim Entry Format

```markdown
---
session: 2026-04-09-a1b2c3
project: cli-relay
agent: claude-code
consolidated: false
---

- pgx pool MaxConns must not exceed max_connections/3
- Testcontainers better than mocks for PostgreSQL integration tests
- SQLC generates incorrect code for CTE with RETURNING
```

### Key Frontmatter Fields

| Field | Purpose |
|-------|---------|
| `confidence` | How well the fact is confirmed (source count, recency) |
| `supersedes` | Link to page this fact replaces (truth maintenance) |
| `consolidated` | Marker for lint: whether verbatim entry has been processed |

### Link Format

Standard markdown links `[text](relative/path.md)` - Obsidian compatible, works everywhere.

## MCP Tools

| Tool | Purpose | Scenario |
|------|---------|----------|
| `wiki_query` | Search + synthesize answer with citations | Targeted search, cross-project search |
| `wiki_recall` | Load project context at session start | Auto-recall via hook |
| `wiki_remember_fact` | Record a single fact to verbatim log | Agent autonomously during work |
| `wiki_remember_session` | Flush session summary to verbatim log | End of session |
| `wiki_ingest` | Process external source -> wiki pages | User adds article/doc |
| `wiki_lint` | Run consolidation + promote + health check | Scheduled or manual |
| `wiki_status` | Wiki statistics and health | Diagnostics |

**Total: 7 tools** (within 5-7 optimal range per research on tool overload).

## Operations & Data Flow

### Recall (session start)

```
Agent starts work
  -> hook determines cwd
  -> ProjectResolver: git remote -> project name
  -> SearchEngine: load projects/{name}/_config.md
  -> SearchEngine: top-N relevant pages from projects/{name}/
  -> SearchEngine: top-N relevant pages from wiki/
  -> Progressive disclosure:
      1. Compact index (~100 tokens): page list + one-liners
      2. Agent requests details via wiki_query on demand
  -> Result injected into agent context
  -> Complements CLAUDE.md/RULES.md, does not duplicate
```

### Remember (during work)

```
Agent learns something useful
  -> wiki_remember_fact(content, project?, tags?)
  -> LogManager: append to log/{agent}/raw/{date}-{session}.md
  -> consolidated: false
  -> No LLM call, no search - instant operation
```

### Session Flush (end of session)

```
Session ends
  -> hook calls wiki_remember_session
  -> Agent forms summary of important findings
  -> LogManager: append to log/{agent}/raw/{date}-{session}.md
  -> GitManager: commit
```

### Query (targeted search)

```
Agent or user asks a question
  -> wiki_query(question, scope?)
  -> Scope resolution: explicit or cascade (project -> wiki -> all)
  -> SearchEngine: hybrid search (BM25 + embeddings via RuVector)
  -> LlmClient: synthesize answer with citations from found pages
  -> Return answer + source list
```

### Ingest (external source)

```
User provides file/URL
  -> wiki_ingest(source)
  -> LlmClient: extract facts, key takeaways
  -> WikiEngine: create/update 10-15 wiki pages
  -> WikiEngine: update crossrefs
  -> LogManager: record in log.md
  -> SearchEngine: reindex changed pages
  -> GitManager: commit
```

### Lint / Consolidation / Promote

```
Scheduled or manual
  -> wiki_lint

  Phase 1 - Consolidation (verbatim -> wiki):
    -> Read all log/{agent}/raw/*.md where consolidated: false
    -> LlmClient: "which facts should be integrated?"
    -> WikiEngine: update/create wiki and project pages
    -> LogManager: mark consolidated: true
    -> LogManager: archive processed -> .archive/

  Phase 2 - Promote (project -> wiki):
    -> Read all projects/*/practices.md
    -> LlmClient: meta-criterion "would this be useful in another project?"
    -> WikiEngine: create/update wiki/patterns/ or wiki/decisions/
    -> WikiEngine: replace in project files with link

  Phase 3 - Health check:
    -> Contradictions between pages
    -> Orphaned pages (no inbound links)
    -> Stale facts (old, low confidence)
    -> Mentioned concepts without their own page
    -> Report -> log.md

  -> GitManager: squash all lint commits into one
  -> Runs in git worktree for isolation from concurrent agent writes
```

### Import (periodic sweep)

```
Scheduled or manual
  -> llm-wiki import

  -> For each agent from .config/agents/:
    -> Read native storage (path from config)
      - Claude Code: ~/.claude/projects/*/memory/
      - Cursor: ~/.cursor/...
      - Codex, KiloCode, OpenCode, Qwen (MVP)
    -> Compare with last import timestamp
    -> New entries -> log/{agent}/raw/ as verbatim
    -> Update timestamp
  -> Processed through normal lint/consolidation
```

## Search Architecture

### Hybrid Search

```
Query
  -> Scope resolution (hierarchical path -> file set)
  -> Stage 1: Retrieval (parallel)
  |   +-- RuVector sparse -- BM25 lexical
  |   +-- RuVector dense -- semantic (embeddings via AI SDK)
  |
  -> Stage 2: Reciprocal Rank Fusion (RRF)
  -> Stage 3: LLM reranking (optional, via AI SDK)
  -> Result
```

### Scope Resolution

Hierarchical via `/`:

```
scope: "projects/cli-relay"          -> only this project
scope: "projects"                    -> all projects
scope: "wiki/patterns"               -> only patterns
scope: "wiki"                        -> all shared knowledge
scope: "log/claude-code"             -> verbatim of specific agent
scope: "/"                           -> everything
scope: undefined                     -> cascade:
                                        projects/{current} -> wiki -> /
```

### Project Resolution

Project identified by `git remote origin` URL. New remote -> suggest creating project. Fallback to directory name if no git.

## Git Strategy

### Commit Types (gitmoji)

| Operation | Format | Example |
|-----------|--------|---------|
| Init | `:tada: [init]` | `:tada: [init] Initialize LLM Wiki` |
| Ingest | `:memo: [ingest]` | `:memo: [ingest] PostgreSQL Performance Guide` |
| Remember | `:speech_balloon: [remember]` | `:speech_balloon: [remember] claude-code 2026-04-09` |
| Consolidation | `:recycle: [consolidate]` | `:recycle: [consolidate] 12 verbatim -> 3 wiki pages` |
| Promote | `:sparkles: [promote]` | `:sparkles: [promote] "no-db-mocking" -> wiki/patterns/` |
| Lint fix | `:adhesive_bandage: [lint]` | `:adhesive_bandage: [lint] Fix 2 broken crossrefs` |
| Import | `:twisted_rightwards_arrows: [import]` | `:twisted_rightwards_arrows: [import] 5 entries from cursor memory` |
| Archive | `:wastebasket: [archive]` | `:wastebasket: [archive] March 2026 consolidated logs` |
| Config | `:wrench: [config]` | `:wrench: [config] Add project cli-relay` |
| Supersede | `:coffin: [supersede]` | `:coffin: [supersede] Old auth -> wiki/patterns/auth-v2.md` |

### Worktree for Lint

```
Lint starts
  -> git worktree add .worktrees/lint-{timestamp}
  -> All changes (consolidation, promote, health fix) in worktree
  -> Squash commit
  -> git merge into main
  -> git worktree remove
```

### Conflict Resolution

```
Write to file
  -> git add + commit
  -> Conflict?
    -> For log/: append-only, conflicts impossible
    -> For wiki/:
      1. Read both versions
      2. LLM: "merge these two page versions"
      3. Write result
      4. Retry commit
      5. If N failures -> error to user
```

## Claude Code Integration

### MCP Server

```json
{
  "mcpServers": {
    "llm-wiki": {
      "command": "npx",
      "args": ["@llm-wiki/mcp-server"],
      "env": {
        "LLM_WIKI_PATH": "~/.llm-wiki"
      }
    }
  }
}
```

### Hooks

```json
{
  "hooks": {
    "SessionStart": [{
      "command": "npx @llm-wiki/claude-code recall"
    }],
    "Stop": [{
      "command": "npx @llm-wiki/claude-code flush"
    }]
  }
}
```

### Skill

One guide skill `/wiki` - explains available MCP tools and workflow. No tool duplication (per tool overload research: 5-7 tools optimal, more degrades performance).

### Context Priority

```
1. CLAUDE.md / RULES.md / AGENTS.md     -> instructions (how to work)
2. wiki recall                           -> knowledge (what we know)
3. Agent via wiki_query                  -> on-demand (during work)
```

Wiki recall complements project-level files, does not duplicate them.

## Configuration

### settings.yaml

```yaml
wiki:
  path: ~/.llm-wiki

llm:
  provider: openai
  model: gpt-4o-mini
  base_url: null                       # override for Ollama/LMStudio/OpenRouter

embedding:
  provider: openai
  model: text-embedding-3-small
  base_url: null

search:
  db_path: .config/search.db
  rerank: false
  cascade_threshold: 0.3

git:
  auto_commit: true
  squash_on_lint: true
  worktree_for_lint: true

consolidation:
  batch_threshold: 10
  archive_after_days: 30
  archive_retention_months: 6
```

### Agent Import Config

```yaml
# .config/agents/claude-code.yaml
agent: claude-code
import:
  enabled: true
  paths:
    - ~/.claude/projects/*/memory/
  format: claude-memory
  last_import: null
```

### Initialization

```
$ llm-wiki init
  1. Create ~/.llm-wiki/ (or ask for path)
  2. git init
  3. Create directory structure
  4. Write default settings.yaml
  5. Write schema.md (meta-prompt)
  6. Write empty index.md, log.md
  7. Initial commit
  8. Output: "Wiki ready. Add MCP server to your agent config."
```

No wizard, no interactive questions - sensible defaults, configure via settings.yaml.

## Deployment Modes

### Solo (MVP)

One user, local git repo, local MCP server. Full feature set.

### Team (post-MVP)

- Wiki on shared git remote (GitHub/GitLab)
- LLM-based merge conflict resolution (already designed)
- `.gitignore` for per-user config (API keys)
- Per-author attribution in frontmatter
- Branch-per-agent or branch-per-developer strategy

### Enterprise (backlog)

- Federation: each team has own wiki repo, hub aggregates promoted knowledge
- ACL: read/write permissions per scope
- Compliance: audit log, retention policies
- Central search: one search endpoint across all wiki instances

Architecture does not block team/enterprise:
- Git = push/pull sync out of the box
- Markdown = merge via standard git
- Hierarchical scope = add level (`team-a/projects/...`)
- Stateless MCP server = each user runs own instance
- Config separated from data = `.config/` in gitignore

## Backlog

- Scope expressions (`wiki/cli-relay+projects/cli-relay`, `*+!log`)
- Sanitization layer for secrets (some credentials may be useful for local dev - research needed)
- Wiki quality metrics (recall/query frequency tracking)
- Offline degraded mode (node-llama.cpp for local LLM)
- Import: antigravity, kiro, amp
- Enterprise federation and ACL

## Design Decisions Log

| Decision | Rationale |
|----------|-----------|
| TypeScript over Rust | MCP SDK maturity, markdown parsing ecosystem (remark/unified), AI SDK compatibility. Rust had weak markdown manipulation and immature MCP SDK |
| AI SDK over LiteLLM | LiteLLM is Python-only; AI SDK is TypeScript-native with same provider breadth |
| RuVector over SQLite FTS5+vec | Embedded hybrid search in single npm package, Rust performance |
| 7 MCP tools, no skill duplication | Research shows 5-7 tools optimal; beyond that attention dilution, tool collision, prompt budget starvation degrade performance |
| Verbatim log + consolidation | Agent doesn't need to decide what's important in runtime; over-extraction filtered at consolidation. Pattern validated by LangMem, Google Memory Agent, claude-mem |
| Standard markdown links over wikilinks | Obsidian supports both; standard markdown works everywhere |
| Git worktree for lint | Isolates lint from concurrent agent writes |
| Gitmoji commit format | Visual distinction of operation types in git log |
| Schema.md as meta-criterion | "Would this be useful in another project?" - one question instead of 20 brittle rules. LLM classifies, not if/else |
| Full write autonomy | Agent writes freely; git + lint + log as safety net |

## References

- [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) - original pattern
- [LLM Wiki v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2) - extended pattern with confidence scoring, supersession, 4-tier consolidation
- [claude-mem](https://github.com/thedotmack/claude-mem) - progressive disclosure pattern for recall
- [claude_memory](https://github.com/codenamev/claude_memory) - truth maintenance (supersession, conflict, accumulation, corroboration)
- [Hindsight](https://github.com/vectorize-io/hindsight) - multi-bank, 4-strategy search, mental models
- [LangMem](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/) - subconscious memory extraction, consolidation lifecycle
- [RAG-MCP](https://arxiv.org/pdf/2505.03275) - tool overload research, dynamic tool subset selection
- [MCP Tool Overload](https://dev.to/nebulagg/mcp-tool-overload-why-more-tools-make-your-agent-worse-5a49) - 5-7 tools optimal threshold
- [AI SDK](https://ai-sdk.dev/) - unified TypeScript LLM client
- [RuVector](https://github.com/ruvnet/ruvector) - embedded vector DB with hybrid search
- [Anthropic memory-management](https://skills.sh/anthropics/knowledge-work-plugins/memory-management) - hot cache + deep memory pattern
