# Milestone 2: Search, Query & Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search infrastructure (RuVector), LLM/embedding clients (AI SDK), QueryService, IngestService, GitManager (worktree-based writes), and wiki_status — enabling semantic search, question answering with citations, external source ingestion, and operational diagnostics.

**Architecture:** Extends Clean Architecture from M1. New ports: `ISearchEngine`, `ILlmClient`, `IEmbeddingClient`, `ISourceReader`, `IStateStore`, plus a `FileStoreFactory` type for worktree writes. `IVersionControl` is extended with worktree methods. New infra adapters: `RuVectorSearchEngine`, `AiSdkLlmClient`, `AiSdkEmbeddingClient`, `GitVersionControl`, `FsSourceReader`, `HttpSourceReader`, `CompositeSourceReader`, `YamlStateStore`. New services: `QueryService`, `IngestService`, `WikiStatusService`. `RecallService` is NOT modified — the spec defines `wiki_recall` as a pure file listing.

**Tech Stack additions:** RuVector (embedded hybrid search), AI SDK (Vercel), simple-git (worktree management)

**Spec:** `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

**Invariants covered:**
- INV-3: `wiki_query` with `LLM_UNAVAILABLE` returns raw search results in citations
- INV-4: After `wiki_ingest` failure, main branch is untouched (worktree discarded)
- INV-6: `search.db` can be deleted and rebuilt from markdown files with identical results
- INV-10: Scope cascade returns project results first, wiki second, all third
- INV-13: `wiki_ingest` runs in worktree, never modifies main branch files directly

**Out of scope (deferred to Milestone 3):** `LintService` / `wiki_lint` and the consolidation / promote / health pipeline. INV-5, INV-9 remain uncovered until M3.

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
          runtime-state.ts                  # WikiRuntimeState value object (NEW)
        ports/
          search-engine.ts                  # ISearchEngine interface (NEW)
          llm-client.ts                     # ILlmClient interface (NEW)
          embedding-client.ts               # IEmbeddingClient interface (NEW)
          source-reader.ts                  # ISourceReader interface (NEW)
          state-store.ts                    # IStateStore interface (NEW)
          file-store.ts                     # + FileStoreFactory type (MODIFIED)
          version-control.ts                # Extended with worktree methods
          index.ts                          # Updated re-exports
        services/
          query-service.ts                  # Orchestrates: SearchEngine + LlmClient (NEW)
          ingest-service.ts                 # Orchestrates: LlmClient + FileStoreFactory + SearchEngine + VersionControl + SourceReader (NEW)
          status-service.ts                 # Orchestrates: FileStore + VerbatimStore + SearchEngine + StateStore (NEW)
          index.ts                          # Updated re-exports
      tests/
        domain/
          search-result.test.ts
          runtime-state.test.ts
        services/
          query-service.test.ts
          ingest-service.test.ts
          status-service.test.ts

    infra/
      src/
        ruvector-search-engine.ts           # ISearchEngine via RuVector (NEW)
        ai-sdk-llm-client.ts                # ILlmClient via AI SDK (NEW)
        ai-sdk-embedding-client.ts          # IEmbeddingClient via AI SDK (NEW)
        git-version-control.ts              # IVersionControl via simple-git (NEW)
        fs-source-reader.ts                 # ISourceReader for file:// and bare paths (NEW)
        http-source-reader.ts               # ISourceReader for http(s):// URLs (NEW)
        composite-source-reader.ts          # Dispatches by URI scheme (NEW)
        yaml-state-store.ts                 # IStateStore via .local/state.yaml (NEW)
        index.ts                            # Updated re-exports
      tests/
        ruvector-search-engine.test.ts
        ai-sdk-llm-client.test.ts
        ai-sdk-embedding-client.test.ts
        git-version-control.test.ts
        fs-source-reader.test.ts
        composite-source-reader.test.ts
        yaml-state-store.test.ts
        integration/
          query-e2e.test.ts
          ingest-e2e.test.ts
```

