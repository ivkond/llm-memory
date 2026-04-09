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

### Package Structure (Clean Architecture)

```
@llm-wiki/core                        # Domain + Application layers
  domain/                              # Domain layer: pure logic, zero dependencies
    WikiPage                           #   Entity: page with frontmatter, content, crossrefs
    VerbatimEntry                      #   Entity: raw memory entry
    Project                            #   Entity: project with config and metadata
    SearchResult                       #   Value object: scored search hit
    SanitizationResult                 #   Value object: redacted content + warnings

  ports/                               # Application layer: interfaces (driven + driving)
    ISearchEngine                      #   Port: index, search, rebuild
    ILlmClient                         #   Port: complete, summarize, classify
    IEmbeddingClient                   #   Port: embed texts
    IVersionControl                    #   Port: commit, squash, worktree, conflict resolve
    IProjectResolver                   #   Port: cwd -> project mapping
    IFileStore                         #   Port: read/write/list markdown files
    IArchiver                          #   Port: compress to 7zip, cleanup old archives

  services/                            # Application layer: orchestration (use cases)
    RecallService                      #   Orchestrates: ProjectResolver + SearchEngine + FileStore
    RememberService                    #   Orchestrates: FileStore + Sanitizer
    QueryService                       #   Orchestrates: SearchEngine + LlmClient
    IngestService                      #   Orchestrates: LlmClient + FileStore + SearchEngine + VersionControl
    LintService                        #   Orchestrates: FileStore + LlmClient + SearchEngine + VersionControl
    ImportService                      #   Orchestrates: FileStore (source) + FileStore (wiki)
    SanitizationService                #   Pure logic: pattern matching + redaction

@llm-wiki/infra                        # Infrastructure layer: adapter implementations
  RuVectorSearchEngine                 #   Implements ISearchEngine via RuVector
  AiSdkLlmClient                      #   Implements ILlmClient via AI SDK
  AiSdkEmbeddingClient                #   Implements IEmbeddingClient via AI SDK
  GitVersionControl                    #   Implements IVersionControl via simple-git
  GitProjectResolver                   #   Implements IProjectResolver via git remote
  FsFileStore                          #   Implements IFileStore via node:fs
  SevenZipArchiver                     #   Implements IArchiver via 7zip CLI
  ConfigLoader                         #   Loads shared + local yaml, env var merge

@llm-wiki/mcp-server                   # Transport: MCP (thin wrapper)
  MCP transport (stdio + HTTP)
  7 MCP tools -> core services

@llm-wiki/cli                          # Transport: CLI (thin wrapper)
  init, ingest, lint, import, search, status -> core services

@llm-wiki/claude-code                  # Integration: Claude Code hooks + skill
  hooks/session-start                  #   Auto wiki_recall
  hooks/stop                           #   Auto wiki_remember_session
  skill/wiki                           #   Guide skill (no tool duplication)
```

**Dependency graph:**

```
claude-code --> mcp-server ---> core/services ---> core/ports (interfaces)
                                     ^                  ^
cli --------------------------------+                   |
                                                        |
                                infra (adapters) -------+
                                  (implements ports)
```

**Rules:**
- `core/domain` depends on nothing
- `core/ports` depends on `core/domain` only
- `core/services` depends on `core/ports` + `core/domain` only (never on `infra`)
- `infra` implements `core/ports`, depends on external libraries (RuVector, AI SDK, simple-git)
- `mcp-server`, `cli`, `claude-code` depend on `core/services` + `infra` (for wiring/DI)
- Contract tests written against `core/ports`, pass for ANY correct adapter

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
      raw/                                #   unprocessed entries (one file per write)
        {date}-{session}-{uuid}.md        #   unique file per remember call

  .archive/                               # 7zip archives after consolidation
    {year}-{month}-{agent}.7z

  .config/                                # shared configuration (git-tracked)
    settings.shared.yaml                  #   search, git, consolidation, sanitization settings
    agents/                               #   per-agent import configs (immutable config)
      claude-code.yaml                    #     paths, format — no runtime state here
      cursor.yaml

  .local/                                 # local machine state (gitignored)
    settings.local.yaml                   #   API keys, provider config, path overrides
    search.db                             #   RuVector storage (rebuildable)
    state.yaml                            #   runtime state: last_import timestamps, etc.
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

