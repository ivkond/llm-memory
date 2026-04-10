# Codebase Concerns

**Analysis Date:** 2026-04-10
**Scope:** Whole repo (root + `packages/core` + `packages/infra`), branch `claude/milestone-3-lint-import-archiver`.
**Baseline:** M1 (foundation) + M2 (search/query/ingest) merged. M3 (Lint/Import/Archive) not yet started on disk — only the planning document exists.
**Signal strength:** Everything below was read directly from the files listed. "Inference" markers flag anything that is a judgment call rather than a fact from the code.

Overall impression: **the shipped code is in good shape**. Clean Architecture is actually respected (Domain/Application has zero upward imports from infra; confirmed by grep), error handling is consistent, path-escape / SSRF / concurrency hazards have already been thought about in depth, and tests are present for every service and adapter. The concerns below are mostly *process* gaps (no linter, no hook, no CI) and a few small *code smells* that will matter as M3 lands.

---

## Critical

### C-1. Project has no linter, no formatter, no pre-commit hook — violates stated rules

**Facts:**
- `package.json:6-11` defines `"lint": "tsc -b"` — i.e. `lint` is an alias for typecheck, not a real linter run.
- No `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `biome.json`, `.editorconfig` exist at the repo root or in either package.
- No `.githooks/` directory exists. `git config core.hooksPath` not set in repo (no `.githooks`).
- No `.github/workflows/`, no `.gitlab-ci.yml`, no `.circleci/` — no CI at all.
- `packages/infra/tests/ai-sdk-llm-client.test.ts:52` contains `// eslint-disable-next-line @typescript-eslint/no-explicit-any`, which is dead code (ESLint is not installed).

**Why this matters:**
- `~/.claude/CLAUDE.md` — "every git repo MUST have a pre-commit hook … that runs the project's static analysis tools". This rule is currently violated.
- `RULES.md:86` — "Static: type checking, linting — always, on every commit". Not satisfied.
- Milestone 3 is named `claude/milestone-3-lint-import-archiver`; merging lint+import+archive work (the plan adds ~4672 lines of feature code) without any automated style/lint guard will bake in drift.

**Impact:** HIGH. Drift in formatting and unsafe-patterns will accumulate through M3 and M4.

**Fix approach:** Add ESLint flat config (`eslint.config.js`) or Biome with TypeScript + import-order + no-floating-promises + no-explicit-any rules. Add `.githooks/pre-commit` that runs `pnpm -w lint && pnpm -w test -- --changed` against staged files. Wire `core.hooksPath = .githooks`. Add a minimal GitHub Actions workflow (`typecheck + vitest`) so CI enforces the gate for outside contributors. `docs/superpowers/plans/2026-04-10-milestone-3-lint-import-archive.md` does not currently include this work — consider inserting it as Task 0.5.

---

### C-2. `@llm-wiki/core` depends on a native library (`re2`) — violates Clean Architecture rule for Domain layer

**Facts:**
- `packages/core/package.json:11` declares `"re2": "^1.24.0"` as a runtime dependency.
- `packages/core/src/services/sanitization-service.ts:1` imports RE2: `import RE2 from 're2';`
- `RULES.md:30` — "Domain: types, protocols, business logic. No dependencies on external libraries (except stdlib)".
- `re2` ships native N-API bindings — it is a non-stdlib runtime dep and requires a compiled artifact at install time.
- The M3 plan (`docs/.../2026-04-10-milestone-3-lint-import-archive.md:83`) even calls it out: "`@llm-wiki/core` stays on zero runtime deps (except the existing `re2`)". The exception is acknowledged but not resolved.

**Why this matters (inference):** The project explicitly uses RE2 to get linear-time regex for user-supplied sanitization patterns (defense against ReDoS from config). That is a legitimate requirement, but it belongs in the *application/infra* layer, not Domain. `SanitizationService` lives in `packages/core/src/services/` which is the application layer of Clean Architecture and *can* import stdlib, but the rule at `RULES.md:30` reads "Domain: no dependencies on external libraries" — RE2 is imported by `core/src/services`, not `core/src/domain`, so this is a layering fuzz rather than a hard Domain violation. Still, it breaks the spirit of "core has zero runtime deps" and forces every consumer of `@llm-wiki/core` to build a native addon.