**IArchiver is NOT delivered in this milestone.** It ships with `LintService` in Milestone 3 because nothing in M2 archives anything.

---

## Task 1: Domain additions + new port interfaces

**Goal:** Add everything M2 services need at the domain and port level, without any infra dependencies.

**Files:**
- Create: `packages/core/src/domain/search-result.ts`
- Create: `packages/core/src/domain/runtime-state.ts`
- Create: `packages/core/src/ports/search-engine.ts`
- Create: `packages/core/src/ports/llm-client.ts`
- Create: `packages/core/src/ports/embedding-client.ts`
- Create: `packages/core/src/ports/source-reader.ts`
- Create: `packages/core/src/ports/state-store.ts`
- Modify: `packages/core/src/ports/file-store.ts` (add `FileStoreFactory` type)
- Modify: `packages/core/src/ports/version-control.ts` (extend with worktree methods)
- Modify: `packages/core/src/ports/index.ts`
- Modify: `packages/core/src/domain/index.ts`
- Modify: `packages/core/src/domain/errors.ts` (add SearchEmptyError, LlmUnavailableError, GitConflictError, SourceNotFoundError, SourceParseError)
- Test: `packages/core/tests/domain/search-result.test.ts`
- Test: `packages/core/tests/domain/runtime-state.test.ts`

**Note:** `IArchiver` is deliberately not introduced here — it moves to Milestone 3 together with `LintService`.

**Design of new port interfaces:**

```typescript
// packages/core/src/ports/source-reader.ts
export interface SourceContent {
  /** Canonical URI of the source (absolute path or URL). */
  uri: string;
  /** Raw text content. */
  content: string;
  /** Optional mime type hint, e.g. 'text/markdown'. */
  mimeType?: string;
  /** Size in bytes of the raw content. */
  bytes: number;
}

export interface ISourceReader {
  /** Read a source by URI (local path or http(s):// URL).
   *  Throws SourceNotFoundError or SourceParseError on failure. */
  read(uri: string): Promise<SourceContent>;
}
```

```typescript
// packages/core/src/ports/state-store.ts
import type { WikiRuntimeState } from '../domain/runtime-state.js';

export interface IStateStore {
  /** Load runtime state. Returns defaults if the state file is missing. */
  load(): Promise<WikiRuntimeState>;

  /** Overwrite runtime state atomically. */
  save(state: WikiRuntimeState): Promise<void>;

  /** Shallow-merge a patch, persist, and return the new state. */
  update(patch: Partial<WikiRuntimeState>): Promise<WikiRuntimeState>;
}
```

```typescript
// packages/core/src/domain/runtime-state.ts
export interface ImportState {
  last_import: string | null;
}

export interface WikiRuntimeState {
  imports: Record<string, ImportState>;
  last_lint: string | null;
  last_ingest: string | null;
}

export const EMPTY_RUNTIME_STATE: WikiRuntimeState = {
  imports: {},
  last_lint: null,
  last_ingest: null,
};
```

```typescript
// addition to packages/core/src/ports/file-store.ts
/** Factory for building an IFileStore rooted at an arbitrary directory.
 *  Used by IngestService / LintService to write inside a git worktree
 *  without coupling services to any concrete adapter. */
export type FileStoreFactory = (rootDir: string) => IFileStore;
```

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

- [ ] **Step 6: Extend IVersionControl with worktree methods**

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

- [ ] **Step 7: Add new domain error types**

Extend `packages/core/src/domain/errors.ts` with `SearchEmptyError` (`SEARCH_EMPTY`), `LlmUnavailableError` (`LLM_UNAVAILABLE`), `GitConflictError` (`GIT_CONFLICT`), `SourceNotFoundError` (`SOURCE_NOT_FOUND`), `SourceParseError` (`SOURCE_PARSE_ERROR`). Each extends `WikiError` and sets the documented code string.

- [ ] **Step 8: Define ISourceReader and IStateStore ports**