One file per write. Filename: `{date}-{session}-{uuid}.md` (e.g. `2026-04-09-a1b2c3-f47ac10b.md`).

```markdown
---
session: a1b2c3
project: cli-relay
agent: claude-code
consolidated: false
created: 2026-04-09T14:30:00Z
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

**Total: 7 tools** (within 5-7 optimal range per research on tool overload).

### wiki_query

Search wiki and synthesize answer with citations.

| Field | Value |
|-------|-------|
| **Request** | `{ question: string, scope?: string, project?: string, max_results?: number (default: 10) }` |
| **Response** | `{ answer: string, citations: Array<{ page: string, excerpt: string, confidence: number }>, scope_used: string, project_used: string \| null }` |
| **Errors** | `SEARCH_EMPTY` (no results found), `LLM_UNAVAILABLE` (synthesis failed, raw results returned in `citations`), `INVALID_SCOPE` |

**Scope resolution with `project`:**
- If `scope` is explicit: use it as-is, ignore `project`
- If `scope` is omitted and `project` is provided: cascade `projects/{project}` -> `wiki` -> `/`
- If both omitted: search `wiki` -> `/` (no project context, context-free fallback)
| **Idempotency** | Yes - read-only, no side effects |
| **Limits** | `answer` max 4096 tokens, `citations` max 20 items |

### wiki_recall

Load project context at session start. Returns **deterministic** project index — no relevance scoring, no query signal needed. Ordering: project pages by recency (updated desc), then wiki pages by recency.

| Field | Value |
|-------|-------|
| **Request** | `{ cwd: string, max_tokens?: number (default: 2048) }` |
| **Response** | `{ project: string \| null, pages: Array<{ path: string, title: string, summary: string, updated: string }>, unconsolidated_count: number, total_pages: number }` |
| **Errors** | `WIKI_EMPTY` (no pages exist at all). Note: unknown project is NOT an error — returns `project: null` with wiki-only context as normal success response |
| **Idempotency** | Yes - read-only, deterministic for same wiki state |
| **Limits** | Response truncated to `max_tokens` budget |

**Page selection algorithm (deterministic, no LLM):**
1. Split `max_tokens` budget: 70% for project pages, 30% reserved for wiki pages
2. Fill project budget: pages from `projects/{resolved_project}/` sorted by `updated` desc
3. Fill wiki budget (+ any unused project budget): pages from `wiki/` sorted by `updated` desc
4. If no project resolved: 100% budget goes to wiki pages
5. Include `unconsolidated_count` so agent knows if recent verbatim data exists

This guarantees wiki pages are always included when they exist, regardless of project size.

### wiki_remember_fact

Record a single fact to verbatim log. Instant, no LLM call.

| Field | Value |
|-------|-------|
| **Request** | `{ content: string, project?: string, tags?: string[] }` |
| **Response** | `{ ok: true, file: string, entry_id: string }` |
| **Errors** | `CONTENT_EMPTY`, `SANITIZATION_BLOCKED` (sensitive content detected) |
| **Idempotency** | No - each call appends a new entry. Duplicate content is allowed (deduplicated at consolidation) |
| **Limits** | `content` max 8192 chars |

### wiki_remember_session

Flush session summary to verbatim log.

| Field | Value |
|-------|-------|
| **Request** | `{ summary: string, project?: string, session_id?: string }` |
| **Response** | `{ ok: true, file: string, facts_count: number }` |
| **Errors** | `CONTENT_EMPTY`, `SANITIZATION_BLOCKED` |
| **Idempotency** | No - appends new entry. `session_id` used for deduplication: if same session_id already flushed, returns existing entry without appending |
| **Limits** | `summary` max 16384 chars |

### wiki_ingest

Process external source into wiki pages. Long-running, may take 30-60s.

| Field | Value |
|-------|-------|
| **Request** | `{ source: string (path or URL), title?: string }` |
| **Response** | `{ pages_created: string[], pages_updated: string[], commit: string }` |
| **Errors** | `SOURCE_NOT_FOUND`, `SOURCE_PARSE_ERROR`, `LLM_UNAVAILABLE` (worktree discarded, no changes), `GIT_CONFLICT` (worktree preserved at returned path for manual recovery) |
| **Idempotency** | No - creates/updates pages. Re-ingesting same source updates existing pages rather than duplicating |
| **Limits** | Source max 100K tokens after extraction |

### wiki_lint

Run consolidation + promote + health check. Long-running.

| Field | Value |
|-------|-------|
| **Request** | `{ phases?: Array<"consolidate" \| "promote" \| "health"> (default: all) }` |
| **Response** | `{ consolidated: number, promoted: number, issues: Array<{ type: string, page: string, description: string }>, commit: string \| null }` |
| **Errors** | `LLM_UNAVAILABLE`, `GIT_CONFLICT` (worktree merge failed, changes preserved in worktree for manual resolution) |
| **Idempotency** | Partially - re-running skips already consolidated entries (via `consolidated: true` marker) |
| **Limits** | Processes max 50 verbatim entries per consolidation batch |

### wiki_status

Wiki statistics and health. Read-only diagnostic.

| Field | Value |
|-------|-------|
| **Request** | `{}` |
| **Response** | `{ total_pages: number, projects: string[], unconsolidated: number, last_lint: string \| null, last_ingest: string \| null, index_health: "ok" \| "stale" \| "missing" }` |
| **Errors** | `WIKI_NOT_INITIALIZED` |
| **Idempotency** | Yes - read-only |
| **Limits** | None |

## Operations & Data Flow

### Recall (session start)

```
Agent starts work
  -> hook determines cwd
  -> ProjectResolver: git remote -> project name (or null)
  -> FileStore: list all pages from projects/{name}/ sorted by updated desc
  -> FileStore: list all pages from wiki/ sorted by updated desc
  -> Deterministic merge with reserved budget:
      - 70% of max_tokens budget for project pages
      - 30% of max_tokens budget for wiki pages (guaranteed minimum)
      - If project budget not fully used, remainder goes to wiki
  -> Progressive disclosure:
      1. Compact index: page list with path + title + summary + updated
      2. Agent requests full content via wiki_query on demand
  -> Result injected into agent context
  -> Complements CLAUDE.md/RULES.md, does not duplicate
  -> No LLM calls, no SearchEngine — pure file listing
