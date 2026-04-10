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
        http-source-reader.test.ts
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
  /** Size in bytes of the raw content (used for transport-layer bounds only). */
  bytes: number;
  /** Estimated token count of `content`. This is the field enforced by
   *  `wiki_ingest`'s 100K-token limit (spec: "Source max 100K tokens after
   *  extraction"). Adapters MUST populate it using a deterministic estimator —
   *  for MVP: `Math.ceil(content.length / 4)` (OpenAI-style ~4 chars/token).
   *  A real tokenizer can be swapped in later without changing this contract. */
  estimatedTokens: number;
}

export interface ISourceReader {
  /** Read a source by URI (local path or http(s):// URL).
   *  Throws SourceNotFoundError or SourceParseError on failure. */
  read(uri: string): Promise<SourceContent>;
}
```

A small pure helper lives alongside the port so every adapter and test uses
the same estimator:

```typescript
// packages/core/src/ports/source-reader.ts (same file)
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
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

**Dependencies (constructor-injected):**

```typescript
constructor(
  private readonly dbPath: string,
  private readonly embeddingClient: IEmbeddingClient,
) {}
```

**Why `IEmbeddingClient` lives here.** The spec defines hybrid search as `RuVector sparse (BM25) + RuVector dense (embeddings)` with embeddings coming from AI SDK (spec, Search Architecture section). `RuVector` owns sparse retrieval natively, but the dense half needs a vector per document. Instead of hard-coding AI SDK inside the search adapter, the adapter depends on `IEmbeddingClient` so:
- Task 2 can unit-test the engine with a trivial in-test fake (no AI SDK, no network)
- Task 3 wires the real `AiSdkEmbeddingClient` in at composition time
- Dense search is guaranteed to be covered end-to-end by Task 9's integration test

**`index(entry)` flow inside the adapter:**
1. `const [vector] = await embeddingClient.embed([entry.title + '\n' + entry.content])`
2. Upsert `{ path, title, content, vector }` into RuVector (RuVector stores both the BM25 term index and the dense vector against the same doc id)
3. Record `lastIndexedAt(path) = now()`

**`search(query)` flow inside the adapter:**
1. `const [qVector] = await embeddingClient.embed([query.text])`
2. Run RuVector hybrid search with BM25 over `query.text` and dense ANN over `qVector`
3. Apply RRF fusion (if RuVector does not already fuse), optional scope prefix filter
4. Return `SearchResult[]` sorted by fused score

**`rebuild(entries)`:** batch-embed in chunks (respect `IEmbeddingClient` rate limits), clear the DB, bulk-insert. INV-6 (delete `search.db`, rebuild, identical results) is covered by Task 9.

- [ ] **Step 1: Install RuVector**

```bash
pnpm --filter @llm-wiki/infra add ruvector
```

If install fails, BLOCK and escalate — do NOT work around it with a stub.

- [ ] **Step 2: Write failing contract tests for ISearchEngine**

Required scenarios (use a real `search.db` under a temp dir, clean it up in `afterEach`; inject a `FakeEmbeddingClient` that deterministically maps text → fixed-length vector so tests are repeatable and offline):

- `test_index_then_search_findsDocument`
- `test_search_noMatches_returnsEmptyArray`
- `test_remove_then_search_missing`
- `test_rebuild_fromEntries_recreatesIndex`
- `test_health_returnsMissingBeforeIndex_okAfter`
- `test_lastIndexedAt_returnsTimestamp`
- `test_hybrid_ranksMoreRelevantFirst` — two entries, one with a keyword match, one with semantic-only match; assert hybrid ordering
- `test_scope_filtersByPrefix`
- `test_index_callsEmbeddingClient_once` — spy on the fake embedder and assert it is invoked per `index()` call
- `test_search_callsEmbeddingClient_once_perQuery` — assert each `search()` embeds the query text exactly once

