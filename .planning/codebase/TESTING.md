# Testing Patterns

**Analysis Date:** 2026-04-10
**Scope:** `packages/core` and `packages/infra` in the llm-memory pnpm monorepo.

This document describes the actual test topology, the conventions observed in
committed tests, and the gaps against the thresholds in `RULES.md` (§Testing Trophy).

---

## Test Framework

**Runner:**
- **Vitest** `^3.1.0` (see root `package.json` devDependencies).
- Workspace mode via `vitest.workspace.ts`:
  ```ts
  export default defineWorkspace([
    'packages/core',
    'packages/infra',
  ]);
  ```
- Each package owns its own `vitest.config.ts`:
  - `packages/core/vitest.config.ts` — `test.globals: true`, `include: ['tests/**/*.test.ts']`.
  - `packages/infra/vitest.config.ts` — same `globals` / `include`, **plus** two
    resolver aliases that point directly at TypeScript sources so tests do not
    require a pre-build:
    ```ts
    alias: {
      '@llm-wiki/core':  path.resolve(__dirname, '../core/src/index.ts'),
      '@llm-wiki/infra': path.resolve(__dirname, './src/index.ts'),
    }
    ```

**Assertion Library:**
- Vitest built-in `expect` (Jest-compatible). No Chai, no `@vitest/expect-extend`.

**Run Commands (from root):**
```bash
pnpm test            # vitest run — all packages, one-shot
pnpm test:watch      # vitest — watch mode
pnpm lint            # tsc -b — static checks only (no ESLint configured)
pnpm build           # tsc -b — emits dist/ for every package
```

Per-package test runs:
```bash
pnpm --filter @llm-wiki/core test     # core only
pnpm --filter @llm-wiki/infra test    # infra only
```

---

## Test File Organization

**Location — two-tier layout mirrored per package:**

```
packages/core/tests/
├── domain/                 # pure entity / value-object tests
│   ├── runtime-state.test.ts
│   ├── sanitization-result.test.ts
│   ├── search-result.test.ts
│   ├── verbatim-entry.test.ts
│   └── wiki-page.test.ts
└── services/               # application/use-case tests (ports mocked via fakes)
    ├── ingest-service.test.ts
    ├── query-service.test.ts
    ├── recall-service.test.ts
    ├── remember-service.test.ts
    ├── sanitization-service.test.ts
    └── status-service.test.ts

packages/infra/tests/
├── ai-sdk-embedding-client.test.ts   # adapter-level tests (unit-ish, one external boundary mocked)
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
└── integration/                       # real-adapter + real-service end-to-end
    ├── ingest-e2e.test.ts
    ├── query-e2e.test.ts
    ├── remember-recall.test.ts
    └── search-rebuild.test.ts
```

**Naming:**
- File name mirrors the unit under test and uses kebab-case: `wiki-page.test.ts`,
  `ai-sdk-llm-client.test.ts`.
- End-to-end files suffix with `-e2e.test.ts` (`ingest-e2e.test.ts`,
  `query-e2e.test.ts`). Cross-service integration files use a flow name:
  `remember-recall.test.ts`, `search-rebuild.test.ts`.

**Tests are not co-located** with sources; they live under `tests/` outside the
TypeScript `rootDir`. This keeps `dist/` free of test artifacts.

**Test counts at this snapshot:**
- 27 test files, 250 total `describe/it/it.each` declarations.
- 11 files under `packages/core/tests` (5 domain + 6 service).
- 16 files under `packages/infra/tests` (12 adapter + 4 integration).

---

## Test Structure (Arrange-Act-Assert)

**Canonical shape — domain tests:**
`packages/core/tests/domain/wiki-page.test.ts:4-27` is representative.

```ts
import { describe, it, expect } from 'vitest';
import { WikiPage } from '../../src/domain/wiki-page.js';

describe('WikiPage', () => {
  it('test_fromParsedData_validData_constructsAllFields', () => {
    // Arrange: build a WikiPageData literal
    const page = WikiPage.fromParsedData('wiki/concepts/test.md', {
      frontmatter: { title: 'Test Page', /* … */ },
      content: '## Summary\n\nSome content here.',
    });
    // Act + Assert (no external I/O, so Act and Assert fold)
    expect(page.path).toBe('wiki/concepts/test.md');
    expect(page.title).toBe('Test Page');
    expect(page.crossrefs).toEqual(['../tools/pg.md']);
  });
});
```

**Canonical shape — service tests (with fakes + `beforeEach`):**
`packages/core/tests/services/remember-service.test.ts:29-41`.