```

### Remember (during work)

```
Agent learns something useful
  -> wiki_remember_fact(content, project?, tags?)
  -> LogManager: create log/{agent}/raw/{date}-{session}-{uuid}.md (unique file)
  -> consolidated: false
  -> No LLM call, no search - instant operation
  -> No git conflicts possible (unique filename per write)
```

### Session Flush (end of session)

```
Session ends
  -> hook calls wiki_remember_session
  -> Agent forms summary of important findings
  -> LogManager: create log/{agent}/raw/{date}-{session}-{uuid}.md (unique file)
  -> GitManager: commit
```

### Query (targeted search)

```
Agent or user asks a question
  -> wiki_query(question, scope?, project?)
  -> Scope resolution: explicit scope, or cascade via project param (see Scope Resolution)
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

## Consistency Model

### Source of Truth

**Markdown files in git are the single source of truth.** `search.db` (RuVector index) is a derived, rebuildable cache.

### Invariants

1. Every wiki page on disk has a corresponding entry in `search.db` (eventually consistent)
2. Every verbatim entry with `consolidated: false` has NOT been integrated into wiki pages
3. Every verbatim entry with `consolidated: true` HAS been integrated (or explicitly skipped)
4. `index.md` reflects current state of wiki pages (rebuilt on lint)
5. `log.md` is append-only — entries are never modified or deleted

### Rebuild Contract

`search.db` can be fully rebuilt from markdown files at any time:

```
llm-wiki rebuild-index
  -> Delete search.db
  -> Scan all wiki/, projects/, log/ markdown files
  -> Re-embed and re-index all pages
  -> Rebuild BM25 and vector indices
```

This is a recovery operation, not a normal workflow. Normal operations use incremental reindex.

### Write Operations and Failure Handling

Two write models depending on operation type:

**Direct writes (remember_fact, remember_session):**

```
1. Write file to main working directory (unique filename, no conflicts)
2. Reindex new file in search.db
3. Git commit

Failure at step 1: No changes persisted, no cleanup needed
Failure at step 2: File written but index stale
  -> On next query: detect mtime mismatch, incremental reindex
Failure at step 3: File written, index updated, but not committed
  -> On next startup: detect uncommitted changes, auto-commit or warn user
```

**Worktree writes (ingest, lint):**

```
1. Create git worktree
2. Make all file changes in worktree
3. Squash commit in worktree
4. Merge worktree into main branch
5. Reindex changed files in search.db (in main working directory)
6. Remove worktree

Failure at steps 1-3: Discard worktree, no changes to main
Failure at step 4 (GIT_CONFLICT): Preserve worktree, return error with path
Failure at step 5: Files merged but index stale -> mtime detection on next query
Failure at step 6: Orphaned worktree -> `llm-wiki worktree-clean` or auto-cleanup on next run
```

Note: `search.db` is always updated against main branch files, never against worktree files. This ensures the index reflects only merged, committed state.

**Ingest and Lint both use worktree isolation:**

```
wiki_ingest / wiki_lint starts
  -> git worktree add .worktrees/{op}-{timestamp}
  -> All file changes happen in worktree (main branch untouched)
  -> On success:
      -> Squash commit in worktree
      -> git merge into main (fast-forward or LLM conflict resolution)
      -> Reindex changed files in search.db
      -> git worktree remove
  -> On LLM/processing failure (e.g. LLM_UNAVAILABLE):
      -> git worktree remove --force (discard all changes)
      -> Main branch and search.db untouched
      -> For lint: verbatim entries remain consolidated: false, retried next run
      -> Return error to caller
  -> On merge conflict (GIT_CONFLICT):
      -> Worktree PRESERVED at .worktrees/{op}-{timestamp}
      -> Return GIT_CONFLICT error with worktree path
      -> User can inspect, manually resolve, and merge
      -> Or run `llm-wiki worktree-clean` to discard
```

Two distinct failure modes: processing errors discard the worktree (nothing worth preserving), merge conflicts preserve it (completed work worth recovering).

### Index Staleness Detection

On MCP server startup and before each query:

```
For each file in wiki scope:
  if file.mtime > index.last_indexed_at(file):
    queue for incremental reindex
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
scope: undefined                     -> depends on `project` param:
                                        if project given: projects/{project} -> wiki -> /
                                        if no project:    wiki -> /
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
    -> For log/raw/:
        File-per-write strategy: each remember_fact/remember_session
        creates a unique file ({date}-{session}-{uuid}.md).
        Conflicts structurally impossible — no two writers touch same file.
        log.md (operation journal) uses append + git merge with union strategy.
    -> For wiki/:
      1. Read both versions
      2. LLM: "merge these two page versions"
      3. Write result
      4. Retry commit
      5. If N failures -> error to user
```

Git config for log.md union merge:

```
# .gitattributes
log.md merge=union
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

### Configuration Files

Three-layer separation: shared config, local config, runtime state.

**`.config/settings.shared.yaml`** (git-tracked, team-reproducible):

```yaml
search:
  db_path: .local/search.db
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

sanitization:
  enabled: true
  mode: redact
  custom_patterns: []
  allowlist: []