Copy the two interface blocks shown at the start of Task 1. ISourceReader is a single-method port (ISP-compliant). IStateStore is 3 methods: `load`, `save`, `update`.

- [ ] **Step 9: Add `FileStoreFactory` type to `packages/core/src/ports/file-store.ts`**

Append the `FileStoreFactory` definition shown at the start of Task 1. Do NOT modify `IFileStore` itself — keep the interface unchanged so M1 adapters still satisfy the contract.

- [ ] **Step 10: Write failing tests for new domain types**

- `search-result.test.ts` — already specified above.
- `runtime-state.test.ts` — verify `EMPTY_RUNTIME_STATE` defaults, shape, and that it is a plain data object (no methods).

- [ ] **Step 11: Implement SearchResult and runtime-state module**

- [ ] **Step 12: Update port and domain index files**

`packages/core/src/ports/index.ts` re-exports: `ISearchEngine`, `ILlmClient`, `IEmbeddingClient`, `ISourceReader`, `SourceContent`, `IStateStore`, `FileStoreFactory`, and the extended `IVersionControl` / `WorktreeInfo`.

`packages/core/src/domain/index.ts` re-exports `SearchResult`, `WikiRuntimeState`, `EMPTY_RUNTIME_STATE`, and the new error types.

- [ ] **Step 13: Verify build**

Run: `pnpm lint`
Expected: Compiles without errors.

Run: `pnpm vitest run packages/core/tests/domain/search-result.test.ts packages/core/tests/domain/runtime-state.test.ts`
Expected: ALL PASS.

- [ ] **Step 14: Commit**

```bash
git add packages/core/
git commit -m ":sparkles: [core] Add SearchResult, WikiRuntimeState, and M2 port interfaces"
```

---

## Task 2: ISearchEngine adapter — RuVectorSearchEngine

**Files:**
- Create: `packages/infra/src/ruvector-search-engine.ts`
- Test: `packages/infra/tests/ruvector-search-engine.test.ts`

**Note:** RuVector is the sole backing implementation for M2. It provides both BM25 (sparse) and vector (dense) search in one embedded package. Placeholder adapters are explicitly forbidden — INV-6 requires real `search.db` rebuild semantics, and the project's `No placeholders` rule applies.

If `ruvector` turns out to be unpublished or has a blocking API issue at implementation time, **stop and escalate to the human.** Do not ship an in-memory stand-in.

- [ ] **Step 1: Install RuVector**

```bash
pnpm --filter @llm-wiki/infra add ruvector
```

If install fails, BLOCK and escalate — do NOT work around it with a stub.

- [ ] **Step 2: Write failing contract tests for ISearchEngine**

Required scenarios (use a real `search.db` under a temp dir, clean up in `afterEach`):
- `test_index_then_search_findsDocument`
- `test_search_noMatches_returnsEmptyArray`
- `test_remove_then_search_missing`
- `test_rebuild_fromEntries_recreatesIndex`
- `test_health_returnsMissingBeforeIndex_okAfter`
- `test_lastIndexedAt_returnsTimestamp`
- `test_hybrid_ranksMoreRelevantFirst`
- `test_scope_filtersByPrefix`

Run: `pnpm vitest run packages/infra/tests/ruvector-search-engine.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement RuVectorSearchEngine**

- Wrap the `ruvector` API.
- Persist the index at a path provided via the constructor (`.local/search.db` by default in wiring code).
- `health()` returns `'missing'` when the DB file does not exist, `'ok'` otherwise. Staleness is reported by comparing `lastIndexedAt(path)` against file mtime in callers (QueryService / WikiStatusService) — the adapter itself does not own mtime checks.

- [ ] **Step 4: Run tests, verify ALL PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/infra/src/ruvector-search-engine.ts packages/infra/tests/ruvector-search-engine.test.ts packages/infra/package.json pnpm-lock.yaml
git commit -m ":sparkles: [infra] RuVectorSearchEngine adapter implementing ISearchEngine"
```

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