Run: `pnpm vitest run packages/infra/tests/ruvector-search-engine.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement RuVectorSearchEngine**

- Accept `dbPath` and `IEmbeddingClient` in the constructor (see flows above).
- Persist the RuVector index at `dbPath` (wiring code passes `.local/search.db` by default).
- `health()` returns `'missing'` when the DB file does not exist, `'ok'` otherwise. Staleness is reported by comparing `lastIndexedAt(path)` against file mtime in callers (QueryService / WikiStatusService) — the adapter itself does not own mtime checks.
- `remove(path)` deletes both sparse and dense entries for that path.
- Scope filter uses RuVector's metadata filter API (path prefix).

- [ ] **Step 4: Run tests, verify ALL PASS**

Run: `pnpm vitest run packages/infra/tests/ruvector-search-engine.test.ts`
Expected: ALL PASS.

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
- Modify: `packages/infra/src/index.ts`

**Test strategy:** pure unit tests against the AI SDK's official mocks. **No real network calls.** The `ai/test` module exports `MockLanguageModelV3` and `MockEmbeddingModelV3`, which implement the current v3 model specification (AI SDK 5.x). Tests construct a mock, pass it into the adapter's constructor via the same dependency-injection point used in production, and assert on the returned shape. **Mock `doGenerate` / `doEmbed` return shapes follow the v3 spec** (`content: [{ type: 'text', text }]`, `finishReason: { unified: 'stop', raw: undefined }`, nested `usage.inputTokens` / `usage.outputTokens` objects). The surface that `generateText()` / `embedMany()` expose to the adapter is `result.text`, `result.usage.inputTokens` (plain number), `result.usage.outputTokens` (plain number), `result.usage.totalTokens` (plain number) — these are what the production code reads.

- [ ] **Step 1: Install AI SDK (pin to v5.x for v3 model spec)**

```bash
pnpm --filter @llm-wiki/infra add ai@^5 @ai-sdk/openai@^1
```

If the install fails for an offline environment, BLOCK and escalate — Task 3 cannot ship without the real SDK.

- [ ] **Step 2: Write failing contract tests for AiSdkLlmClient**

```typescript
// packages/infra/tests/ai-sdk-llm-client.test.ts
import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { AiSdkLlmClient } from '../src/ai-sdk-llm-client.js';
import { LlmUnavailableError } from '@llm-wiki/core';

// Helper: build a v3 mock doGenerate result with a single text content block.
function ok(text: string, input = 10, output = 20) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: output, text: output, reasoning: undefined },
    },
    warnings: [],
  };
}

describe('AiSdkLlmClient', () => {
  it('test_complete_returnsContentAndUsage', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ok('Hello world', 12, 34),
    });
    const client = new AiSdkLlmClient(model);

    const response = await client.complete({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(response.content).toBe('Hello world');
    expect(response.usage.inputTokens).toBe(12);
    expect(response.usage.outputTokens).toBe(34);
  });

  it('test_complete_providerThrows_wrappedAsLlmUnavailable', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => { throw new Error('boom'); },
    });
    const client = new AiSdkLlmClient(model);

    await expect(
      client.complete({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it('test_complete_passesSystemAndTemperature', async () => {
    let captured: unknown;
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        captured = options;
        return ok('ok', 1, 1);
      },
    });
    const client = new AiSdkLlmClient(model);

    await client.complete({
      system: 'you are a wiki',
      messages: [{ role: 'user', content: 'x' }],
      temperature: 0.1,
    });

    expect(captured).toBeDefined();
  });
});
```

Run: `pnpm vitest run packages/infra/tests/ai-sdk-llm-client.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement AiSdkLlmClient**

```typescript
// packages/infra/src/ai-sdk-llm-client.ts
import { generateText, type LanguageModel } from 'ai';
import type { ILlmClient, LlmCompletionRequest, LlmCompletionResponse } from '@llm-wiki/core';
import { LlmUnavailableError } from '@llm-wiki/core';

export class AiSdkLlmClient implements ILlmClient {
  constructor(private readonly model: LanguageModel) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    try {
      const result = await generateText({
        model: this.model,
        system: request.system,
        messages: request.messages,
        // AI SDK 5.x: the caller-facing option is named `maxOutputTokens`.
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
      });
      // AI SDK 5.x surfaces usage as plain numbers: inputTokens, outputTokens, totalTokens.
      return {
        content: result.text,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        },
      };
    } catch (err) {
      throw new LlmUnavailableError((err as Error).message);
    }
  }
}
```

- [ ] **Step 4: Write failing contract tests for AiSdkEmbeddingClient**