```

**`.config/agents/claude-code.yaml`** (git-tracked, immutable config — no runtime state):

```yaml
agent: claude-code
import:
  enabled: true
  paths:
    - ~/.claude/projects/*/memory/
  format: claude-memory
```

**`.local/settings.local.yaml`** (gitignored, per-machine secrets):

```yaml
wiki:
  path: ~/.llm-wiki

llm:
  provider: openai
  model: gpt-4o-mini
  base_url: null                       # override for Ollama/LMStudio/OpenRouter
  api_key: null                        # or via env var LLM_WIKI_LLM_API_KEY

embedding:
  provider: openai
  model: text-embedding-3-small
  base_url: null
  api_key: null                        # or via env var LLM_WIKI_EMBEDDING_API_KEY
```

**`.local/state.yaml`** (gitignored, mutable runtime state):

```yaml
imports:
  claude-code:
    last_import: 2026-04-10T12:00:00Z
  cursor:
    last_import: null
last_lint: 2026-04-10T14:30:00Z
last_ingest: 2026-04-10T10:00:00Z
```

**Merge order:** `.config/settings.shared.yaml` <- `.local/settings.local.yaml` <- env vars.

**Gitignore entries:**

```
.local/
```

### Initialization

```
$ llm-wiki init
  1. Create ~/.llm-wiki/ (or ask for path)
  2. git init
  3. Create directory structure
  4. Write default settings.shared.yaml + settings.local.yaml
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
- Config split: `settings.shared.yaml` tracked in git, `settings.local.yaml` + `search.db` gitignored

## Content Sanitization (MVP)

All write operations (`wiki_remember_fact`, `wiki_remember_session`, `wiki_ingest`, consolidation) pass through a sanitization layer before persisting content.

### Detection Rules

```
High-entropy strings matching known patterns:
  - AWS keys (AKIA...)
  - GitHub tokens (ghp_..., gho_..., github_pat_...)
  - Generic API keys (sk-..., sk_live_..., pk_live_...)
  - JWT tokens (eyJ...)
  - Private keys (-----BEGIN ... PRIVATE KEY-----)
  - Connection strings with passwords (postgresql://user:pass@...)
  - .env file content (KEY=value patterns in bulk)
```

### Behavior

```
Content hits sanitization rule
  -> Replace matched value with [REDACTED:{type}] placeholder
  -> Log warning to log.md: "Sanitized {type} from {operation}"
  -> Continue with redacted content
  -> Return SANITIZATION_BLOCKED error only if >50% of content is redacted
     (indicates entire content is likely a credentials dump)
```

### Configuration

```yaml
# settings.yaml
sanitization:
  enabled: true
  mode: redact                         # redact | warn | block
  custom_patterns: []                  # user-defined regex patterns
  allowlist: []                        # patterns to skip (e.g. localhost URLs)
```

### Non-goals (post-MVP)

- Deep semantic analysis of whether content is "sensitive" beyond pattern matching
- Per-project sensitivity policies
- Integration with secret management tools (Vault, 1Password)

## Backlog

- Scope expressions (`wiki/cli-relay+projects/cli-relay`, `*+!log`)
- Wiki quality metrics (recall/query frequency tracking)
- Offline degraded mode (node-llama.cpp for local LLM)
- Import: antigravity, kiro, amp
- Enterprise federation and ACL

## Acceptance Criteria & Testing Requirements

### Core Invariants (contract tests — must hold for ANY correct implementation)

| ID | Invariant | Verification |
|----|-----------|-------------|
| INV-1 | `wiki_remember_fact` returns within 100ms, never calls LLM | Unit test: mock LlmClient, assert zero calls |
| INV-2 | `wiki_recall` for unknown project returns wiki-only context, never errors | Integration test: recall with non-existent git remote |
| INV-3 | `wiki_query` with `LLM_UNAVAILABLE` returns raw search results in citations | Integration test: mock LlmClient to throw, verify citations populated |
| INV-4 | After `wiki_ingest` failure, main branch is untouched (worktree discarded) | Integration test: mock LlmClient to fail mid-ingest, verify main branch `git status` clean |
| INV-5 | After `wiki_lint`, all processed verbatim entries have `consolidated: true` | Integration test: create N entries, run lint, assert all marked |
| INV-6 | `search.db` can be deleted and rebuilt from markdown files with identical query results | Integration test: query, delete DB, rebuild, query again, compare |
| INV-7 | Sanitization redacts all patterns from detection rules before content reaches disk | Unit test: parametrize with each pattern type, assert redacted in output file |
| INV-8 | `wiki_remember_session` with same `session_id` is idempotent | Integration test: call twice, assert single entry |
| INV-9 | `wiki_lint` in worktree does not modify main branch until merge | Integration test: run lint, check main branch unchanged until squash+merge |
| INV-10 | Scope cascade returns project results first, wiki second, all third | Integration test: create pages in each scope, verify ordering |
| INV-11 | `wiki_recall` is deterministic: same wiki state + same cwd = same response | Integration test: call recall twice, assert identical response |
| INV-12 | `wiki_recall` never calls LLM — pure file listing with recency sort | Unit test: mock ILlmClient, assert zero calls |
| INV-13 | `wiki_ingest` runs in worktree, never modifies main branch files directly | Integration test: during ingest, verify main branch working tree unchanged |

### Key Scenarios (integration/e2e tests)

**Recall flow:**
- Given: project `cli-relay` exists in wiki with 5 pages
- When: `wiki_recall({ cwd: "/path/to/cli-relay" })`
- Then: response contains `project: "cli-relay"`, pages from both `projects/cli-relay/` (70% budget) and `wiki/` (30% reserved budget), total within `max_tokens` budget

**Remember + Consolidation flow:**
- Given: empty wiki
- When: `wiki_remember_fact({ content: "pgx pool MaxConns <= max_connections/3", project: "cli-relay" })` x3
- And: `wiki_lint({ phases: ["consolidate"] })`
- Then: verbatim entries marked `consolidated: true`, at least one wiki or project page created/updated, git commit exists with `:recycle: [consolidate]`

**Promote flow:**
- Given: same practice recorded in 2+ projects
- When: `wiki_lint({ phases: ["promote"] })`
- Then: page created in `wiki/patterns/`, project files contain link to promoted page

**Import flow:**
- Given: Claude Code memory files exist at `~/.claude/projects/test/memory/`
- When: `llm-wiki import`
- Then: new verbatim entries created in `log/claude-code/raw/`, `last_import` timestamp updated

**Conflict resolution flow:**
- Given: two concurrent writes to same wiki page
- When: second write triggers git conflict
- Then: LLM merges both versions, commit succeeds, or after N retries returns `GIT_CONFLICT` error

**Sanitization flow:**
- Given: agent calls `wiki_remember_fact({ content: "API key: sk-abc123..." })`
- Then: persisted content contains `[REDACTED:api_key]`, log.md has sanitization warning

### Failure Scenarios

| Scenario | Expected behavior |
|----------|------------------|
| LLM API down during query | Return raw search results without synthesis |
| LLM API down during ingest | Return `LLM_UNAVAILABLE`, no files modified |
| LLM API down during lint | Return `LLM_UNAVAILABLE`, worktree discarded, entries remain unconsolidated |
| Git conflict during lint merge | Preserve worktree, return `GIT_CONFLICT` with worktree path |
| Disk full during write | Operation fails, no partial files (write to temp + rename) |
| Corrupted search.db | Auto-detect on startup, trigger rebuild |
| Missing wiki directory | `WIKI_NOT_INITIALIZED` error on all operations |

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
| Ports/adapters in core | core/ports defines interfaces, infra implements them. Contract tests against ports, not implementations. Enables adapter swaps without touching business logic |
| Worktree for all mutating operations | Both ingest and lint use git worktree. Eliminates dangerous `git checkout -- .` and protects concurrent agent writes |
| Deterministic recall (no LLM) | wiki_recall is pure file listing sorted by recency, no relevance scoring. Deterministic, fast, client-independent |
| Explicit project context in query | wiki_query accepts optional `project` param for scope cascade. Without it, falls back to context-free search (wiki -> all). No hidden state |
| Three-layer config | `.config/` (shared, tracked) + `.local/` (secrets, gitignored) + `.local/state.yaml` (runtime state, gitignored). Clean separation for team reproducibility |

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
