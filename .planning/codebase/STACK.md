# Technology Stack

**Analysis Date:** 2026-04-10

## Languages

**Primary:**
- TypeScript `^5.8.0` (resolved `5.9.3`) — all source under `packages/core/src/` and `packages/infra/src/`. Strict mode, ES2022 target, NodeNext module resolution, `verbatimModuleSyntax` enforced (see `tsconfig.base.json`).

**Secondary:**
- None. The repo is pure TypeScript. Config files (`pnpm-workspace.yaml`, `vitest.workspace.ts`, `tsconfig.*.json`) are YAML / TS / JSON only.

## Runtime

**Environment:**
- Node.js `>=20` — declared in root `package.json` `engines` field. `@types/node` dev dep pinned to `^22.0.0` (resolved `22.19.17`), so development and typings target the Node 22 API surface while allowing Node 20 at runtime.
- ES Modules only — every `package.json` sets `"type": "module"`. Infra code uses native `node:fs/promises`, `node:path`, `node:dns/promises`, `node:net`, `node:child_process`, `node:url`.

**Package Manager:**
- pnpm with workspaces (`pnpm-workspace.yaml` → `packages/*`).
- Lockfile: `pnpm-lock.yaml` (lockfile v9.0), committed.
- `allowBuilds` allowlist in `pnpm-workspace.yaml`: `esbuild`, `re2` — only these native builds are permitted during install.

## Frameworks

**Core application framework:**
- None. The project is a library monorepo (no web framework, no HTTP server framework, no CLI framework yet). Per `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`, transport layers (`@llm-wiki/mcp-server`, `@llm-wiki/cli`, `@llm-wiki/claude-code`) are deferred to Milestone 4 and not yet present on disk.

**Testing:**
- Vitest `^3.1.0` (resolved `3.2.4`) — runner, assertion library, and mocking framework. Workspace mode via `vitest.workspace.ts` (references `packages/core` and `packages/infra`). Each package has its own `vitest.config.ts` with `globals: true` and `include: ['tests/**/*.test.ts']`. `packages/infra/vitest.config.ts` aliases `@llm-wiki/core` and `@llm-wiki/infra` to their `src/index.ts` so tests run against unbuilt source.
- MSW `^2.13.2` (resolved `2.13.2`) — HTTP mocking for `HttpSourceReader` tests (dev dep of `@llm-wiki/infra` only).

**Build:**
- TypeScript project references (`tsc -b`) — root `tsconfig.json` references `packages/core` and `packages/infra`; `packages/infra/tsconfig.json` references `../core`. Both package tsconfigs set `composite: true`, `outDir: dist`, `rootDir: src`. Root `npm run build` = `tsc -b`; root `npm run lint` is currently aliased to `tsc -b` as well (pure type-check; no ESLint/Prettier configured yet).

## Key Dependencies

### `@llm-wiki/core` (`packages/core/package.json`)

Runtime:
- `re2` `^1.24.0` (resolved `1.24.0`) — Google RE2 regex engine bindings. Used by the domain sanitization layer to guarantee linear-time pattern matching on untrusted input (avoids ReDoS on custom patterns from config).

Dev:
- `typescript` `^5.8.0`

The core package is otherwise **zero-dependency**. This is a Clean Architecture invariant: domain and application layers depend on nothing from `node_modules` besides `re2` (chosen specifically for the ReDoS guarantee that no pure-JS regex lib offers).

### `@llm-wiki/infra` (`packages/infra/package.json`)

Runtime:
- `@ai-sdk/openai` `^1.3.24` (resolved `1.3.24`) — OpenAI provider for the Vercel AI SDK. Used by `AiSdkLlmClient` and `AiSdkEmbeddingClient` as the default provider; the adapters accept any `LanguageModel` / `EmbeddingModel<string>` so providers are swappable without code changes.
- `ai` `^5.0.172` (resolved `5.0.172`) — Vercel AI SDK v5. `generateText()` backs `AiSdkLlmClient.complete()`; `embedMany()` backs `AiSdkEmbeddingClient.embed()`. AI SDK v5 surfaces `usage.inputTokens` / `usage.outputTokens` directly.
- `ruvector` `^0.2.22` (resolved `0.2.22`) — Rust-native embedded vector DB (HNSW) with Node N-API bindings. Provides the dense half of hybrid search in `RuVectorSearchEngine`. Persists to a single file at `<dbPath>/vectors.db`. Platform-specific optional binaries are pulled in via `@ruvector/rvf-node-*` sub-packages for darwin-arm64/x64, linux-arm64/x64 (gnu), and win32-x64 (msvc).
- `minisearch` `^7.2.0` (resolved `7.2.0`) — in-process BM25 / sparse text index. Provides the sparse half of hybrid search in `RuVectorSearchEngine`; persisted to `<dbPath>/bm25.json` with atomic `writeFile`+`rename` and a version-1 wrapper schema.
- `simple-git` `^3.27.0` (resolved `3.35.2`) — `IVersionControl` adapter (`GitVersionControl`). Handles commit, status, `worktree add -b`, `worktree remove`, `reset --soft main` squash, `merge --ff-only`. `GitProjectResolver` also shells out directly via `node:child_process execSync` for `git remote get-url origin`.
- `gray-matter` `^4.0.3` (resolved `4.0.3`) — YAML frontmatter parser/serializer for wiki markdown files (`FsFileStore.readWikiPage`, `FsVerbatimStore.writeEntry`, `GitProjectResolver.resolve`).
- `js-yaml` `^4.1.0` (resolved `4.1.1`) — YAML load/dump for `ConfigLoader` (`settings.shared.yaml` + `settings.local.yaml`) and `YamlStateStore` (`.local/state.yaml`).

