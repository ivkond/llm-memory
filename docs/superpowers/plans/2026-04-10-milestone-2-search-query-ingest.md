# Milestone 2: Search, Query & Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search infrastructure (RuVector), LLM/embedding clients (AI SDK), QueryService, IngestService, GitManager (worktree-based writes), and wiki_status — enabling semantic search, question answering with citations, external source ingestion, and operational diagnostics.

**Architecture:** Extends Clean Architecture from M1. New ports: ISearchEngine, ILlmClient, IEmbeddingClient, IArchiver. New infra adapters: RuVectorSearchEngine, AiSdkLlmClient, AiSdkEmbeddingClient, GitVersionControl. New services: QueryService, IngestService. Enhanced RecallService with search index awareness.

**Tech Stack additions:** RuVector (embedded hybrid search), AI SDK (Vercel), simple-git (worktree management)

**Spec:** `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

**Invariants covered:**
- INV-3: `wiki_query` with `LLM_UNAVAILABLE` returns raw search results in citations
- INV-4: After `wiki_ingest` failure, main branch is untouched (worktree discarded)
- INV-6: `search.db` can be deleted and rebuilt from markdown files with identical results
- INV-9: `wiki_lint` in worktree does not modify main branch until merge
- INV-10: Scope cascade returns project results first, wiki second, all third
- INV-13: `wiki_ingest` runs in worktree, never modifies main branch files directly

**Depends on:** Milestone 1 (domain entities, ports, FsFileStore, FsVerbatimStore, RememberService, RecallService, SanitizationService, ConfigLoader, GitProjectResolver)

---

## File Structure (additions to M1)

```
llm-memory/
  packages/
    core/
      src/
        domain/
          search-result.ts                  # SearchResult value object (NEW)
        ports/
          search-engine.ts                  # ISearchEngine interface (NEW)
          llm-client.ts                     # ILlmClient interface (NEW)
          embedding-client.ts               # IEmbeddingClient interface (NEW)
          archiver.ts                       # IArchiver interface (NEW)
          version-control.ts                # Extended with worktree methods
          index.ts                          # Updated re-exports
        services/
          query-service.ts                  # Orchestrates: SearchEngine + LlmClient (NEW)
          ingest-service.ts                 # Orchestrates: LlmClient + FileStore + SearchEngine + VersionControl (NEW)
          recall-service.ts                 # Enhanced: add search index staleness check
          index.ts                          # Updated re-exports
      tests/
        domain/
          search-result.test.ts
        services/
          query-service.test.ts
          ingest-service.test.ts

    infra/
      src/
        ruvector-search-engine.ts           # ISearchEngine via RuVector (NEW)
        ai-sdk-llm-client.ts               # ILlmClient via AI SDK (NEW)
        ai-sdk-embedding-client.ts          # IEmbeddingClient via AI SDK (NEW)
        git-version-control.ts              # IVersionControl via simple-git (NEW)
        index.ts                            # Updated re-exports
      tests/
        ruvector-search-engine.test.ts
        ai-sdk-llm-client.test.ts
        ai-sdk-embedding-client.test.ts
        git-version-control.test.ts
        integration/
          query-e2e.test.ts
          ingest-e2e.test.ts
```

---

## Task 1: SearchResult domain entity + new port interfaces

**Files:**
- Create: `packages/core/src/domain/search-result.ts`
- Create: `packages/core/src/ports/search-engine.ts`
- Create: `packages/core/src/ports/llm-client.ts`
- Create: `packages/core/src/ports/embedding-client.ts`
- Create: `packages/core/src/ports/archiver.ts`
- Modify: `packages/core/src/ports/version-control.ts` (extend with worktree methods)
- Modify: `packages/core/src/ports/index.ts`
- Modify: `packages/core/src/domain/index.ts`
- Test: `packages/core/tests/domain/search-result.test.ts`

- [ ] **Step 1: Write SearchResult value object test**

```typescript
// packages/core/tests/domain/search-result.test.ts
import { describe, it, expect } from 'vitest';
import { SearchResult } from '../../src/domain/search-result.js';

