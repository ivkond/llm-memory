# Codebase Structure

**Analysis Date:** 2026-04-10

## Directory Layout

```
llm-memory/
├── package.json                        # Root workspace manifest (name: llm-wiki), scripts: build/test/lint
├── pnpm-workspace.yaml                 # Workspace glob: packages/*  (allowBuilds: esbuild, re2)
├── pnpm-lock.yaml
├── tsconfig.json                       # Root solution file (project references)
├── tsconfig.base.json                  # Shared compiler options (strict, NodeNext, ES2022)
├── vitest.workspace.ts                 # Vitest workspace: packages/core, packages/infra
├── CLAUDE.md                           # AI agent instructions (beads, session completion)
├── RULES.md                            # Project coding rules
├── docs/                               # Developer docs (superpowers/ subfolder)
├── .ai/workspace/analysis/             # (empty) prior architectural notes would live here
├── .planning/codebase/                 # This folder - codebase-mapper outputs
└── packages/
    ├── core/                           # @llm-wiki/core - domain + ports + services (pure)
    │   ├── package.json                # main: dist/index.js, dep: re2 only
    │   ├── tsconfig.json               # composite, rootDir: src, outDir: dist, no references
    │   ├── vitest.config.ts
    │   ├── src/
    │   │   ├── index.ts                # Barrel: re-exports domain/ports/services
    │   │   ├── domain/                 # Pure business types (no I/O)
    │   │   │   ├── index.ts            # Domain barrel
    │   │   │   ├── errors.ts           # WikiError hierarchy (13 typed error classes)
    │   │   │   ├── project.ts          # Project value object
    │   │   │   ├── wiki-page.ts        # WikiPage + WikiPageFrontmatter + WikiPageData
    │   │   │   ├── verbatim-entry.ts   # VerbatimEntry value object + identifier guard
    │   │   │   ├── sanitization-result.ts
    │   │   │   ├── search-result.ts    # SearchResult + SearchSource ('bm25'|'vector'|'hybrid')
    │   │   │   └── runtime-state.ts    # WikiRuntimeState, ImportState, EMPTY_RUNTIME_STATE
    │   │   ├── ports/                  # Interfaces that services depend on
    │   │   │   ├── index.ts            # Ports barrel
    │   │   │   ├── file-store.ts       # IFileStore + FileInfo + FileStoreFactory
    │   │   │   ├── verbatim-store.ts   # IVerbatimStore
    │   │   │   ├── project-resolver.ts # IProjectResolver
    │   │   │   ├── version-control.ts  # IVersionControl + WorktreeInfo
    │   │   │   ├── search-engine.ts    # ISearchEngine + SearchQuery + IndexEntry + IndexHealth
    │   │   │   ├── llm-client.ts       # ILlmClient + LlmCompletionRequest/Response
    │   │   │   ├── embedding-client.ts # IEmbeddingClient
    │   │   │   ├── source-reader.ts    # ISourceReader + SourceContent + estimateTokens()
    │   │   │   └── state-store.ts      # IStateStore
    │   │   └── services/               # Application use cases (orchestrate ports)
    │   │       ├── index.ts            # Services barrel
    │   │       ├── sanitization-service.ts  # RE2-backed redaction/warn/block
    │   │       ├── remember-service.ts      # wiki_remember (fact + session dedup)
    │   │       ├── recall-service.ts        # wiki_recall (project/wiki budget split)
    │   │       ├── query-service.ts         # wiki_query (cascade + staleness sync + LLM)
    │   │       ├── ingest-service.ts        # wiki_ingest (worktree + LLM + reindex)
    │   │       └── status-service.ts        # wiki_status (read-only aggregation)
    │   └── tests/
    │       ├── domain/                 # Pure unit tests for value objects
    │       │   ├── runtime-state.test.ts
    │       │   ├── sanitization-result.test.ts
    │       │   ├── search-result.test.ts
    │       │   ├── verbatim-entry.test.ts
    │       │   └── wiki-page.test.ts
    │       └── services/               # Service tests with hand-written port fakes
    │           ├── ingest-service.test.ts
    │           ├── query-service.test.ts
    │           ├── recall-service.test.ts
    │           ├── remember-service.test.ts
    │           ├── sanitization-service.test.ts
    │           └── status-service.test.ts
    └── infra/                          # @llm-wiki/infra - adapters implementing ports
        ├── package.json                # deps: simple-git, gray-matter, js-yaml, minisearch,
        │                               #       ruvector, ai, @ai-sdk/openai, msw (dev)
        ├── tsconfig.json               # composite, references: [../core]
        ├── vitest.config.ts
        ├── src/
        │   ├── index.ts                # Barrel of every adapter class
        │   ├── config-loader.ts        # WikiConfig + ConfigLoader (shared/local YAML + env)
        │   ├── fs-file-store.ts        # FsFileStore (IFileStore) - path-escape + symlink guards
        │   ├── fs-verbatim-store.ts    # FsVerbatimStore (IVerbatimStore) - delegates to IFileStore
        │   ├── fs-source-reader.ts     # FsSourceReader (ISourceReader) - file:// + absolute + relative
        │   ├── http-source-reader.ts   # HttpSourceReader (ISourceReader) - http(s) with msw in tests
        │   ├── composite-source-reader.ts # Dispatches by URI scheme to fs/http readers
        │   ├── git-project-resolver.ts # GitProjectResolver (IProjectResolver) - git remote + _config.md
        │   ├── git-version-control.ts  # GitVersionControl (IVersionControl) - simple-git + worktrees
        │   ├── ruvector-search-engine.ts # RuVectorSearchEngine (ISearchEngine) - MiniSearch + ruvector + RRF
        │   ├── ai-sdk-llm-client.ts    # AiSdkLlmClient (ILlmClient) - Vercel AI SDK + @ai-sdk/openai
        │   ├── ai-sdk-embedding-client.ts # AiSdkEmbeddingClient (IEmbeddingClient)
        │   └── yaml-state-store.ts     # YamlStateStore (IStateStore) - .local/state.yaml via IFileStore
        └── tests/
            ├── ai-sdk-embedding-client.test.ts
            ├── ai-sdk-llm-client.test.ts
            ├── composite-source-reader.test.ts
            ├── config-loader.test.ts
            ├── fs-file-store.test.ts
            ├── fs-source-reader.test.ts
            ├── fs-verbatim-store.test.ts
            ├── git-project-resolver.test.ts
            ├── git-version-control.test.ts
            ├── http-source-reader.test.ts
            ├── ruvector-search-engine.test.ts
            ├── yaml-state-store.test.ts
            └── integration/            # End-to-end tests composing real adapters on temp dirs
                ├── ingest-e2e.test.ts
                ├── query-e2e.test.ts
                ├── remember-recall.test.ts
                └── search-rebuild.test.ts
```

