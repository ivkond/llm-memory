# Architecture

**Analysis Date:** 2026-04-10

## Pattern Overview

**Overall:** Clean / Hexagonal Architecture in a pnpm TypeScript monorepo.

**Key Characteristics:**
- Strict dependency direction: `Infrastructure -> Application (services) -> Domain`. The domain layer has zero runtime dependencies on infra; infra imports core exclusively via the `@llm-wiki/core` package entry point.
- Two workspaces: `packages/core` (domain + ports + services, pure logic) and `packages/infra` (adapters that implement the ports using Node APIs, git, filesystem, LLM SDKs, vector DB).
- Port/adapter seams are expressed as `I*` TypeScript interfaces under `packages/core/src/ports/`. Services depend only on these interfaces and are composed via constructor injection from wiring code.
- TypeScript project references enforce the layering at build time: `packages/infra/tsconfig.json` references `../core`, but not vice versa (see `packages/core/tsconfig.json` which has no `references`).
- ESM-first (`"type": "module"` in both package.json files), NodeNext resolution, explicit `.js` extensions on relative imports from `.ts` sources.

## Layers

**Domain (`packages/core/src/domain/`):**
- Purpose: Pure business concepts. Value objects, entity classes, typed errors, runtime-state DTOs. No I/O, no Node built-ins, no infra dependencies.
- Location: `packages/core/src/domain/`
- Contains: `WikiPage` (`wiki-page.ts`), `VerbatimEntry` (`verbatim-entry.ts`), `Project` (`project.ts`), `SanitizationResult` (`sanitization-result.ts`), `SearchResult` (`search-result.ts`), runtime-state types (`runtime-state.ts`), and the `WikiError` hierarchy (`errors.ts`).
- Depends on: Nothing outside the domain folder. `errors.ts` has zero imports; other domain files import only sibling domain modules.
- Used by: Services (application layer) and re-exported through `packages/core/src/index.ts` so infra adapters can consume domain types.

**Ports (`packages/core/src/ports/`):**
- Purpose: Inbound contract for every external capability a service needs - filesystem, search, LLM, embeddings, git, source reading, state persistence, project resolution, verbatim entry storage.
- Location: `packages/core/src/ports/`
- Contains: `IFileStore` + `FileStoreFactory` (`file-store.ts`), `IVerbatimStore` (`verbatim-store.ts`), `IProjectResolver` (`project-resolver.ts`), `IVersionControl` (`version-control.ts`), `ISearchEngine` + `IndexEntry` + `IndexHealth` (`search-engine.ts`), `ILlmClient` (`llm-client.ts`), `IEmbeddingClient` (`embedding-client.ts`), `ISourceReader` + `estimateTokens` helper (`source-reader.ts`), `IStateStore` (`state-store.ts`).
- Depends on: Domain only (e.g. `ISearchEngine` returns `SearchResult[]`, `IFileStore.readWikiPage` returns `WikiPageData`).
- Used by: Services via constructor-injected interfaces; implemented by infra adapters.

**Application / Services (`packages/core/src/services/`):**
- Purpose: Orchestrate ports to satisfy use cases (`wiki_ingest`, `wiki_query`, `wiki_remember`, `wiki_recall`, `wiki_status`, sanitization). Every service takes its collaborators as `readonly` constructor params; no service instantiates an adapter.
- Location: `packages/core/src/services/`
- Contains: `IngestService` (`ingest-service.ts`), `QueryService` (`query-service.ts`), `RememberService` (`remember-service.ts`), `RecallService` (`recall-service.ts`), `WikiStatusService` (`status-service.ts`), `SanitizationService` (`sanitization-service.ts`).
- Depends on: Domain types + port interfaces. Never imports from `@llm-wiki/infra`.
- Used by: Wiring code (future CLI / MCP server) - not yet present in this repo.