describe('SearchResult', () => {
  it('test_create_validData_constructsAllFields', () => {
    const result = new SearchResult(
      'wiki/patterns/testing.md',
      'Testing Patterns',
      'Use testcontainers for integration tests.',
      0.85,
      'hybrid',
    );

    expect(result.path).toBe('wiki/patterns/testing.md');
    expect(result.title).toBe('Testing Patterns');
    expect(result.excerpt).toBe('Use testcontainers for integration tests.');
    expect(result.score).toBe(0.85);
    expect(result.source).toBe('hybrid');
  });

  it('test_isHighConfidence_above08_returnsTrue', () => {
    const result = new SearchResult('p', 't', 'e', 0.9, 'hybrid');
    expect(result.isHighConfidence).toBe(true);
  });

  it('test_isHighConfidence_below08_returnsFalse', () => {
    const result = new SearchResult('p', 't', 'e', 0.5, 'hybrid');
    expect(result.isHighConfidence).toBe(false);
  });

  it('test_sortByScoreDesc_correctOrder', () => {
    const results = [
      new SearchResult('a', 'A', 'a', 0.5, 'bm25'),
      new SearchResult('b', 'B', 'b', 0.9, 'vector'),
      new SearchResult('c', 'C', 'c', 0.7, 'hybrid'),
    ];
    const sorted = SearchResult.sortByScore(results);
    expect(sorted[0].path).toBe('b');
    expect(sorted[1].path).toBe('c');
    expect(sorted[2].path).toBe('a');
  });
});
```

- [ ] **Step 2: Implement SearchResult**

```typescript
// packages/core/src/domain/search-result.ts

export type SearchSource = 'bm25' | 'vector' | 'hybrid';

export class SearchResult {
  constructor(
    public readonly path: string,
    public readonly title: string,
    public readonly excerpt: string,
    public readonly score: number,
    public readonly source: SearchSource,
  ) {}

  get isHighConfidence(): boolean {
    return this.score >= 0.8;
  }

  static sortByScore(results: SearchResult[]): SearchResult[] {
    return [...results].sort((a, b) => b.score - a.score);
  }
}
```

- [ ] **Step 3: Define ISearchEngine port**

```typescript
// packages/core/src/ports/search-engine.ts
import type { SearchResult } from '../domain/search-result.js';

export interface SearchQuery {
  text: string;
  scope?: string;
  maxResults?: number;
}

export interface IndexEntry {
  path: string;
  title: string;
  content: string;
  updated: string;
}

export interface ISearchEngine {
  /** Index or re-index a document. */
  index(entry: IndexEntry): Promise<void>;

  /** Remove a document from the index. */
  remove(path: string): Promise<void>;

  /** Hybrid search: BM25 + vector similarity via RRF. */
  search(query: SearchQuery): Promise<SearchResult[]>;

  /** Rebuild entire index from scratch. */
  rebuild(entries: IndexEntry[]): Promise<void>;

  /** Check if index exists and is healthy. */
  health(): Promise<'ok' | 'stale' | 'missing'>;

  /** Get last indexed timestamp for a file. Returns null if not indexed. */
  lastIndexedAt(path: string): Promise<string | null>;
}
```

- [ ] **Step 4: Define ILlmClient port**

```typescript
// packages/core/src/ports/llm-client.ts

export interface LlmCompletionRequest {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompletionResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ILlmClient {
  /** Generate a completion. */
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}
```

- [ ] **Step 5: Define IEmbeddingClient port**

```typescript
// packages/core/src/ports/embedding-client.ts

export interface IEmbeddingClient {
  /** Generate embeddings for one or more texts. */
  embed(texts: string[]): Promise<number[][]>;

