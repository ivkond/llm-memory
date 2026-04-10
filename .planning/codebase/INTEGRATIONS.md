# External Integrations

**Analysis Date:** 2026-04-10

## Overview

llm-memory is a **file-first, local-first** knowledge base for LLM agents. There is no remote backend, no managed database, and no cloud-hosted service the app talks to of its own accord. The only network calls made by the library itself are:

1. **LLM / embedding API calls** via the Vercel AI SDK (OpenAI by default, pluggable).
2. **HTTP(S) ingestion of user-supplied URLs** via `HttpSourceReader`, used to pull source material into the wiki.
3. **Git operations**, all local to the on-disk wiki repo (no `git push` from inside the library).

Everything else — search, persistence, state, verbatim logs — lives on the local filesystem inside a single wiki root directory (default `~/.llm-wiki`).

## APIs & External Services

### LLM Provider (pluggable via Vercel AI SDK)

- **Service:** OpenAI Chat Completions (default). Any AI SDK-compatible provider is acceptable because the adapter accepts a generic `LanguageModel` at construction time.
- **SDK / client:** `ai` `^5.0.172` + `@ai-sdk/openai` `^1.3.24`
- **Adapter:** `packages/infra/src/ai-sdk-llm-client.ts` (`AiSdkLlmClient` implements `ILlmClient`)
- **Entry point:** `generateText({ model, system, messages, maxOutputTokens, temperature })`
- **Default model:** `gpt-4o-mini` (from `ConfigLoader` defaults)
- **Auth:** environment variable `LLM_WIKI_LLM_API_KEY` (merged into config as `llm.api_key`) or standard provider env vars (e.g. `OPENAI_API_KEY`) picked up by `@ai-sdk/openai` itself.
- **Base URL override:** `LLM_WIKI_LLM_BASE_URL` / `llm.base_url` — allows self-hosted OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, Together, Groq, etc.).
- **Error translation:** any provider-side failure is rethrown as the domain-level `LlmUnavailableError` so `QueryService` can degrade gracefully to raw search results (invariant INV-3).

### Embedding Provider (pluggable via Vercel AI SDK)

- **Service:** OpenAI Embeddings (default). Like the LLM client, the adapter accepts any AI SDK `EmbeddingModel<string>`.
- **SDK / client:** `ai` `^5.0.172` + `@ai-sdk/openai` `^1.3.24`
- **Adapter:** `packages/infra/src/ai-sdk-embedding-client.ts` (`AiSdkEmbeddingClient` implements `IEmbeddingClient`)
- **Entry point:** `embedMany({ model, values })`
- **Default model:** `text-embedding-3-small`
- **Dimensionality:** passed explicitly to the adapter constructor (AI SDK does not expose it on the model interface). The `RuVectorSearchEngine` uses `embeddingClient.dimensions()` to size its HNSW index at first-use.
- **Auth / base URL:** `LLM_WIKI_EMBEDDING_API_KEY` / `LLM_WIKI_EMBEDDING_BASE_URL`, merged into config as `embedding.api_key` / `embedding.base_url`.

### HTTP(S) Ingestion (user-supplied URLs)