```ts
describe('RememberService', () => {
  let fileStore: IFileStore;
  let verbatimStore: IVerbatimStore;
  let service: RememberService;

  beforeEach(() => {
    const mocks = createMocks();                    // Arrange: fresh fakes per test
    fileStore = mocks.fileStore;
    verbatimStore = mocks.verbatimStore;
    const sanitizer = new SanitizationService({ enabled: true, mode: 'redact' });
    service = new RememberService(fileStore, verbatimStore, sanitizer);
  });

  it('test_rememberFact_validContent_writesFile', async () => {
    const result = await service.rememberFact({ /* … */ });   // Act
    expect(result.ok).toBe(true);                              // Assert business facts
    expect(result.file).toMatch(/^log\/claude-code\/raw\//);
    expect(verbatimStore.writeEntry).toHaveBeenCalledOnce();
  });
});
```

**Observed conventions:**
- **One `describe` per unit**, named exactly after the class / function under test.
- **One `it` per behavior**. Each test asserts a single business fact; multi-step
  tests still concentrate on one question (e.g. "does the second call deduplicate?").
- **`beforeEach` for Arrange, `afterEach` for cleanup** (only in infra / integration
  tests that touch real tempdirs — `beforeEach` creates `mkdtemp`, `afterEach` calls
  `rm(…, { recursive: true, force: true })`).
- **No snapshot tests.** `expect(...).toMatchSnapshot()` is not used anywhere.
- **Test names are prescriptive and spec-linked**, e.g.
  `test_ingest_llmFails_worktreeDiscarded_mainBranchUntouched_stateUnchanged`
  encodes the invariant it pins; some tests append the invariant code:
  `test_ingest_success_pagesCreated_worktreeCleaned_stateUpdated (INV-13)`.

---

## Naming Convention — `test_<what>_<condition>_<result>`

**Stated (`RULES.md` §Test Writing Rules):**
> Name = business requirement: `test_<what>_<condition>_<result>`.

**Observed:** The convention is followed **strictly** across all 27 files.
Representative samples:

| File | Example test name |
|------|-------------------|
| `packages/core/tests/domain/wiki-page.test.ts` | `test_fromParsedData_missingTitle_usesFilename` |
| `packages/core/tests/domain/verbatim-entry.test.ts` | `test_create_invalidAgent_throws` |
| `packages/core/tests/services/remember-service.test.ts` | `test_rememberFact_emptyContent_throwsContentEmpty` |
| `packages/core/tests/services/remember-service.test.ts` | `test_rememberFact_sensitiveContent_redacts` |
| `packages/core/tests/services/remember-service.test.ts` | `test_rememberSession_duplicateSessionId_returnsExisting (INV-8)` |
| `packages/core/tests/services/ingest-service.test.ts` | `test_ingest_sourceOverTokenLimit_throwsSourceParseError` |
| `packages/core/tests/services/ingest-service.test.ts` | `test_ingest_llmFails_worktreeDiscarded_mainBranchUntouched_stateUnchanged` |
| `packages/infra/tests/fs-file-store.test.ts` | `test_readFile_parentEscape_throwsPathEscape` |
| `packages/infra/tests/ai-sdk-llm-client.test.ts` | `test_complete_providerThrows_wrappedAsLlmUnavailable` |
| `packages/infra/tests/integration/ingest-e2e.test.ts` | `test_ingest_success_pagesCreated_worktreeCleaned_stateUpdated (INV-13)` |

**New tests MUST follow this pattern.**

---

## Mocking & Fakes

**Framework:** `vitest` built-ins — `vi.fn`, `vi.spyOn`, `vi.mock`, `vi.mocked`.
(`msw` is listed in `packages/infra/package.json` devDependencies but is
**not currently imported** by any test file — grep returns zero matches for
`msw|setupServer|rest\.|http\.get|http\.post` under `packages/infra/tests`.)

**Two distinct mock styles are used:**

### 1. `vi.fn`-backed object literals (lightweight port mocks)
Used in small service tests where only a few methods are needed.

`packages/core/tests/services/remember-service.test.ts:7-27`:
```ts
function createMocks() {
  const files = new Map<string, string>();

  const fileStore: IFileStore = {
    readFile:  vi.fn(async (p: string) => files.get(p) ?? null),
    writeFile: vi.fn(async (p: string, c: string) => { files.set(p, c); }),
    listFiles: vi.fn(async () => []),
    exists:    vi.fn(async (p: string) => files.has(p)),
    readWikiPage: vi.fn(async () => null),
  };
  // …
  return { fileStore, verbatimStore, files };
}
```