```typescript
// packages/infra/tests/ai-sdk-embedding-client.test.ts
import { describe, it, expect } from 'vitest';
import { MockEmbeddingModelV3 } from 'ai/test';
import { AiSdkEmbeddingClient } from '../src/ai-sdk-embedding-client.js';

describe('AiSdkEmbeddingClient', () => {
  const stubVector = Array.from({ length: 8 }, (_, i) => i / 10);

  it('test_embed_returnsVectorsOfCorrectDimensionality', async () => {
    const model = new MockEmbeddingModelV3({
      doEmbed: async ({ values }) => ({
        embeddings: values.map(() => stubVector),
      }),
    });
    const client = new AiSdkEmbeddingClient(model, stubVector.length);

    const vectors = await client.embed(['one', 'two', 'three']);

    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toHaveLength(stubVector.length);
    expect(client.dimensions()).toBe(stubVector.length);
  });

  it('test_embed_emptyBatch_returnsEmpty', async () => {
    const model = new MockEmbeddingModelV3({
      doEmbed: async () => ({ embeddings: [] }),
    });
    const client = new AiSdkEmbeddingClient(model, 8);

    expect(await client.embed([])).toEqual([]);
  });

  it('test_embed_providerThrows_propagatesError', async () => {
    const model = new MockEmbeddingModelV3({
      doEmbed: async () => { throw new Error('rate limit'); },
    });
    const client = new AiSdkEmbeddingClient(model, 8);

    await expect(client.embed(['x'])).rejects.toThrow('rate limit');
  });
});
```

Run: `pnpm vitest run packages/infra/tests/ai-sdk-embedding-client.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implement AiSdkEmbeddingClient**

```typescript
// packages/infra/src/ai-sdk-embedding-client.ts
import { embedMany, type EmbeddingModel } from 'ai';
import type { IEmbeddingClient } from '@llm-wiki/core';

export class AiSdkEmbeddingClient implements IEmbeddingClient {
  constructor(
    private readonly model: EmbeddingModel<string>,
    private readonly dims: number,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const result = await embedMany({ model: this.model, values: texts });
    return result.embeddings;
  }

  dimensions(): number {
    return this.dims;
  }
}
```

- [ ] **Step 6: Run tests, verify ALL PASS**

Run: `pnpm vitest run packages/infra/tests/ai-sdk-llm-client.test.ts packages/infra/tests/ai-sdk-embedding-client.test.ts`
Expected: ALL PASS.

- [ ] **Step 7: Update `packages/infra/src/index.ts` to export both clients**

- [ ] **Step 8: Commit**

```bash
git add packages/infra/src/ai-sdk-llm-client.ts packages/infra/src/ai-sdk-embedding-client.ts packages/infra/tests/ai-sdk-llm-client.test.ts packages/infra/tests/ai-sdk-embedding-client.test.ts packages/infra/src/index.ts packages/infra/package.json pnpm-lock.yaml
git commit -m ":sparkles: [infra] AiSdkLlmClient and AiSdkEmbeddingClient adapters"
```

---

## Task 4: GitVersionControl adapter (worktree support)

**Files:**
- Create: `packages/infra/src/git-version-control.ts`
- Test: `packages/infra/tests/git-version-control.test.ts`
- Modify: `packages/infra/src/index.ts`

**Test strategy:** real git repos in `mkdtemp` directories, cleaned up in `afterEach`. Initial commit is seeded in `beforeEach` so `HEAD` always exists. No network. `simple-git` is driven through the production code path — no mocks.

- [ ] **Step 1: Install simple-git if not already present**

```bash
pnpm --filter @llm-wiki/infra add simple-git
```

- [ ] **Step 2: Write failing contract tests**

```typescript
// packages/infra/tests/git-version-control.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { GitVersionControl } from '../src/git-version-control.js';
import { GitConflictError } from '@llm-wiki/core';