## Task 5: QueryService (with pre-search staleness sync)

**Files:**
- Create: `packages/core/src/services/query-service.ts`
- Test: `packages/core/tests/services/query-service.test.ts`

**Scope of this service.** The spec says staleness detection runs "before each query". That responsibility lives here, NOT in `RecallService`:

> For each file in wiki scope: if `file.mtime > index.lastIndexedAt(file)`, queue for incremental reindex.

This keeps `wiki_recall` a pure file listing (per spec) and concentrates the search engine coupling in `wiki_query`.

- [ ] **Step 1: Write failing tests (covers INV-3, INV-10)**

Mock `ISearchEngine`, `ILlmClient`, `IFileStore`, `IProjectResolver`. Required scenarios:
- `test_query_validQuestion_returnsAnswerAndCitations`
- `test_query_explicitScope_searchEngineReceivesScope`
- `test_query_cascadeByProject_projectFirst_thenWiki_thenAll` (INV-10)
- `test_query_llmThrows_returnsRawResultsAsCitations` (INV-3)
- `test_query_noSearchResults_throwsSearchEmpty`
- `test_query_staleFile_triggersReindexBeforeSearch`
- `test_query_citationsCappedAt20`
- `test_query_answerRespectsMaxTokens`

- [ ] **Step 2: Implement QueryService**

Orchestrates: `ISearchEngine + ILlmClient + IProjectResolver + IFileStore`.

Flow:
1. Resolve scope (explicit scope parameter, or cascade derived from `project` param)
2. Staleness sync: for each file in the resolved scope, if `file.updated > searchEngine.lastIndexedAt(path)`, call `searchEngine.index(entry)` to refresh it
3. `searchEngine.search({ query, scope, limit })` → `SearchResult[]`
4. If results empty → throw `SearchEmptyError`
5. Try `llmClient.complete(...)` to synthesize an answer with citations
6. On `LlmUnavailableError` (or any thrown error from the LLM client): return `{ answer: '', citations: rawResults, scope_used, project_used }` — INV-3 guarantees citations are populated
7. Cap `citations` at 20

- [ ] **Step 3: Run tests, verify pass**

Run: `pnpm vitest run packages/core/tests/services/query-service.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Update services index**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/query-service.ts packages/core/tests/services/query-service.test.ts packages/core/src/services/index.ts
git commit -m ":sparkles: [core] QueryService with staleness sync and LLM fallback (INV-3, INV-10)"
```

---

## Task 6: IngestService

**Files:**
- Create: `packages/core/src/services/ingest-service.ts`
- Test: `packages/core/tests/services/ingest-service.test.ts`

**Dependencies (constructor-injected, all ports from Task 1):**

```typescript
constructor(
  private readonly sourceReader: ISourceReader,
  private readonly llmClient: ILlmClient,
  private readonly searchEngine: ISearchEngine,
  private readonly versionControl: IVersionControl,
  private readonly mainFileStore: IFileStore,
  private readonly fileStoreFactory: FileStoreFactory,
) {}
```

**Why a factory instead of reusing `IFileStore`.** M1's `IFileStore` is root-bound (`FsFileStore` is constructed with a single `rootDir`). IngestService writes inside a freshly created worktree whose path is only known at runtime, so it calls `fileStoreFactory(worktreeInfo.path)` to obtain a fresh `IFileStore` scoped to that worktree. Wiring code (MCP server / CLI) provides `(root) => new FsFileStore(root)`.

**Why `ISourceReader`.** `wiki_ingest` accepts "path or URL" as the source. `IFileStore` only reads from the wiki root, so we need a separate port that routes file paths to `FsSourceReader` and URLs to `HttpSourceReader` (both shipped in Task 7).

- [ ] **Step 1: Write failing tests (covers INV-4, INV-13)**