**Infrastructure (`packages/infra/src/`):**
- Purpose: Concrete adapters implementing each port with real I/O. Each adapter is a single class file named `<tech>-<port>.ts`.
- Location: `packages/infra/src/`
- Contains:
  - `FsFileStore` (`fs-file-store.ts`) - `IFileStore` over `node:fs/promises` with lexical + symlink-aware path-escape guards and `gray-matter` frontmatter parsing.
  - `FsVerbatimStore` (`fs-verbatim-store.ts`) - `IVerbatimStore` delegating writes through an `IFileStore`.
  - `GitProjectResolver` (`git-project-resolver.ts`) - `IProjectResolver` using `child_process` git + project `_config.md` frontmatter.
  - `GitVersionControl` (`git-version-control.ts`) - `IVersionControl` built on `simple-git`, manages `.worktrees/<name>-<ts>` isolated worktrees and translates `simple-git` conflict errors into `GitConflictError`.
  - `RuVectorSearchEngine` (`ruvector-search-engine.ts`) - `ISearchEngine` combining `minisearch` (BM25) and `ruvector` (vector DB) via Reciprocal Rank Fusion, persisting `bm25.json` + `vectors.db`.
  - `AiSdkLlmClient` (`ai-sdk-llm-client.ts`) and `AiSdkEmbeddingClient` (`ai-sdk-embedding-client.ts`) - LLM / embedding ports backed by the Vercel AI SDK and `@ai-sdk/openai`.
  - `FsSourceReader` (`fs-source-reader.ts`), `HttpSourceReader` (`http-source-reader.ts`), `CompositeSourceReader` (`composite-source-reader.ts`) - `ISourceReader` dispatching on URI scheme.
  - `YamlStateStore` (`yaml-state-store.ts`) - `IStateStore` persisted at `.local/state.yaml` via an injected `IFileStore` (reuses path-escape guards).
  - `ConfigLoader` (`config-loader.ts`) - loads `.config/settings.shared.yaml` + `.local/settings.local.yaml` + env overrides into `WikiConfig`.
- Depends on: `@llm-wiki/core` (via `"workspace:*"`) and third-party libs (`simple-git`, `gray-matter`, `js-yaml`, `minisearch`, `ruvector`, `ai`, `@ai-sdk/openai`, `msw` for tests).
- Used by: Future wiring layer (CLI / MCP server). Infra imports cross the workspace boundary only through the `@llm-wiki/core` package entry (`packages/core/src/index.ts`), never by deep paths.

**Wiring (composition root):**
- Not yet present. Services are instantiated inside tests (unit tests use hand-written fakes; integration tests under `packages/infra/tests/integration/` compose real adapters against a temp directory). Production wiring (CLI / MCP server) will be added in a later milestone; Milestone 3 on this branch adds Lint / Import / Archiver services that will be wired here.

## Data Flow

**`wiki_ingest` (see `IngestService.ingest()` at `packages/core/src/services/ingest-service.ts`):**

1. `ISourceReader.read(req.source)` fetches raw content + `estimatedTokens` (dispatched through `CompositeSourceReader` to `FsSourceReader` or `HttpSourceReader`).
2. Pre-worktree guard: if `estimatedTokens > 100_000` (`MAX_SOURCE_TOKENS`), throw `SourceParseError` before any git state is mutated.
3. `IVersionControl.createWorktree('ingest')` creates a branch `ingest-<ts>` in `.worktrees/ingest-<ts>` forked off `main`.
4. `FileStoreFactory(worktree.path)` builds a worktree-scoped `IFileStore` (`FsFileStore`) so writes never touch the main working copy.
5. `ILlmClient.complete()` extracts structured pages (`{path,title,content}[]`). Non-JSON or malformed responses become `LlmUnavailableError`; LLM-provided paths pass through `validateTargetPath` which requires `wiki/...md` or `projects/<name>/...md` and rejects backslashes, absolute paths, `..`, NUL bytes, or unsafe project names - defeats a hostile LLM writing into `package.json` or `.github/workflows/`.
6. For each extracted page, check `mainFileStore.exists(path)` to classify create vs update, then write the rendered frontmatter + body via `worktreeStore.writeFile()`.
7. `commitInWorktree` -> `squashWorktree` -> `mergeWorktree` (fast-forward into main). On `GitConflictError` the worktree is left on disk for manual recovery and `last_ingest` is not stamped.
8. Post-merge: re-index each touched file via `ISearchEngine.index()`, remove the worktree, then `IStateStore.update({ last_ingest: <iso> })`.

Error invariants (INV-4, INV-13): any failure before the merge force-removes the worktree; state is never stamped on failure; main branch is only touched by a successful fast-forward merge.

**`wiki_query` (see `QueryService.query()` at `packages/core/src/services/query-service.ts`):**