**Impact:** HIGH for portability and test speed — `re2` install failures on Windows/musl have historically been a common pain point; the N-API version also ties the package to a narrow Node ABI range.

**Fix approach:** Two options.
1. Move `SanitizationService` to `@llm-wiki/infra` and define an `ISanitizer` port in `@llm-wiki/core` (DIP). `RememberService` already injects it via constructor, so the extraction is mechanical.
2. Keep RE2 but provide a pluggable `PatternCompiler` port with a default implementation that uses RE2 *in infra only*. Core would fall back to native `RegExp` with a strict length + complexity cap in domain for the default ruleset.

Either way, resolving this before M3 starts is cheaper than after LintService adds more consumers.

---

## High

### H-1. `FsSourceReader` has no filesystem containment — LLM-driven ingest can read any file the process can read

**Facts:**
- `packages/infra/src/fs-source-reader.ts:25-49`: `read()` calls `fs.readFile(absPath, 'utf-8')` after resolving via `path.resolve(process.cwd(), uri)` or `fileURLToPath`.
- There is no `assertUnderRoot` equivalent, no allowlist, no rejection of `/etc/passwd`, `~/.ssh/id_rsa`, etc.
- `IngestRequest.source` (`packages/core/src/services/ingest-service.ts:21-24`) is an arbitrary string — its validation happens only *after* the reader has already read the file (the token-count check at line 82 is post-read).
- The adversary is the LLM or a user who crafts an ingest request. `IngestService.validateTargetPath()` (`ingest-service.ts:241-294`) validates *destination* paths extremely carefully but not *source* paths.

**Why this matters:** In the MCP / Claude Code deployment model (where an LLM or remote agent can call `wiki_ingest`), an attacker who can submit any source URI can exfiltrate arbitrary readable files into the wiki. The wiki is a git repo — once a file lands in `wiki/…`, the LLM has freely gained read access via subsequent queries.

**Impact:** HIGH if `wiki_ingest` is exposed via a transport where the caller is untrusted. Today M3/M4 do not ship transport, so this is latent, but the planning doc assumes `wiki_ingest` will eventually be exposed to Claude Code.

**Fix approach:**
- Add an allowlist option to `FsSourceReader` (constructor-injected roots; reject anything outside them).
- Or block absolute paths entirely from untrusted callers and force `file://` with an allowlist check in `CompositeSourceReader`.
- Add a test `test_fsSourceReader_rejectsPathOutsideAllowlist`.

---

### H-2. LLM response parsing in `IngestService.extractPages` is brittle and uses multiple `unknown`-narrowing casts