Mock all ports. Cover:
- `test_ingest_validSource_createsWikiPagesInWorktree` (INV-13)
- `test_ingest_sourceOver100K_throwsSourceParseError`
- `test_ingest_sourceMissing_throwsSourceNotFoundError`
- `test_ingest_llmFails_worktreeDiscarded_mainBranchUntouched` (INV-4) — verify `removeWorktree(path, true)` is called and no file is written through `mainFileStore`
- `test_ingest_success_pagesCommittedSquashedMerged_thenReindexed`
- `test_ingest_mergeConflict_worktreePreserved_returnsPath` — verify `removeWorktree` is NOT called
- `test_ingest_rerunSameSource_updatesExistingPage_noDuplicate`

- [ ] **Step 2: Implement IngestService**

Flow:
1. `source = sourceReader.read(req.source)` — throws `SourceNotFoundError` / `SourceParseError` on failure
2. Enforce size limit: reject if `source.bytes > MAX_SOURCE_BYTES` (maps to 100K tokens)
3. `worktree = versionControl.createWorktree('ingest')`
4. `const worktreeStore = fileStoreFactory(worktree.path)` — isolated writes
5. Call `llmClient.complete(...)` to extract structured pages; on error → `removeWorktree(worktree.path, true)` then rethrow as `LlmUnavailableError`
6. Write pages through `worktreeStore.writeFile(...)`
7. Update crossrefs (also through `worktreeStore`)
8. `versionControl.commitInWorktree(worktree.path, changedFiles, ':memo: [ingest] ...')`
9. `versionControl.squashWorktree(worktree.path, ':memo: [ingest] ...')`
10. Try `versionControl.mergeWorktree(worktree.path)` — on `GitConflictError`: return the error with the worktree path, do NOT remove the worktree
11. On success: for each changed file, read from `mainFileStore` and call `searchEngine.index(entry)`
12. `versionControl.removeWorktree(worktree.path)`

Note: steps 5–12 run in a try/catch/finally that guarantees either (a) discard worktree on processing error, (b) preserve worktree on merge conflict, (c) remove worktree on success.

- [ ] **Step 3: Run tests, verify pass**

Run: `pnpm vitest run packages/core/tests/services/ingest-service.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Update services index**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/ingest-service.ts packages/core/tests/services/ingest-service.test.ts packages/core/src/services/index.ts
git commit -m ":sparkles: [core] IngestService via worktree isolation (INV-4, INV-13)"
```

---

## Task 7: ISourceReader + IStateStore adapters

**Why this task:** `IngestService` (Task 6) needs to read a path-or-URL source, and `WikiStatusService` (Task 8) needs to read `.local/state.yaml` for `last_lint` / `last_ingest`. Neither responsibility fits inside `IFileStore` or `ConfigLoader`, so they ship as dedicated ports + adapters.

**Note:** `RecallService` is NOT modified in this milestone. The spec defines `wiki_recall` as pure file listing (`{ project, pages, unconsolidated_count, total_pages }` with no `index_health`, no `SearchEngine` call), and that contract is honored as-is. Index staleness handling belongs to `QueryService` (pre-search) and `WikiStatusService` (`index_health` field) — both introduced in this milestone.

**Files:**
- Create: `packages/infra/src/fs-source-reader.ts` (reads local files)
- Create: `packages/infra/src/http-source-reader.ts` (reads http/https URLs)
- Create: `packages/infra/src/composite-source-reader.ts` (dispatches by URI scheme)
- Create: `packages/infra/src/yaml-state-store.ts` (reads/writes `.local/state.yaml`)
- Test: `packages/infra/tests/fs-source-reader.test.ts`
- Test: `packages/infra/tests/composite-source-reader.test.ts`
- Test: `packages/infra/tests/yaml-state-store.test.ts`
- Modify: `packages/infra/src/index.ts`

- [ ] **Step 1: Write failing contract tests for FsSourceReader**

Cover:
- Reads a local markdown file and returns `{ uri, content, mimeType: 'text/markdown' }`
- Resolves relative paths against cwd
- Throws `SourceNotFoundError` when the file does not exist
- Respects the 100K-token size limit (reject oversized sources)