## Directory Purposes

**`packages/core/src/domain/`:**
- Purpose: Pure domain types - value objects, DTOs, typed errors. Zero dependencies outside itself.
- Contains: Value objects with private constructors + static factories, typed error subclasses of `WikiError`, runtime-state types.
- Key files: `errors.ts`, `wiki-page.ts`, `verbatim-entry.ts`, `search-result.ts`, `runtime-state.ts`.

**`packages/core/src/ports/`:**
- Purpose: Interfaces describing every external capability a service needs. Each port is its own file, each file exports one interface plus any supporting types.
- Contains: `I*` interfaces, supporting DTOs, and a single shared helper (`estimateTokens` in `source-reader.ts`).
- Key files: `file-store.ts`, `search-engine.ts`, `version-control.ts`, `state-store.ts`.

**`packages/core/src/services/`:**
- Purpose: Application use cases. One class per use case, composed from ports via constructor injection.
- Contains: Six services (`SanitizationService`, `RememberService`, `RecallService`, `QueryService`, `IngestService`, `WikiStatusService`). Milestone 3 will add `LintService`, `ImportService`, `ArchiveService` here.
- Key files: `ingest-service.ts` (largest - 347 lines, handles the full worktree pipeline), `query-service.ts`.

**`packages/core/tests/`:**
- Purpose: Core unit tests. Split into `domain/` (pure value-object tests) and `services/` (service tests with hand-written port fakes).
- Contains: One test file per source file. Runs via vitest (`vitest.workspace.ts` includes `packages/core`).
- Key files: `services/ingest-service.test.ts`, `services/query-service.test.ts`.

**`packages/infra/src/`:**
- Purpose: Adapter implementations. Flat folder - no sub-directories - each adapter is one file named `<tech>-<port>.ts`.
- Contains: 12 adapter classes plus `ConfigLoader` and the `index.ts` barrel.
- Key files: `fs-file-store.ts`, `git-version-control.ts`, `ruvector-search-engine.ts`.

**`packages/infra/tests/`:**
- Purpose: Adapter unit tests plus end-to-end integration tests.
- Contains: One `*.test.ts` per adapter in the flat root, plus `integration/` for multi-adapter flows.
- Key files: `integration/ingest-e2e.test.ts`, `integration/query-e2e.test.ts`, `integration/search-rebuild.test.ts`, `integration/remember-recall.test.ts`.

**`.planning/codebase/`:**
- Purpose: Output directory for the GSD codebase-mapper agents. This document lives here.
- Committed: Yes.

**`.ai/workspace/analysis/`:**
- Purpose: Intended for prior architectural reasoning. Currently empty on this branch.
- Committed: Directory exists in git; contents empty.

**`.worktrees/`:**
- Purpose: Runtime-created by `GitVersionControl.createWorktree()` - ingest / lint isolation.
- Generated: Yes (naming pattern `.worktrees/<name>-<timestamp>`).
- Committed: No (listed in `.gitignore`; a worktree checkout is visible in `git status` as untracked on this branch).

**`docs/`:**
- Purpose: Developer-facing documentation.
- Contains: `superpowers/` subfolder.

## Key File Locations

