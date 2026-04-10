# Coding Conventions

**Analysis Date:** 2026-04-10
**Scope:** `packages/core` and `packages/infra` in the llm-memory pnpm monorepo.

This document distinguishes **Stated** conventions (what `RULES.md` / `CLAUDE.md` require)
from **Observed** conventions (what the committed TypeScript actually does), and calls
out gaps where the two diverge.

---

## Monorepo Layout

**Observed:**
- pnpm workspace with two packages declared in `pnpm-workspace.yaml`:
  - `@llm-wiki/core` → `packages/core` (domain + application, one runtime dep: `re2`)
  - `@llm-wiki/infra` → `packages/infra` (adapters: `ai`, `gray-matter`, `js-yaml`, `minisearch`, `ruvector`, `simple-git`, `msw`)
- Root `package.json` exposes:
  - `pnpm build` → `tsc -b`
  - `pnpm test` → `vitest run`
  - `pnpm test:watch` → `vitest`
  - `pnpm lint` → `tsc -b` (type-check only — see gap below)
- Node `>=20` required (`package.json` `engines`).
- Each package is `"type": "module"` and uses TypeScript project references (`tsconfig.json` has `"references": [{ "path": "packages/core" }, { "path": "packages/infra" }]`).

---

## TypeScript Compiler Options

**Source of truth:** `tsconfig.base.json`
(`packages/core/tsconfig.json` and `packages/infra/tsconfig.json` extend it and add
`"composite": true` + `"rootDir": "src"` + `"include": ["src"]`).

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

Packages use **TypeScript Project References** — `packages/infra/tsconfig.json` declares
`"references": [{ "path": "../core" }]`, so `tsc -b` at the root incrementally builds
core before infra and enforces the dependency direction at the type-graph level.

---

## Import Conventions

**Observed (hard rules from `verbatimModuleSyntax` + NodeNext):**

1. **Every relative import ends in `.js`**, even though sources are `.ts`. Example from
   `packages/core/src/services/remember-service.ts`:
   ```ts
   import { VerbatimEntry } from '../domain/verbatim-entry.js';
   import { ContentEmptyError, SanitizationBlockedError } from '../domain/errors.js';
   import type { IFileStore } from '../ports/file-store.js';
   import type { IVerbatimStore } from '../ports/verbatim-store.js';
   import type { SanitizationService } from './sanitization-service.js';
   ```
2. **Type-only imports use `import type`**, value imports use plain `import`. Mixed
   imports use `import { X, type Y }`. This is enforced by `verbatimModuleSyntax`.
3. **Cross-package imports go through the package name**, not relative paths. Infra
   code imports core as `@llm-wiki/core` (see `packages/infra/src/fs-file-store.ts`,
   `packages/infra/src/ai-sdk-llm-client.ts`, every infra test). Relative
   `../../core/...` paths are not used.
4. **Infra integration tests import services from `@llm-wiki/core`** and adapters from
   `../../src/index.js` (see `packages/infra/tests/integration/ingest-e2e.test.ts`:16).
5. **Path aliases**: `packages/infra/vitest.config.ts` maps `@llm-wiki/core` →
   `../core/src/index.ts` and `@llm-wiki/infra` → `./src/index.ts` so tests resolve
   against TypeScript sources without needing a pre-build.

**Import ordering (observed, not enforced by tooling):**
1. Node built-ins (`node:fs/promises`, `node:path`, `node:os`, `node:child_process`)
2. Third-party packages (`vitest`, `ai/test`, `gray-matter`, `re2`)
3. Workspace packages (`@llm-wiki/core`, `@llm-wiki/infra`)
4. Relative imports, grouped by depth, value imports before type imports

Ordering is consistent across the codebase but is **not** enforced by a linter.

---

## Directory & File Naming

**Observed:**