1. Resolve project name from `req.project` or `IProjectResolver.resolve(req.cwd)` (nullable).
2. Build scope cascade: explicit `req.scope` -> single entry; else `projects/<project>/` -> `wiki/` -> `''` (all); else `['']`.
3. Pre-search staleness sync: walk each scope's directory via `IFileStore.listFiles()`, compare `file.updated` against `ISearchEngine.lastIndexedAt(path)`, and re-index anything newer or never indexed. This centralizes search/file coupling here rather than scattering it through recall/status.
4. Walk the cascade; first scope returning hits wins. `SearchEmptyError` if all scopes return zero.
5. Cap at 20 citations; call `ILlmClient.complete()` with a numbered-context prompt.
6. INV-3 guarantee: any LLM failure still returns the raw citations with an empty `answer`. The call is wrapped in `try/catch` that never rethrows.

**Hybrid search (inside `RuVectorSearchEngine` at `packages/infra/src/ruvector-search-engine.ts`):**

1. `ISearchEngine.search({text, scope, maxResults})` runs a BM25 query through MiniSearch and a vector query through `ruvector` (after embedding `text` with the injected `IEmbeddingClient`).
2. Results are fused via Reciprocal Rank Fusion (`RRF_K = 60`) producing a single ranked list of `SearchResult` objects with `source: 'bm25' | 'vector' | 'hybrid'`.
3. Index state is persisted to `<searchDir>/bm25.json` (versioned JSON envelope with a `lastIndexedAt` map) and `<searchDir>/vectors.db` (ruvector file-backed DB). `health()` returns `'missing' | 'stale' | 'ok'` based on file presence and load success.

**`wiki_remember` (see `RememberService` at `packages/core/src/services/remember-service.ts`):**

1. `SanitizationService.sanitize(content)` applies RE2-compiled default + custom patterns; `redact` / `warn` / `block` modes via `SanitizationConfig`.
2. `VerbatimEntry.create({content, agent, sessionId, project, tags})` validates `agent` and `sessionId` against the slug regex (blocks `../` traversal into `log/<agent>/raw/`), generates a filename `<date>-<sessionId>-<id>.md`, and pins `consolidated=false`.
3. `IVerbatimStore.writeEntry(entry)` serializes frontmatter + body and writes through `IFileStore` at `log/<agent>/raw/<filename>.md`.
4. `rememberSession` deduplicates by scanning existing session files under `log/<agent>/raw/` and returning the stored file if a matching `session:` frontmatter value is found.

**`wiki_recall` (see `RecallService` at `packages/core/src/services/recall-service.ts`):**

1. Resolve project via `IProjectResolver.resolve(cwd)`.
2. Load page metadata from `projects/<project>` (if any) and `wiki/` via `IFileStore.listFiles()` + `readWikiPage()`, deterministically sorted by `updated` desc.
3. Allocate token budget (`max_tokens / 50`), split at `PROJECT_BUDGET_RATIO = 0.7`, with remainder rolling from project to wiki; wiki is guaranteed at least one slot when pages exist.
4. Ask `IVerbatimStore.countUnconsolidated()` for the unconsolidated count; return `{project, pages, unconsolidated_count, total_pages}`.

**`wiki_status` (see `WikiStatusService` at `packages/core/src/services/status-service.ts`):**