- **Use case:** `wiki_ingest` pulls source material from `http://` / `https://` URLs the user feeds the tool.
- **Adapter:** `packages/infra/src/http-source-reader.ts` (`HttpSourceReader` implements `ISourceReader`)
- **Transport:** global `fetch` (`globalThis.fetch`, overridable via `options.fetchImpl` for tests).
- **Dispatcher:** `packages/infra/src/composite-source-reader.ts` routes `http://`/`https://` to the HTTP reader, `file://` and bare paths to `FsSourceReader`, and rejects any other URI scheme (`ftp://`, `s3://`, ...) with `SourceParseError`.
- **Security hardening** (all enforced in `HttpSourceReader`):
  - Scheme allowlist: only `http:` / `https:`.
  - Hostname blocklist: `localhost`, `localhost.localdomain`, `metadata.google.internal`, `instance-data`, `instance-data.ec2.internal`.
  - IP blocklist via `node:net` `BlockList`: RFC1918 private ranges, loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16` — includes AWS/GCP IMDS `169.254.169.254`), unique-local IPv6 (`fc00::/7`), link-local IPv6 (`fe80::/10`), CGNAT (`100.64.0.0/10`), unspecified (`0.0.0.0/8`, `::`).
  - DNS lookup via `node:dns/promises` `lookup({ all: true, verbatim: true })` — every resolved address is checked against the blocklist. Literal IPs skip DNS and are checked directly. DNS lookup fn is injectable for tests.
  - Request timeout: 30 s default (`AbortController`).
  - Max body size: 2 MiB default, enforced by streaming + byte counting on `response.body.getReader()`.
  - Max redirect hops: 3 default. `redirect: 'manual'` on every `fetch` so the SSRF host check is **re-run on every hop** — a public domain cannot redirect to `127.0.0.1` or the cloud metadata IP.
  - 404 → `SourceNotFoundError`; any other non-2xx → `SourceParseError`.
- **Outgoing User-Agent / headers:** whatever `globalThis.fetch` sends by default — no custom headers added.

## Data Storage

### Primary storage: the wiki root directory

Everything the library persists lives under a single root directory (default `~/.llm-wiki`, overridable via `LLM_WIKI_PATH` / `wiki.path`). This directory is expected to be a **git repository** owned by the user. Layout (per the design spec and the adapters):

```
<wiki-root>/
  schema.md                     # meta-prompt / structuring rules
  index.md                      # auto-generated catalog
  log.md                        # append-only operation journal
  wiki/                         # consolidated knowledge (shared across projects)
    concepts/  tools/  patterns/  decisions/
  projects/
    <project-name>/
      _config.md                # git_remote, name, metadata (YAML frontmatter)
      architecture.md  quirks.md  practices.md
  log/                          # per-agent verbatim layer
    <agent>/
      raw/                      # unconsolidated entries, one file each
        <date>-<session>-<uuid>.md
  .config/
    settings.shared.yaml        # committed config
  .local/                       # git-ignored, operational state
    settings.local.yaml
    state.yaml                  # WikiRuntimeState
    search.db/                  # default search index directory
      vectors.db                # ruvector HNSW file
      bm25.json                 # minisearch sparse index