**Facts:**
- `packages/core/src/services/ingest-service.ts:191-223`: the service expects the LLM to reply with a JSON array of `{path, title, content}` objects. The parser:
  1. `stripCodeFence()` trims optional ```` ``` ```` fences (`ingest-service.ts:297-301`).
  2. `JSON.parse()` the result.
  3. Validates each entry via `typeof (raw as {path?: unknown}).path !== 'string'`.
- Any deviation (missing field, extra prose before/after the JSON, nested object instead of array, field with the wrong type) throws `LlmUnavailableError` — a blanket "LLM is broken" error.

**Why this matters:**
- `LlmUnavailableError` is the wrong signal for "the LLM answered but didn't follow the schema" — it causes callers to retry the network, not to reprompt. The inferred intent is "model failure", but the real cause is usually prompt drift.
- No schema validator (zod/valibot/arktype). Adding one is cheap.
- `INGEST_SYSTEM_PROMPT` (`ingest-service.ts:38-41`) is a single terse line; it does not specify the `.md` path constraints that `validateTargetPath` then enforces. A slightly-off model will always hit the violation error without a useful retry path.

**Impact:** HIGH — this is the single biggest source of user-visible flakiness once `wiki_ingest` ships.

**Fix approach:**
- Validate with a schema library (zod is already in the dependency tree of `ai` transitively — worth confirming before adding).
- Either enrich the system prompt with the exact path regex or feed the model a tool-call-style response format (`responseFormat: 'json'` in AI SDK 5.x).
- Distinguish "model returned well-formed response" from "path was disallowed" with a new error subtype so callers can reprompt vs. retry.

---

### H-3. `QueryService.syncStaleFiles` has O(directories × files × awaits) behaviour per query

**Facts:**
- `packages/core/src/services/query-service.ts:144-175`: on *every* `query()` call, the service walks each cascade directory (`wiki/`, `projects/<name>/`, or `wiki` + `projects` for the empty scope) and for every file calls `searchEngine.lastIndexedAt(file.path)` sequentially, then compares dates and reindexes.
- For the empty scope (`''` in `buildScopeCascade`), it reads `wiki` + `projects` — the entire wiki — on every query.
- `RuVectorSearchEngine.index` (`ruvector-search-engine.ts:244-289`) calls the embedding client, deletes from both the vector DB and MiniSearch, writes, and persists the BM25 sidecar to disk — each of those is an IO hit.
- There is no batching; a wiki with 1000 pages will issue 1000 separate reads + 1000 sequential `lastIndexedAt` calls on each cold query.

**Why this matters:** `wiki_query` is the primary user-facing read path. A cold query on a medium wiki (500+ pages) will stall for multiple seconds before any search happens, and every LLM retry re-walks the whole cascade.

**Impact:** HIGH for UX latency once the wiki grows past a few dozen pages.

**Fix approach:**
- Parallelise the `lastIndexedAt` calls (`Promise.all` over files) — these are pure reads and the RuVector engine uses an in-memory map so this is safe.
- Add a cheap in-process "staleness cache" keyed by `(directory, mtime-of-directory)` so repeat queries within a single request or back-to-back calls skip the walk.
- Longer-term: let `ISearchEngine` expose a `pathsStaleSince(timestamp)` bulk query so the service does one call instead of N.

---

### H-4. `RuVectorSearchEngine` exceeds the SRP 300-line threshold and mixes four responsibilities

**Facts:**
- `packages/infra/src/ruvector-search-engine.ts` = 472 lines (`wc -l` output above).
- Responsibilities in one class: (a) init/persistence lifecycle, (b) write-mutex, (c) BM25 index management via MiniSearch, (d) dense vector index via ruvector, (e) RRF fusion + rank-to-score normalisation, (f) excerpt rendering. That is ≥5 reasons to change.
- `RULES.md:36` — ">300 lines = candidate for splitting" / ">3 public methods of different nature = violation". The class has 6 public methods (`index`, `remove`, `search`, `rebuild`, `health`, `lastIndexedAt`) — all are within the `ISearchEngine` contract so the interface itself is fine, but the internals are over-loaded.

**Why this matters:** M3 will add a `LintService` that rebuilds/prunes the index; M4 will add an MCP transport. Both will push changes into this file. A 500-line hotspot gets harder to review safely.

**Impact:** MEDIUM-HIGH.

**Fix approach:** Extract `Bm25IndexAdapter` (owns MiniSearch + sidecar JSON + atomic rename), `DenseIndexAdapter` (owns ruvector + id-lifecycle), and a tiny `RrfFusion` pure helper. `RuVectorSearchEngine` becomes a ~120-line composition root. Tests for each sub-adapter in isolation.

---

### H-5. No ESLint / no `tsc --noUncheckedIndexedAccess` — silent `undefined` holes in hot paths

**Facts:**
- `tsconfig.base.json:1-19` has `"strict": true` but **not** `"noUncheckedIndexedAccess"` or `"exactOptionalPropertyTypes"`.
- Examples of code that would be caught:
  - `ruvector-search-engine.ts:405`: `const top = scored[0].fused || 1;` — `scored[0]` is typed as `Scored` but the array could be empty (guarded at line 378 via early `return [];`, so this is fine at runtime, but the type system allows a silent `undefined` access if the guard is ever removed).
  - `git-project-resolver.ts:19`: `return data.name as string;` — `data.name` comes from gray-matter frontmatter with type `any`; the cast is unchecked. A `_config.md` with no `name:` field returns `undefined` typed as `string`.
  - `fs-file-store.ts:172-178`: every frontmatter field is read as `(data.title as string)` with no runtime validation. A malformed wiki page silently produces a `WikiPageData` whose `title` is `undefined` at runtime but typed as `string` — and every downstream `page.title` access compiles.
- 7 `as unknown` + `as any` casts total across source + tests (grep output in my exploration).

**Why this matters:** These are the exact silent-bug traps Clean Architecture is supposed to protect against. `frontmatter.title` propagates into `IndexEntry.title`, into `bm25.add({title, ...})`, and into user-facing search results.

**Impact:** MEDIUM-HIGH — no active bug, but the lack of runtime validation on file-loaded data is a latent correctness issue the strict TypeScript config doesn't catch.

**Fix approach:**
1. Turn on `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in `tsconfig.base.json`; fix the resulting errors (mostly null-guards).
2. Parse frontmatter through a schema validator in `fs-file-store.readWikiPage` — return `null` for malformed pages instead of producing a partially-`undefined` `WikiPageData`.
3. Add a `valueOrThrow` helper in the domain for unchecked casts that must be validated.