- [ ] **Step 2: Implement FsSourceReader via `node:fs/promises`**

- [ ] **Step 3: Write failing contract tests for HttpSourceReader**

Cover (use an in-process fetch stub — no real network):
- Fetches a URL and returns the response body
- Maps 404 to `SourceNotFoundError`, 5xx to `SourceParseError`
- Aborts downloads larger than the size limit

- [ ] **Step 4: Implement HttpSourceReader via global `fetch`**

- [ ] **Step 5: Write tests for CompositeSourceReader**

- `http://` / `https://` URIs go to `HttpSourceReader`
- Everything else goes to `FsSourceReader`
- Unknown scheme -> `SourceParseError`

- [ ] **Step 6: Implement CompositeSourceReader**

- [ ] **Step 7: Write failing contract tests for YamlStateStore**

Cover:
- `load()` returns default state when `.local/state.yaml` does not exist (no error)
- `save()` writes YAML and creates parent dirs
- `update(patch)` merges shallowly and persists, returning the new state
- Round-trip: `save(state)` then `load()` returns structurally equal state
- Concurrent `update()` calls do not drop writes (use a simple mutex)

- [ ] **Step 8: Implement YamlStateStore via `IFileStore` + `js-yaml`**

YamlStateStore is injected with an `IFileStore` so it reuses `FsFileStore` rather than owning its own filesystem handle.

- [ ] **Step 9: Update `packages/infra/src/index.ts` to export the new adapters**

- [ ] **Step 10: Run tests, verify pass**