### 2. In-memory `Fake*` classes (stateful, reusable, assert-able)
Used in larger orchestration tests where multiple behaviors and call ordering
matter.

`packages/core/tests/services/ingest-service.test.ts:30-198` defines:
- `FakeSourceReader` — `public readSpy = vi.fn()`, swappable `response` field.
- `FakeLlmClient`    — swappable `response`, returns JSON array by default.
- `FakeSearchEngine` — tracks indexed entries in an `indexSpy`.
- `FakeVersionControl` — counts worktrees, exposes `createSpy`, `removeSpy`,
  `mergeSpy`, `commitInWorktreeSpy`; supports an injected `onMergeSuccess`
  callback that the test uses to mirror worktree writes into the main store,
  simulating a real `git merge` effect.
- `FakeFileStore`    — backing `files: Record<string, string>` + `writeSpy`.
- `FakeStateStore`   — clones state via `structuredClone`, tracks `updateSpy`.

This style is in line with `RULES.md` §Tests: *"Do NOT mock business logic — use
in-memory implementations."*

### What gets mocked vs. what stays real

| Layer | Real in the test | Mocked / Faked |
|-------|------------------|----------------|
| Domain entity tests | Entity under test | Nothing — pure data |
| `SanitizationService` test | Service + domain | `SanitizationConfig` literal |
| Other core service tests | Service under test | All ports via `Fake*` / `vi.fn` |
| Infra adapter tests | Adapter under test | The **one** external boundary: `fetch`, `execSync`, AI SDK model (`MockLanguageModelV2` / `MockEmbeddingModelV2` from `ai/test`), filesystem via `mkdtemp`, git via `execSync` on a real tmp repo |
| Integration tests | Real `FsFileStore`, `GitVersionControl`, `RuVectorSearchEngine`, `YamlStateStore`, `FsSourceReader`, service classes | Only the LLM + embeddings (via `MockLanguageModelV2` / `MockEmbeddingModelV2`) |

**The rule in practice:** *mock only the outermost boundary of the test subject*.
An HTTP client test mocks `fetch` and `DnsLookupFn`; a filesystem adapter test
uses a **real** `mkdtemp`; an ingest-flow E2E uses a real git repo and mocks only
the model.

### Mock inspection idioms

```ts
// Count calls
expect(verbatimStore.writeEntry).toHaveBeenCalledOnce();
expect(vcs.commitInWorktreeSpy).toHaveBeenCalledTimes(1);

// Inspect arguments without casting
const entry = (verbatimStore.writeEntry as ReturnType<typeof vi.fn>).mock.calls[0][0];
expect(entry.content).toContain('[REDACTED:api_key]');

// Per-call override
(fileStore.listFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
  { path: first.file, updated: new Date().toISOString() },
]);
```

---

## Contract-Test Patterns

**Stated (`RULES.md` §Contract-First):**
> Protocol → contract tests → implementation. Contract tests must pass for ANY
> correct implementation.

**Observed pattern:** Infra adapter tests are written against the **port's
contract**, not against internal adapter details:

- `packages/infra/tests/fs-file-store.test.ts` imports `PathEscapeError` from
  `@llm-wiki/core` and asserts the port's null/exists/listFiles semantics. Every
  assertion is a fact about the `IFileStore` contract; nothing depends on
  `FsFileStore` internals.
- `packages/infra/tests/ai-sdk-llm-client.test.ts` pins the `ILlmClient` contract
  — *"provider throws → wrapped as `LlmUnavailableError`"*, *"usage missing →
  returns zero"*, *"system/temperature passed through"*. Any future
  `ILlmClient` implementation must pass the same assertions to be considered
  correct.
- `packages/infra/tests/git-version-control.test.ts` asserts `IVersionControl`
  contract behaviors: creating/removing worktrees, commit-in-worktree semantics,
  `GitConflictError` on merge conflicts.

**Gap — contract tests are not yet reusable across implementations.** They are
written inline per adapter. If a second `IFileStore` implementation is ever
added, the current tests would need to be copied. A reusable `describeIFileStore(
makeStore: () => IFileStore)` helper would close this gap. See CONCERNS.md.

---

## Test Data & Fixtures

**Observed:**
- **Inline literals.** Every test builds its own `WikiPageData`, `VerbatimEntry`
  arguments, request objects, and markdown strings inline. There is no
  `fixtures/` directory, no factory helpers, no `builders/`.