describe('GitVersionControl', () => {
  let repo: string;
  let vcs: GitVersionControl;

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'llm-wiki-git-'));
    execSync('git init -q -b main', { cwd: repo });
    execSync('git config user.email test@example.com', { cwd: repo });
    execSync('git config user.name Test', { cwd: repo });
    await writeFile(path.join(repo, 'README.md'), '# Seed\n');
    execSync('git add README.md && git commit -q -m seed', { cwd: repo });
    vcs = new GitVersionControl(repo);
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('test_commit_createsCommitWithMessage', async () => {
    await writeFile(path.join(repo, 'a.md'), 'a');
    const sha = await vcs.commit(['a.md'], ':memo: add a');
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    const log = execSync('git log -1 --pretty=%s', { cwd: repo, encoding: 'utf-8' }).trim();
    expect(log).toBe(':memo: add a');
  });

  it('test_hasUncommittedChanges_detectsWorkingTreeChanges', async () => {
    expect(await vcs.hasUncommittedChanges()).toBe(false);
    await writeFile(path.join(repo, 'dirty.md'), 'x');
    expect(await vcs.hasUncommittedChanges()).toBe(true);
  });

  it('test_createWorktree_returnsInfoAndDirectoryExists', async () => {
    const info = await vcs.createWorktree('ingest');
    expect(info.path).toContain('.worktrees/ingest-');
    expect(info.branch).toMatch(/ingest-/);
    // The worktree directory must be a real checkout of main
    execSync('git status', { cwd: info.path });
    await vcs.removeWorktree(info.path);
  });

  it('test_commitInWorktree_createsCommitIsolatedFromMain', async () => {
    const info = await vcs.createWorktree('ingest');
    await writeFile(path.join(info.path, 'isolated.md'), 'x');
    const sha = await vcs.commitInWorktree(info.path, ['isolated.md'], ':memo: isolated');
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    // Main branch working tree must be untouched
    expect(await vcs.hasUncommittedChanges()).toBe(false);
    const mainLog = execSync('git log main --pretty=%s', { cwd: repo, encoding: 'utf-8' });
    expect(mainLog).not.toContain('isolated');
    await vcs.removeWorktree(info.path);
  });

  it('test_squashWorktree_collapsesMultipleCommitsIntoOne', async () => {
    const info = await vcs.createWorktree('ingest');
    await writeFile(path.join(info.path, '1.md'), '1');
    await vcs.commitInWorktree(info.path, ['1.md'], 'first');
    await writeFile(path.join(info.path, '2.md'), '2');
    await vcs.commitInWorktree(info.path, ['2.md'], 'second');

    await vcs.squashWorktree(info.path, ':memo: squashed');
    const log = execSync(`git log ${info.branch} --pretty=%s`, { cwd: repo, encoding: 'utf-8' })
      .trim()
      .split('\n');
    // Only squashed commit + the seed commit from main
    expect(log[0]).toBe(':memo: squashed');
    await vcs.removeWorktree(info.path);
  });

  it('test_mergeWorktree_fastForwardMergesToMain', async () => {
    const info = await vcs.createWorktree('ingest');
    await writeFile(path.join(info.path, 'merged.md'), 'x');
    await vcs.commitInWorktree(info.path, ['merged.md'], ':memo: merged');
    const sha = await vcs.mergeWorktree(info.path);
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    // File now present on main
    const mainLog = execSync('git log main --pretty=%s', { cwd: repo, encoding: 'utf-8' });
    expect(mainLog).toContain(':memo: merged');
    await vcs.removeWorktree(info.path);
  });

  it('test_mergeWorktree_conflict_throwsGitConflictError_preservesWorktree', async () => {
    // Mutate main and worktree to the same file → conflict on merge
    await writeFile(path.join(repo, 'conflict.md'), 'main-version');
    await vcs.commit(['conflict.md'], 'main change');

    const info = await vcs.createWorktree('ingest');
    await writeFile(path.join(info.path, 'conflict.md'), 'worktree-version');
    await vcs.commitInWorktree(info.path, ['conflict.md'], 'worktree change');

    await expect(vcs.mergeWorktree(info.path)).rejects.toBeInstanceOf(GitConflictError);
    // Worktree preserved for manual recovery
    execSync('git status', { cwd: info.path });
    await vcs.removeWorktree(info.path, true);
  });

  it('test_removeWorktree_cleansUpDirectory', async () => {
    const info = await vcs.createWorktree('ingest');
    await vcs.removeWorktree(info.path);
    expect(() => execSync('git status', { cwd: info.path })).toThrow();
  });
});
```

Run: `pnpm vitest run packages/infra/tests/git-version-control.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement GitVersionControl via simple-git**

```typescript
// packages/infra/src/git-version-control.ts
// Wraps simple-git. Worktrees created at .worktrees/{name}-{timestamp}.
// On merge conflict, catches simple-git's MergeConflictError and throws
// GitConflictError from @llm-wiki/core instead. The worktree is NOT removed
// on conflict — IngestService/LintService decide whether to preserve it.
```

Required methods (match the IVersionControl contract from Task 1): `commit`, `hasUncommittedChanges`, `createWorktree`, `removeWorktree`, `squashWorktree`, `mergeWorktree`, `commitInWorktree`.

- [ ] **Step 4: Run tests, verify ALL PASS**