| Layer | Directory | File names |
|-------|-----------|------------|
| Domain | `packages/core/src/domain/` | kebab-case: `wiki-page.ts`, `verbatim-entry.ts`, `sanitization-result.ts`, `runtime-state.ts`, `errors.ts` |
| Ports | `packages/core/src/ports/` | kebab-case, one port per file: `file-store.ts`, `search-engine.ts`, `llm-client.ts`, `embedding-client.ts`, `source-reader.ts`, `state-store.ts`, `verbatim-store.ts`, `version-control.ts`, `project-resolver.ts` |
| Services | `packages/core/src/services/` | kebab-case with `-service` suffix: `ingest-service.ts`, `remember-service.ts`, `query-service.ts`, `recall-service.ts`, `sanitization-service.ts`, `status-service.ts` |
| Infra adapters | `packages/infra/src/` | kebab-case, `<backing-tech>-<port>`: `fs-file-store.ts`, `fs-verbatim-store.ts`, `git-project-resolver.ts`, `git-version-control.ts`, `ruvector-search-engine.ts`, `ai-sdk-llm-client.ts`, `ai-sdk-embedding-client.ts`, `yaml-state-store.ts`, `http-source-reader.ts`, `fs-source-reader.ts`, `composite-source-reader.ts`, `config-loader.ts` |
| Core tests | `packages/core/tests/{domain,services}/` | Co-named with the unit under test: `wiki-page.test.ts`, `ingest-service.test.ts`, … |
| Infra tests | `packages/infra/tests/` (flat) + `tests/integration/` | `<adapter>.test.ts` for unit-level, `<flow>-e2e.test.ts` / `<flow>.test.ts` for integration |

**Barrel files** exist only at package and sub-package level:
- `packages/core/src/index.ts` re-exports everything from `./domain`, `./ports`, `./services`.
- `packages/core/src/domain/index.ts`, `ports/index.ts`, `services/index.ts` re-export named members and explicit `export type { … }` for interfaces.
- `packages/infra/src/index.ts` re-exports each adapter by name. One public type
  (`WikiConfig`) is re-exported with `export type`.

---

## TypeScript Code Style

**Interfaces vs classes:**
- **Ports** (`packages/core/src/ports/*.ts`) are `interface` declarations prefixed with
  `I` (`IFileStore`, `IVerbatimStore`, `IStateStore`, `IVersionControl`, `ILlmClient`,
  `IEmbeddingClient`, `ISourceReader`, `ISearchEngine`, `IProjectResolver`).
  Associated value types (`FileInfo`, `SearchQuery`, `IndexEntry`, `WorktreeInfo`,
  `SourceContent`, `LlmCompletionRequest/Response`) are plain `interface` without
  the `I` prefix.
- **Domain entities** (`WikiPage`, `VerbatimEntry`, `Project`, `SanitizationResult`,
  `SearchResult`) are `class` with a **private constructor** plus static factory
  methods (`static fromParsedData(...)`, `static create(...)`). Example:
  `packages/core/src/domain/wiki-page.ts:17` — `private constructor(public readonly ...)`.
- **Services** are `class` with a public constructor that takes ports as
  `private readonly` parameters (parameter-property DI). See every file in
  `packages/core/src/services/`.

**Immutability:**
- Domain entities expose **only `public readonly`** fields. Mutation happens via
  factory methods that return new instances, or via `toData()` → re-parse.
- Service dependencies are also `private readonly`.

**Nullability:**
- Missing file / missing record returns `null` rather than throwing (`IFileStore.readFile`
  docstring: *"Returns null if not found."*). Callers check for `null` explicitly.
- Error cases use typed exceptions (see below), never sentinel return values.

**Function design:**
- Services have one public entry-point method per use case; everything else is
  `private`. Example: `IngestService.ingest()` + private `extractPages`,
  `validateTargetPath`, `renderPageBody`, `yamlString`, `stripCodeFence`,
  `safeRemoveWorktree`.
- Arguments are passed as a single request-object interface (`RememberFactRequest`,
  `IngestRequest`, `RememberSessionRequest`), and results are typed response interfaces
  (`RememberFactResponse`, `IngestResponse`). This keeps signatures stable when
  fields are added.

**Async:**
- Every I/O path is `async` / `Promise<T>`. Sync APIs (`execSync`) appear **only in
  integration tests** to script git setup, never in production code.

---

## Error Handling