- **Determinism via `beforeEach` / `mkdtemp`.** Tests that need a filesystem
  create a fresh tmpdir per test and remove it in `afterEach`:
  ```ts
  // packages/infra/tests/fs-file-store.test.ts:12-19
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-test-'));
    store = new FsFileStore(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });
  ```
- **Deterministic embedding stub** in `ingest-e2e.test.ts:68-88`: a tiny hand-
  rolled 16-dim bag-of-chars embedding, L2-normalized, so vector search is
  reproducible without calling a real model.
- **Deterministic `idGenerator`** is available on `VerbatimEntry.create` — tests
  can inject a fixed ID if needed (see `packages/core/src/domain/verbatim-entry.ts:9`).
- **Deterministic dates** in domain tests use ISO-format literals like
  `'2026-04-09'`. The `today` that services compute via `new Date().toISOString()`
  is asserted with a regex / `.toBeTruthy()` rather than an exact string (see
  `ingest-service.test.ts:305-309`).

---

## Parametrization

**Stated:** Variations via `@parametrize`, not copy-paste.

**Observed:** Vitest's equivalent `it.each` is used in exactly **one** place:

`packages/core/tests/services/ingest-service.test.ts:325-341` — the path-
validation matrix:
```ts
it.each([
  ['package.json', 'top-level config file'],
  ['pnpm-lock.yaml', 'lock file'],
  ['.github/workflows/ci.yml', 'CI workflow'],
  // … 15 cases total
])('test_ingest_rejectsMaliciousPath_%s', async (badPath, _description) => {
  llm.response = [{ path: badPath, title: 'Evil', content: '# oops' }];
  await expect(service.ingest({ source: '/tmp/src.md' })).rejects
    .toBeInstanceOf(IngestPathViolationError);
  // …assert worktree cleanup, main untouched, state untouched
});
```

**Gap:** Several other files contain near-duplicate `it(...)` blocks that should
be collapsed into `it.each`. Candidates:
- `packages/infra/tests/fs-file-store.test.ts` — path-traversal variants.
- `packages/infra/tests/http-source-reader.test.ts` — 24 `it` blocks covering
  status codes, content types, DNS lookups (some natural variants).
- `packages/core/tests/services/sanitization-service.test.ts` — 21 `it` blocks
  for each detector/mode combination.

---

## Coverage Tooling

**Stated targets (`RULES.md` §Tests):**
- Overall: **85%+**
- Core / business logic: **95%+**
- Infrastructure / adapters: **70%+**

**Observed:**
- **No coverage reporter is installed.** `@vitest/coverage-v8` and
  `@vitest/coverage-istanbul` are absent from all three `package.json` files.
- `pnpm test --coverage` is available through Vitest but would fail without a
  reporter plugin.
- No `coverage/` directory, no threshold configuration in any
  `vitest.config.ts`.

**Gap — priority HIGH.** Add `@vitest/coverage-v8` as a root devDependency,
configure per-package thresholds in each `vitest.config.ts`, and wire a
`pnpm test:coverage` script. Tracked in CONCERNS.md.

---

## Test Types by Layer

### Domain tests (`packages/core/tests/domain/`)

Pure, synchronous, no I/O, no mocks. Exercise factory methods, getters,
round-trip `toData()` + `fromParsedData()`, and edge cases (missing title,
invalid identifier). Total: **36** `it` / `it.each` across 5 files.

### Service tests (`packages/core/tests/services/`)

Service under test is real, all ports are replaced by `vi.fn`-backed mocks or
stateful `Fake*` classes defined at the top of the file. Cover happy path,
every documented error path, and invariant labels (INV-1, INV-4, INV-8, INV-13,
…). Total: **75** `it` / `it.each` across 6 files.

### Adapter tests (`packages/infra/tests/*.test.ts` — flat)

Single adapter against a real boundary where possible (`mkdtemp` + real fs,
`execSync` + real git, `MockLanguageModelV2` + real AI SDK transport). These
double as **contract tests** for the corresponding port. Total: **125** `it` /
`it.each` across 12 files.

### Integration / E2E (`packages/infra/tests/integration/`)

Compose real adapters + real services + stubbed model to exercise end-to-end
flows. Four flows are covered today:
- `ingest-e2e.test.ts` — full wiki_ingest orchestration with real git (INV-13, INV-4).
- `query-e2e.test.ts` — hybrid search rebuild + answer composition.
- `remember-recall.test.ts` — remember → recall round-trip with project resolution.
- `search-rebuild.test.ts` — search index rebuild from file store.

These are the "main focus" per `RULES.md` §Testing Trophy and account for
**13** `it` across 4 files. Each spins up a fresh `mkdtemp` + `git init` in
`beforeEach` and tears it down in `afterEach`, so tests run offline and in
parallel safely.