Run: `pnpm vitest run packages/infra/tests/git-version-control.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Update `packages/infra/src/index.ts` to export `GitVersionControl`**

- [ ] **Step 6: Commit**

```bash
git add packages/infra/src/git-version-control.ts packages/infra/tests/git-version-control.test.ts packages/infra/src/index.ts packages/infra/package.json pnpm-lock.yaml
git commit -m ":sparkles: [infra] GitVersionControl adapter with worktree support"
```

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
3. `searchEngine.search({ text: req.question, scope, maxResults })` → `SearchResult[]`
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
  private readonly stateStore: IStateStore,
) {}
```

**Why a factory instead of reusing `IFileStore`.** M1's `IFileStore` is root-bound (`FsFileStore` is constructed with a single `rootDir`). IngestService writes inside a freshly created worktree whose path is only known at runtime, so it calls `fileStoreFactory(worktreeInfo.path)` to obtain a fresh `IFileStore` scoped to that worktree. Wiring code (MCP server / CLI) provides `(root) => new FsFileStore(root)`.

**Why `IStateStore`.** Task 8 (`WikiStatusService`) treats `IStateStore` as the source of truth for `last_ingest`. That field is only meaningful if the write path updates it on every successful ingest — so the port is injected here and written from this service.

**Why `ISourceReader`.** `wiki_ingest` accepts "path or URL" as the source. `IFileStore` only reads from the wiki root, so we need a separate port that routes file paths to `FsSourceReader` and URLs to `HttpSourceReader` (both shipped in Task 7).

- [ ] **Step 1: Write failing tests (covers INV-4, INV-13)**

Mock all ports. Cover:
- `test_ingest_validSource_createsWikiPagesInWorktree` (INV-13)
- `test_ingest_sourceOverTokenLimit_throwsSourceParseError` — build a `SourceContent` with `estimatedTokens = 100_001`, assert `SourceParseError` and that no worktree is created
- `test_ingest_sourceMissing_throwsSourceNotFoundError`
- `test_ingest_llmFails_worktreeDiscarded_mainBranchUntouched_stateUnchanged` (INV-4) — verify `removeWorktree(path, true)` is called, no `mainFileStore.writeFile`, and `stateStore.update` is NOT called
- `test_ingest_success_pagesCommittedSquashedMerged_thenReindexed_stateUpdated` — assert final `stateStore.update({ last_ingest: <iso timestamp> })` is called exactly once after a successful merge
- `test_ingest_mergeConflict_worktreePreserved_returnsPath_stateUnchanged` — `removeWorktree` is NOT called and `stateStore.update` is NOT called
- `test_ingest_rerunSameSource_updatesExistingPage_noDuplicate`

- [ ] **Step 2: Implement IngestService**

Flow:
1. `source = sourceReader.read(req.source)` — throws `SourceNotFoundError` / `SourceParseError` on failure
2. Enforce the spec limit in tokens: reject with `SourceParseError` if `source.estimatedTokens > MAX_SOURCE_TOKENS` (`MAX_SOURCE_TOKENS = 100_000`). The `estimatedTokens` field is populated by the `ISourceReader` adapter via the shared `estimateTokens()` helper, keeping the public `wiki_ingest` contract in tokens and out of bytes.
3. `worktree = versionControl.createWorktree('ingest')`
4. `const worktreeStore = fileStoreFactory(worktree.path)` — isolated writes
5. Call `llmClient.complete(...)` to extract structured pages; on error → `removeWorktree(worktree.path, true)` then rethrow as `LlmUnavailableError`
6. Write pages through `worktreeStore.writeFile(...)`
7. Update crossrefs (also through `worktreeStore`)
8. `versionControl.commitInWorktree(worktree.path, changedFiles, ':memo: [ingest] ...')`
9. `versionControl.squashWorktree(worktree.path, ':memo: [ingest] ...')`
10. Try `versionControl.mergeWorktree(worktree.path)` — on `GitConflictError`: return the error with the worktree path, do NOT remove the worktree, do NOT update state
11. On successful merge: for each changed file, read from `mainFileStore` and call `searchEngine.index(entry)`
12. `versionControl.removeWorktree(worktree.path)`
13. `await stateStore.update({ last_ingest: new Date().toISOString() })` — only on the success path; never on LLM failure or merge conflict