Run: `pnpm vitest run packages/infra/tests/fs-source-reader.test.ts packages/infra/tests/composite-source-reader.test.ts packages/infra/tests/yaml-state-store.test.ts`
Expected: ALL PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/infra/src/fs-source-reader.ts packages/infra/src/http-source-reader.ts packages/infra/src/composite-source-reader.ts packages/infra/src/yaml-state-store.ts packages/infra/tests/ packages/infra/src/index.ts
git commit -m ":sparkles: [infra] FsSourceReader, HttpSourceReader, YamlStateStore adapters"
```

---

## Task 8: WikiStatusService

**Files:**
- Create: `packages/core/src/services/status-service.ts`
- Test: `packages/core/tests/services/status-service.test.ts`

**Dependencies (constructor-injected):**

```typescript
constructor(
  private readonly fileStore: IFileStore,
  private readonly verbatimStore: IVerbatimStore,
  private readonly searchEngine: ISearchEngine,
  private readonly stateStore: IStateStore,
) {}
```

`IStateStore` is the source of truth for `last_lint` and `last_ingest` — they come from `.local/state.yaml`, not from `ConfigLoader` (which only merges settings). `IngestService` and (future) `LintService` call `stateStore.update(...)` after successful operations; this service only reads.

- [ ] **Step 1: Write failing tests**

Mock all four ports. Cover:
- `test_status_emptyWiki_throwsWikiNotInitialized`
- `test_status_nonEmptyWiki_returnsTotalPagesAndProjects`
- `test_status_unconsolidatedCountPropagatedFromVerbatimStore`
- `test_status_indexHealth_returnsFromSearchEngine`
- `test_status_staleFiles_indexHealthReportsStale` — mock `searchEngine.health()` returning `'ok'` but simulate at least one file with `file.updated > searchEngine.lastIndexedAt(path)`, expect `'stale'`
- `test_status_lastLintAndLastIngest_fromStateStore` — pre-populate `IStateStore` with non-null timestamps, assert they appear in the response
- `test_status_freshState_lastLintAndLastIngestAreNull`

- [ ] **Step 2: Implement WikiStatusService**

```typescript
// packages/core/src/services/status-service.ts
// Orchestrates: IFileStore + IVerbatimStore + ISearchEngine + IStateStore
//
// Response: {
//   total_pages: number,
//   projects: string[],
//   unconsolidated: number,
//   last_lint: string | null,
//   last_ingest: string | null,
//   index_health: 'ok' | 'stale' | 'missing',
// }
```

Flow:
1. Enumerate `wiki/` and `projects/` via `fileStore.listFiles(...)`; throw `WikiNotInitializedError` if both are empty
2. Derive `projects` list from directory names under `projects/`
3. `unconsolidated = verbatimStore.countUnconsolidated()`
4. Determine `index_health`:
   - `searchEngine.health()` → if `'missing'`, return `'missing'`
   - Otherwise, for each file, if `file.updated > lastIndexedAt(file.path)`, mark stale
   - Return `'stale'` if any stale, else `'ok'`
5. `state = stateStore.load()` → extract `last_lint`, `last_ingest`

- [ ] **Step 3: Run tests, verify pass**

Run: `pnpm vitest run packages/core/tests/services/status-service.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Update services index**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/status-service.ts packages/core/tests/services/status-service.test.ts packages/core/src/services/index.ts
git commit -m ":sparkles: [core] WikiStatusService with index health and state store"
```

---

## Task 9: Integration tests — Query + Ingest E2E

**Files:**
- Create: `packages/infra/tests/integration/query-e2e.test.ts`
- Create: `packages/infra/tests/integration/ingest-e2e.test.ts`

- [ ] **Step 1: Write Query E2E test**

End-to-end wiring: real `FsFileStore`, real `RuVectorSearchEngine` backed by a temp `search.db`, stubbed `ILlmClient` (in-process fake — no real network).

- Create wiki pages on disk
- Index them via `RuVectorSearchEngine`
- Query and verify answer + citations
- Test scope cascade (INV-10)
- Test LLM failure fallback: inject an `ILlmClient` stub that throws; assert citations are still returned (INV-3)

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
| `WikiRuntimeState` domain type | Shape of `.local/state.yaml` (imports, last_lint, last_ingest) |
| New domain errors | `SearchEmptyError`, `LlmUnavailableError`, `GitConflictError`, `SourceNotFoundError`, `SourceParseError` |
| `ISearchEngine` port | Index, search, rebuild, health, lastIndexedAt |
| `ILlmClient` port | LLM completion interface |
| `IEmbeddingClient` port | Embedding generation interface |
| `ISourceReader` port | Read source by path or URL for ingest |
| `IStateStore` port | Load / save / update runtime state |
| `FileStoreFactory` type | Build `IFileStore` rooted at arbitrary dir (worktree writes) |
| `IVersionControl` (extended) | Worktree create / remove / squash / merge / commitInWorktree |
| `RuVectorSearchEngine` | Hybrid BM25+vector search adapter |
| `AiSdkLlmClient` | LLM via AI SDK |
| `AiSdkEmbeddingClient` | Embeddings via AI SDK |
| `GitVersionControl` | Git operations via simple-git |
| `FsSourceReader` / `HttpSourceReader` / `CompositeSourceReader` | Source ingestion adapters |
| `YamlStateStore` | `.local/state.yaml` persistence via `IFileStore` + `js-yaml` |
| `QueryService` | Semantic search + answer synthesis + pre-search staleness sync |
| `IngestService` | External source ingestion via worktree isolation |
| `WikiStatusService` | Operational diagnostics (total pages, projects, unconsolidated, index_health, last_lint, last_ingest) |
| Integration tests | Query E2E, Ingest E2E, index rebuild (INV-6) |

**Unchanged from M1:** `RecallService` stays a pure file listing as defined in the spec; no `SearchEngine` dependency is introduced. Any staleness handling needed for `wiki_query` lives inside `QueryService`.

**Invariants verified:** INV-3, INV-4, INV-6, INV-10, INV-13

**Deferred to Milestone 3:** `LintService`, `wiki_lint`, consolidation/promote/health pipeline, `IArchiver` adapter, INV-5, INV-9.

**Next milestone:** MCP Server + CLI + Claude Code integration (MCP transport, CLI commands, Claude Code hooks/skill)