### Static analysis

`pnpm lint` → `tsc -b`. TypeScript `strict: true` + `verbatimModuleSyntax: true`
catch most silent errors. **No ESLint / Prettier / Biome.** See CONCERNS.md.

---

## Common Patterns

**Async with rejection matcher:**
```ts
await expect(service.rememberFact({ content: '', agent: 'x', sessionId: 'y' }))
  .rejects.toThrow('Content must not be empty');

await expect(service.ingest({ source: '/tmp/huge.md' }))
  .rejects.toBeInstanceOf(SourceParseError);
```

**Error-type assertions** use `.rejects.toBeInstanceOf(SomeDomainError)` instead
of string matching, so error wrapping (e.g. `LlmUnavailableError` wrapping
vendor errors) is part of the contract.

**Call-order assertions** are avoided in favor of effect assertions: instead of
asserting "`createWorktree` was called before `writeFile`", tests assert that
the worktree store received the writes (`worktreeStores[0].writeSpy`) and the
main store did not (`expect(mainStore.writeSpy).not.toHaveBeenCalled()`). This
keeps tests robust under refactor.

**Invariant pinning:** tests whose name ends in `(INV-N)` are the enforcement
point for a numbered invariant from the spec. When changing the code they touch,
the invariant must still hold. See `ingest-service.test.ts:241`,
`remember-service.test.ts:96`, `ingest-e2e.test.ts:122,141`.

---

## Gaps vs `RULES.md`

| Rule (`RULES.md`) | Status | Gap |
|-------------------|--------|-----|
| Testing Trophy weights (integration > unit) | **Partially met** | Integration layer exists (4 files, 13 tests) but is dwarfed by 125 adapter-level unit-ish tests. Ratio is fine; watch for drift. |
| Coverage 85% / core 95% / infra 70% | **NOT MET** | No coverage tooling installed. Cannot measure. |
| `test_<what>_<condition>_<result>` naming | **MET** | Enforced by convention across all 27 files. |
| Arrange-Act-Assert | **MET** | Consistent usage. |
| `@parametrize` (`it.each`) over copy-paste | **Partially met** | Used once (path validation). Underused in sanitization, http, fs-file-store tests. |
| Mock only external boundaries | **MET** | Fakes are in-memory implementations; vendor errors are wrapped; real tmpdirs + real git in integration tests. |
| 5+ mocks → integration test | **MET** | `IngestService` unit test uses 7 fakes, but the same flow is also covered by `ingest-e2e.test.ts` with real adapters, which is the correct escalation. |
| "Each test = one scenario" | **MET** | Each `it` asserts one behavior (sometimes multiple `expect` calls, all on the same scenario). |
| "Test fails for one reason" | **MET** | Tests use specific error-type matchers and targeted effect assertions. |
| Static analysis on every commit | **NOT MET** | No pre-commit hook, no ESLint. `pnpm lint` is aliased to `tsc -b` and runs only on-demand. |
| Contract tests reusable across implementations | **Partially met** | Tests target port contracts but are not extracted into reusable `describe*` helpers. One adapter per port today, so no pain yet. |

---

## Recommendations for New Tests

When adding tests in this repo, follow these rules:

1. **Name as `test_<unit>_<condition>_<result>`** — no exceptions. Append
   `(INV-N)` if it pins a numbered invariant.
2. **Core service tests:** inject fakes via the service's constructor. Prefer
   `Fake*` classes for multi-method ports with state; `vi.fn` object literals
   are fine for small surfaces.
3. **Infra adapter tests:** mock exactly one external boundary and run against
   a real `mkdtemp` / real tmp git repo wherever possible. Assert the **port
   contract**, not internal helpers.
4. **Integration tests** belong in `packages/infra/tests/integration/`, import
   real services from `@llm-wiki/core`, wire them with real adapters, and mock
   only the LLM + embeddings using `MockLanguageModelV2` / `MockEmbeddingModelV2`
   from `ai/test`.
5. **Use `it.each` whenever you have >2 copy-pasted cases** that differ only in
   input data.
6. **Assert typed errors** with `.rejects.toBeInstanceOf(SomeWikiError)` rather
   than matching on the message — wrapping / rewording the message must not
   break tests.
7. **Use `mkdtemp` + `rm` in `beforeEach` / `afterEach`** for any filesystem or
   git-touching test. Never write into a fixed path inside the repo.
8. **No snapshots. No production `console.*`. No global test state.**

---

*Testing analysis: 2026-04-10*