Note: steps 5–13 run in a try/catch/finally that guarantees either (a) discard worktree on processing error (no state write), (b) preserve worktree on merge conflict (no state write), (c) remove worktree and update `last_ingest` on success.

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
- Test: `packages/infra/tests/http-source-reader.test.ts`
- Test: `packages/infra/tests/composite-source-reader.test.ts`
- Test: `packages/infra/tests/yaml-state-store.test.ts`
- Modify: `packages/infra/src/index.ts`

**Reader contract for sizing:** adapters do NOT enforce the 100K-token limit themselves — that is `IngestService`'s job. The readers MUST populate `bytes` AND `estimatedTokens` using the shared `estimateTokens()` helper from Task 1 so that a single place (`IngestService`) owns the public `wiki_ingest` bound.

- [ ] **Step 1: Write failing contract tests for FsSourceReader**

Cover:
- Reads a local markdown file and returns `{ uri, content, mimeType: 'text/markdown', bytes, estimatedTokens }`
- `estimatedTokens` equals `estimateTokens(content)` (use the helper directly in the assertion)
- Resolves relative paths against cwd
- Throws `SourceNotFoundError` when the file does not exist

- [ ] **Step 2: Implement FsSourceReader via `node:fs/promises`**

- [ ] **Step 3: Write failing contract tests for HttpSourceReader**

Cover (use an in-process fetch stub — no real network):
- Fetches a URL and returns the response body with populated `bytes` and `estimatedTokens`
- Maps 404 to `SourceNotFoundError`, 5xx to `SourceParseError`

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

Run: `pnpm vitest run packages/infra/tests/fs-source-reader.test.ts packages/infra/tests/http-source-reader.test.ts packages/infra/tests/composite-source-reader.test.ts packages/infra/tests/yaml-state-store.test.ts`
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

## Task 9: Integration tests — Query + Ingest E2E + Search Rebuild

**Files:**
- Create: `packages/infra/tests/integration/query-e2e.test.ts`
- Create: `packages/infra/tests/integration/ingest-e2e.test.ts`
- Create: `packages/infra/tests/integration/search-rebuild.test.ts`

**Wiring in these tests.** Everything goes through real adapters EXCEPT the LLM / embedding provider. Specifically:
- Real `FsFileStore` on a `mkdtemp` directory
- Real `RuVectorSearchEngine` backed by a temp `search.db` under the same directory
- Real `GitVersionControl` on a `git init` repo
- Real `FsVerbatimStore`, `GitProjectResolver`, `YamlStateStore`
- Real `FsSourceReader` for ingest input
- `AiSdkLlmClient` / `AiSdkEmbeddingClient` constructed with AI SDK **mock models** (`MockLanguageModelV3` / `MockEmbeddingModelV3` from `ai/test`, v3 model spec) — deterministic, offline, reproducible

`beforeEach` creates the temp dir + initial git commit; `afterEach` removes the directory.

- [ ] **Step 1: Write Query E2E test**

```typescript
// packages/infra/tests/integration/query-e2e.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MockLanguageModelV3, MockEmbeddingModelV3 } from 'ai/test';
import {
  FsFileStore, FsVerbatimStore, GitProjectResolver,
  RuVectorSearchEngine, AiSdkLlmClient, AiSdkEmbeddingClient,
} from '@llm-wiki/infra';
import { QueryService } from '@llm-wiki/core';

// v3 mock doGenerate helper — see Task 3 for the full shape.
function okGen(text: string, input = 10, output = 5) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: output, text: output, reasoning: undefined },
    },
    warnings: [],
  };
}

describe('Query E2E', () => {
  let dir: string;
  let service: QueryService;
  let throwingService: QueryService;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-e2e-'));
    const fs = new FsFileStore(dir);
    await fs.writeFile('wiki/patterns/testing.md',
      '---\ntitle: Testing\nupdated: 2026-04-09\nsources: []\nsupersedes: null\ntags: []\nconfidence: 0.9\ncreated: 2026-04-09\n---\n## Summary\nUse testcontainers for integration tests.\n');
    await fs.writeFile('projects/cli-relay/architecture.md',
      '---\ntitle: Architecture\nupdated: 2026-04-09\nsources: []\nsupersedes: null\ntags: []\nconfidence: 0.9\ncreated: 2026-04-09\n---\n## Summary\nClean Architecture with ports/adapters.\n');

    const stubVec = Array.from({ length: 8 }, (_, i) => i / 10);
    const embedModel = new MockEmbeddingModelV3({
      doEmbed: async ({ values }) => ({ embeddings: values.map(() => stubVec) }),
    });
    const embeddings = new AiSdkEmbeddingClient(embedModel, stubVec.length);

    const search = new RuVectorSearchEngine(path.join(dir, '.local/search.db'), embeddings);
    await search.index({ path: 'wiki/patterns/testing.md', title: 'Testing',
      content: 'Use testcontainers for integration tests.', updated: '2026-04-09' });
    await search.index({ path: 'projects/cli-relay/architecture.md', title: 'Architecture',
      content: 'Clean Architecture with ports/adapters.', updated: '2026-04-09' });

    const llmModel = new MockLanguageModelV3({
      doGenerate: async () => okGen('Use testcontainers.', 10, 5),
    });
    const llm = new AiSdkLlmClient(llmModel);
    const resolver = new GitProjectResolver(fs);

    service = new QueryService(search, llm, resolver, fs);

    const throwingLlm = new AiSdkLlmClient(new MockLanguageModelV3({
      doGenerate: async () => { throw new Error('LLM DOWN'); },
    }));
    throwingService = new QueryService(search, throwingLlm, resolver, fs);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('test_query_returnsAnswerAndCitations', async () => {
    const result = await service.query({ question: 'how to test' });
    expect(result.answer).toContain('testcontainers');
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].page).toContain('testing.md');
  });

  it('test_query_scopeCascade_projectFirstThenWiki (INV-10)', async () => {
    const result = await service.query({ question: 'architecture', project: 'cli-relay' });
    expect(result.citations[0].page).toContain('projects/cli-relay');
  });

  it('test_query_llmDown_stillReturnsCitations (INV-3)', async () => {
    const result = await throwingService.query({ question: 'how to test' });
    expect(result.citations.length).toBeGreaterThan(0);
  });
});
```