```

**Filesystem adapters:**
- `FsFileStore` (`packages/infra/src/fs-file-store.ts`) — the only adapter that touches wiki markdown files. Enforces a path-escape guard (`resolveSafePath` — lexical `..` / absolute-path / sibling-prefix rejection via `PathEscapeError`) **and** a symlink-aware guard (`assertUnderRoot` — resolves through `realpath` and re-checks the prefix, so a symlink planted inside the wiki that points outside is refused). Symlinks are skipped entirely during `listFiles` directory walks. The canonical wiki-root realpath is cached per instance so the real root may itself be a symlink (e.g. `~/.llm-wiki` → `/data/wiki`).
- `FsVerbatimStore` (`packages/infra/src/fs-verbatim-store.ts`) — writes verbatim entries to `log/<agent>/raw/*.md`, parses `consolidated: bool` frontmatter with `gray-matter`.
- `YamlStateStore` (`packages/infra/src/yaml-state-store.ts`) — serialises `WikiRuntimeState` to `.local/state.yaml`. Chained-promise mutex for concurrent `update()` calls; routes through `IFileStore` to reuse the path-escape guards.
- `ConfigLoader` (`packages/infra/src/config-loader.ts`) — merges `DEFAULTS` ← `.config/settings.shared.yaml` ← `.local/settings.local.yaml` ← environment variables (deep-merge, last writer wins).

### Search index (hybrid, local)

- **Service:** none. The index is embedded in the process — there is no external Elasticsearch / OpenSearch / Pinecone / Weaviate / Qdrant.
- **Adapter:** `packages/infra/src/ruvector-search-engine.ts` (`RuVectorSearchEngine` implements `ISearchEngine`)
- **Dense half:** `ruvector` `^0.2.22` — Rust HNSW vector DB via N-API. Persisted to `<dbPath>/vectors.db`. Dimensions taken from `embeddingClient.dimensions()`.
- **Sparse half:** `minisearch` `^7.2.0` — pure-JS BM25 index. Persisted to `<dbPath>/bm25.json` via atomic `writeFile('<path>.tmp') + rename('<path>.tmp', '<path>')`. Wrapped in a v1 file schema (`{ version: 1, index, lastIndexedAt }`) to enable future on-disk migrations.
- **Fusion:** Reciprocal Rank Fusion (RRF) with `k=60`, performed in-process. The dense and sparse halves each contribute `1/(k+rank)`; the result is normalised into `[0, 1]` against the top score before being returned as `SearchResult[]`.
- **Concurrency:** init is one-shot (shared in-flight promise so concurrent first-callers see a single open); mutations (`index`, `remove`, `rebuild`) are serialised through a chained-promise write mutex; reads only await init. Cross-process coordination is explicitly out of scope — the adapter assumes a single-writer wiki root (CLI **or** MCP server, not both concurrently).

### File storage for source material

- **Service:** none. All ingested source material is either already on the local filesystem or fetched once via `HttpSourceReader` and written into the wiki as a markdown page.
- **MIME detection:** `FsSourceReader` uses extension-based detection (`.md`/`.markdown` → `text/markdown`, `.html`/`.htm` → `text/html`, `.json` → `application/json`, everything else → `text/plain`). `HttpSourceReader` takes the `Content-Type` header and strips the charset parameter.

### Caching

- **Service:** none. No Redis, no in-memory cache beyond the adapters' lazily-initialised singletons (`RuVectorSearchEngine.init()` caches the open DB; `FsFileStore` caches the canonical root realpath).

## Authentication & Identity

- **Service:** none. The library has no user accounts, no session management, and no OAuth flow.
- The only credentials the library handles are **LLM / embedding provider API keys**, read from environment variables and merged into the config object. They are never persisted outside whatever env-var store the user runs the process under, and are never logged.

## Version Control

- **Service:** local `git` CLI via `simple-git` `^3.27.0`.
- **Adapter:** `packages/infra/src/git-version-control.ts` (`GitVersionControl` implements `IVersionControl`).
- **Operations used:**
  - `git add <files>` + `git commit -m ... -- <files>`
  - `git status` (via `simpleGit.status()`)
  - `git worktree add -b <branch-name-timestamp> .worktrees/<name-timestamp> main`
  - `git worktree remove [--force] <path>`
  - `git reset --soft main` + `git commit -m` in the worktree (squash)
  - `git merge <branch> --ff-only` on main (with `CONFLICT` detection rethrown as `GitConflictError`)
  - `git rev-parse --abbrev-ref HEAD`, `git rev-parse HEAD`
- **Convention:** all ingest / lint work happens on a disposable worktree under `<wiki-root>/.worktrees/<name>-<timestamp>` branched from `main`. This preserves invariant INV-13: the main branch is never touched until a successful fast-forward merge. Conflicts leave the worktree in place so the caller can decide what to do.
- **Project resolution:** `packages/infra/src/git-project-resolver.ts` (`GitProjectResolver`) shells out directly via `node:child_process.execSync('git remote get-url origin', { cwd })` to identify the current project. It then scans `projects/*/\_config.md` frontmatter for a matching `git_remote` field (via `gray-matter`) to map the working directory to a project name. Falls back to `basename(cwd)` if no remote is configured but a matching `_config.md` exists.
- The library **never pushes** — `git push` / `git fetch` / `git pull` are not in the adapter surface. Sync with remote git hosts (GitHub, GitLab, etc.) is entirely the user's responsibility.

## Monitoring & Observability

- **Error tracking:** none configured. No Sentry, no Datadog, no Honeycomb. Errors propagate as typed domain errors (`LlmUnavailableError`, `GitConflictError`, `PathEscapeError`, `SourceNotFoundError`, `SourceParseError`, `SanitizationBlockedError`, etc.) and the caller decides how to surface them.
- **Logs:** no logging framework is wired up. There are no `console.log` / `console.error` calls in the adapter or service layer. Operational history is captured in the wiki's own `log.md` (append-only) and `.local/state.yaml`, which are the user-facing audit trail.
- **Metrics:** none.
- **Tracing:** none.

## CI/CD & Deployment

- **Hosting:** none. This is a library monorepo; nothing is deployed.
- **CI pipeline:** not detected. No `.github/workflows/` directory present at the repo root; no `.circleci/`, no `.gitlab-ci.yml`, no `azure-pipelines.yml`, no Jenkinsfile.
- **Release / publish:** no release tooling (`changesets`, `semantic-release`, `release-please`, etc.) configured. Both workspace packages are at version `0.1.0` and are not currently published to npm.
- **Container / orchestration:** no `Dockerfile`, no `docker-compose.yml`, no `k8s/`, no Terraform.

## Environment Configuration

**Required env vars (for live operation against real providers):**
- `LLM_WIKI_LLM_API_KEY` — LLM provider API key, or rely on the provider SDK's own default env var (`OPENAI_API_KEY` for `@ai-sdk/openai`).
- `LLM_WIKI_EMBEDDING_API_KEY` — embedding provider API key (same fallback behaviour).

**Optional env vars (overrides):**
- `LLM_WIKI_PATH` — wiki root directory (default `~/.llm-wiki`)
- `LLM_WIKI_LLM_MODEL` — defaults to `gpt-4o-mini`
- `LLM_WIKI_LLM_BASE_URL` — for self-hosted OpenAI-compatible endpoints
- `LLM_WIKI_EMBEDDING_MODEL` — defaults to `text-embedding-3-small`
- `LLM_WIKI_EMBEDDING_BASE_URL`

**Secrets location:** whatever shell / process manager / OS keychain the user chooses. The repo contains **no** `.env` files and `.env*` is not written to by any adapter. `.local/` is gitignored so user-specific config in `settings.local.yaml` is never committed.

## Webhooks & Callbacks

- **Incoming:** none. The library is not a server. Milestone 4 will add `@llm-wiki/mcp-server` with stdio + HTTP MCP transport, but it is not yet present in the codebase.
- **Outgoing:** none other than the LLM / embedding / source-ingest calls described above.

## MCP Servers

- The library is **designed** to be consumed by MCP clients (Claude Code, Cursor, Copilot, Codex, etc.) per the design spec — see `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`. The spec calls for seven MCP tools (`wiki_recall`, `wiki_remember`, `wiki_query`, `wiki_ingest`, `wiki_lint`, `wiki_import`, `wiki_status`) exposed through `@modelcontextprotocol/sdk`.
- **Current status:** no MCP server package exists yet. `@llm-wiki/mcp-server` is deferred to Milestone 4 per `docs/superpowers/plans/2026-04-10-milestone-3-lint-import-archive.md` ("No transport packages are built in this milestone"). The `@modelcontextprotocol/sdk` dependency is **not yet** in any `package.json`.
- The `@llm-wiki/core` service classes (`RecallService`, `RememberService`, `QueryService`, `IngestService`, `StatusService`, and the M3 `LintService` / `ImportService`) are the seams that MCP tool handlers will call into once the transport package exists.

## File Formats Consumed and Produced

**Consumed:**
- Markdown with YAML frontmatter (`gray-matter`) — wiki pages, verbatim entries, project configs.
- YAML — `.config/settings.shared.yaml`, `.local/settings.local.yaml`, `.local/state.yaml`.
- Arbitrary text for ingest — `.md`, `.html`, `.json`, and any other UTF-8 encodable content served over http(s) or readable from the local filesystem.

**Produced:**
- Markdown with YAML frontmatter — every wiki page and verbatim entry.
- YAML — `.local/state.yaml` (`WikiRuntimeState`), emitted with `sortKeys: true, noRefs: true`.
- JSON — `.local/search.db/bm25.json` (MiniSearch index, wrapped in `{ version: 1, index, lastIndexedAt }`, written atomically via tmp+rename).
- Binary — `.local/search.db/vectors.db` (ruvector HNSW file).

## Planned Integrations (not yet implemented)

Captured from `docs/superpowers/plans/2026-04-10-milestone-3-lint-import-archive.md` and `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`:

- **7-Zip CLI** via `node-7z` + bundled `7zip-bin` — planned for M3 `SevenZipArchiver` (`IArchiver` port). Will archive consolidated verbatim batches to `.archive/<YYYY-MM>-<agent>.7z`. Retention pruning deferred.
- **Claude Code native memory reader** — planned M3 `ClaudeCodeMemoryReader` (`IAgentMemoryReader` port). Will sweep Claude Code's on-disk memory store via `globby` and dedupe into verbatim entries. Other agents (Cursor, Codex, KiloCode, OpenCode, Qwen) use the same port but are deferred until after M4.
- **MCP server** (`@llm-wiki/mcp-server`) — M4. `@modelcontextprotocol/sdk` will be added then.
- **CLI** (`@llm-wiki/cli`) — M4. No CLI framework chosen yet in the spec.
- **Claude Code hooks / skill package** (`@llm-wiki/claude-code`) — M4. Session-start hook will auto-trigger `wiki_recall`; stop hook will auto-trigger `wiki_remember_session`.

---

*Integration audit: 2026-04-10*
