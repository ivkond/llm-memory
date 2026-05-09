# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
pnpm i
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Architecture Overview

_Add a brief overview of your project architecture_

## Conventions & Patterns

_Add your project-specific conventions here_

<!-- GSD:project-start source:PROJECT.md -->
## Project

**LLM Wiki**

A personal knowledge base for AI agents implementing Andrej Karpathy's LLM Wiki pattern. Markdown files in git are the single source of truth; LLM handles structuring, cross-referencing, promoting, and deduplication. Primary consumer is Claude Code via MCP, with developer access through CLI and Obsidian.

**Core Value:** Every fact an AI agent learns persists, consolidates, and becomes retrievable across sessions — without manual bookkeeping.

### Constraints

- **Tech stack**: TypeScript, pnpm monorepo, ESM-only, Node 20+ — established, no changes
- **Architecture**: Clean Architecture with ports/adapters — must maintain strict layering
- **Transport packages**: `@llm-wiki/mcp-server`, `@llm-wiki/cli`, `@llm-wiki/claude-code` are thin wrappers over core services — no business logic in transport
- **MCP SDK**: `@modelcontextprotocol/sdk` — reference implementation
- **Solo use**: Target is local workstation, no server deployment
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript `^5.8.0` (resolved `5.9.3`) — all source under `packages/core/src/` and `packages/infra/src/`. Strict mode, ES2022 target, NodeNext module resolution, `verbatimModuleSyntax` enforced (see `tsconfig.base.json`).
- None. The repo is pure TypeScript. Config files (`pnpm-workspace.yaml`, `vitest.workspace.ts`, `tsconfig.*.json`) are YAML / TS / JSON only.
## Runtime
- Node.js `>=20` — declared in root `package.json` `engines` field. `@types/node` dev dep pinned to `^22.0.0` (resolved `22.19.17`), so development and typings target the Node 22 API surface while allowing Node 20 at runtime.
- ES Modules only — every `package.json` sets `"type": "module"`. Infra code uses native `node:fs/promises`, `node:path`, `node:dns/promises`, `node:net`, `node:child_process`, `node:url`.
- pnpm with workspaces (`pnpm-workspace.yaml` → `packages/*`).
- Lockfile: `pnpm-lock.yaml` (lockfile v9.0), committed.
- `allowBuilds` allowlist in `pnpm-workspace.yaml`: `esbuild`, `re2` — only these native builds are permitted during install.
## Frameworks
- The project is a TypeScript monorepo with executable transport packages present on disk: `@llm-wiki/cli`, `@llm-wiki/mcp-server`, and `@llm-wiki/common` wiring. There is no web framework dependency.
- Vitest `^3.1.0` (resolved `3.2.4`) — runner, assertion library, and mocking framework. Workspace mode via `vitest.workspace.ts` (references `packages/core` and `packages/infra`). Each package has its own `vitest.config.ts` with `globals: true` and `include: ['tests/**/*.test.ts']`. `packages/infra/vitest.config.ts` aliases `@llm-wiki/core` and `@llm-wiki/infra` to their `src/index.ts` so tests run against unbuilt source.
- MSW `^2.13.2` (resolved `2.13.2`) — HTTP mocking for `HttpSourceReader` tests (dev dep of `@llm-wiki/infra` only).
- TypeScript project references (`tsc -b`) — root `tsconfig.json` references `packages/core` and `packages/infra`; `packages/infra/tsconfig.json` references `../core`. Both package tsconfigs set `composite: true`, `outDir: dist`, `rootDir: src`. Root `npm run build` = `tsc -b`; root `npm run lint` is currently aliased to `tsc -b` as well (pure type-check; no ESLint/Prettier configured yet).
## Key Dependencies
### `@llm-wiki/core` (`packages/core/package.json`)
- `re2` `^1.24.0` (resolved `1.24.0`) — Google RE2 regex engine bindings. Used by the domain sanitization layer to guarantee linear-time pattern matching on untrusted input (avoids ReDoS on custom patterns from config).
- `typescript` `^5.8.0`
### `@llm-wiki/infra` (`packages/infra/package.json`)
- `@ai-sdk/openai` `^1.3.24` (resolved `1.3.24`) — OpenAI provider for the Vercel AI SDK. Used by `AiSdkLlmClient` and `AiSdkEmbeddingClient` as the default provider; the adapters accept any `LanguageModel` / `EmbeddingModel<string>` so providers are swappable without code changes.
- `ai` `^5.0.172` (resolved `5.0.172`) — Vercel AI SDK v5. `generateText()` backs `AiSdkLlmClient.complete()`; `embedMany()` backs `AiSdkEmbeddingClient.embed()`. AI SDK v5 surfaces `usage.inputTokens` / `usage.outputTokens` directly.
- `ruvector` `^0.2.22` (resolved `0.2.22`) — Rust-native embedded vector DB (HNSW) with Node N-API bindings. Provides the dense half of hybrid search in `RuVectorSearchEngine`. Persists to a single file at `<dbPath>/vectors.db`. Platform-specific optional binaries are pulled in via `@ruvector/rvf-node-*` sub-packages for darwin-arm64/x64, linux-arm64/x64 (gnu), and win32-x64 (msvc).
- `minisearch` `^7.2.0` (resolved `7.2.0`) — in-process BM25 / sparse text index. Provides the sparse half of hybrid search in `RuVectorSearchEngine`; persisted to `<dbPath>/bm25.json` with atomic `writeFile`+`rename` and a version-1 wrapper schema.
- `simple-git` `^3.27.0` (resolved `3.35.2`) — `IVersionControl` adapter (`GitVersionControl`). Handles commit, status, `worktree add -b`, `worktree remove`, `reset --soft main` squash, `merge --ff-only`. `GitProjectResolver` also shells out directly via `node:child_process execSync` for `git remote get-url origin`.
- `gray-matter` `^4.0.3` (resolved `4.0.3`) — YAML frontmatter parser/serializer for wiki markdown files (`FsFileStore.readWikiPage`, `FsVerbatimStore.writeEntry`, `GitProjectResolver.resolve`).
- `js-yaml` `^4.1.0` (resolved `4.1.1`) — YAML load/dump for `ConfigLoader` (`settings.shared.yaml` + `settings.local.yaml`) and `YamlStateStore` (`.local/state.yaml`).
- `@llm-wiki/core` `workspace:*` — linked to `../core`.
- `@types/js-yaml` `^4.0.9`
- `msw` `^2.13.2`
- `typescript` `^5.8.0`
## Configuration
- `LLM_WIKI_PATH` — overrides `wiki.path`
- `LLM_WIKI_LLM_API_KEY`, `LLM_WIKI_LLM_MODEL`, `LLM_WIKI_LLM_BASE_URL`
- `LLM_WIKI_EMBEDDING_API_KEY`, `LLM_WIKI_EMBEDDING_MODEL`, `LLM_WIKI_EMBEDDING_BASE_URL`
- `tsconfig.base.json` — shared compiler options (ES2022, NodeNext, strict, declaration, declarationMap, sourceMap, isolatedModules, verbatimModuleSyntax).
- `tsconfig.json` — solution file, references both packages.
- `packages/core/tsconfig.json`, `packages/infra/tsconfig.json` — per-package composite builds.
- `vitest.workspace.ts` at repo root.
- `packages/core/vitest.config.ts`, `packages/infra/vitest.config.ts` — per-package configs. Infra adds source-path aliases for `@llm-wiki/core` and `@llm-wiki/infra` so tests hit TypeScript source, not `dist/`.
- **Type checking:** `tsc -b` (via `pnpm lint` and `pnpm build`). Strict TypeScript is the only enforced static analysis today.
- **ESLint:** not configured. No `.eslintrc*` / `eslint.config.*` present.
- **Prettier:** not configured. No `.prettierrc*` present.
- **Biome / other:** not configured.
- **Pre-commit hook:** not present. The project-level guideline in `CLAUDE.md` / `RULES.md` calls for one, but `.githooks/` does not exist yet and `git config core.hooksPath` is unset.
## Platform Requirements
- Node.js 20+ (22 recommended — matches `@types/node`).
- pnpm (version implied by lockfile v9.0 → pnpm 9.x or 10.x).
- Git CLI on `PATH` — `GitVersionControl` and `GitProjectResolver` both shell out to `git`. `git worktree add -b` / `worktree remove` / `merge --ff-only` must all be available.
- A supported native platform for `ruvector` prebuilt binaries: darwin-arm64, darwin-x64, linux-arm64-gnu, linux-x64-gnu, or win32-x64-msvc. Musl-libc Linux is not in the `rvf-node` prebuild set.
- A supported native platform for `re2` prebuilds (same four-plus-Windows matrix typical for N-API modules).
- Library package only — no deployment target yet. Milestone 4 (per `docs/superpowers/plans/2026-04-10-milestone-3-lint-import-archive.md`) will add `@llm-wiki/mcp-server` (stdio + HTTP MCP transport) and `@llm-wiki/cli`, at which point the runtime targets are "local workstation" (CLI + MCP over stdio for Claude Code) rather than a server host.
## Milestone Status
- **M1** (complete): domain + ports + adapters (`FsFileStore`, `FsVerbatimStore`, `GitProjectResolver`, `ConfigLoader`, `RememberService`, `RecallService`, `SanitizationService`).
- **M2** (complete): hybrid search, query, ingest, status (`RuVectorSearchEngine`, `AiSdkLlmClient`, `AiSdkEmbeddingClient`, `GitVersionControl`, `FsSourceReader`, `HttpSourceReader`, `CompositeSourceReader`, `YamlStateStore`, `IngestService`, `QueryService`, `StatusService`).
- **M3** (current branch `claude/milestone-3-lint-import-archiver`): Lint / Import / Archive services. The plan (`docs/superpowers/plans/2026-04-10-milestone-3-lint-import-archive.md`) calls for three additional infra deps not yet in `package.json`:
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Monorepo Layout
- pnpm workspace with two packages declared in `pnpm-workspace.yaml`:
- Root `package.json` exposes:
- Node `>=20` required (`package.json` `engines`).
- Each package is `"type": "module"` and uses TypeScript project references (`tsconfig.json` has `"references": [{ "path": "packages/core" }, { "path": "packages/infra" }]`).
## TypeScript Compiler Options
| Option | Value | Effect |
|--------|-------|--------|
| `target` | `ES2022` | Modern syntax, top-level await allowed |
| `module` | `NodeNext` | ESM with mandatory `.js` extensions in relative imports |
| `moduleResolution` | `NodeNext` | Matches Node ESM resolver |
| `strict` | `true` | All strict flags on (`strictNullChecks`, `noImplicitAny`, etc.) |
| `verbatimModuleSyntax` | `true` | Forces `import type` for type-only imports — any accidental runtime import of a type is a compile error |
| `isolatedModules` | `true` | Every file must be independently transpilable |
| `forceConsistentCasingInFileNames` | `true` | Cross-platform file-name hygiene |
| `esModuleInterop` | `true` | CJS default imports work (used for `re2`, `gray-matter`, `js-yaml`, `path`) |
| `declaration` + `declarationMap` + `sourceMap` | `true` | Every build artifact ships `.d.ts` + maps |
| `resolveJsonModule` | `true` | JSON imports allowed |
| `outDir` / `rootDir` | `dist` / `src` | Tests live in `tests/`, outside `rootDir`, so they are type-checked by `vitest` but not included in the emitted build |
## Import Conventions
## Directory & File Naming
| Layer | Directory | File names |
|-------|-----------|------------|
| Domain | `packages/core/src/domain/` | kebab-case: `wiki-page.ts`, `verbatim-entry.ts`, `sanitization-result.ts`, `runtime-state.ts`, `errors.ts` |
| Ports | `packages/core/src/ports/` | kebab-case, one port per file: `file-store.ts`, `search-engine.ts`, `llm-client.ts`, `embedding-client.ts`, `source-reader.ts`, `state-store.ts`, `verbatim-store.ts`, `version-control.ts`, `project-resolver.ts` |
| Services | `packages/core/src/services/` | kebab-case with `-service` suffix: `ingest-service.ts`, `remember-service.ts`, `query-service.ts`, `recall-service.ts`, `sanitization-service.ts`, `status-service.ts` |
| Infra adapters | `packages/infra/src/` | kebab-case, `<backing-tech>-<port>`: `fs-file-store.ts`, `fs-verbatim-store.ts`, `git-project-resolver.ts`, `git-version-control.ts`, `ruvector-search-engine.ts`, `ai-sdk-llm-client.ts`, `ai-sdk-embedding-client.ts`, `yaml-state-store.ts`, `http-source-reader.ts`, `fs-source-reader.ts`, `composite-source-reader.ts`, `config-loader.ts` |
| Core tests | `packages/core/tests/{domain,services}/` | Co-named with the unit under test: `wiki-page.test.ts`, `ingest-service.test.ts`, … |
| Infra tests | `packages/infra/tests/` (flat) + `tests/integration/` | `<adapter>.test.ts` for unit-level, `<flow>-e2e.test.ts` / `<flow>.test.ts` for integration |
- `packages/core/src/index.ts` re-exports everything from `./domain`, `./ports`, `./services`.
- `packages/core/src/domain/index.ts`, `ports/index.ts`, `services/index.ts` re-export named members and explicit `export type { … }` for interfaces.
- `packages/infra/src/index.ts` re-exports each adapter by name. One public type
## TypeScript Code Style
- **Ports** (`packages/core/src/ports/*.ts`) are `interface` declarations prefixed with
- **Domain entities** (`WikiPage`, `VerbatimEntry`, `Project`, `SanitizationResult`,
- **Services** are `class` with a public constructor that takes ports as
- Domain entities expose **only `public readonly`** fields. Mutation happens via
- Service dependencies are also `private readonly`.
- Missing file / missing record returns `null` rather than throwing (`IFileStore.readFile`
- Error cases use typed exceptions (see below), never sentinel return values.
- Services have one public entry-point method per use case; everything else is
- Arguments are passed as a single request-object interface (`RememberFactRequest`,
- Every I/O path is `async` / `Promise<T>`. Sync APIs (`execSync`) appear **only in
## Error Handling
- Single root class `WikiError extends Error` with a machine-readable `code`.
- One subclass per failure mode, each hard-codes its own `code` constant:
- Error subclasses carry **typed context fields**: e.g. `PathEscapeError.attemptedPath`,
- Services **validate inputs on entry** and throw domain errors before any I/O:
- **Adapter errors are wrapped, not leaked.** `AiSdkLlmClient` catches the raw AI
- **Compensating actions on failure.** On LLM failure or path-validation failure
- **No `console.*` calls in production code.** `grep -r 'console.(log|warn|error)'
## Dependency Injection Style
- **Pure constructor injection.** Every service class takes its ports as ordered
- **No DI container.** Wiring lives at the composition root (expected to be the
- **Factory ports where root is per-call.** `FileStoreFactory = (rootDir: string)
- **`SanitizationService` is the one exception** — services take it as a concrete
## Domain Layer Dependency Budget
## Module Exports
- Public API of each package is defined **only** in its barrel `index.ts`.
- Internal files use **named exports** only — no `export default` appears in any
- Interfaces and classes are exported by name; types with no runtime
## Comments & Documentation
- **JSDoc on every port method** describing contract, return semantics, and
- **Long-form block comments on service entry points** (`IngestService.ingest`
- **Inline comments justify invariants**, e.g. `ingest-service.ts:215-218`
- **Tests include `(INV-N)` tags** in their names to link back to the spec's
- `// eslint-disable-next-line` is used once in the whole codebase
## Observed vs Stated Summary
| Topic | Stated in `RULES.md` / `CLAUDE.md` | Observed in code |
|-------|-------------------------------------|------------------|
| Clean Architecture (`Infra → App → Domain`) | Required | Enforced by project references + `@llm-wiki/core` package boundary. Core has 1 external dep (`re2`), deliberate. |
| Contract-First (Protocol → contract tests → impl) | Required | Ports under `packages/core/src/ports/` as `interface`, implementations in `@llm-wiki/infra`, contract-style tests live in `packages/infra/tests/<adapter>.test.ts`. |
| TDD (Red → Green → Refactor) | Required | Cannot verify from commits alone; observed state is that every production file has a matching `*.test.ts`. |
| SRP ≤300 lines | Required | Largest file is `packages/core/src/services/ingest-service.ts` at **346 lines** — **over budget** (see CONCERNS.md). All others ≤184 lines. |
| ISP ≤5 methods per interface | Required | `IFileStore` has **5** methods, `ISearchEngine` has **6** — one-over. `IVersionControl` has **7** — over. See CONCERNS.md. |
| DIP (ctor accepts abstraction) | Required | Every service does this; `FileStoreFactory` is used where the root dir varies per call. |
| No `TODO` / `...` placeholders | Required | `grep -r "TODO\|FIXME" packages/**/src` returns zero matches (except `packages/infra/src/http-source-reader.ts`'s `vi.spyOn` call, which is not a placeholder — see unused `vi` import there). |
| Naming: `test_<what>_<condition>_<result>` | Required | **Strictly followed** across all 27 test files. Example: `test_rememberFact_emptyContent_throwsContentEmpty`. |
| Arrange-Act-Assert | Required | Followed; `beforeEach` handles Arrange, each `it` body has a clear Act then `expect(…)` Assert block. |
| `@parametrize` over copy-paste | Required | `vitest` equivalent is `it.each` — used in **one** place (`ingest-service.test.ts:325` for path-validation matrix). Mostly honored but underused (see gap below). |
| Response language: Russian | Required | Does not apply to source code; all code / tests / comments are in English. |
| No protected-file edits | Required | `.env*`, `ci/**`, Docker/K8s/Terraform absent from repo — nothing to protect. |
## Gaps
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Strict dependency direction: `Infrastructure -> Application (services) -> Domain`. The domain layer has zero runtime dependencies on infra; infra imports core exclusively via the `@llm-wiki/core` package entry point.
- Two workspaces: `packages/core` (domain + ports + services, pure logic) and `packages/infra` (adapters that implement the ports using Node APIs, git, filesystem, LLM SDKs, vector DB).
- Port/adapter seams are expressed as `I*` TypeScript interfaces under `packages/core/src/ports/`. Services depend only on these interfaces and are composed via constructor injection from wiring code.
- TypeScript project references enforce the layering at build time: `packages/infra/tsconfig.json` references `../core`, but not vice versa (see `packages/core/tsconfig.json` which has no `references`).
- ESM-first (`"type": "module"` in both package.json files), NodeNext resolution, explicit `.js` extensions on relative imports from `.ts` sources.
## Layers
- Purpose: Pure business concepts. Value objects, entity classes, typed errors, runtime-state DTOs. No I/O, no Node built-ins, no infra dependencies.
- Location: `packages/core/src/domain/`
- Contains: `WikiPage` (`wiki-page.ts`), `VerbatimEntry` (`verbatim-entry.ts`), `Project` (`project.ts`), `SanitizationResult` (`sanitization-result.ts`), `SearchResult` (`search-result.ts`), runtime-state types (`runtime-state.ts`), and the `WikiError` hierarchy (`errors.ts`).
- Depends on: Nothing outside the domain folder. `errors.ts` has zero imports; other domain files import only sibling domain modules.
- Used by: Services (application layer) and re-exported through `packages/core/src/index.ts` so infra adapters can consume domain types.
- Purpose: Inbound contract for every external capability a service needs - filesystem, search, LLM, embeddings, git, source reading, state persistence, project resolution, verbatim entry storage.
- Location: `packages/core/src/ports/`
- Contains: `IFileStore` + `FileStoreFactory` (`file-store.ts`), `IVerbatimStore` (`verbatim-store.ts`), `IProjectResolver` (`project-resolver.ts`), `IVersionControl` (`version-control.ts`), `ISearchEngine` + `IndexEntry` + `IndexHealth` (`search-engine.ts`), `ILlmClient` (`llm-client.ts`), `IEmbeddingClient` (`embedding-client.ts`), `ISourceReader` + `estimateTokens` helper (`source-reader.ts`), `IStateStore` (`state-store.ts`).
- Depends on: Domain only (e.g. `ISearchEngine` returns `SearchResult[]`, `IFileStore.readWikiPage` returns `WikiPageData`).
- Used by: Services via constructor-injected interfaces; implemented by infra adapters.
- Purpose: Orchestrate ports to satisfy use cases (`wiki_ingest`, `wiki_query`, `wiki_remember`, `wiki_recall`, `wiki_status`, sanitization). Every service takes its collaborators as `readonly` constructor params; no service instantiates an adapter.
- Location: `packages/core/src/services/`
- Contains: `IngestService` (`ingest-service.ts`), `QueryService` (`query-service.ts`), `RememberService` (`remember-service.ts`), `RecallService` (`recall-service.ts`), `WikiStatusService` (`status-service.ts`), `SanitizationService` (`sanitization-service.ts`).
- Depends on: Domain types + port interfaces. Never imports from `@llm-wiki/infra`.
- Used by: Wiring code in `@llm-wiki/common`, `@llm-wiki/cli`, and `@llm-wiki/mcp-server`.
- Purpose: Concrete adapters implementing each port with real I/O. Each adapter is a single class file named `<tech>-<port>.ts`.
- Location: `packages/infra/src/`
- Contains:
- Depends on: `@llm-wiki/core` (via `"workspace:*"`) and third-party libs (`simple-git`, `gray-matter`, `js-yaml`, `minisearch`, `ruvector`, `ai`, `@ai-sdk/openai`, `msw` for tests).
- Used by: Future wiring layer (CLI / MCP server). Infra imports cross the workspace boundary only through the `@llm-wiki/core` package entry (`packages/core/src/index.ts`), never by deep paths.
- Not yet present. Services are instantiated inside tests (unit tests use hand-written fakes; integration tests under `packages/infra/tests/integration/` compose real adapters against a temp directory). Production wiring (CLI / MCP server) will be added in a later milestone; Milestone 3 on this branch adds Lint / Import / Archiver services that will be wired here.
## Data Flow
- Read-only: lists `wiki/` + `projects/` via `IFileStore`, derives unique project names from `projects/<name>/...` paths, asks `IVerbatimStore` for the unconsolidated count, combines `ISearchEngine.health()` with per-file staleness (upgrade `ok -> stale` when any file's `updated` is newer than its `lastIndexedAt`), and reads `last_lint` / `last_ingest` from `IStateStore`.
- Persistent runtime state is flat YAML at `.local/state.yaml` (`YamlStateStore`), containing `{imports: Record<string, ImportState>, last_lint, last_ingest}`. Concurrent `update()` calls are serialized through a chained-promise mutex in `YamlStateStore`.
- Search index state (BM25 + vectors) lives under the search-engine's own directory passed at construction.
- Configuration is loaded once at startup by `ConfigLoader` (shared YAML + local YAML + env overrides).
## Key Abstractions
- Purpose: A single external capability exposed as the narrowest possible TypeScript interface. SOLID-ISP: all ports are small (2-6 methods).
- Examples: `packages/core/src/ports/file-store.ts`, `packages/core/src/ports/search-engine.ts`, `packages/core/src/ports/version-control.ts`.
- Pattern: Pure interfaces, no default implementation, no class inheritance; adapters `implements IFileStore` etc.
- Purpose: `IngestService` needs a file store scoped to a freshly-created worktree root. Rather than coupling the service to `FsFileStore`, `IFileStore` is paired with `FileStoreFactory = (rootDir: string) => IFileStore`. Wiring code passes `(root) => new FsFileStore(root)`.
- Location: `packages/core/src/ports/file-store.ts`
- Pattern: Factory-by-function (DIP); the service sees only a callable signature.
- Purpose: Every typed failure mode extends `WikiError(code, message)` so services can catch and classify without `instanceof`-ing each leaf.
- Location: `packages/core/src/domain/errors.ts`
- Pattern: Nominal error classes with a stable `code` string - consumed by `IngestService` to re-raise `WikiError` subclasses as-is and wrap everything else in `LlmUnavailableError`.
- Purpose: Private constructors plus static factory methods enforce invariants (`assertIdentifier` for agent/sessionId, default fallbacks for missing frontmatter).
- Location: `packages/core/src/domain/wiki-page.ts`, `packages/core/src/domain/verbatim-entry.ts`
- Pattern: DDD value objects; all public fields are `readonly`.
## Entry Points
- Re-exports `domain`, `ports`, `services` barrels. Infra and future wiring import exclusively through `@llm-wiki/core`.
- Re-exports every adapter class plus `ConfigLoader` / `WikiConfig`.
- `packages/core/tests/services/*.test.ts` drive services with in-memory fakes (example: `packages/core/tests/services/ingest-service.test.ts`).
- `packages/infra/tests/integration/*.test.ts` compose real adapters against temp directories to exercise end-to-end flows: `ingest-e2e.test.ts`, `query-e2e.test.ts`, `remember-recall.test.ts`, `search-rebuild.test.ts`.
- `LintService`, `ImportService`, `ArchiveService` will land under `packages/core/src/services/` and follow the same constructor-injection + worktree pattern as `IngestService`.
## Error Handling
- Fail fast before side effects: `IngestService` checks the token limit and validates LLM-provided paths *before* any filesystem write.
- Worktree isolation for transactional semantics: `IngestService` force-removes the worktree on any non-conflict failure so main is never partially mutated. `GitConflictError` intentionally leaves the worktree behind for manual recovery.
- Path-escape guards run at two levels: lexical (`FsFileStore.resolveSafePath`) and symlink-aware (`assertUnderRoot` via `realpath`) - defense in depth.
- Service-level graceful degradation: `QueryService` returns raw citations with an empty `answer` on any LLM failure (INV-3).
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| executing-plans | Use when you have a written implementation plan to execute in a separate session with review checkpoints | `.claude/skills/executing-plans/SKILL.md` |
| subagent-driven-development | Use when executing implementation plans with independent tasks in the current session | `.claude/skills/subagent-driven-development/SKILL.md` |
| test-driven-development | Use when implementing any feature or bugfix, before writing implementation code | `.claude/skills/test-driven-development/SKILL.md` |
| verification-before-completion | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always | `.claude/skills/verification-before-completion/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