Run: `pnpm vitest run packages/infra/tests/integration/query-e2e.test.ts`
Expected: ALL PASS.

- [ ] **Step 2: Write Ingest E2E test**

```typescript
// packages/infra/tests/integration/ingest-e2e.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { MockLanguageModelV3, MockEmbeddingModelV3 } from 'ai/test';
import {
  FsFileStore, RuVectorSearchEngine, AiSdkLlmClient, AiSdkEmbeddingClient,
  GitVersionControl, FsSourceReader, YamlStateStore,
} from '@llm-wiki/infra';
import { IngestService } from '@llm-wiki/core';

// v3 mock doGenerate helper.
function okGen(text: string, input = 10, output = 20) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: output, text: output, reasoning: undefined },
    },
    warnings: [],
  };
}

describe('Ingest E2E', () => {
  let wiki: string;
  let sourceFile: string;

  beforeEach(async () => {
    wiki = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-e2e-'));
    execSync('git init -q -b main', { cwd: wiki });
    execSync('git config user.email t@e.com && git config user.name T', { cwd: wiki });
    await writeFile(path.join(wiki, 'README.md'), '# seed');
    execSync('git add README.md && git commit -q -m seed', { cwd: wiki });

    const sourceDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-src-'));
    sourceFile = path.join(sourceDir, 'article.md');
    await writeFile(sourceFile, '# PostgreSQL\n\nUse MaxConns <= max_connections/3.\n');
  });

  afterEach(async () => {
    await rm(wiki, { recursive: true, force: true });
  });

  function makeService(llmThrows: boolean) {
    const fs = new FsFileStore(wiki);
    const stubVec = Array.from({ length: 8 }, (_, i) => i / 10);
    const embeddings = new AiSdkEmbeddingClient(
      new MockEmbeddingModelV3({
        doEmbed: async ({ values }) => ({ embeddings: values.map(() => stubVec) }),
      }),
      stubVec.length,
    );
    const search = new RuVectorSearchEngine(path.join(wiki, '.local/search.db'), embeddings);
    const llm = new AiSdkLlmClient(new MockLanguageModelV3({
      doGenerate: async () => {
        if (llmThrows) throw new Error('DOWN');
        return okGen(
          JSON.stringify([{
            path: 'wiki/tools/postgresql.md',
            title: 'PostgreSQL',
            content: '## Summary\nMaxConns rule.',
          }]),
          10,
          20,
        );
      },
    }));
    const vcs = new GitVersionControl(wiki);
    const stateStore = new YamlStateStore(fs);
    const sourceReader = new FsSourceReader();
    return new IngestService(
      sourceReader, llm, search, vcs, fs, (root) => new FsFileStore(root), stateStore,
    );
  }

  it('test_ingest_success_pagesCreated_worktreeCleaned_stateUpdated (INV-13)', async () => {
    const svc = makeService(false);
    const result = await svc.ingest({ source: sourceFile });

    expect(result.pages_created.length).toBeGreaterThan(0);
    const created = await new FsFileStore(wiki).readFile(result.pages_created[0]);
    expect(created).toContain('PostgreSQL');

    // Worktree removed
    expect(execSync('git worktree list', { cwd: wiki, encoding: 'utf-8' }))
      .not.toContain('.worktrees/ingest-');

    // State updated
    const state = await new YamlStateStore(new FsFileStore(wiki)).load();
    expect(state.last_ingest).not.toBeNull();
  });

  it('test_ingest_llmFails_mainBranchUntouched_stateUnchanged (INV-4)', async () => {
    const svc = makeService(true);
    await expect(svc.ingest({ source: sourceFile })).rejects.toThrow();

    // Main branch tree is still just the seed
    const status = execSync('git status --porcelain', { cwd: wiki, encoding: 'utf-8' });
    expect(status.trim()).toBe('');

    // No last_ingest recorded
    const state = await new YamlStateStore(new FsFileStore(wiki)).load();
    expect(state.last_ingest).toBeNull();

    // Worktree discarded
    expect(execSync('git worktree list', { cwd: wiki, encoding: 'utf-8' }))
      .not.toContain('.worktrees/ingest-');
  });
});
```