- Read-only: lists `wiki/` + `projects/` via `IFileStore`, derives unique project names from `projects/<name>/...` paths, asks `IVerbatimStore` for the unconsolidated count, combines `ISearchEngine.health()` with per-file staleness (upgrade `ok -> stale` when any file's `updated` is newer than its `lastIndexedAt`), and reads `last_lint` / `last_ingest` from `IStateStore`.

**State Management:**
- Persistent runtime state is flat YAML at `.local/state.yaml` (`YamlStateStore`), containing `{imports: Record<string, ImportState>, last_lint, last_ingest}`. Concurrent `update()` calls are serialized through a chained-promise mutex in `YamlStateStore`.
- Search index state (BM25 + vectors) lives under the search-engine's own directory passed at construction.
- Configuration is loaded once at startup by `ConfigLoader` (shared YAML + local YAML + env overrides).

## Key Abstractions

**Port interface (`I*` at `packages/core/src/ports/`):**
- Purpose: A single external capability exposed as the narrowest possible TypeScript interface. SOLID-ISP: all ports are small (2-6 methods).
- Examples: `packages/core/src/ports/file-store.ts`, `packages/core/src/ports/search-engine.ts`, `packages/core/src/ports/version-control.ts`.
- Pattern: Pure interfaces, no default implementation, no class inheritance; adapters `implements IFileStore` etc.

**Factory function for scoped adapters (`FileStoreFactory`):**
- Purpose: `IngestService` needs a file store scoped to a freshly-created worktree root. Rather than coupling the service to `FsFileStore`, `IFileStore` is paired with `FileStoreFactory = (rootDir: string) => IFileStore`. Wiring code passes `(root) => new FsFileStore(root)`.
- Location: `packages/core/src/ports/file-store.ts`
- Pattern: Factory-by-function (DIP); the service sees only a callable signature.

**Domain error hierarchy (`WikiError`):**
- Purpose: Every typed failure mode extends `WikiError(code, message)` so services can catch and classify without `instanceof`-ing each leaf.
- Location: `packages/core/src/domain/errors.ts`
- Pattern: Nominal error classes with a stable `code` string - consumed by `IngestService` to re-raise `WikiError` subclasses as-is and wrap everything else in `LlmUnavailableError`.

**Value-object construction (`WikiPage.fromParsedData`, `VerbatimEntry.create`):**
- Purpose: Private constructors plus static factory methods enforce invariants (`assertIdentifier` for agent/sessionId, default fallbacks for missing frontmatter).
- Location: `packages/core/src/domain/wiki-page.ts`, `packages/core/src/domain/verbatim-entry.ts`
- Pattern: DDD value objects; all public fields are `readonly`.

## Entry Points

No production CLI / server is wired yet on this branch. The effective entry points are:

**Package entry (`packages/core/src/index.ts`):**
- Re-exports `domain`, `ports`, `services` barrels. Infra and future wiring import exclusively through `@llm-wiki/core`.

**Package entry (`packages/infra/src/index.ts`):**
- Re-exports every adapter class plus `ConfigLoader` / `WikiConfig`.

**Test entry points:**
- `packages/core/tests/services/*.test.ts` drive services with in-memory fakes (example: `packages/core/tests/services/ingest-service.test.ts`).
- `packages/infra/tests/integration/*.test.ts` compose real adapters against temp directories to exercise end-to-end flows: `ingest-e2e.test.ts`, `query-e2e.test.ts`, `remember-recall.test.ts`, `search-rebuild.test.ts`.

**Future entry points (Milestone 3, current branch):**
- `LintService`, `ImportService`, `ArchiveService` will land under `packages/core/src/services/` and follow the same constructor-injection + worktree pattern as `IngestService`.

## Error Handling

**Strategy:** Typed `WikiError` subclasses thrown at the boundary where the invariant is detected; services either rethrow (for classification upstream) or wrap into `LlmUnavailableError` when the failure originates inside the LLM call.

**Patterns:**
- Fail fast before side effects: `IngestService` checks the token limit and validates LLM-provided paths *before* any filesystem write.
- Worktree isolation for transactional semantics: `IngestService` force-removes the worktree on any non-conflict failure so main is never partially mutated. `GitConflictError` intentionally leaves the worktree behind for manual recovery.
- Path-escape guards run at two levels: lexical (`FsFileStore.resolveSafePath`) and symlink-aware (`assertUnderRoot` via `realpath`) - defense in depth.
- Service-level graceful degradation: `QueryService` returns raw citations with an empty `answer` on any LLM failure (INV-3).

## Cross-Cutting Concerns

**Logging:** None in the domain/application layers - services return structured responses and let callers log. Infra adapters rely on thrown errors for observability.

**Validation:** Domain-level regex guards for user-provided identifiers (`IDENTIFIER_PATTERN` in `verbatim-entry.ts`, `PROJECT_NAME_RE` in `ingest-service.ts`) and path shape (`IngestService.validateTargetPath`).

**Sanitization:** `SanitizationService` with RE2-compiled patterns (user-supplied patterns *must* go through RE2 to block catastrophic backtracking); default patterns cover private keys, AWS keys, GitHub tokens, API keys, JWTs, connection strings.

**Authentication:** Not applicable - local tool, secrets for LLM / embeddings loaded through `ConfigLoader` env overrides (`LLM_WIKI_LLM_API_KEY`, `LLM_WIKI_EMBEDDING_API_KEY`).

**Configuration:** `ConfigLoader.load()` deep-merges `DEFAULTS` -> `.config/settings.shared.yaml` -> `.local/settings.local.yaml` -> env overrides and returns a typed `WikiConfig`.

---

*Architecture analysis: 2026-04-10*