---

## Medium

### M-1. Duplicate in-memory fakes across test files

**Facts:**
- `FakeFileStore`, `FakeSearchEngine`, `FakeVersionControl`, `FakeStateStore`, `FakeVerbatimStore`, `FakeLlmClient`, `FakeSourceReader` are each re-declared (with small variations) in:
  - `packages/core/tests/services/ingest-service.test.ts:35-198`
  - `packages/core/tests/services/query-service.test.ts:1-110` (inferred from size + fake patterns grep)
  - `packages/core/tests/services/status-service.test.ts:18-79`
  - `packages/core/tests/services/recall-service.test.ts`, `remember-service.test.ts`, `sanitization-service.test.ts`
  - plus adapter-specific fakes under `tests/integration/`.
- These are structurally near-identical — the copies differ only in the subset of methods they override.

**Why this matters:** Adding a method to a port (e.g. the M3 plan adds `IVerbatimStore.readEntry` + `markConsolidated`) forces synchronised edits across 5+ test files. The project rules state "if duplication appears >2 times → extract it" (`RULES.md:43`).

**Impact:** MEDIUM — pure DRY debt; no runtime risk but slows M3 test writing and creates a drift hazard (fakes that silently diverge from the real contract).

**Fix approach:** Create `packages/core/tests/fakes/` with one file per port (e.g. `fake-file-store.ts`). Each export is a configurable factory (`makeFakeFileStore({ files? })`). Update every service test to import instead of redefining. Expected reduction: ≥600 lines of test boilerplate.

---

### M-2. `FsFileStore.readWikiPage` silently trims `data.title` without validation

**Facts:**
- `packages/infra/src/fs-file-store.ts:164-182`: reads frontmatter, then does `title: data.title as string`, `created: data.created as string`, etc.
- `data` is the gray-matter output — typed as `{ [key: string]: any }`.
- If a wiki page's frontmatter has `title: null`, `title: 42`, or is missing entirely, the cast succeeds silently and a subsequent `.title.toUpperCase()` would throw a runtime `TypeError`.
- `WikiPage.fromParsedData` (`wiki-page.ts:29-43`) applies `?? basename` fallbacks, but that rescue only runs on explicit `undefined` — `null` or `42` pass through.

**Why this matters:** `IngestService` writes well-formed pages, but any human edit + git reload could produce malformed frontmatter that corrupts the search index quietly.

**Impact:** MEDIUM.

**Fix approach:** Add a small `validateWikiFrontmatter` (or zod schema) in `fs-file-store.ts`; on failure, return `null` and log a structured warning. Cover with a test that feeds a malformed page and asserts `readWikiPage()` returns `null`.

---

### M-3. `IngestService` is 346 lines and mixes orchestration + YAML emission + path validation + stripping LLM fences

**Facts:**
- `packages/core/src/services/ingest-service.ts` = 346 lines.
- Responsibilities: orchestration (worktree lifecycle, commit/squash/merge), LLM interaction (prompt, parsing, validation), path-escape defence (`validateTargetPath`, 53 lines on its own), YAML frontmatter emission (`renderPageBody` + `yamlString`), error translation.
- `RULES.md:36`: ">300 lines = candidate for splitting".