Run: `pnpm vitest run packages/infra/tests/integration/ingest-e2e.test.ts`
Expected: ALL PASS.

- [ ] **Step 3: Write search rebuild test (INV-6)**

```typescript
// packages/infra/tests/integration/search-rebuild.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MockEmbeddingModelV3 } from 'ai/test';
import { RuVectorSearchEngine, AiSdkEmbeddingClient } from '@llm-wiki/infra';

describe('search.db rebuild (INV-6)', () => {
  let dir: string;
  const stubVec = Array.from({ length: 8 }, (_, i) => i / 10);

  beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-rebuild-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  function engine() {
    const embeddings = new AiSdkEmbeddingClient(
      new MockEmbeddingModelV3({
        doEmbed: async ({ values }) => ({ embeddings: values.map(() => stubVec) }),
      }),
      stubVec.length,
    );
    return new RuVectorSearchEngine(path.join(dir, '.local/search.db'), embeddings);
  }

  it('test_deleteAndRebuild_returnsIdenticalResults', async () => {
    const entries = [
      { path: 'wiki/a.md', title: 'A', content: 'apple banana', updated: '2026-04-09' },
      { path: 'wiki/b.md', title: 'B', content: 'apple cherry', updated: '2026-04-09' },
    ];

    const first = engine();
    for (const e of entries) await first.index(e);
    const before = await first.search({ text: 'apple' });

    // Delete search.db entirely
    await rm(path.join(dir, '.local/search.db'), { recursive: true, force: true });

    const second = engine();
    await second.rebuild(entries);
    const after = await second.search({ text: 'apple' });

    expect(after.map(r => r.path)).toEqual(before.map(r => r.path));
  });
});
```

Run: `pnpm vitest run packages/infra/tests/integration/search-rebuild.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Run full test suite**

Run: `pnpm lint && pnpm vitest run`
Expected: ALL PASS across all packages.

- [ ] **Step 5: Commit**

```bash
git add packages/infra/tests/integration/
git commit -m ":white_check_mark: [test] Query + Ingest E2E + search.db rebuild (INV-3, INV-4, INV-6, INV-10, INV-13)"
```

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
| `IngestService` | External source ingestion via worktree isolation; writes `last_ingest` to `IStateStore` on success |
| `WikiStatusService` | Operational diagnostics (total pages, projects, unconsolidated, index_health, last_lint, last_ingest) |
| Integration tests | Query E2E, Ingest E2E, index rebuild (INV-6) |

**Unchanged from M1:** `RecallService` stays a pure file listing as defined in the spec; no `SearchEngine` dependency is introduced. Any staleness handling needed for `wiki_query` lives inside `QueryService`.

**Invariants verified:** INV-3, INV-4, INV-6, INV-10, INV-13

**Deferred to Milestone 3:** `LintService`, `wiki_lint`, consolidation/promote/health pipeline, `IArchiver` adapter, INV-5, INV-9.

**Next milestone:** MCP Server + CLI + Claude Code integration (MCP transport, CLI commands, Claude Code hooks/skill)