Workspace:
- `@llm-wiki/core` `workspace:*` — linked to `../core`.

Dev:
- `@types/js-yaml` `^4.0.9`
- `msw` `^2.13.2`
- `typescript` `^5.8.0`

**Critical:** The `LanguageModel` and `EmbeddingModel<string>` abstractions from `ai` are what keep the AI SDK provider pluggable. Tests inject mock models; production composition code picks `@ai-sdk/openai` or any other provider package without touching the adapter classes.

**Infrastructure:** All persistence is file-based under a wiki root directory. There is no relational DB, no remote cache, no message broker. See `INTEGRATIONS.md` for the full storage picture.

## Configuration

**Environment variables** (read by `packages/infra/src/config-loader.ts`):
- `LLM_WIKI_PATH` — overrides `wiki.path`
- `LLM_WIKI_LLM_API_KEY`, `LLM_WIKI_LLM_MODEL`, `LLM_WIKI_LLM_BASE_URL`
- `LLM_WIKI_EMBEDDING_API_KEY`, `LLM_WIKI_EMBEDDING_MODEL`, `LLM_WIKI_EMBEDDING_BASE_URL`

Env overrides sit on top of `.config/settings.shared.yaml` (committed) and `.local/settings.local.yaml` (git-ignored), which sit on top of `DEFAULTS` hard-coded in `ConfigLoader`. Defaults: LLM provider `openai` model `gpt-4o-mini`; embedding provider `openai` model `text-embedding-3-small`; search db `.local/search.db`.

**Build/Type configuration:**
- `tsconfig.base.json` — shared compiler options (ES2022, NodeNext, strict, declaration, declarationMap, sourceMap, isolatedModules, verbatimModuleSyntax).
- `tsconfig.json` — solution file, references both packages.
- `packages/core/tsconfig.json`, `packages/infra/tsconfig.json` — per-package composite builds.

**Test configuration:**
- `vitest.workspace.ts` at repo root.
- `packages/core/vitest.config.ts`, `packages/infra/vitest.config.ts` — per-package configs. Infra adds source-path aliases for `@llm-wiki/core` and `@llm-wiki/infra` so tests hit TypeScript source, not `dist/`.

**Linters / formatters / type checkers:**
- **Type checking:** `tsc -b` (via `pnpm lint` and `pnpm build`). Strict TypeScript is the only enforced static analysis today.
- **ESLint:** not configured. No `.eslintrc*` / `eslint.config.*` present.
- **Prettier:** not configured. No `.prettierrc*` present.
- **Biome / other:** not configured.
- **Pre-commit hook:** not present. The project-level guideline in `CLAUDE.md` / `RULES.md` calls for one, but `.githooks/` does not exist yet and `git config core.hooksPath` is unset.

**Ignored paths** (`.gitignore`): `.ai`, `.uv-cache`, `node_modules`, `dist`, `*.tsbuildinfo`, `.local/`, `conversation.txt`, `.claude/settings.json`, `.claude/settings.local.json`, `.claude/projects/`.

## Platform Requirements

**Development:**
- Node.js 20+ (22 recommended — matches `@types/node`).
- pnpm (version implied by lockfile v9.0 → pnpm 9.x or 10.x).
- Git CLI on `PATH` — `GitVersionControl` and `GitProjectResolver` both shell out to `git`. `git worktree add -b` / `worktree remove` / `merge --ff-only` must all be available.
- A supported native platform for `ruvector` prebuilt binaries: darwin-arm64, darwin-x64, linux-arm64-gnu, linux-x64-gnu, or win32-x64-msvc. Musl-libc Linux is not in the `rvf-node` prebuild set.
- A supported native platform for `re2` prebuilds (same four-plus-Windows matrix typical for N-API modules).

**Production:**
- Library package only — no deployment target yet. Milestone 4 (per `docs/superpowers/plans/2026-04-10-milestone-3-lint-import-archive.md`) will add `@llm-wiki/mcp-server` (stdio + HTTP MCP transport) and `@llm-wiki/cli`, at which point the runtime targets are "local workstation" (CLI + MCP over stdio for Claude Code) rather than a server host.

## Milestone Status

- **M1** (complete): domain + ports + adapters (`FsFileStore`, `FsVerbatimStore`, `GitProjectResolver`, `ConfigLoader`, `RememberService`, `RecallService`, `SanitizationService`).
- **M2** (complete): hybrid search, query, ingest, status (`RuVectorSearchEngine`, `AiSdkLlmClient`, `AiSdkEmbeddingClient`, `GitVersionControl`, `FsSourceReader`, `HttpSourceReader`, `CompositeSourceReader`, `YamlStateStore`, `IngestService`, `QueryService`, `StatusService`).
- **M3** (current branch `claude/milestone-3-lint-import-archiver`): Lint / Import / Archive services. The plan (`docs/superpowers/plans/2026-04-10-milestone-3-lint-import-archive.md`) calls for three additional infra deps not yet in `package.json`:
  - `node-7z` — async wrapper over the 7-Zip CLI
  - `7zip-bin` — statically linked 7z binary so tests don't need a system install
  - `globby` — glob expansion for agent memory paths

---

*Stack analysis: 2026-04-10*