  /** Get the dimensionality of the embedding model. */
  dimensions(): number;
}
```

- [ ] **Step 6: Define IArchiver port**

```typescript
// packages/core/src/ports/archiver.ts

export interface ArchiveResult {
  archivePath: string;
  filesArchived: number;
  bytesCompressed: number;
}

export interface IArchiver {
  /** Compress files to 7zip archive. */
  archive(files: string[], outputPath: string): Promise<ArchiveResult>;

  /** List archives in a directory. */
  listArchives(directory: string): Promise<string[]>;

  /** Clean up archives older than retention period. */
  cleanup(directory: string, retentionMonths: number): Promise<number>;
}
```

- [ ] **Step 7: Extend IVersionControl with worktree methods**

```typescript
// packages/core/src/ports/version-control.ts

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export interface IVersionControl {
  /** Commit specific files with a message. */
  commit(files: string[], message: string): Promise<string>;

  /** Check for uncommitted changes. */
  hasUncommittedChanges(): Promise<boolean>;

  /** Create a git worktree for isolated operations. */
  createWorktree(name: string): Promise<WorktreeInfo>;

  /** Remove a git worktree. */
  removeWorktree(path: string, force?: boolean): Promise<void>;

  /** Squash all commits in worktree into one. */
  squashWorktree(worktreePath: string, message: string): Promise<string>;

  /** Merge worktree branch into main. Returns commit SHA or throws GIT_CONFLICT. */
  mergeWorktree(worktreePath: string): Promise<string>;

  /** Add all changes in worktree and commit. */
  commitInWorktree(worktreePath: string, files: string[], message: string): Promise<string>;
}
```

- [ ] **Step 8: Update port and domain index files**

- [ ] **Step 9: Verify build**

Run: `pnpm --filter @llm-wiki/core build`
Expected: Compiles without errors.

- [ ] **Step 10: Commit**

```bash
git add packages/core/
git commit -m ":sparkles: [core] SearchResult entity + ISearchEngine, ILlmClient, IEmbeddingClient, IArchiver ports"
```

---

## Task 2: ISearchEngine adapter — RuVectorSearchEngine

**Files:**
- Create: `packages/infra/src/ruvector-search-engine.ts`
- Test: `packages/infra/tests/ruvector-search-engine.test.ts`

**Note:** RuVector is an embedded npm package (`ruvector`). It provides both BM25 (sparse) and vector (dense) search in a single package. If RuVector is not yet published or has API issues, implement with an in-memory adapter that can be swapped later.

- [ ] **Step 1: Install RuVector**

```bash
pnpm --filter @llm-wiki/infra add ruvector
```

If `ruvector` is not available, create an in-memory hybrid search adapter as a placeholder.

- [ ] **Step 2: Write contract tests for ISearchEngine**

Tests should verify:
- `index()` then `search()` finds the document
- `search()` with no matches returns empty array
- `remove()` then `search()` does not find removed document
- `rebuild()` re-creates the full index
- `health()` returns 'ok' after index, 'missing' before
- `lastIndexedAt()` returns timestamp after indexing
- Hybrid search ranks documents by relevance
- Scope filtering works correctly

- [ ] **Step 3: Implement RuVectorSearchEngine (or InMemorySearchEngine fallback)**

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

---

## Task 3: ILlmClient + IEmbeddingClient adapters — AI SDK

**Files:**
- Create: `packages/infra/src/ai-sdk-llm-client.ts`
- Create: `packages/infra/src/ai-sdk-embedding-client.ts`
- Test: `packages/infra/tests/ai-sdk-llm-client.test.ts`
- Test: `packages/infra/tests/ai-sdk-embedding-client.test.ts`

- [ ] **Step 1: Install AI SDK**

```bash
pnpm --filter @llm-wiki/infra add ai @ai-sdk/openai
```

- [ ] **Step 2: Write contract tests for ILlmClient**

Tests should verify:
- `complete()` returns valid response structure
- Error handling for LLM_UNAVAILABLE
- Token usage tracked correctly

Use mock/stub AI SDK provider for unit tests.

- [ ] **Step 3: Write contract tests for IEmbeddingClient**

Tests should verify:
- `embed()` returns arrays of correct dimensionality
- `dimensions()` matches model configuration
- Batch embedding works

- [ ] **Step 4: Implement AiSdkLlmClient**

```typescript
// packages/infra/src/ai-sdk-llm-client.ts
// Implements ILlmClient via AI SDK (Vercel)
// Wraps generateText() from 'ai' package
```

- [ ] **Step 5: Implement AiSdkEmbeddingClient**

```typescript
// packages/infra/src/ai-sdk-embedding-client.ts
// Implements IEmbeddingClient via AI SDK
// Wraps embedMany() from 'ai' package
```

- [ ] **Step 6: Run tests, verify pass**

- [ ] **Step 7: Commit**

---

## Task 4: GitVersionControl adapter (worktree support)

**Files:**
- Create: `packages/infra/src/git-version-control.ts`
- Test: `packages/infra/tests/git-version-control.test.ts`

- [ ] **Step 1: Write contract tests for IVersionControl**

Tests should verify:
- `commit()` creates git commit with correct message
- `hasUncommittedChanges()` detects changes
- `createWorktree()` creates isolated worktree
- `removeWorktree()` cleans up
- `squashWorktree()` squashes commits
- `mergeWorktree()` merges back to main
- `mergeWorktree()` throws on conflict
- `commitInWorktree()` commits within worktree

All tests use real git repos in temp directories.

- [ ] **Step 2: Implement GitVersionControl via simple-git**

```typescript
// packages/infra/src/git-version-control.ts
// Uses simple-git for git operations
// Worktree created at .worktrees/{name}-{timestamp}
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

---

## Task 5: QueryService

**Files:**
- Create: `packages/core/src/services/query-service.ts`
- Test: `packages/core/tests/services/query-service.test.ts`

- [ ] **Step 1: Write failing tests (covers INV-3, INV-10)**

Tests should verify:
- `query()` with valid question returns answer + citations
- `query()` with scope applies scope filtering
- `query()` with project cascades: project -> wiki -> all (INV-10)
- `query()` when LLM fails returns raw search results as citations (INV-3)
- `query()` with no results throws SEARCH_EMPTY
- Answer respects maxTokens limit
- Citations capped at max 20

- [ ] **Step 2: Implement QueryService**

```typescript
// packages/core/src/services/query-service.ts
// Orchestrates: ISearchEngine + ILlmClient + IProjectResolver
//
// Flow:
// 1. Resolve scope (explicit, or cascade via project)
// 2. Search via ISearchEngine
// 3. Synthesize answer via ILlmClient (with fallback to raw results)
// 4. Return answer + citations
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Update services index**

- [ ] **Step 5: Commit**

---

## Task 6: IngestService

**Files:**
- Create: `packages/core/src/services/ingest-service.ts`
- Test: `packages/core/tests/services/ingest-service.test.ts`

- [ ] **Step 1: Write failing tests (covers INV-4, INV-13)**

Tests should verify:
- `ingest()` creates/updates wiki pages from source content
- `ingest()` runs in worktree, not main branch (INV-13)
- `ingest()` on LLM failure: main branch untouched, worktree discarded (INV-4)
- `ingest()` on success: pages committed, merged to main, reindexed
- `ingest()` re-ingesting same source updates (not duplicates)
- `ingest()` on GIT_CONFLICT: worktree preserved with path returned
- Source size limit enforced (100K tokens)

- [ ] **Step 2: Implement IngestService**

```typescript
// packages/core/src/services/ingest-service.ts
// Orchestrates: ILlmClient + IFileStore + ISearchEngine + IVersionControl
//
// Flow:
// 1. Read source (file or URL)
// 2. Create worktree
// 3. LLM: extract facts, create wiki pages in worktree
// 4. Update crossrefs
// 5. Squash commit in worktree
// 6. Merge worktree -> main
// 7. Reindex changed pages in search.db
// 8. Remove worktree
// On failure: discard worktree (LLM error) or preserve (GIT_CONFLICT)
```

- [ ] **Step 3: Add new domain errors**

```typescript
// Add to packages/core/src/domain/errors.ts
export class SearchEmptyError extends WikiError { ... }
export class LlmUnavailableError extends WikiError { ... }
export class GitConflictError extends WikiError { ... }
export class SourceNotFoundError extends WikiError { ... }
export class SourceParseError extends WikiError { ... }
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

---

## Task 7: Enhanced RecallService — search index staleness detection

**Files:**
- Modify: `packages/core/src/services/recall-service.ts`
- Modify: `packages/core/tests/services/recall-service.test.ts`

- [ ] **Step 1: Add index staleness check to RecallService**

The RecallService should detect when files have changed since last index:
- Compare file mtime with `ISearchEngine.lastIndexedAt()`
- Queue stale files for reindex
- Include `index_health` in response

- [ ] **Step 2: Write tests for staleness detection**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Commit**

---

## Task 8: WikiStatusService

**Files:**
- Create: `packages/core/src/services/status-service.ts`
- Test: `packages/core/tests/services/status-service.test.ts`

- [ ] **Step 1: Write failing tests**

Tests should verify:
- `status()` returns total_pages, projects list, unconsolidated count
- `status()` returns index_health ('ok', 'stale', 'missing')
- `status()` returns last_lint, last_ingest timestamps from state
- `status()` throws WIKI_NOT_INITIALIZED when wiki doesn't exist

- [ ] **Step 2: Implement WikiStatusService**

```typescript
// packages/core/src/services/status-service.ts
// Orchestrates: IFileStore + IVerbatimStore + ISearchEngine
//
// Response: {
//   total_pages, projects, unconsolidated,
//   last_lint, last_ingest, index_health
// }
```

- [ ] **Step 3: Commit**

---

## Task 9: Integration tests — Query + Ingest E2E

**Files:**
- Create: `packages/infra/tests/integration/query-e2e.test.ts`
- Create: `packages/infra/tests/integration/ingest-e2e.test.ts`

- [ ] **Step 1: Write Query E2E test**

End-to-end with real filesystem + in-memory search:
- Create wiki pages
- Index them
- Query and verify answer + citations
- Test scope cascade (INV-10)
- Test LLM failure fallback (INV-3)

- [ ] **Step 2: Write Ingest E2E test**

End-to-end with real filesystem + git:
- Create source file
- Run ingest
- Verify wiki pages created
- Verify git commits
- Verify worktree cleanup
- Test failure scenario (INV-4, INV-13)

- [ ] **Step 3: Write search rebuild test (INV-6)**

- Delete search.db
- Rebuild from markdown
- Verify identical query results

- [ ] **Step 4: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

---

## Milestone 2 — Summary

After completing all 9 tasks, the following is added:

| Component | What it does |
|-----------|-------------|
| `SearchResult` entity | Scored search hit value object |
| `ISearchEngine` port | Index, search, rebuild interface |
| `ILlmClient` port | LLM completion interface |
| `IEmbeddingClient` port | Embedding generation interface |
| `IArchiver` port | Archive compression interface |
| `IVersionControl` (extended) | Worktree create/remove/squash/merge |
| `RuVectorSearchEngine` | Hybrid BM25+vector search adapter |
| `AiSdkLlmClient` | LLM via AI SDK |
| `AiSdkEmbeddingClient` | Embeddings via AI SDK |
| `GitVersionControl` | Git operations via simple-git |
| `QueryService` | Semantic search + answer synthesis |
| `IngestService` | External source ingestion via worktree |
| `WikiStatusService` | Operational diagnostics |
| Integration tests | Query E2E, Ingest E2E, index rebuild |

**Invariants verified:** INV-3, INV-4, INV-6, INV-9, INV-10, INV-13

**Next milestone:** MCP Server + CLI + Claude Code integration (MCP transport, CLI commands, Claude Code hooks/skill)