**Workspace / Build:**
- `pnpm-workspace.yaml`: Workspace glob is `packages/*`. `allowBuilds: { esbuild: true, re2: true }` permits the two native-dependency builds.
- `tsconfig.json`: Root solution file that TypeScript uses for `tsc -b` (run via `pnpm build` or `pnpm lint`).
- `tsconfig.base.json`: Shared strict compiler options extended by each package.
- `vitest.workspace.ts`: Defines the two-package vitest workspace.

**Core Package Entry:**
- `packages/core/src/index.ts`: Re-exports `domain/index.ts`, `ports/index.ts`, `services/index.ts`.
- `packages/core/package.json`: `"name": "@llm-wiki/core"`, only runtime dep is `re2`.

**Infra Package Entry:**
- `packages/infra/src/index.ts`: Named re-exports of every adapter class plus `ConfigLoader` / `WikiConfig`.
- `packages/infra/package.json`: `"name": "@llm-wiki/infra"`, depends on `@llm-wiki/core: workspace:*` plus runtime libs.

**Configuration:**
- `packages/infra/src/config-loader.ts`: `WikiConfig` shape and defaults. Loads `.config/settings.shared.yaml`, `.local/settings.local.yaml`, and a curated set of `LLM_WIKI_*` env overrides.

**Error Hierarchy:**
- `packages/core/src/domain/errors.ts`: All typed `WikiError` subclasses live here.

**Testing:**
- `packages/core/tests/services/`: Service tests with fake ports.
- `packages/infra/tests/integration/`: End-to-end flows composing real adapters (tmp dirs, real git, in-memory HTTP mocks via `msw`).

## Naming Conventions

**Files:**
- `kebab-case.ts` everywhere (e.g. `fs-file-store.ts`, `ingest-service.ts`).
- Adapter files follow `<tech>-<port-noun>.ts`: `fs-file-store.ts`, `git-version-control.ts`, `ruvector-search-engine.ts`, `yaml-state-store.ts`, `ai-sdk-llm-client.ts`.
- Service files follow `<usecase>-service.ts`: `ingest-service.ts`, `query-service.ts`.
- Domain files are plain nouns: `wiki-page.ts`, `verbatim-entry.ts`.
- Port files follow the port's domain noun: `file-store.ts` (not `i-file-store.ts`).
- Tests mirror source filenames with `.test.ts`.

**Directories:**
- Lowercase (`domain`, `ports`, `services`, `integration`).

**Exports:**
- PascalCase classes (`FsFileStore`, `IngestService`).
- Port interfaces prefixed with `I`: `IFileStore`, `IVersionControl`.
- `I*` prefix is an intentional convention for ports (standard TypeScript style would drop it; this repo keeps it to make port vs implementation visually obvious at import sites).

## Where to Add New Code

**New domain concept:**
- Value object / DTO: `packages/core/src/domain/<noun>.ts`
- Add re-export to `packages/core/src/domain/index.ts`
- New error class: append to `packages/core/src/domain/errors.ts` (do not create one-error-per-file)
- Tests: `packages/core/tests/domain/<noun>.test.ts`

**New port (abstraction over an external capability):**
- Interface: `packages/core/src/ports/<capability>.ts`
- Re-export types from `packages/core/src/ports/index.ts`
- Keep the interface `<= 5` methods (project rule: ISP)

**New service (application use case):**
- Class: `packages/core/src/services/<usecase>-service.ts` with constructor injection of ports only
- Export service + request/response types from `packages/core/src/services/index.ts`
- Never import from `@llm-wiki/infra`; services must pass the type-reference build in `packages/core/tsconfig.json` which has no back-reference to infra
- Tests with port fakes: `packages/core/tests/services/<usecase>-service.test.ts`

**New adapter (port implementation):**
- File: `packages/infra/src/<tech>-<port-noun>.ts`
- Class `implements I<Port>` from `@llm-wiki/core`
- Add named export to `packages/infra/src/index.ts`
- Unit test: `packages/infra/tests/<tech>-<port-noun>.test.ts`
- If the adapter participates in an end-to-end flow, also add or extend an integration test under `packages/infra/tests/integration/`

**Shared helper / utility:**
- If the helper is domain-pure (`estimateTokens` is the current example): co-locate with the port that uses it (`packages/core/src/ports/source-reader.ts`).
- If the helper is infra-only: inline in the adapter file; there is no `utils/` dumping ground yet.

## Special Directories

**`.worktrees/`:**
- Purpose: Runtime git worktrees for ingest / lint isolation. Created by `GitVersionControl.createWorktree()`.
- Generated: Yes, at runtime.
- Committed: No.

**`.ai/workspace/analysis/`:**
- Purpose: Prior architectural reasoning (empty on this branch).
- Committed: Yes (directory).

**`.planning/codebase/`:**
- Purpose: GSD codebase-mapper outputs (this document).
- Committed: Yes.

**`docs/superpowers/`:**
- Purpose: Developer docs.
- Committed: Yes.

**Workspace glob (`pnpm-workspace.yaml`):**
- `packages: ["packages/*"]` - any new workspace must live under `packages/`.
- `allowBuilds: { esbuild: true, re2: true }` - these two native builds are explicitly permitted; any new native-build dependency will need to be added here or pnpm will refuse to run its postinstall script.

---

*Structure analysis: 2026-04-10*