**Why this matters:** The file already carries the entire ingest-critical path. Every future change (M3's `LintService` will steal a lot of the same worktree patterns, M4 adds transport wrappers) pulls more reviewers through this file.

**Impact:** MEDIUM.

**Fix approach (inference):**
- Extract `IngestPathValidator` (pure, unit-tested in isolation).
- Extract `WikiFrontmatterEmitter` (pure, reusable by LintService/ArchiveService later).
- Extract `LlmPageExtractor` (prompt + parse + schema).
- `IngestService.ingest()` then reduces to ~120 lines of pure orchestration.

---

### M-4. `AiSdkEmbeddingClient` has no batching / retry — a single 10K-chunk ingest blows one request

**Facts:**
- `packages/infra/src/ai-sdk-embedding-client.ts:16-20`: `embed()` passes the entire `texts` array to `embedMany({ model, values })` in one shot. No chunking by provider rate limit, no exponential backoff, no retry on 429.
- `RuVectorSearchEngine.index` currently sends exactly one string per call, so today this is fine — but `rebuild(entries)` (`ruvector-search-engine.ts:421-441`) calls `indexUnsafe` per entry sequentially, each of which calls `embeddingClient.embed([...])` separately. That's also *n* round-trips, not one batch.
- The test uses `MockEmbeddingModelV2` with `maxEmbeddingsPerCall: 100` (`ingest-e2e.test.ts:80`) — a constraint the real client does not encode.

**Why this matters:**
- M3's `ImportService` will sweep external agent memory stores and may push dozens of verbatim entries at once.
- M3's `LintService.rebuild` phase (inferred from plan doc) is even heavier — it may need to re-embed every wiki page.
- OpenAI's `text-embedding-3-small` has a batch limit; hitting it silently truncates results in older SDK versions.

**Impact:** MEDIUM — latency + occasional 429s under load.

**Fix approach:** Add `maxEmbeddingsPerCall` + `maxRetries` + backoff to `AiSdkEmbeddingClient`. Test with a mock that throws on oversized batches. The M3 plan is the natural place to schedule this fix since `LintService` will be the first heavy consumer.

---

### M-5. `GitProjectResolver` uses `execSync` for `git remote get-url origin`

**Facts:**
- `packages/infra/src/git-project-resolver.ts:36-44`: synchronous `execSync('git remote get-url origin', { cwd, ... })` runs on the main event loop.
- `cwd` comes from the caller — it is the user's working directory — without any validation beyond "string". Not a shell injection risk since `shell: false` is the default with `execSync(cmd, {...})` having no shell, **but**: `execSync` with a string command does use shell. Reading the source: `execSync('git remote get-url origin', { cwd })` — the first argument is a *command string*, so Node runs it through `/bin/sh` (or `cmd.exe` on Windows). `cwd` is not interpolated into that string so there is no injection path, but the blocking I/O + shell spawn on a hot call (`QueryService.query` via `projectResolver.resolve`) is still wasteful.

**Why this matters:** `wiki_query` calls `projectResolver.resolve(cwd)` on every request. Each call forks a shell and blocks until `git` returns. Tens of ms per query is gratuitous on a tool that is supposed to feel interactive.

**Impact:** MEDIUM (latency).

**Fix approach:** Use async `execFile('git', ['remote', 'get-url', 'origin'], { cwd })` via `node:util.promisify` — no shell, non-blocking. Cache the result per `cwd` for the lifetime of the process (project configs don't change mid-session).

---

### M-6. `GitVersionControl.mergeWorktree` matches conflicts via English-locale regex

**Facts:**
- `packages/infra/src/git-version-control.ts:99`: `if (/conflict|CONFLICT|not possible to fast-forward|Merge conflict/i.test(message))`.
- `simple-git` / underlying `git` will localise error text when `LANG`/`LC_MESSAGES` is set. On a French/Russian/Japanese developer machine, the regex misses and the raw error (not `GitConflictError`) bubbles up.

**Why this matters:** `IngestService` decides whether to preserve or remove the worktree based on the error class (`ingest-service.ts:139-147`). A misclassified conflict means the worktree gets force-removed and the in-progress work is lost.

**Impact:** MEDIUM — silent data loss under localised git.

**Fix approach:**
- Set `LANG=C` (or `LC_ALL=C`) on all `simple-git` invocations; simple-git accepts env via `simpleGit(root, { config: [...], env: {...} })`.
- Or check `err.exitCode`/`err.git.conflicts` from simple-git's structured error surface rather than scraping the message.

---

### M-7. `RememberService.countFacts` uses a leaky heuristic (`split('\n').filter(…)`)

**Facts:**
- `packages/core/src/services/remember-service.ts:104-106`: `content.split('\n').filter(line => line.trim().startsWith('- ')).length || 1`
- Any code block or prose bullet that happens to start with `- ` counts as a "fact". Nested bullets (`  - nested`) are not counted. An empty summary returns 1 (not 0).

**Why this matters:** `facts_count` is part of the `RememberSessionResponse` API surface. It is an observable number users/MCP clients will act on.

**Impact:** LOW-MEDIUM (API drift risk).

**Fix approach:** Either document the heuristic as an *estimate* in the response type, or parse the markdown properly (a 20-line parser is enough for top-level bullets). TDD test cases: empty summary, nested bullets, fenced code blocks, mixed `-`/`*`/`+` markers.

---

### M-8. `SanitizationService.sanitize` mutates shared RegExp state across calls

**Facts:**
- `packages/core/src/services/sanitization-service.ts:82-83`: inside the `for (const rule of this.patterns)` loop it sets `rule.pattern.lastIndex = 0` before calling `result.replace(rule.pattern, ...)`.
- `DEFAULT_PATTERNS` are module-level constants (`sanitization-service.ts:31-38`). They are shared across every `SanitizationService` instance and every concurrent call.
- `String.prototype.replace` with a global regex does reset `lastIndex` internally, so the manual reset is defensive — but two concurrent calls from two service instances can still interleave reads of `lastIndex` between the reset and the replace. In practice Node's event loop makes this safe (no preemption between the two statements) — but it's fragile.

**Why this matters:** It's defensive code that works today *only* because V8 never preempts a synchronous line. The moment someone adds an `await` between the reset and the replace, the code races.

**Impact:** LOW today; MEDIUM if the code is refactored.

**Fix approach:** Compile fresh `RegExp` instances per `sanitize()` call (cheap) OR store patterns as source strings and instantiate inside the loop. For the RE2 custom patterns, they can stay cached because RE2 has no `lastIndex`.

---

## Low

### L-1. `WikiPage.summary` string-builds by concatenation in a loop

**Facts:**
- `packages/core/src/domain/wiki-page.ts:60-81`: builds `current += (current ? ' ' : '') + line.trim()` in a hot loop over every line.
- Only the first paragraph is returned (`return paragraphs[0] ?? ''`) — so building the entire `paragraphs` array is wasted work for large pages.

**Impact:** LOW.

**Fix approach:** Early-return after finding the first non-heading non-empty paragraph. Use an array + `.join(' ')` instead of `+=` for the per-paragraph accumulator.

---

### L-2. `WikiPage.crossrefs` regex misses link targets with spaces or parens

**Facts:**
- `packages/core/src/domain/wiki-page.ts:84-91`: `/\[([^\]]*)\]\(([^)]+\.md)\)/g`
- Markdown allows `[text](path/with%20space.md)` (URL-encoded) and `[text](path/with (parens).md "title")` — both fail to match.

**Impact:** LOW — cosmetic for now, but `LintService` (per M3 plan) uses `crossrefs` to find broken links. False negatives = broken-link detector misses issues.

**Fix approach:** Use a proper markdown parser (micromark is ~7 KB and already transitively available via gray-matter). Or document the regex's scope in a JSDoc and add tests for the known limitations.

---

### L-3. `RecallService.countFacts` / budget math has a subtle off-by-one

**Facts:**
- `packages/core/src/services/recall-service.ts:53-76`: computes `minBudget`, `totalBudget = Math.max(minBudget, ...)`, then allocates `projectBudget = Math.floor(totalBudget * 0.7)`, and reshuffles remainders.
- When `totalBudget = 1`, `projectBudget = 0`, remainder flows to wiki → wiki gets 1. That's correct.
- When `totalBudget = 2` and both project + wiki have pages, `projectBudget = 1`, `wikiBudget = 1`. Also fine.
- When `totalBudget = 2` and only project has pages (wiki is empty), `projectBudget = 1`, remainder = 0, `wikiBudget = 1` — but wiki is empty, so one slot is wasted.
- Not a correctness bug, just budget underutilisation.

**Impact:** LOW.

**Fix approach:** After the initial split, re-assign unused wiki budget back to project when wiki is empty.

---

### L-4. `FsSourceReader.mimeTypeFor` is a closed mini-allowlist that forgets `.yaml` / `.yml` / `.txt`

**Facts:**
- `packages/infra/src/fs-source-reader.ts:56-62`: branches on `.md`, `.html`, `.json`, else `text/plain`.
- `.yaml`/`.yml`/`.toml`/`.ini` all become `text/plain` silently.

**Impact:** LOW — the `mimeType` is only a hint for downstream tooling; the ingest path does not gate on it.

**Fix approach:** Either delete the hint (YAGNI) or use the `mime` package. The first is preferable given the rules on unnecessary libraries.

---

### L-5. `ConfigLoader.deepMerge` relies on double `as unknown as WikiConfig` cast

**Facts:**
- `packages/infra/src/config-loader.ts:32-33`:
  ```
  const defaultsAsRecord = DEFAULTS as unknown as Record<string, unknown>;
  return this.deepMerge(defaultsAsRecord, shared, local, envOverrides) as unknown as WikiConfig;
  ```
- There is no validation that the merged object actually satisfies `WikiConfig` — a bad `settings.shared.yaml` can inject `llm: "not-an-object"` and pass straight through.

**Impact:** LOW (user hurts themselves with a bad YAML file).

**Fix approach:** Validate with a schema. `ConfigLoader` is the natural seam for it and it's all infra so a runtime dep like zod is acceptable.

---

### L-6. `CompositeSourceReader` silently falls through bare paths to `fsReader`

**Facts:**
- `packages/infra/src/composite-source-reader.ts:26-40`: if the URI is not `http://`, `https://`, `file://`, and doesn't look like a scheme at all, it is sent to `fsReader`.
- A user typing `wiki/tools/postgres.md` (a *wiki-relative* path) will trigger a real filesystem read rooted at `process.cwd()`, almost certainly failing with `SourceNotFoundError`. The error message will not hint that the user probably wanted `wiki/tools/postgres.md` resolved relative to the wiki root.

**Impact:** LOW (UX confusion, not correctness).

**Fix approach:** Reject paths that start with `wiki/` or `projects/` with a `SourceParseError` like "wiki-relative paths are not supported by wiki_ingest; use an absolute path or file:// URI".

---

### L-7. `ingest-service.ts` YAML emitter is a bespoke mini-serialiser

**Facts:**
- `packages/core/src/services/ingest-service.ts:311-335`: `renderPageBody` + `yamlString` hand-roll a fragment of YAML.
- The `yamlString` regex `/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/` is intentionally narrow and will quote anything with `'`, `"`, `#`, `:` followed by whitespace, leading space, or non-ASCII.
- It works for the closed `WikiPageFrontmatter` shape but duplicates logic that `gray-matter` / `js-yaml` already handle. Infra uses `gray-matter.stringify` elsewhere (`fs-verbatim-store.ts:19`).
- The choice is explicitly justified in a comment ("Core intentionally does not depend on gray-matter") — consistent with the Domain-has-no-deps rule, *but* see Concern C-2 where RE2 already violates that rule. The justification is therefore inconsistent.

**Impact:** LOW (works correctly for the closed field set) but adds a maintenance surface.

**Fix approach:** Keep as-is until the frontmatter shape needs to grow, then extract to a `FrontmatterEncoder` port with a `GrayMatterEncoder` infra impl.

---

### L-8. `VerbatimEntry.create` seeds `filename` with `Math.random().toString(16).slice(2, 10)`

**Facts:**
- `packages/core/src/domain/verbatim-entry.ts:53`: default idGenerator is `() => Math.random().toString(16).slice(2, 10)` — 8 hex chars, ~32 bits of entropy.
- `filename` is `${date}-${sessionId}-${uuid}.md`. Collision probability at 1000 entries per session is ~10⁻⁴ (birthday paradox on 2³² domain).
- `opts.idGenerator` is injectable so tests can substitute a deterministic generator — good.

**Impact:** LOW (a collision overwrites a previous file silently because `FsFileStore.writeFile` does not check existence).

**Fix approach:** Use `crypto.randomUUID()` (Node ≥ 19 stdlib, zero deps — fine for Domain per the rules) or throw if the file already exists in `FsVerbatimStore.writeEntry`. Prefer the former.

---

### L-9. `RememberService.findExistingSession` is O(files) per call

**Facts:**
- `packages/core/src/services/remember-service.ts:92-102`: lists every file in `log/<agent>/raw`, filters by substring match, then reads each candidate and regex-matches its frontmatter `session:` field.
- Called on every `rememberSession` invocation.

**Impact:** LOW now, higher once a session has thousands of files.

**Fix approach:** Cache a `sessionId → filePath` map in `YamlStateStore` (extend `WikiRuntimeState.imports` pattern). Update on every write.

---

## Positive Observations

- **Clean Architecture is actually enforced.** No file under `packages/core/` imports from `@llm-wiki/infra` or `packages/infra/`. Ports are type-only imports. The one mechanical violation (`re2`) is called out in the M3 plan.
- **Concurrency hazards are thought through.** `RuVectorSearchEngine.writeChain` (`ruvector-search-engine.ts:114, 200-209`) and `YamlStateStore.writeChain` (`yaml-state-store.ts:25, 46-60`) both implement a chained-promise mutex correctly. The `persist()` method in RuVector uses write-then-rename for atomic sidecar swap. The init-once pattern caches the in-flight promise (`ruvector-search-engine.ts:107, 149-152`) — exactly the right pattern against double-init under concurrent first-callers.
- **Path-escape + SSRF defence-in-depth is solid.** `FsFileStore.assertUnderRoot` (`fs-file-store.ts:55-74`) uses both lexical AND symlink-aware (`realpath`) checks. `HttpSourceReader` (`http-source-reader.ts:77-96, 221-266`) builds a `BlockList` covering RFC 1918 + link-local + cloud-metadata + ULA, blocks loopback hostnames, re-runs the host check on every redirect hop, enforces a byte cap with streaming, and uses `redirect: 'manual'` so the host check is authoritative.
- **Error taxonomy is coherent.** Every domain error extends `WikiError` with a stable `code` string (`errors.ts:1-101`). `IngestService` uses `instanceof WikiError` as the "safe to propagate" predicate — the right DIP shape.
- **Worktree isolation is real.** `IngestService.ingest` creates a worktree, writes through a worktree-scoped `IFileStore`, and only merges fast-forward on success (`ingest-service.ts:79-169`). The test `test_ingest_llmFails_worktreeDiscarded_mainBranchUntouched_stateUnchanged` (`ingest-service.test.ts:274-287`) pins INV-4.
- **Tests exist for every service and adapter**, including integration tests under `packages/infra/tests/integration/` that wire real `FsFileStore` + real `GitVersionControl` + real `RuVectorSearchEngine` with mocked LLM + embeddings. The `describe.it.expect` style matches the `test_<what>_<condition>_<result>` rule from `RULES.md:90`.
- **`VerbatimEntry.create` hard-validates identifiers** with an explicit regex (`verbatim-entry.ts:27, 48-49`) and a dedicated `InvalidIdentifierError`. That defends the `log/<agent>/raw/` filesystem layout against path traversal at the Domain boundary — exactly where it belongs.
- **`CompositeSourceReader` rejects unknown URI schemes** (`composite-source-reader.ts:36-38`) instead of silently falling through, so adding `s3://` or `gs://` requires a deliberate code change.

---

## Milestone-3 Readiness Notes

Pulling the concerns above into a M3-impact view (inference based on the plan doc at `docs/superpowers/plans/2026-04-10-milestone-3-lint-import-archive.md`):

1. **Before writing any M3 code**, land **C-1** (linter + hook + CI). Otherwise M3's ~4672-line feature drop will double the lint debt.
2. **H-2** (LLM JSON parsing) will bite `LintService` immediately — `ConsolidatePhase` and `PromotePhase` both call the LLM and need strict response schemas. Worth extracting a shared `LlmJsonExtractor<T>` helper while adding LintService.
3. **M-1** (duplicate test fakes) becomes critical in M3: the plan adds `consolidate-phase.test.ts`, `promote-phase.test.ts`, `health-phase.test.ts`, `lint-service.test.ts`, `import-service.test.ts`, plus new adapter tests. Without a shared `tests/fakes/` layer, each one will redeclare `FakeFileStore` + `FakeVerbatimStore` + `FakeVersionControl`. Do this before Task 6.
4. **H-4** (RuVectorSearchEngine 472 lines) should be split before `LintService.HealthPhase` adds new queries against it, otherwise the file blows past 600 lines.
5. **C-2** (core depends on re2) is a good candidate for a M3 side-quest: introducing `ISanitizer` in `core/ports/` and moving `SanitizationService` to infra is under 300 lines of movement and unblocks the "core has zero runtime deps" invariant the plan already assumes.

None of these are blockers — the existing code runs and its tests pass under the current constraints — but addressing at least C-1 and M-1 before M3 begins will materially lower the cost of the milestone.

---

*Concerns audit: 2026-04-10*