**Observed (stated in `RULES.md` *"Fail Fast"*, implemented in
`packages/core/src/domain/errors.ts`):**

- Single root class `WikiError extends Error` with a machine-readable `code`.
- One subclass per failure mode, each hard-codes its own `code` constant:
  `CONTENT_EMPTY`, `SANITIZATION_BLOCKED`, `WIKI_NOT_INITIALIZED`, `WIKI_EMPTY`,
  `PATH_ESCAPE`, `INVALID_IDENTIFIER`, `INVALID_PATTERN`, `SEARCH_EMPTY`,
  `LLM_UNAVAILABLE`, `GIT_CONFLICT`, `SOURCE_NOT_FOUND`, `SOURCE_PARSE_ERROR`,
  `INGEST_PATH_VIOLATION`.
- Error subclasses carry **typed context fields**: e.g. `PathEscapeError.attemptedPath`,
  `SanitizationBlockedError.redactedRatio`, `GitConflictError.worktreePath`,
  `IngestPathViolationError.attemptedPath` + `reason`.
- Services **validate inputs on entry** and throw domain errors before any I/O:
  `RememberService.rememberFact` throws `ContentEmptyError` on empty content;
  `IngestService.ingest` enforces `MAX_SOURCE_TOKENS = 100_000` **before** creating
  a worktree (`packages/core/src/services/ingest-service.ts:82`).
- **Adapter errors are wrapped, not leaked.** `AiSdkLlmClient` catches the raw AI
  SDK error and rethrows `LlmUnavailableError(message)` so the service layer never
  imports a vendor error type
  (`packages/infra/tests/ai-sdk-llm-client.test.ts:38-49` pins this contract).
- **Compensating actions on failure.** On LLM failure or path-validation failure
  inside `IngestService.ingest`, the worktree is force-removed and the state store
  is left untouched (`ingest-service.ts:96-102`, pinned by
  `test_ingest_llmFails_worktreeDiscarded_mainBranchUntouched_stateUnchanged` and
  `test_ingest_rejectsMaliciousPath_*`). Merge conflicts are the exception:
  the worktree is **preserved** for manual recovery.
- **No `console.*` calls in production code.** `grep -r 'console.(log|warn|error)'
  packages/**/src` returns zero matches. Logging is not a concern of core/infra
  today — see CONCERNS.md for the gap.

---

## Dependency Injection Style

**Observed:**
- **Pure constructor injection.** Every service class takes its ports as ordered
  parameter properties:
  ```ts
  // packages/core/src/services/remember-service.ts:34
  export class RememberService {
    constructor(
      private readonly fileStore: IFileStore,
      private readonly verbatimStore: IVerbatimStore,
      private readonly sanitizer: SanitizationService,
    ) {}
    …
  }
  ```
- **No DI container.** Wiring lives at the composition root (expected to be the
  MCP server / CLI entry point; not yet present in the repo).
- **Factory ports where root is per-call.** `FileStoreFactory = (rootDir: string)
  => IFileStore` is injected into `IngestService` so the service can create a
  second `IFileStore` scoped to a git worktree path without knowing about
  `FsFileStore` (`packages/core/src/ports/file-store.ts:27`).
- **`SanitizationService` is the one exception** — services take it as a concrete
  class, not as an interface, because it has no port. The class is final and its
  constructor takes a plain `SanitizationConfig` value object.

---

## Domain Layer Dependency Budget

**Stated (`RULES.md` §Clean Architecture):** *Domain = 0 external dependencies*.

**Observed:** Exactly **one** non-stdlib import lives in `packages/core/src`:

```
packages/core/src/services/sanitization-service.ts:1: import RE2 from 're2';
```

`re2` is pulled in deliberately as defense-in-depth against catastrophic
backtracking in user-supplied patterns (`MAX_CUSTOM_PATTERN_LENGTH = 512` plus a
wrapping `try/catch` that throws `InvalidPatternError`). The rest of core imports
only its own relative files. Every port and domain entity has zero runtime
dependencies.

**Nuance:** `SanitizationService` arguably belongs to the application layer, not
the pure domain. It is co-located under `src/services/` (application use cases),
so the "domain has zero deps" invariant is preserved if you read `domain/` as the
pure layer and `services/` as the application layer. See CONCERNS.md for whether
this layering split should be made explicit in directory names.

---

## Module Exports

**Observed:**
- Public API of each package is defined **only** in its barrel `index.ts`.
- Internal files use **named exports** only — no `export default` appears in any
  `src/` file (searched). `ai-sdk-llm-client.ts` uses `import RE2 from 're2'`
  because `re2`'s own shipped types use a default export; that is the single
  default import in the codebase.
- Interfaces and classes are exported by name; types with no runtime
  representation are re-exported as `export type { X }` to satisfy
  `verbatimModuleSyntax`. Example: `packages/core/src/domain/index.ts:2` —
  `export type { WikiPageFrontmatter, WikiPageData } from './wiki-page.js';`

---

## Comments & Documentation

**Observed:**
- **JSDoc on every port method** describing contract, return semantics, and
  null / error behavior. Example: `packages/core/src/ports/file-store.ts:8-21`
  — each method has a one-line `/** … */` block.
- **Long-form block comments on service entry points** (`IngestService.ingest`
  at lines 43-67) explain the orchestration and every error path.
- **Inline comments justify invariants**, e.g. `ingest-service.ts:215-218`
  explains *why* `validateTargetPath` must run before any filesystem write.
- **Tests include `(INV-N)` tags** in their names to link back to the spec's
  invariant table: `test_rememberSession_duplicateSessionId_returnsExisting (INV-8)`,
  `test_ingest_success_pagesCreated_worktreeCleaned_stateUpdated (INV-13)`.
- `// eslint-disable-next-line` is used once in the whole codebase
  (`packages/infra/tests/ai-sdk-llm-client.test.ts:52`) despite no ESLint being
  configured — carried over from a previous state or anticipating future lint.

---

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

---

## Gaps

1. **No ESLint, Prettier, or Biome configuration exists.** The `pnpm lint` script
   is aliased to `tsc -b` (type-check only). `grep` for `eslint|prettier|biome`
   in the root finds no config files, yet `packages/infra/tests/ai-sdk-llm-client.test.ts:52`
   contains `// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
   implying either a past ESLint setup or an anticipated one. **Style is enforced
   by convention alone.**
2. **No `.githooks/pre-commit` directory.** The global rule in `~/.claude/CLAUDE.md`
   *"every git repo MUST have a pre-commit hook"* is not yet satisfied.
   `git config core.hooksPath` is not set.
3. **No coverage tooling.** `@vitest/coverage-v8` (or `-istanbul`) is not listed in
   any `package.json`. The 85% / 95% / 70% targets in `RULES.md` cannot be
   measured today.
4. **`verbatimModuleSyntax` is strict**, but there is no automated enforcement that
   imports are sorted / grouped. New code should follow the observed 4-group order
   (node → third-party → workspace → relative).
5. **One service file exceeds the 300-line SRP threshold** (`ingest-service.ts` at
   346 lines). It is dense and well-documented, but it combines orchestration,
   path validation, YAML rendering, and LLM-response parsing. Candidate for
   extraction. Tracked in CONCERNS.md.
6. **`IVersionControl` has 7 methods**, over the ISP ≤5 budget (`commit`,
   `hasUncommittedChanges`, `createWorktree`, `removeWorktree`, `squashWorktree`,
   `mergeWorktree`, `commitInWorktree`). Splitting into `ICommitLog` +
   `IWorktreeManager` would bring it in line. Tracked in CONCERNS.md.
7. **No project-level logging convention.** Zero `console.*` calls exist. When
   logging is eventually needed, a port (`ILogger`) should be added rather than
   pulling in a framework directly from services.
8. **`it.each` is underused.** Only `ingest-service.test.ts` uses it. Any test
   file with more than two copy-pasted cases (e.g., path-traversal branches in
   `fs-file-store.test.ts`, status codes in `http-source-reader.test.ts`) is
   a candidate for parametrization per `RULES.md` §Test Writing Rules.

---

*Conventions analysis: 2026-04-10*
