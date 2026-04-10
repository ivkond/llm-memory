# Milestone 3: Lint, Import & Archive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the `@llm-wiki/core` application layer by adding `LintService` (consolidate + promote + health), `ImportService` (sweep native agent memory stores), and `IArchiver` / `SevenZipArchiver` (7zip archival of consolidated verbatim entries) — closing invariants INV-5 and INV-9 and enabling the full wiki lifecycle: remember → consolidate → promote → archive, plus one-shot sweeps from external agent stores.

**Architecture:** Extends the Clean Architecture from M1/M2. New ports: `IArchiver`, `IAgentMemoryReader`. `IVerbatimStore` is extended with `readEntry` + `markConsolidated` so lint can flip the `consolidated` flag without leaking markdown parsing into core. `LintService` is split into three pure phase classes (`ConsolidatePhase`, `PromotePhase`, `HealthPhase`) orchestrated by a thin `LintService` wrapper that owns the worktree + squash + merge lifecycle. `ImportService` is a simple orchestrator: resolve configured agents, ask each `IAgentMemoryReader` for new items since `last_import`, dedupe, write verbatim entries, stamp state. No transport packages are built in this milestone — M4 wires them to CLI + MCP + Claude Code.

**Tech Stack additions:** `node-7z` (async wrapper over the 7-Zip CLI), `7zip-bin` (statically linked binary so tests don't need a system 7z install), `globby` (glob expansion for agent memory paths — used in infra only, core stays dependency-free).

**Spec:** `docs/superpowers/specs/2026-04-10-llm-wiki-design.md`

**Invariants covered:**
- INV-5: After `wiki_lint`, all processed verbatim entries have `consolidated: true`
- INV-9: `wiki_lint` in worktree does not modify main branch until merge

**Depends on:** Milestone 1 (`WikiPage`, `VerbatimEntry`, `IFileStore`, `IVerbatimStore`, `IProjectResolver`, `RememberService`, `RecallService`, `FsFileStore`, `FsVerbatimStore`, `ConfigLoader`) + Milestone 2 (`ISearchEngine`, `ILlmClient`, `IEmbeddingClient`, `IVersionControl` with worktree methods, `IStateStore`, `ISourceReader`, `IngestService`, `WikiStatusService`, `GitVersionControl`, `RuVectorSearchEngine`, `AiSdkLlmClient`, `YamlStateStore`).

**Out of scope:**
- Transport packages `@llm-wiki/mcp-server`, `@llm-wiki/cli`, `@llm-wiki/claude-code` — deferred to **Milestone 4**. M3 ships only services/adapters in `core` + `infra`.
- **LLM-driven health checks** — `HealthPhase` only reports deterministic findings (orphans, stale-by-age-and-confidence, broken links). Spec's "contradictions between pages" and "mentioned concepts without their own page" require an LLM pass and are deferred to a follow-up milestone; they are not covered by any invariant in the acceptance criteria, so leaving them out does not break the contract suite.
- **Non-Claude-Code memory readers** — spec lists Cursor, Codex, KiloCode, OpenCode, Qwen under "MVP" for import. M3 builds the `IAgentMemoryReader` port + `ClaudeCodeMemoryReader` only. Other agents plug into the same port with no core changes; adding them is a flat sequence of adapter tasks scheduled after M4.
- **Scheduling** (cron / interval triggers for lint and import). M3 exposes synchronous `LintService.lint()` / `ImportService.importAll()` calls; scheduling is a transport concern handled in M4's CLI.
- **Content archival retention policy** (spec's `archive_retention_months`). M3 archives every consolidated batch into `.archive/<YYYY-MM>-<agent>.7z` but does not prune old archives. A separate sweep can be added once `IArchiver` grows a `listArchives` / `removeArchive` method.

---

## File Structure (additions to M1 + M2)

```
llm-memory/
  packages/
    core/
      src/
        domain/
          errors.ts                           # + LintError, ImportError, ArchiveError (MODIFIED)
          lint-report.ts                      # LintReport value object (NEW)
          health-issue.ts                     # HealthIssue value object (NEW)
          agent-memory-item.ts                # AgentMemoryItem value object (NEW)
          index.ts                            # re-exports (MODIFIED)
        ports/
          archiver.ts                         # IArchiver interface (NEW)
          agent-memory-reader.ts              # IAgentMemoryReader interface (NEW)
          verbatim-store.ts                   # + readEntry + markConsolidated (MODIFIED)
          index.ts                            # re-exports (MODIFIED)
        services/
          lint-service.ts                     # LintService orchestrator (NEW)
          lint/
            consolidate-phase.ts              # Phase 1: verbatim → wiki/projects (NEW)
            promote-phase.ts                  # Phase 2: projects → wiki/patterns (NEW)
            health-phase.ts                   # Phase 3: report orphans/stale/etc (NEW)
          import-service.ts                   # ImportService orchestrator (NEW)
          index.ts                            # re-exports (MODIFIED)
      tests/
        domain/
          lint-report.test.ts                 # (NEW)
          health-issue.test.ts                # (NEW)
          agent-memory-item.test.ts           # (NEW)
        services/
          lint/
            consolidate-phase.test.ts         # (NEW)
            promote-phase.test.ts             # (NEW)
            health-phase.test.ts              # (NEW)
          lint-service.test.ts                # orchestration + worktree + state (NEW)
          import-service.test.ts              # (NEW)

    infra/
      src/
        seven-zip-archiver.ts                 # SevenZipArchiver via node-7z (NEW)
        fs-verbatim-store.ts                  # + readEntry + markConsolidated (MODIFIED)
        claude-code-memory-reader.ts          # ClaudeCodeMemoryReader (NEW)
        index.ts                              # re-exports (MODIFIED)
      tests/
        seven-zip-archiver.test.ts            # (NEW)
        fs-verbatim-store.test.ts             # + new-method cases (MODIFIED)
        claude-code-memory-reader.test.ts     # (NEW)
        integration/
          lint-e2e.test.ts                    # worktree + real 7z + mock LLM (NEW)
          import-e2e.test.ts                  # real fs agent memory sweep (NEW)
      package.json                            # + node-7z, 7zip-bin, globby (MODIFIED)
```

**Dependency delta:** `@llm-wiki/infra` gains three runtime deps (`node-7z`, `7zip-bin`, `globby`); `@llm-wiki/core` stays on zero runtime deps (except the existing `re2`).

---

## Invariant → Task Coverage Map

| Invariant | Where it's enforced | Where it's tested |
|-----------|--------------------|-------------------|
| INV-5 (all processed verbatim marked consolidated) | `ConsolidatePhase.run()` flips `consolidated` on every accepted entry before returning; `LintService.lint()` runs this phase inside the worktree lifecycle | Task 6 `ConsolidatePhase` unit tests, Task 9 `LintService` unit tests, Task 13 Lint E2E integration test |
| INV-9 (worktree isolation until merge) | `LintService.lint()` creates the worktree via `IVersionControl`, runs every phase against a worktree-scoped `IFileStore`, squashes + merges only at the end | Task 9 `LintService` unit tests (stubbed phases + `FakeVersionControl`), Task 13 Lint E2E integration test (real git + `ProbingGitVersionControl` mid-flight probe) |

---

## Task 0: Bootstrap per-package test runners

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/infra/package.json`

Neither `@llm-wiki/core` nor `@llm-wiki/infra` currently ship a `test` script — the root-level `pnpm test` runs Vitest workspace-wide. Every subsequent task in this plan invokes `pnpm -F @llm-wiki/... test <pattern>`, which would fail today with *"no script named test"*. This task adds the per-package runner scripts so the TDD loop is actually executable.

- [ ] **Step 1: Add a `test` script to `@llm-wiki/core`**

Edit `packages/core/package.json`, extend the `scripts` block:

```json
{
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Add the same scripts to `@llm-wiki/infra`**

Edit `packages/infra/package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Verify the runners work from the workspace filter**

Run: `pnpm -F @llm-wiki/core test`
Expected: the existing core test suite runs and passes.

Run: `pnpm -F @llm-wiki/infra test`
Expected: the existing infra test suite runs and passes.

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json packages/infra/package.json
git commit -m ":wrench: [build] Add per-package vitest scripts for TDD loop"
```

---

## Task 1: IArchiver port

**Files:**
- Create: `packages/core/src/ports/archiver.ts`
- Modify: `packages/core/src/ports/index.ts` (add re-export)
- Modify: `packages/core/src/domain/errors.ts` (add `ArchiveError`)
- Modify: `packages/core/src/domain/index.ts` (re-export `ArchiveError`)

This task introduces the port only — no adapter, no test file. The IArchiver contract is exercised directly by the SevenZipArchiver tests in Task 2; there is only one adapter in M3, so a shared contract-test file is YAGNI. When a second adapter is added later, extract the shared cases from Task 2's test file at that point.

- [ ] **Step 1: Write the `ArchiveError` domain error**

Edit `packages/core/src/domain/errors.ts`, add at the bottom:

```ts
export class ArchiveError extends WikiError {
  constructor(public readonly target: string, message: string) {
    super('ARCHIVE_ERROR', `Failed to archive ${target}: ${message}`);
  }
}
```

Export it from `packages/core/src/domain/index.ts`:

```ts
export { ArchiveError } from './errors.js';
```

- [ ] **Step 2: Write the `IArchiver` port**

Create `packages/core/src/ports/archiver.ts`:

```ts
export interface ArchiveEntry {
  /** Absolute path on disk of the source file to include in the archive. */
  sourcePath: string;
}

export interface ArchiveResult {
  /** Absolute path of the produced `.7z` file. */
  archivePath: string;
  /** Number of files written into the archive. */
  fileCount: number;
  /** Size of the resulting archive on disk in bytes. */
  bytes: number;
}

export interface IArchiver {
  /**
   * Produce a single compressed archive at `archivePath` containing every
   * entry from `entries`.
   *
   * Contract:
   *   - `archivePath` MUST be an absolute path. Relative paths are rejected
   *     by the adapter because their meaning depends on process CWD, which
   *     is unstable across the CLI, MCP server, and test runners.
   *   - The archive MUST be created atomically: on failure no partial file
   *     is left at `archivePath`.
   *   - In-archive layout is determined by the adapter (MVP: node-7z default
   *     layout). Callers that need to locate files inside the archive must
   *     rely on file basename, not on any prescribed sub-path.
   *
   * Throws `ArchiveError` on any I/O or compression failure.
   */
  createArchive(archivePath: string, entries: ArchiveEntry[]): Promise<ArchiveResult>;
}
```

- [ ] **Step 3: Re-export from the ports index**

Edit `packages/core/src/ports/index.ts`, append:

```ts
export type { IArchiver, ArchiveEntry, ArchiveResult } from './archiver.js';
```

- [ ] **Step 4: Verify the core package still builds**

Run: `pnpm -F @llm-wiki/core build`
Expected: PASS. The new port file compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ports/archiver.ts \
        packages/core/src/ports/index.ts \
        packages/core/src/domain/errors.ts \
        packages/core/src/domain/index.ts
git commit -m ":sparkles: [core] Add IArchiver port and ArchiveError"
```

---

## Task 2: SevenZipArchiver adapter

**Files:**
- Create: `packages/infra/src/seven-zip-archiver.ts`
- Create: `packages/infra/tests/seven-zip-archiver.test.ts`
- Modify: `packages/infra/src/index.ts` (re-export)
- Modify: `packages/infra/package.json` (add `node-7z`, `7zip-bin`)

- [ ] **Step 1: Install the dependencies**

Run:

```bash
pnpm -F @llm-wiki/infra add node-7z@^3.0.0 7zip-bin@^5.2.0
pnpm -F @llm-wiki/infra add -D @types/node-7z@^2.1.8
```

Expected: `packages/infra/package.json` gains the three entries, lockfile updated.

- [ ] **Step 2: Write the failing adapter test**

Create `packages/infra/tests/seven-zip-archiver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, stat, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveError } from '@llm-wiki/core';
import { SevenZipArchiver } from '../src/seven-zip-archiver.js';

describe('SevenZipArchiver', () => {
  it('creates a single archive containing all requested entries', async () => {
    const archiver = new SevenZipArchiver();
    const workdir = await mkdtemp(path.join(tmpdir(), 'archiver-'));
    try {
      const srcA = path.join(workdir, 'a.md');
      const srcB = path.join(workdir, 'b.md');
      await writeFile(srcA, 'alpha');
      await writeFile(srcB, 'beta');
      const archivePath = path.join(workdir, 'out.7z');

      const result = await archiver.createArchive(archivePath, [
        { sourcePath: srcA },
        { sourcePath: srcB },
      ]);

      expect(result.archivePath).toBe(archivePath);
      expect(result.fileCount).toBe(2);
      expect(result.bytes).toBeGreaterThan(0);
      const info = await stat(archivePath);
      expect(info.isFile()).toBe(true);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('rejects relative archivePath', async () => {
    const archiver = new SevenZipArchiver();
    const workdir = await mkdtemp(path.join(tmpdir(), 'archiver-'));
    try {
      const src = path.join(workdir, 'a.md');
      await writeFile(src, 'x');
      await expect(
        archiver.createArchive('relative/out.7z', [{ sourcePath: src }]),
      ).rejects.toBeInstanceOf(ArchiveError);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('throws ArchiveError when a source file does not exist', async () => {
    const archiver = new SevenZipArchiver();
    const workdir = await mkdtemp(path.join(tmpdir(), 'archiver-'));
    try {
      const missing = path.join(workdir, 'missing.md');
      const archivePath = path.join(workdir, 'out.7z');
      await expect(
        archiver.createArchive(archivePath, [{ sourcePath: missing }]),
      ).rejects.toBeInstanceOf(ArchiveError);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('rejects empty entry list and leaves no partial file', async () => {
    const archiver = new SevenZipArchiver();
    const workdir = await mkdtemp(path.join(tmpdir(), 'archiver-'));
    try {
      const archiveDir = path.join(workdir, 'out');
      await mkdir(archiveDir);
      const archivePath = path.join(archiveDir, 'out.7z');
      await expect(
        archiver.createArchive(archivePath, []),
      ).rejects.toBeInstanceOf(ArchiveError);
      await expect(stat(archivePath)).rejects.toThrow();
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F @llm-wiki/infra test seven-zip-archiver`
Expected: FAIL — `Cannot find module '../src/seven-zip-archiver.js'`.

- [ ] **Step 4: Write the SevenZipArchiver adapter**

Create `packages/infra/src/seven-zip-archiver.ts`:

```ts
import { add } from 'node-7z';
import sevenBin from '7zip-bin';
import { stat, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  ArchiveError,
  type IArchiver,
  type ArchiveEntry,
  type ArchiveResult,
} from '@llm-wiki/core';

/**
 * IArchiver adapter backed by the statically-linked 7-Zip binary shipped by
 * the `7zip-bin` package. We drive it via `node-7z` which returns a stream
 * of progress events — we resolve on `end`, reject on `error`.
 *
 * Atomicity: we write to `<archivePath>.tmp` and rename on success. On any
 * failure the temp file is unlinked so the caller never sees a partial
 * archive at `archivePath`. node-7z refuses to add empty file lists, so
 * the pre-check below turns that into an `ArchiveError` before we touch
 * the filesystem.
 *
 * The adapter rejects relative `archivePath` values up front — process
 * CWD is not a stable anchor across CLI, MCP server, and test runners,
 * so every caller in the codebase MUST compute an absolute target.
 *
 * In-archive layout is whatever node-7z produces by default (full source
 * paths collapsed to a common prefix). Callers must not rely on a specific
 * sub-path inside the archive.
 */
export class SevenZipArchiver implements IArchiver {
  private readonly binaryPath: string;

  constructor(binaryPath: string = sevenBin.path7za) {
    this.binaryPath = binaryPath;
  }

  async createArchive(archivePath: string, entries: ArchiveEntry[]): Promise<ArchiveResult> {
    if (!path.isAbsolute(archivePath)) {
      throw new ArchiveError(archivePath, 'archivePath must be absolute');
    }
    if (entries.length === 0) {
      throw new ArchiveError(archivePath, 'no entries provided');
    }
    for (const entry of entries) {
      if (!path.isAbsolute(entry.sourcePath)) {
        throw new ArchiveError(
          archivePath,
          `entry.sourcePath must be absolute: ${entry.sourcePath}`,
        );
      }
      try {
        await stat(entry.sourcePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new ArchiveError(archivePath, `source missing: ${entry.sourcePath} (${message})`);
      }
    }

    await mkdir(path.dirname(archivePath), { recursive: true });
    const tmpPath = `${archivePath}.tmp`;
    await this.safeUnlink(tmpPath);

    const sourcePaths = entries.map((e) => e.sourcePath);

    await new Promise<void>((resolve, reject) => {
      const stream = add(tmpPath, sourcePaths, {
        $bin: this.binaryPath,
        $raw: ['-t7z', '-mx=5'],
      });
      stream.on('error', (err: Error) => reject(err));
      stream.on('end', () => resolve());
    }).catch(async (err) => {
      await this.safeUnlink(tmpPath);
      const message = err instanceof Error ? err.message : String(err);
      throw new ArchiveError(archivePath, message);
    });

    try {
      const { rename } = await import('node:fs/promises');
      await rename(tmpPath, archivePath);
    } catch (err) {
      await this.safeUnlink(tmpPath);
      const message = err instanceof Error ? err.message : String(err);
      throw new ArchiveError(archivePath, `rename failed: ${message}`);
    }

    const info = await stat(archivePath);
    return {
      archivePath,
      fileCount: entries.length,
      bytes: info.size,
    };
  }

  private async safeUnlink(target: string): Promise<void> {
    try {
      await unlink(target);
    } catch {
      // swallow ENOENT and friends — nothing to clean up
    }
  }
}
```

- [ ] **Step 5: Re-export from infra index**

Edit `packages/infra/src/index.ts`, add:

```ts
export { SevenZipArchiver } from './seven-zip-archiver.js';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm -F @llm-wiki/infra test seven-zip-archiver`
Expected: PASS on all four cases (happy path, relative-path rejection, missing source rejection, empty-entries rejection). The real 7za binary runs — tests take ~1-2s.

- [ ] **Step 7: Commit**

```bash
git add packages/infra/src/seven-zip-archiver.ts \
        packages/infra/src/index.ts \
        packages/infra/tests/seven-zip-archiver.test.ts \
        packages/infra/package.json \
        pnpm-lock.yaml
git commit -m ":sparkles: [infra] Add SevenZipArchiver adapter with node-7z"
```

---

## Task 3: Extend IVerbatimStore with readEntry + markConsolidated

**Files:**
- Modify: `packages/core/src/ports/verbatim-store.ts`
- Modify: `packages/infra/src/fs-verbatim-store.ts`
- Modify: `packages/infra/tests/fs-verbatim-store.test.ts`

`LintService` needs to (a) load an individual verbatim entry as a domain object, and (b) flip its `consolidated` flag in place. Neither capability exists yet — port + adapter both need the new methods, and markdown parsing stays in infra.

- [ ] **Step 1: Write failing adapter tests**

Edit `packages/infra/tests/fs-verbatim-store.test.ts` and append two `describe` blocks:

```ts
describe('FsVerbatimStore.readEntry', () => {
  it('returns null for a missing file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-read-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const result = await store.readEntry('log/claude-code/raw/missing.md');
      expect(result).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('parses a stored entry back into a VerbatimEntry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-read-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const entry = VerbatimEntry.create({
        content: 'pgx MaxConns rule',
        agent: 'claude-code',
        sessionId: 'sess1',
        project: 'cli-relay',
        idGenerator: () => 'uuid1',
      });
      await store.writeEntry(entry);
      const roundtrip = await store.readEntry(entry.filePath);
      expect(roundtrip).not.toBeNull();
      expect(roundtrip!.agent).toBe('claude-code');
      expect(roundtrip!.sessionId).toBe('sess1');
      expect(roundtrip!.project).toBe('cli-relay');
      expect(roundtrip!.consolidated).toBe(false);
      expect(roundtrip!.content).toContain('pgx MaxConns rule');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('FsVerbatimStore.markConsolidated', () => {
  it('flips consolidated: false → true on disk', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-mark-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const entry = VerbatimEntry.create({
        content: 'fact',
        agent: 'claude-code',
        sessionId: 'sess',
        idGenerator: () => 'uuid2',
      });
      await store.writeEntry(entry);
      await store.markConsolidated(entry.filePath);
      const reloaded = await store.readEntry(entry.filePath);
      expect(reloaded!.consolidated).toBe(true);
      const unconsolidated = await store.listUnconsolidated('claude-code');
      expect(unconsolidated).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is idempotent when already consolidated', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-mark-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const entry = VerbatimEntry.create({
        content: 'x',
        agent: 'claude-code',
        sessionId: 's',
        idGenerator: () => 'uuid3',
      });
      await store.writeEntry(entry);
      await store.markConsolidated(entry.filePath);
      await expect(store.markConsolidated(entry.filePath)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('throws on missing file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-mark-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      await expect(
        store.markConsolidated('log/claude-code/raw/does-not-exist.md'),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

Make sure the imports at the top of the test file include `VerbatimEntry`, `mkdtemp`, `rm`, `tmpdir`, `path`, `FsVerbatimStore`, `FsFileStore`.

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm -F @llm-wiki/infra test fs-verbatim-store`
Expected: FAIL — `store.readEntry is not a function`, `store.markConsolidated is not a function`.

- [ ] **Step 3: Extend the port**

Edit `packages/core/src/ports/verbatim-store.ts`:

```ts
import type { VerbatimEntry } from '../domain/verbatim-entry.js';
import type { FileInfo } from './file-store.js';

export interface IVerbatimStore {
  /** Write a VerbatimEntry to disk as markdown (serialization owned by infra). */
  writeEntry(entry: VerbatimEntry): Promise<void>;

  /** Find verbatim entries with consolidated: false for a given agent. */
  listUnconsolidated(agent: string): Promise<FileInfo[]>;

  /** Count unconsolidated entries across all agents. */
  countUnconsolidated(): Promise<number>;

  /** Load a single entry by relative path. Returns null if missing. */
  readEntry(filePath: string): Promise<VerbatimEntry | null>;

  /**
   * Flip the `consolidated` flag to `true` for the entry at `filePath`.
   * Idempotent: a no-op if already consolidated. Throws if the file does
   * not exist.
   */
  markConsolidated(filePath: string): Promise<void>;
}
```

- [ ] **Step 4: Extend the adapter**

Edit `packages/infra/src/fs-verbatim-store.ts` and append methods inside the class:

```ts
async readEntry(filePath: string): Promise<VerbatimEntry | null> {
  const raw = await this.fileStore.readFile(filePath);
  if (raw === null) return null;
  const parsed = matter(raw);
  const filename = filePath.split('/').pop() ?? filePath;
  return VerbatimEntry.fromParsedData(filename, {
    session: String(parsed.data.session ?? ''),
    agent: String(parsed.data.agent ?? ''),
    project: parsed.data.project ? String(parsed.data.project) : undefined,
    tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : undefined,
    consolidated: parsed.data.consolidated === true,
    created: String(parsed.data.created ?? ''),
    content: parsed.content,
  });
}

async markConsolidated(filePath: string): Promise<void> {
  const raw = await this.fileStore.readFile(filePath);
  if (raw === null) {
    throw new Error(`Cannot mark consolidated — file not found: ${filePath}`);
  }
  const parsed = matter(raw);
  if (parsed.data.consolidated === true) return;
  const nextFm = { ...parsed.data, consolidated: true };
  const rewritten = matter.stringify(parsed.content, nextFm);
  await this.fileStore.writeFile(filePath, rewritten);
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm -F @llm-wiki/infra test fs-verbatim-store`
Expected: PASS on all new + existing cases.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ports/verbatim-store.ts \
        packages/infra/src/fs-verbatim-store.ts \
        packages/infra/tests/fs-verbatim-store.test.ts
git commit -m ":sparkles: [core] Extend IVerbatimStore with readEntry + markConsolidated"
```

---

## Task 4: LintReport + HealthIssue + AgentMemoryItem domain types

**Files:**
- Create: `packages/core/src/domain/lint-report.ts`
- Create: `packages/core/src/domain/health-issue.ts`
- Create: `packages/core/src/domain/agent-memory-item.ts`
- Create: `packages/core/tests/domain/lint-report.test.ts`
- Create: `packages/core/tests/domain/health-issue.test.ts`
- Create: `packages/core/tests/domain/agent-memory-item.test.ts`
- Modify: `packages/core/src/domain/index.ts`

These are pure value objects — no branching logic — but they pin the LintService response shape and give us something to test-drive.

- [ ] **Step 1: Write failing HealthIssue test**

Create `packages/core/tests/domain/health-issue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { HealthIssue, HealthIssueType } from '../../src/domain/health-issue.js';

describe('HealthIssue', () => {
  it('carries type, page path, and human description', () => {
    const issue = HealthIssue.create({
      type: HealthIssueType.Orphan,
      page: 'wiki/tools/postgresql.md',
      description: 'No inbound links from any other page',
    });
    expect(issue.type).toBe('orphan');
    expect(issue.page).toBe('wiki/tools/postgresql.md');
    expect(issue.description).toContain('No inbound');
  });

  it('serialises to a plain object', () => {
    const issue = HealthIssue.create({
      type: HealthIssueType.Stale,
      page: 'wiki/a.md',
      description: 'Last updated > 365 days ago',
    });
    expect(issue.toData()).toEqual({
      type: 'stale',
      page: 'wiki/a.md',
      description: 'Last updated > 365 days ago',
    });
  });

  it('rejects empty page path', () => {
    expect(() =>
      HealthIssue.create({
        type: HealthIssueType.Orphan,
        page: '',
        description: 'x',
      }),
    ).toThrow(/page/i);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm -F @llm-wiki/core test health-issue`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement HealthIssue**

Create `packages/core/src/domain/health-issue.ts`:

```ts
export const HealthIssueType = {
  Orphan: 'orphan',
  Stale: 'stale',
  Contradiction: 'contradiction',
  MissingConcept: 'missing_concept',
  BrokenLink: 'broken_link',
} as const;

export type HealthIssueTypeValue = typeof HealthIssueType[keyof typeof HealthIssueType];

export interface HealthIssueData {
  type: HealthIssueTypeValue;
  page: string;
  description: string;
}

export class HealthIssue {
  private constructor(
    public readonly type: HealthIssueTypeValue,
    public readonly page: string,
    public readonly description: string,
  ) {}

  static create(data: HealthIssueData): HealthIssue {
    if (!data.page) {
      throw new Error('HealthIssue.page must not be empty');
    }
    if (!data.description) {
      throw new Error('HealthIssue.description must not be empty');
    }
    return new HealthIssue(data.type, data.page, data.description);
  }

  toData(): HealthIssueData {
    return { type: this.type, page: this.page, description: this.description };
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `pnpm -F @llm-wiki/core test health-issue`
Expected: PASS.

- [ ] **Step 5: Write failing LintReport test**

Create `packages/core/tests/domain/lint-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LintReport } from '../../src/domain/lint-report.js';
import { HealthIssue, HealthIssueType } from '../../src/domain/health-issue.js';

describe('LintReport', () => {
  it('defaults every counter to zero', () => {
    const report = LintReport.empty();
    expect(report.consolidated).toBe(0);
    expect(report.promoted).toBe(0);
    expect(report.issues).toEqual([]);
    expect(report.commitSha).toBeNull();
  });

  it('merges two reports by summing counters and concatenating issues', () => {
    const a = LintReport.from({
      consolidated: 3,
      promoted: 1,
      issues: [
        HealthIssue.create({ type: HealthIssueType.Orphan, page: 'a.md', description: 'x' }),
      ],
      commitSha: null,
    });
    const b = LintReport.from({
      consolidated: 2,
      promoted: 4,
      issues: [
        HealthIssue.create({ type: HealthIssueType.Stale, page: 'b.md', description: 'y' }),
      ],
      commitSha: null,
    });
    const merged = a.merge(b);
    expect(merged.consolidated).toBe(5);
    expect(merged.promoted).toBe(5);
    expect(merged.issues).toHaveLength(2);
  });

  it('withCommit returns a copy carrying the SHA', () => {
    const base = LintReport.empty();
    const sealed = base.withCommit('abc123');
    expect(sealed.commitSha).toBe('abc123');
    expect(base.commitSha).toBeNull(); // original untouched
  });
});
```

- [ ] **Step 6: Run, confirm failure**

Run: `pnpm -F @llm-wiki/core test lint-report`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement LintReport**

Create `packages/core/src/domain/lint-report.ts`:

```ts
import type { HealthIssue } from './health-issue.js';

export interface LintReportData {
  consolidated: number;
  promoted: number;
  issues: HealthIssue[];
  commitSha: string | null;
}

export class LintReport {
  private constructor(
    public readonly consolidated: number,
    public readonly promoted: number,
    public readonly issues: readonly HealthIssue[],
    public readonly commitSha: string | null,
  ) {}

  static empty(): LintReport {
    return new LintReport(0, 0, [], null);
  }

  static from(data: LintReportData): LintReport {
    return new LintReport(data.consolidated, data.promoted, [...data.issues], data.commitSha);
  }

  merge(other: LintReport): LintReport {
    return new LintReport(
      this.consolidated + other.consolidated,
      this.promoted + other.promoted,
      [...this.issues, ...other.issues],
      other.commitSha ?? this.commitSha,
    );
  }

  withCommit(sha: string): LintReport {
    return new LintReport(this.consolidated, this.promoted, [...this.issues], sha);
  }

  toData(): LintReportData {
    return {
      consolidated: this.consolidated,
      promoted: this.promoted,
      issues: [...this.issues],
      commitSha: this.commitSha,
    };
  }
}
```

- [ ] **Step 8: Run, confirm pass**

Run: `pnpm -F @llm-wiki/core test lint-report`
Expected: PASS.

- [ ] **Step 9: Write failing AgentMemoryItem test**

Create `packages/core/tests/domain/agent-memory-item.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AgentMemoryItem } from '../../src/domain/agent-memory-item.js';

describe('AgentMemoryItem', () => {
  it('captures source path, session, project, content, and mtime', () => {
    const item = AgentMemoryItem.create({
      agent: 'claude-code',
      sourcePath: '/home/me/.claude/projects/abc/memory/2026-04-09.md',
      sessionId: 'sess42',
      project: 'cli-relay',
      content: 'fact a\nfact b',
      mtime: '2026-04-09T14:00:00Z',
    });
    expect(item.agent).toBe('claude-code');
    expect(item.sessionId).toBe('sess42');
    expect(item.project).toBe('cli-relay');
    expect(item.content).toBe('fact a\nfact b');
    expect(item.mtime).toBe('2026-04-09T14:00:00Z');
  });

  it('normalises sessionId to the same regex as VerbatimEntry identifiers', () => {
    expect(() =>
      AgentMemoryItem.create({
        agent: 'claude-code',
        sourcePath: '/x/y.md',
        sessionId: '../escape',
        content: 'c',
        mtime: '2026-04-09T00:00:00Z',
      }),
    ).toThrow(/sessionId/);
  });

  it('agent identifier must also be safe', () => {
    expect(() =>
      AgentMemoryItem.create({
        agent: 'claude code',
        sourcePath: '/x/y.md',
        sessionId: 's',
        content: 'c',
        mtime: '2026-04-09T00:00:00Z',
      }),
    ).toThrow(/agent/);
  });
});
```

- [ ] **Step 10: Run, confirm failure**

Run: `pnpm -F @llm-wiki/core test agent-memory-item`
Expected: FAIL — module not found.

- [ ] **Step 11: Implement AgentMemoryItem**

Create `packages/core/src/domain/agent-memory-item.ts`:

```ts
import { InvalidIdentifierError } from './errors.js';

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function assertIdentifier(field: string, value: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new InvalidIdentifierError(field, value);
  }
}

export interface AgentMemoryItemData {
  agent: string;
  sourcePath: string;
  sessionId: string;
  project?: string;
  content: string;
  mtime: string;
}

export class AgentMemoryItem {
  private constructor(
    public readonly agent: string,
    public readonly sourcePath: string,
    public readonly sessionId: string,
    public readonly project: string | undefined,
    public readonly content: string,
    public readonly mtime: string,
  ) {}

  static create(data: AgentMemoryItemData): AgentMemoryItem {
    assertIdentifier('agent', data.agent);
    assertIdentifier('sessionId', data.sessionId);
    if (!data.sourcePath) throw new Error('AgentMemoryItem.sourcePath required');
    if (!data.content) throw new Error('AgentMemoryItem.content required');
    if (!data.mtime) throw new Error('AgentMemoryItem.mtime required');
    return new AgentMemoryItem(
      data.agent,
      data.sourcePath,
      data.sessionId,
      data.project,
      data.content,
      data.mtime,
    );
  }

  /** Key used for deduplication across repeated imports. */
  get dedupeKey(): string {
    return `${this.agent}:${this.sessionId}:${this.sourcePath}`;
  }
}
```

- [ ] **Step 12: Re-export from domain index**

Edit `packages/core/src/domain/index.ts` and add:

```ts
export { HealthIssue, HealthIssueType } from './health-issue.js';
export type { HealthIssueTypeValue, HealthIssueData } from './health-issue.js';
export { LintReport } from './lint-report.js';
export type { LintReportData } from './lint-report.js';
export { AgentMemoryItem } from './agent-memory-item.js';
export type { AgentMemoryItemData } from './agent-memory-item.js';
```

- [ ] **Step 13: Run all domain tests**

Run: `pnpm -F @llm-wiki/core test domain`
Expected: PASS on all three new suites plus existing ones.

- [ ] **Step 14: Commit**

```bash
git add packages/core/src/domain/health-issue.ts \
        packages/core/src/domain/lint-report.ts \
        packages/core/src/domain/agent-memory-item.ts \
        packages/core/src/domain/index.ts \
        packages/core/tests/domain/health-issue.test.ts \
        packages/core/tests/domain/lint-report.test.ts \
        packages/core/tests/domain/agent-memory-item.test.ts
git commit -m ":sparkles: [core] Add LintReport, HealthIssue, AgentMemoryItem value objects"
```

---

## Task 5: IAgentMemoryReader port + error types

**Files:**
- Create: `packages/core/src/ports/agent-memory-reader.ts`
- Modify: `packages/core/src/ports/index.ts`
- Modify: `packages/core/src/domain/errors.ts`
- Modify: `packages/core/src/domain/index.ts`

- [ ] **Step 1: Add ImportError domain types**

Edit `packages/core/src/domain/errors.ts`, append:

```ts
export class ImportReaderNotRegisteredError extends WikiError {
  constructor(public readonly agent: string) {
    super('IMPORT_READER_NOT_REGISTERED', `No IAgentMemoryReader registered for agent "${agent}"`);
  }
}

export class LintPhaseError extends WikiError {
  constructor(public readonly phase: string, message: string) {
    super('LINT_PHASE_ERROR', `Lint phase "${phase}" failed: ${message}`);
  }
}
```

Re-export from `packages/core/src/domain/index.ts`:

```ts
export { ImportReaderNotRegisteredError, LintPhaseError } from './errors.js';
```

- [ ] **Step 2: Write the IAgentMemoryReader port**

Create `packages/core/src/ports/agent-memory-reader.ts`:

```ts
import type { AgentMemoryItem } from '../domain/agent-memory-item.js';

export interface AgentMemoryDiscoveryOptions {
  /** Glob/base paths to scan (resolved by the adapter). */
  paths: string[];
  /**
   * Only return items whose mtime is strictly greater than this ISO
   * timestamp. `null` means "return everything".
   */
  since: string | null;
}

export interface IAgentMemoryReader {
  /** Agent identifier this reader handles (e.g. `'claude-code'`). */
  readonly agent: string;

  /** Enumerate new memory items under the configured paths. */
  discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]>;
}
```

- [ ] **Step 3: Re-export from ports index**

Edit `packages/core/src/ports/index.ts`:

```ts
export type { IAgentMemoryReader, AgentMemoryDiscoveryOptions } from './agent-memory-reader.js';
```

- [ ] **Step 4: Confirm build still types**

Run: `pnpm -F @llm-wiki/core exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ports/agent-memory-reader.ts \
        packages/core/src/ports/index.ts \
        packages/core/src/domain/errors.ts \
        packages/core/src/domain/index.ts
git commit -m ":sparkles: [core] Add IAgentMemoryReader port and import/lint error types"
```

---

## Task 6: ConsolidatePhase — extract wiki/project pages from verbatim

**Files:**
- Create: `packages/core/src/services/lint/consolidate-phase.ts`
- Create: `packages/core/tests/services/lint/consolidate-phase.test.ts`

`ConsolidatePhase` is a pure orchestrator: takes unconsolidated verbatim entries, asks the LLM for structured page edits, writes them to a worktree-scoped `IFileStore`, flips `consolidated`, and returns the touched file paths + count. It owns NO git calls — `LintService` handles the worktree lifecycle.

**Batch sizing:** the spec caps each consolidation batch at 50 entries. We export `CONSOLIDATE_BATCH_LIMIT = 50` so the `LintService` (and tests) can reference it.

- [ ] **Step 1: Write failing test (happy path)**

Create `packages/core/tests/services/lint/consolidate-phase.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsolidatePhase, CONSOLIDATE_BATCH_LIMIT } from '../../../src/services/lint/consolidate-phase.js';
import { VerbatimEntry } from '../../../src/domain/verbatim-entry.js';
import type {
  IFileStore,
  IVerbatimStore,
  ILlmClient,
  IArchiver,
  FileInfo,
  LlmCompletionRequest,
  LlmCompletionResponse,
  ArchiveEntry,
  ArchiveResult,
} from '../../../src/ports/index.js';
import type { WikiPageData } from '../../../src/domain/wiki-page.js';

class FakeFileStore implements IFileStore {
  files: Record<string, string> = {};
  async readFile(p: string): Promise<string | null> {
    return this.files[p] ?? null;
  }
  async writeFile(p: string, c: string): Promise<void> {
    this.files[p] = c;
  }
  async listFiles(): Promise<FileInfo[]> {
    return [];
  }
  async exists(p: string): Promise<boolean> {
    return p in this.files;
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    if (!(p in this.files)) return null;
    return {
      frontmatter: {
        title: p,
        created: '2026-04-01',
        updated: '2026-04-01',
        confidence: 0.8,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: this.files[p],
    };
  }
}

class FakeVerbatimStore implements IVerbatimStore {
  public entries: Map<string, VerbatimEntry> = new Map();
  public marked: string[] = [];
  async writeEntry(e: VerbatimEntry): Promise<void> {
    this.entries.set(e.filePath, e);
  }
  async listUnconsolidated(agent: string): Promise<FileInfo[]> {
    return [...this.entries.values()]
      .filter((e) => e.agent === agent && !e.consolidated)
      .map((e) => ({ path: e.filePath, updated: e.created }));
  }
  async countUnconsolidated(): Promise<number> {
    return [...this.entries.values()].filter((e) => !e.consolidated).length;
  }
  async readEntry(p: string): Promise<VerbatimEntry | null> {
    return this.entries.get(p) ?? null;
  }
  async markConsolidated(p: string): Promise<void> {
    this.marked.push(p);
    const e = this.entries.get(p);
    if (!e) throw new Error('not found');
    // swap for a "consolidated" instance by replaying the constructor via fromParsedData
    this.entries.set(
      p,
      VerbatimEntry.fromParsedData(p.split('/').pop()!, {
        session: e.sessionId,
        agent: e.agent,
        project: e.project,
        tags: e.tags,
        consolidated: true,
        created: e.created,
        content: e.content,
      }),
    );
  }
}

class FakeLlm implements ILlmClient {
  public response:
    | { pages: Array<{ path: string; title: string; content: string; source_entries: string[] }> }
    | Error = { pages: [] };
  public completeSpy = vi.fn();
  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.completeSpy(req);
    if (this.response instanceof Error) throw this.response;
    return {
      content: JSON.stringify(this.response),
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }
}

class FakeArchiver implements IArchiver {
  public createSpy = vi.fn<(p: string, e: ArchiveEntry[]) => ArchiveResult>();
  async createArchive(p: string, e: ArchiveEntry[]): Promise<ArchiveResult> {
    this.createSpy(p, e);
    return { archivePath: p, fileCount: e.length, bytes: 42 };
  }
}

describe('ConsolidatePhase', () => {
  let fileStore: FakeFileStore;
  let verbatimStore: FakeVerbatimStore;
  let llm: FakeLlm;

  beforeEach(() => {
    fileStore = new FakeFileStore();
    verbatimStore = new FakeVerbatimStore();
    llm = new FakeLlm();
  });

  async function seed(count: number, agent = 'claude-code'): Promise<void> {
    for (let i = 0; i < count; i++) {
      await verbatimStore.writeEntry(
        VerbatimEntry.create({
          content: `fact ${i}`,
          agent,
          sessionId: `sess${i}`,
          idGenerator: () => `uuid${i}`,
        }),
      );
    }
  }

  it('returns (0, []) when no unconsolidated entries exist', async () => {
    const phase = new ConsolidatePhase(fileStore, verbatimStore, llm);
    const result = await phase.run();
    expect(result.consolidatedCount).toBe(0);
    expect(result.touchedPaths).toEqual([]);
    expect(llm.completeSpy).not.toHaveBeenCalled();
  });

  it('asks the LLM for structured edits, writes pages, marks entries', async () => {
    await seed(3);
    llm.response = {
      pages: [
        {
          path: 'wiki/tools/postgresql.md',
          title: 'PostgreSQL',
          content: '## Summary\nConsolidated wisdom.',
          source_entries: [...verbatimStore.entries.keys()],
        },
      ],
    };
    const phase = new ConsolidatePhase(fileStore, verbatimStore, llm);
    const result = await phase.run();
    expect(result.consolidatedCount).toBe(3);
    expect(result.touchedPaths).toContain('wiki/tools/postgresql.md');
    expect(fileStore.files['wiki/tools/postgresql.md']).toMatch(/PostgreSQL/);
    expect(verbatimStore.marked).toHaveLength(3);
  });

  it('rejects LLM-returned paths outside wiki/ or projects/', async () => {
    await seed(1);
    llm.response = {
      pages: [
        {
          path: '../evil.md',
          title: 'x',
          content: 'y',
          source_entries: [...verbatimStore.entries.keys()],
        },
      ],
    };
    const phase = new ConsolidatePhase(fileStore, verbatimStore, llm);
    await expect(phase.run()).rejects.toThrow(/path/i);
    expect(verbatimStore.marked).toHaveLength(0);
  });

  it('processes at most CONSOLIDATE_BATCH_LIMIT entries per run', async () => {
    await seed(CONSOLIDATE_BATCH_LIMIT + 10);
    llm.response = { pages: [] };
    const phase = new ConsolidatePhase(fileStore, verbatimStore, llm);
    const result = await phase.run();
    // even with no pages emitted, every entry in the batch must be marked
    expect(result.consolidatedCount).toBe(CONSOLIDATE_BATCH_LIMIT);
  });

  it('propagates LlmUnavailableError on LLM failure and marks nothing', async () => {
    await seed(2);
    llm.response = new Error('DOWN');
    const phase = new ConsolidatePhase(fileStore, verbatimStore, llm);
    await expect(phase.run()).rejects.toThrow();
    expect(verbatimStore.marked).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm -F @llm-wiki/core test consolidate-phase`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ConsolidatePhase**

Create `packages/core/src/services/lint/consolidate-phase.ts`:

```ts
import { LintPhaseError, LlmUnavailableError } from '../../domain/errors.js';
import type { IFileStore } from '../../ports/file-store.js';
import type { IVerbatimStore } from '../../ports/verbatim-store.js';
import type { ILlmClient } from '../../ports/llm-client.js';
import type { VerbatimEntry } from '../../domain/verbatim-entry.js';

export const CONSOLIDATE_BATCH_LIMIT = 50;

export interface ConsolidatePhaseResult {
  consolidatedCount: number;
  touchedPaths: string[];
}

interface ProposedPage {
  path: string;
  title: string;
  content: string;
  source_entries: string[];
}

const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

const CONSOLIDATE_SYSTEM_PROMPT =
  'You are a wiki editor. Merge verbatim memory entries into durable wiki or project pages. ' +
  'Respond with a JSON object: {"pages":[{"path":"wiki/...","title":"...","content":"...","source_entries":["log/..."]}]}. ' +
  'Only emit pages when the entries contain reusable knowledge. An empty pages array is valid.';

/**
 * Phase 1 of wiki_lint.
 *
 * Loads up to `CONSOLIDATE_BATCH_LIMIT` unconsolidated verbatim entries from
 * every known agent, asks the LLM to fold them into wiki/project pages, and
 * writes those pages via a worktree-scoped `IFileStore`. Every entry in the
 * batch is marked `consolidated: true` regardless of whether the LLM chose
 * to integrate it — re-emitting the same entry next lint run is waste, and
 * the LLM has already had one chance to use it. Pages targeting paths
 * outside `wiki/` or `projects/<name>/` are rejected before any marker is
 * flipped (INV-5 compliance relies on this — if we marked first and then
 * threw, re-runs would silently skip real data).
 *
 * Worktree discipline: the phase is handed a worktree-scoped `IFileStore`
 * and `IVerbatimStore` by `LintService`. It never touches main-branch paths.
 */
export class ConsolidatePhase {
  constructor(
    private readonly worktreeFileStore: IFileStore,
    private readonly worktreeVerbatimStore: IVerbatimStore,
    private readonly llmClient: ILlmClient,
  ) {}

  async run(): Promise<ConsolidatePhaseResult> {
    const batch = await this.collectBatch();
    if (batch.length === 0) {
      return { consolidatedCount: 0, touchedPaths: [] };
    }

    let pages: ProposedPage[];
    try {
      pages = await this.askLlm(batch);
    } catch (err) {
      if (err instanceof LlmUnavailableError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(message);
    }

    // Validate BEFORE we start mutating anything — an invalid path must
    // not leave a partial write or a flipped marker.
    for (const page of pages) {
      this.validatePagePath(page.path);
    }

    // Write every proposed page.
    const touchedPaths: string[] = [];
    for (const page of pages) {
      const body = this.renderPage(page);
      await this.worktreeFileStore.writeFile(page.path, body);
      touchedPaths.push(page.path);
    }

    // Flip every entry in the batch — INV-5. Writes only happen AFTER the
    // pages have been written successfully above, so a mid-loop crash here
    // leaves the pages on disk but the entries unconsolidated (self-healing
    // on next lint run: same LLM input + same output is idempotent because
    // pages are overwritten, not appended).
    for (const entry of batch) {
      await this.worktreeVerbatimStore.markConsolidated(entry.filePath);
    }

    return { consolidatedCount: batch.length, touchedPaths };
  }

  private async collectBatch(): Promise<VerbatimEntry[]> {
    const logRoot = await this.worktreeFileStore.listFiles('log');
    const agents = new Set<string>();
    for (const info of logRoot) {
      const parts = info.path.split('/');
      if (parts.length >= 3 && parts[0] === 'log') agents.add(parts[1]);
    }

    const batch: VerbatimEntry[] = [];
    for (const agent of [...agents].sort()) {
      if (batch.length >= CONSOLIDATE_BATCH_LIMIT) break;
      const unconsolidated = await this.worktreeVerbatimStore.listUnconsolidated(agent);
      // Deterministic order: by path (filename includes date + session + uuid).
      unconsolidated.sort((a, b) => a.path.localeCompare(b.path));
      for (const info of unconsolidated) {
        if (batch.length >= CONSOLIDATE_BATCH_LIMIT) break;
        const entry = await this.worktreeVerbatimStore.readEntry(info.path);
        if (entry) batch.push(entry);
      }
    }
    return batch;
  }

  private async askLlm(batch: VerbatimEntry[]): Promise<ProposedPage[]> {
    const userPayload = batch.map((e) => ({
      path: e.filePath,
      agent: e.agent,
      project: e.project,
      content: e.content,
    }));
    const response = await this.llmClient.complete({
      system: CONSOLIDATE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            `Consolidate the following ${batch.length} entries. ` +
            'Reply with JSON: {"pages":[...]}.\n\n' +
            JSON.stringify(userPayload, null, 2),
        },
      ],
      temperature: 0.1,
    });

    const trimmed = this.stripCodeFence(response.content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(`model returned non-JSON: ${message}`);
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { pages?: unknown }).pages)
    ) {
      throw new LlmUnavailableError('model response missing "pages" array');
    }
    const pages = (parsed as { pages: unknown[] }).pages;
    const result: ProposedPage[] = [];
    for (const raw of pages) {
      if (
        typeof raw !== 'object' ||
        raw === null ||
        typeof (raw as { path?: unknown }).path !== 'string' ||
        typeof (raw as { title?: unknown }).title !== 'string' ||
        typeof (raw as { content?: unknown }).content !== 'string' ||
        !Array.isArray((raw as { source_entries?: unknown }).source_entries)
      ) {
        throw new LlmUnavailableError('malformed page entry in model response');
      }
      const obj = raw as ProposedPage;
      result.push({
        path: obj.path,
        title: obj.title,
        content: obj.content,
        source_entries: obj.source_entries,
      });
    }
    return result;
  }

  private validatePagePath(requestedPath: string): void {
    if (!requestedPath || requestedPath.includes('\\') || requestedPath.startsWith('/')) {
      throw new LintPhaseError('consolidate', `invalid path ${JSON.stringify(requestedPath)}`);
    }
    const segments = requestedPath.split('/');
    for (const seg of segments) {
      if (seg === '' || seg === '.' || seg === '..') {
        throw new LintPhaseError('consolidate', `invalid segment in ${requestedPath}`);
      }
    }
    if (!requestedPath.endsWith('.md')) {
      throw new LintPhaseError('consolidate', `path must end with .md: ${requestedPath}`);
    }
    if (segments[0] === 'wiki' && segments.length >= 2) return;
    if (segments[0] === 'projects' && segments.length >= 3 && PROJECT_NAME_RE.test(segments[1])) {
      return;
    }
    throw new LintPhaseError(
      'consolidate',
      `path must be wiki/... or projects/<name>/...: ${requestedPath}`,
    );
  }

  private renderPage(page: ProposedPage): string {
    const today = new Date().toISOString().slice(0, 10);
    const sources = page.source_entries
      .map((s) => `  - ${this.yamlString(s)}`)
      .join('\n');
    const fm = [
      '---',
      `title: ${this.yamlString(page.title)}`,
      `created: ${today}`,
      `updated: ${today}`,
      'confidence: 0.8',
      sources.length > 0 ? `sources:\n${sources}` : 'sources: []',
      'supersedes: null',
      'tags: []',
      '---',
      '',
    ].join('\n');
    return `${fm}\n${page.content.trim()}\n`;
  }

  private stripCodeFence(content: string): string {
    const trimmed = content.trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return match ? match[1] : trimmed;
  }

  private yamlString(value: string): string {
    if (/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/.test(value)) return value;
    return JSON.stringify(value);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm -F @llm-wiki/core test consolidate-phase`
Expected: PASS on all five cases.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/lint/consolidate-phase.ts \
        packages/core/tests/services/lint/consolidate-phase.test.ts
git commit -m ":sparkles: [core] Add ConsolidatePhase with LLM-driven verbatim fold-in"
```

---

## Task 7: PromotePhase — lift project practices into wiki/patterns

**Files:**
- Create: `packages/core/src/services/lint/promote-phase.ts`
- Create: `packages/core/tests/services/lint/promote-phase.test.ts`

`PromotePhase` reads `projects/*/practices.md`, asks the LLM which practices are reusable across projects, creates pages under `wiki/patterns/`, and rewrites the source project file so each promoted section becomes a markdown link. Like `ConsolidatePhase`, it operates on a worktree-scoped `IFileStore`.

- [ ] **Step 1: Write failing test**

Create `packages/core/tests/services/lint/promote-phase.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromotePhase } from '../../../src/services/lint/promote-phase.js';
import type {
  IFileStore,
  ILlmClient,
  FileInfo,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '../../../src/ports/index.js';
import type { WikiPageData } from '../../../src/domain/wiki-page.js';

class FakeFileStore implements IFileStore {
  files: Record<string, string> = {};
  async readFile(p: string): Promise<string | null> {
    return this.files[p] ?? null;
  }
  async writeFile(p: string, c: string): Promise<void> {
    this.files[p] = c;
  }
  async listFiles(dir: string): Promise<FileInfo[]> {
    return Object.keys(this.files)
      .filter((k) => k.startsWith(dir + '/') || k === dir)
      .map((k) => ({ path: k, updated: '2026-04-01' }));
  }
  async exists(p: string): Promise<boolean> {
    return p in this.files;
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    if (!(p in this.files)) return null;
    return {
      frontmatter: {
        title: p,
        created: '2026-04-01',
        updated: '2026-04-01',
        confidence: 0.8,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: this.files[p],
    };
  }
}

class FakeLlm implements ILlmClient {
  public response: unknown = { promoted: [] };
  public completeSpy = vi.fn();
  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.completeSpy(req);
    if (this.response instanceof Error) throw this.response;
    return {
      content: JSON.stringify(this.response),
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }
}

describe('PromotePhase', () => {
  let fileStore: FakeFileStore;
  let llm: FakeLlm;

  beforeEach(() => {
    fileStore = new FakeFileStore();
    llm = new FakeLlm();
  });

  it('returns zero when no project practices files exist', async () => {
    const phase = new PromotePhase(fileStore, llm);
    const result = await phase.run();
    expect(result.promotedCount).toBe(0);
    expect(result.touchedPaths).toEqual([]);
  });

  it('creates wiki/patterns pages and rewrites source project file with link', async () => {
    fileStore.files['projects/cli-relay/practices.md'] =
      '---\ntitle: cli-relay practices\n---\n\n## no-db-mocking\nUse testcontainers not mocks.\n';
    fileStore.files['projects/other-app/practices.md'] =
      '---\ntitle: other-app practices\n---\n\n## no-db-mocking\nReal DB for integration tests.\n';

    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/no-db-mocking.md',
          title: 'No DB mocking',
          content: '## Summary\nPrefer testcontainers to DB mocks.',
          sources: ['projects/cli-relay/practices.md', 'projects/other-app/practices.md'],
          replacement_marker: 'no-db-mocking',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm);
    const result = await phase.run();

    expect(result.promotedCount).toBe(1);
    expect(result.touchedPaths).toContain('wiki/patterns/no-db-mocking.md');
    expect(fileStore.files['wiki/patterns/no-db-mocking.md']).toContain('Prefer testcontainers');

    // Source files gain a link to the promoted page.
    expect(fileStore.files['projects/cli-relay/practices.md']).toContain(
      '[no-db-mocking](../../wiki/patterns/no-db-mocking.md)',
    );
    expect(fileStore.files['projects/other-app/practices.md']).toContain(
      '[no-db-mocking](../../wiki/patterns/no-db-mocking.md)',
    );
  });

  it('rejects promotion target outside wiki/patterns/', async () => {
    fileStore.files['projects/x/practices.md'] =
      '---\ntitle: x\n---\n\n## a\nb\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/tools/x.md',
          title: 'x',
          content: 'y',
          sources: ['projects/x/practices.md'],
          replacement_marker: 'a',
        },
      ],
    };
    const phase = new PromotePhase(fileStore, llm);
    await expect(phase.run()).rejects.toThrow(/wiki\/patterns/);
  });

  it('propagates LLM failure as LlmUnavailableError', async () => {
    fileStore.files['projects/x/practices.md'] =
      '---\ntitle: x\n---\n\n## a\nb\n';
    llm.response = new Error('boom');
    const phase = new PromotePhase(fileStore, llm);
    await expect(phase.run()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm -F @llm-wiki/core test promote-phase`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PromotePhase**

Create `packages/core/src/services/lint/promote-phase.ts`:

```ts
import { LintPhaseError, LlmUnavailableError } from '../../domain/errors.js';
import type { IFileStore, FileInfo } from '../../ports/file-store.js';
import type { ILlmClient } from '../../ports/llm-client.js';

export interface PromotePhaseResult {
  promotedCount: number;
  touchedPaths: string[];
}

interface PromoteProposal {
  target: string;
  title: string;
  content: string;
  sources: string[];
  replacement_marker: string;
}

const PROMOTE_SYSTEM_PROMPT =
  'You are a knowledge curator. Identify reusable practices inside per-project practices.md files ' +
  'and lift them into shared wiki/patterns/ pages. ' +
  'Respond with a JSON object: {"promoted":[{"target":"wiki/patterns/...","title":"...","content":"...","sources":["projects/..."],"replacement_marker":"..."}]}. ' +
  'Only promote a practice when it is non-trivial and would apply to at least one other project. ' +
  '`replacement_marker` must match a heading or line inside each source file so the phase can swap it for a link.';

export class PromotePhase {
  constructor(
    private readonly worktreeFileStore: IFileStore,
    private readonly llmClient: ILlmClient,
  ) {}

  async run(): Promise<PromotePhaseResult> {
    const practicesFiles = await this.collectPracticeFiles();
    if (practicesFiles.length === 0) {
      return { promotedCount: 0, touchedPaths: [] };
    }

    const payload = await this.buildPayload(practicesFiles);
    if (payload.length === 0) {
      return { promotedCount: 0, touchedPaths: [] };
    }

    let proposals: PromoteProposal[];
    try {
      proposals = await this.askLlm(payload);
    } catch (err) {
      if (err instanceof LlmUnavailableError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(message);
    }

    for (const prop of proposals) {
      this.validateTarget(prop.target);
    }

    const touchedPaths: string[] = [];
    for (const prop of proposals) {
      const body = this.renderPage(prop);
      await this.worktreeFileStore.writeFile(prop.target, body);
      touchedPaths.push(prop.target);

      for (const sourcePath of prop.sources) {
        const original = await this.worktreeFileStore.readFile(sourcePath);
        if (original === null) continue;
        const rewritten = this.replaceMarkerWithLink(
          original,
          prop.replacement_marker,
          sourcePath,
          prop.target,
        );
        if (rewritten !== original) {
          await this.worktreeFileStore.writeFile(sourcePath, rewritten);
          if (!touchedPaths.includes(sourcePath)) touchedPaths.push(sourcePath);
        }
      }
    }

    return { promotedCount: proposals.length, touchedPaths };
  }

  private async collectPracticeFiles(): Promise<FileInfo[]> {
    const all = await this.worktreeFileStore.listFiles('projects');
    return all.filter((f) => /^projects\/[^/]+\/practices\.md$/.test(f.path));
  }

  private async buildPayload(files: FileInfo[]): Promise<Array<{ path: string; content: string }>> {
    const payload: Array<{ path: string; content: string }> = [];
    for (const file of files) {
      const content = await this.worktreeFileStore.readFile(file.path);
      if (content) payload.push({ path: file.path, content });
    }
    return payload;
  }

  private async askLlm(
    payload: Array<{ path: string; content: string }>,
  ): Promise<PromoteProposal[]> {
    const response = await this.llmClient.complete({
      system: PROMOTE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            'Project practices files:\n\n' +
            JSON.stringify(payload, null, 2) +
            '\n\nRespond with the {"promoted":[...]} JSON object.',
        },
      ],
      temperature: 0.1,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.stripCodeFence(response.content));
    } catch (err) {
      throw new LlmUnavailableError(
        `model returned non-JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { promoted?: unknown }).promoted)
    ) {
      throw new LlmUnavailableError('promote response missing "promoted" array');
    }
    const promoted = (parsed as { promoted: unknown[] }).promoted;
    const result: PromoteProposal[] = [];
    for (const raw of promoted) {
      const obj = raw as Partial<PromoteProposal>;
      if (
        typeof obj.target !== 'string' ||
        typeof obj.title !== 'string' ||
        typeof obj.content !== 'string' ||
        !Array.isArray(obj.sources) ||
        typeof obj.replacement_marker !== 'string'
      ) {
        throw new LlmUnavailableError('malformed promote entry');
      }
      result.push(obj as PromoteProposal);
    }
    return result;
  }

  private validateTarget(target: string): void {
    if (!target.startsWith('wiki/patterns/') || !target.endsWith('.md')) {
      throw new LintPhaseError(
        'promote',
        `target must be wiki/patterns/<name>.md: ${target}`,
      );
    }
    const segments = target.split('/');
    for (const seg of segments) {
      if (seg === '' || seg === '.' || seg === '..') {
        throw new LintPhaseError('promote', `invalid segment in ${target}`);
      }
    }
  }

  private renderPage(prop: PromoteProposal): string {
    const today = new Date().toISOString().slice(0, 10);
    const sources = prop.sources.map((s) => `  - ${s}`).join('\n');
    const fm = [
      '---',
      `title: ${this.yamlString(prop.title)}`,
      `created: ${today}`,
      `updated: ${today}`,
      'confidence: 0.9',
      `sources:\n${sources}`,
      'supersedes: null',
      'tags: [promoted]',
      '---',
      '',
    ].join('\n');
    return `${fm}\n${prop.content.trim()}\n`;
  }

  /**
   * Replace the first occurrence of the replacement marker (matched as a
   * markdown heading OR literal line) with a link to the promoted page.
   * The link path is computed relative to the source file.
   */
  private replaceMarkerWithLink(
    original: string,
    marker: string,
    sourcePath: string,
    targetPath: string,
  ): string {
    const relLink = this.relativeLink(sourcePath, targetPath);
    const markerEscaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const asHeading = new RegExp(`^##\\s+${markerEscaped}\\s*$`, 'm');
    if (asHeading.test(original)) {
      return original.replace(asHeading, `## [${marker}](${relLink})`);
    }
    const asLine = new RegExp(`^${markerEscaped}\\s*$`, 'm');
    if (asLine.test(original)) {
      return original.replace(asLine, `[${marker}](${relLink})`);
    }
    return original; // nothing to replace — leave source untouched
  }

  private relativeLink(fromFile: string, toFile: string): string {
    const fromSegments = fromFile.split('/').slice(0, -1);
    const toSegments = toFile.split('/');
    const up = '../'.repeat(fromSegments.length);
    return `${up}${toSegments.join('/')}`;
  }

  private stripCodeFence(content: string): string {
    const trimmed = content.trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return match ? match[1] : trimmed;
  }

  private yamlString(value: string): string {
    if (/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/.test(value)) return value;
    return JSON.stringify(value);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm -F @llm-wiki/core test promote-phase`
Expected: PASS on all four cases.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/lint/promote-phase.ts \
        packages/core/tests/services/lint/promote-phase.test.ts
git commit -m ":sparkles: [core] Add PromotePhase for project→wiki/patterns promotion"
```

---

## Task 8: HealthPhase — report orphans, stale pages, broken links

**Files:**
- Create: `packages/core/src/services/lint/health-phase.ts`
- Create: `packages/core/tests/services/lint/health-phase.test.ts`

Health is the deterministic half of the lint workflow. We keep it strictly non-LLM for this milestone — contradictions + missing-concept detection (which require an LLM) are out of scope and tracked in the spec's health check backlog. The phase inspects `wiki/` and `projects/` pages and emits `HealthIssue`s for:

1. **Orphan pages** — no other page in the wiki links to them (ignored: `wiki/index.md`).
2. **Stale pages** — `frontmatter.updated` older than the configurable threshold (default 365 days) AND `confidence < 0.7`.
3. **Broken links** — a markdown link to a `.md` file that does not exist relative to the source.

- [ ] **Step 1: Write failing test**

Create `packages/core/tests/services/lint/health-phase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { HealthPhase } from '../../../src/services/lint/health-phase.js';
import { HealthIssueType } from '../../../src/domain/health-issue.js';
import type { IFileStore, FileInfo } from '../../../src/ports/index.js';
import type { WikiPageData } from '../../../src/domain/wiki-page.js';

class FakeFileStore implements IFileStore {
  files: Record<string, WikiPageData> = {};
  async readFile(): Promise<string | null> {
    return null;
  }
  async writeFile(): Promise<void> {}
  async listFiles(dir: string): Promise<FileInfo[]> {
    return Object.keys(this.files)
      .filter((k) => k.startsWith(dir + '/') || k === dir)
      .map((k) => ({ path: k, updated: this.files[k].frontmatter.updated }));
  }
  async exists(p: string): Promise<boolean> {
    return p in this.files;
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    return this.files[p] ?? null;
  }
}

function page(updated: string, content: string, confidence = 0.8): WikiPageData {
  return {
    frontmatter: {
      title: 't',
      created: '2025-01-01',
      updated,
      confidence,
      sources: [],
      supersedes: null,
      tags: [],
    },
    content,
  };
}

describe('HealthPhase', () => {
  it('reports no issues for a healthy wiki', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/a.md'] = page('2026-04-01', '[b](b.md)');
    fs.files['wiki/b.md'] = page('2026-04-01', '[a](a.md)');
    const phase = new HealthPhase(fs, { now: () => new Date('2026-04-10T00:00:00Z'), staleDays: 365 });
    const result = await phase.run();
    expect(result.issues).toEqual([]);
  });

  it('flags orphan pages', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/a.md'] = page('2026-04-01', '');
    fs.files['wiki/b.md'] = page('2026-04-01', '');
    const phase = new HealthPhase(fs, { now: () => new Date('2026-04-10T00:00:00Z'), staleDays: 365 });
    const result = await phase.run();
    const orphans = result.issues.filter((i) => i.type === HealthIssueType.Orphan);
    expect(orphans.map((i) => i.page).sort()).toEqual(['wiki/a.md', 'wiki/b.md']);
  });

  it('flags stale pages older than threshold with low confidence', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/old.md'] = page('2024-01-01', '[x](x.md)', 0.3);
    fs.files['wiki/x.md'] = page('2026-04-01', '[old](old.md)');
    const phase = new HealthPhase(fs, { now: () => new Date('2026-04-10T00:00:00Z'), staleDays: 365 });
    const result = await phase.run();
    const stale = result.issues.filter((i) => i.type === HealthIssueType.Stale);
    expect(stale.map((i) => i.page)).toEqual(['wiki/old.md']);
  });

  it('does NOT flag old pages with high confidence as stale', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/old.md'] = page('2024-01-01', '[x](x.md)', 0.95);
    fs.files['wiki/x.md'] = page('2026-04-01', '[old](old.md)');
    const phase = new HealthPhase(fs, { now: () => new Date('2026-04-10T00:00:00Z'), staleDays: 365 });
    const result = await phase.run();
    expect(result.issues.filter((i) => i.type === HealthIssueType.Stale)).toEqual([]);
  });

  it('flags broken relative links', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/a.md'] = page('2026-04-01', 'See [missing](missing.md)');
    fs.files['wiki/b.md'] = page('2026-04-01', '[a](a.md)');
    const phase = new HealthPhase(fs, { now: () => new Date('2026-04-10T00:00:00Z'), staleDays: 365 });
    const result = await phase.run();
    const broken = result.issues.filter((i) => i.type === HealthIssueType.BrokenLink);
    expect(broken).toHaveLength(1);
    expect(broken[0].page).toBe('wiki/a.md');
    expect(broken[0].description).toContain('missing.md');
  });

  it('ignores wiki/index.md from orphan detection', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/index.md'] = page('2026-04-01', '');
    fs.files['wiki/a.md'] = page('2026-04-01', '[other](index.md)');
    const phase = new HealthPhase(fs, { now: () => new Date('2026-04-10T00:00:00Z'), staleDays: 365 });
    const result = await phase.run();
    const orphans = result.issues.filter((i) => i.type === HealthIssueType.Orphan);
    expect(orphans.map((i) => i.page)).toEqual(['wiki/a.md']);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm -F @llm-wiki/core test health-phase`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement HealthPhase**

Create `packages/core/src/services/lint/health-phase.ts`:

```ts
import { HealthIssue, HealthIssueType } from '../../domain/health-issue.js';
import type { IFileStore, FileInfo } from '../../ports/file-store.js';
import type { WikiPage } from '../../domain/wiki-page.js';
import { WikiPage as WikiPageClass } from '../../domain/wiki-page.js';

export interface HealthPhaseOptions {
  now?: () => Date;
  staleDays?: number;
  staleConfidenceThreshold?: number;
}

export interface HealthPhaseResult {
  issues: HealthIssue[];
}

const DEFAULT_STALE_DAYS = 365;
const DEFAULT_STALE_CONFIDENCE = 0.7;

/**
 * Deterministic health checks — no LLM. Reports orphan pages, stale pages
 * (old AND low confidence), and broken markdown links. Runs read-only
 * against the worktree-scoped file store; `LintService` does not expect
 * any file writes from this phase.
 */
export class HealthPhase {
  private readonly now: () => Date;
  private readonly staleMs: number;
  private readonly staleConfidence: number;

  constructor(
    private readonly worktreeFileStore: IFileStore,
    options: HealthPhaseOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.staleMs = (options.staleDays ?? DEFAULT_STALE_DAYS) * 24 * 60 * 60 * 1000;
    this.staleConfidence = options.staleConfidenceThreshold ?? DEFAULT_STALE_CONFIDENCE;
  }

  async run(): Promise<HealthPhaseResult> {
    const wikiFiles = await this.worktreeFileStore.listFiles('wiki');
    const projectFiles = await this.worktreeFileStore.listFiles('projects');
    const all: FileInfo[] = [...wikiFiles, ...projectFiles];

    const pages: WikiPage[] = [];
    for (const info of all) {
      const data = await this.worktreeFileStore.readWikiPage(info.path);
      if (data) pages.push(WikiPageClass.fromParsedData(info.path, data));
    }

    const issues: HealthIssue[] = [];
    issues.push(...this.checkOrphans(pages));
    issues.push(...this.checkStale(pages));
    issues.push(...this.checkBrokenLinks(pages));
    return { issues };
  }

  private checkOrphans(pages: WikiPage[]): HealthIssue[] {
    const byPath = new Map(pages.map((p) => [p.path, p]));
    const inboundCount = new Map<string, number>();
    for (const page of pages) {
      for (const ref of page.crossrefs) {
        const resolved = this.resolveLink(page.path, ref);
        if (resolved && byPath.has(resolved)) {
          inboundCount.set(resolved, (inboundCount.get(resolved) ?? 0) + 1);
        }
      }
    }
    const issues: HealthIssue[] = [];
    for (const page of pages) {
      if (page.path === 'wiki/index.md') continue;
      if ((inboundCount.get(page.path) ?? 0) === 0) {
        issues.push(
          HealthIssue.create({
            type: HealthIssueType.Orphan,
            page: page.path,
            description: 'No inbound links from any other page',
          }),
        );
      }
    }
    return issues;
  }

  private checkStale(pages: WikiPage[]): HealthIssue[] {
    const now = this.now().getTime();
    const issues: HealthIssue[] = [];
    for (const page of pages) {
      const updated = Date.parse(page.updated);
      if (Number.isNaN(updated)) continue;
      const ageMs = now - updated;
      if (ageMs > this.staleMs && page.confidence < this.staleConfidence) {
        const days = Math.round(ageMs / (24 * 60 * 60 * 1000));
        issues.push(
          HealthIssue.create({
            type: HealthIssueType.Stale,
            page: page.path,
            description: `Last updated ${days} days ago (confidence ${page.confidence.toFixed(2)})`,
          }),
        );
      }
    }
    return issues;
  }

  private checkBrokenLinks(pages: WikiPage[]): HealthIssue[] {
    const byPath = new Set(pages.map((p) => p.path));
    const issues: HealthIssue[] = [];
    for (const page of pages) {
      for (const ref of page.crossrefs) {
        if (/^https?:/i.test(ref)) continue; // external, out of scope
        const resolved = this.resolveLink(page.path, ref);
        if (!resolved) continue;
        if (!byPath.has(resolved)) {
          issues.push(
            HealthIssue.create({
              type: HealthIssueType.BrokenLink,
              page: page.path,
              description: `Broken link to ${ref} (resolved to ${resolved})`,
            }),
          );
        }
      }
    }
    return issues;
  }

  /** Resolve a relative markdown link against a source page path. */
  private resolveLink(sourcePath: string, link: string): string | null {
    if (link.startsWith('/')) return null; // absolute — not supported in wiki
    const fromSegments = sourcePath.split('/').slice(0, -1);
    const linkSegments = link.split('/');
    const stack = [...fromSegments];
    for (const seg of linkSegments) {
      if (seg === '.') continue;
      if (seg === '..') {
        if (stack.length === 0) return null;
        stack.pop();
        continue;
      }
      stack.push(seg);
    }
    return stack.join('/');
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm -F @llm-wiki/core test health-phase`
Expected: PASS on all six cases.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/lint/health-phase.ts \
        packages/core/tests/services/lint/health-phase.test.ts
git commit -m ":sparkles: [core] Add HealthPhase (orphans, stale, broken links)"
```

---

## Task 9: LintService orchestration + state + archival

**Files:**
- Create: `packages/core/src/services/lint-service.ts`
- Create: `packages/core/tests/services/lint-service.test.ts`
- Modify: `packages/core/src/services/index.ts`

`LintService` owns the worktree lifecycle, runs every phase in order, squash-merges the result into main, and stamps `last_lint` in the state store. After a successful consolidate phase it hands every consolidated verbatim file to `IArchiver` to produce an **operational backup** under `<mainRepoRoot>/.archive/<YYYY-MM>-<agent>.7z`. The original markdown files in `log/<agent>/raw/` are NOT deleted: the spec fixes markdown-in-git as the single source of truth, so the archive is a redundant snapshot, not a replacement. Retention-driven pruning of old entries (spec's `archive_after_days` / `archive_retention_months`) is deferred to a follow-up milestone alongside an `IArchiver.listArchives` extension.

Key invariants held in this orchestrator:

- **INV-9:** phases only touch a `FileStoreFactory`-built store rooted at `worktree.path`. Main branch files are untouched until `mergeWorktree` returns.
- **INV-5:** every entry in the consolidation batch is `markConsolidated`'d before the phase returns. `LintService` double-checks by asserting `verbatimStore.countUnconsolidated()` only drops by the expected amount.
- **state:** `last_lint` is only stamped on full success (all phases + merge). A phase failure aborts everything, the worktree is discarded, the state is untouched.

- [ ] **Step 1: Write failing test**

Create `packages/core/tests/services/lint-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LintService, type LintPhase, type LintRequest } from '../../src/services/lint-service.js';
import { LintReport } from '../../src/domain/lint-report.js';
import { HealthIssue, HealthIssueType } from '../../src/domain/health-issue.js';
import { GitConflictError, LlmUnavailableError } from '../../src/domain/errors.js';
import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';
import type {
  IFileStore,
  IVerbatimStore,
  IVersionControl,
  IStateStore,
  IArchiver,
  ISearchEngine,
  IndexEntry,
  SearchQuery,
  FileStoreFactory,
  WorktreeInfo,
  FileInfo,
  ArchiveEntry,
  ArchiveResult,
} from '../../src/ports/index.js';
import type { SearchResult } from '../../src/domain/search-result.js';
import type { VerbatimEntry } from '../../src/domain/verbatim-entry.js';
import type { WikiPageData } from '../../src/domain/wiki-page.js';

class FakeFileStore implements IFileStore {
  constructor(public readonly root: string) {}
  files: Record<string, string> = {};
  /** Precomputed WikiPageData keyed by path. Seeded by the reindex test
   *  so LintService's post-merge loop can pick up a valid page. Empty by
   *  default — readWikiPage returns null for any unseeded path, which
   *  matches the tests that don't care about reindex. */
  pages: Record<string, WikiPageData> = {};

  async readFile(p: string): Promise<string | null> {
    return this.files[p] ?? null;
  }
  async writeFile(p: string, c: string): Promise<void> {
    this.files[p] = c;
  }
  async listFiles(): Promise<FileInfo[]> {
    return Object.keys(this.files).map((k) => ({ path: k, updated: '2026-04-01' }));
  }
  async exists(p: string): Promise<boolean> {
    return p in this.files;
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    return this.pages[p] ?? null;
  }
}

class FakeSearchEngine implements ISearchEngine {
  public indexed: IndexEntry[] = [];
  async index(entry: IndexEntry): Promise<void> {
    this.indexed.push(entry);
  }
  async remove(): Promise<void> {}
  async search(_q: SearchQuery): Promise<SearchResult[]> {
    return [];
  }
  async rebuild(): Promise<void> {}
  async health(): Promise<'ok' | 'stale' | 'missing'> {
    return 'ok';
  }
  async lastIndexedAt(): Promise<string | null> {
    return null;
  }
}

class FakeVerbatimStore implements IVerbatimStore {
  public unconsolidated = 3;
  public marked: string[] = [];
  async writeEntry(): Promise<void> {}
  async listUnconsolidated(): Promise<FileInfo[]> {
    return [];
  }
  async countUnconsolidated(): Promise<number> {
    return this.unconsolidated;
  }
  async readEntry(): Promise<VerbatimEntry | null> {
    return null;
  }
  async markConsolidated(p: string): Promise<void> {
    this.marked.push(p);
    this.unconsolidated = Math.max(0, this.unconsolidated - 1);
  }
}

class FakeVersionControl implements IVersionControl {
  public createdWorktree: WorktreeInfo | null = null;
  public removeSpy = vi.fn<(p: string, force?: boolean) => void>();
  public squashSpy = vi.fn();
  public mergeSpy = vi.fn();
  public commitSpy = vi.fn();
  public mergeResponse: string | Error = 'final-sha';
  async commit(): Promise<string> {
    return 'main-sha';
  }
  async hasUncommittedChanges(): Promise<boolean> {
    return false;
  }
  async createWorktree(name: string): Promise<WorktreeInfo> {
    this.createdWorktree = { path: `/tmp/wt/${name}-1`, branch: `${name}-1` };
    return this.createdWorktree;
  }
  async removeWorktree(p: string, force?: boolean): Promise<void> {
    this.removeSpy(p, force);
  }
  async squashWorktree(p: string, m: string): Promise<string> {
    this.squashSpy(p, m);
    return 'squash-sha';
  }
  async mergeWorktree(p: string): Promise<string> {
    this.mergeSpy(p);
    if (this.mergeResponse instanceof Error) throw this.mergeResponse;
    return this.mergeResponse;
  }
  async commitInWorktree(p: string, f: string[], m: string): Promise<string> {
    this.commitSpy(p, f, m);
    return 'wt-commit-sha';
  }
}

class FakeStateStore implements IStateStore {
  public saved: WikiRuntimeState[] = [];
  private state: WikiRuntimeState = { ...EMPTY_RUNTIME_STATE };
  async load(): Promise<WikiRuntimeState> {
    return this.state;
  }
  async save(s: WikiRuntimeState): Promise<void> {
    this.state = s;
    this.saved.push(s);
  }
  async update(p: Partial<WikiRuntimeState>): Promise<WikiRuntimeState> {
    this.state = { ...this.state, ...p };
    this.saved.push(this.state);
    return this.state;
  }
}

class FakeArchiver implements IArchiver {
  public calls: Array<{ path: string; entries: ArchiveEntry[] }> = [];
  async createArchive(p: string, e: ArchiveEntry[]): Promise<ArchiveResult> {
    this.calls.push({ path: p, entries: e });
    return { archivePath: p, fileCount: e.length, bytes: 1 };
  }
}

/**
 * Stub phases: each one records that it was invoked and returns a canned
 * report. The actual phase logic is tested in Tasks 6/7/8.
 */
function stubConsolidate(touched: string[] = []): LintPhase<'consolidate'> {
  const spy = vi.fn();
  const phase: LintPhase<'consolidate'> = {
    name: 'consolidate',
    async run() {
      spy();
      return {
        consolidatedCount: touched.length,
        touchedPaths: touched,
      };
    },
  };
  (phase as unknown as { spy: typeof spy }).spy = spy;
  return phase;
}

function stubPromote(touched: string[] = []): LintPhase<'promote'> {
  return {
    name: 'promote',
    async run() {
      return { promotedCount: touched.length, touchedPaths: touched };
    },
  };
}

function stubHealth(issues: HealthIssue[] = []): LintPhase<'health'> {
  return {
    name: 'health',
    async run() {
      return { issues };
    },
  };
}

describe('LintService', () => {
  let fsFactory: FileStoreFactory;
  let mainFs: FakeFileStore;
  let vs: FakeVerbatimStore;
  let vc: FakeVersionControl;
  let state: FakeStateStore;
  let archiver: FakeArchiver;
  let searchEngine: FakeSearchEngine;

  beforeEach(() => {
    mainFs = new FakeFileStore('/main');
    vs = new FakeVerbatimStore();
    vc = new FakeVersionControl();
    state = new FakeStateStore();
    archiver = new FakeArchiver();
    searchEngine = new FakeSearchEngine();
    fsFactory = (root: string) => new FakeFileStore(root);
  });

  it('runs all phases, squashes, merges, stamps last_lint', async () => {
    const consolidatePaths = ['wiki/tools/postgresql.md'];
    const service = new LintService({
      mainRepoRoot: '/main',
      mainFileStore: mainFs,
      mainVerbatimStore: vs,
      versionControl: vc,
      searchEngine,
      fileStoreFactory: fsFactory,
      verbatimStoreFactory: () => vs,
      stateStore: state,
      archiver,
      makeConsolidatePhase: () => stubConsolidate(consolidatePaths),
      makePromotePhase: () => stubPromote(['wiki/patterns/x.md']),
      makeHealthPhase: () => stubHealth([]),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const report = await service.lint({});

    expect(vc.createdWorktree?.branch).toMatch(/^lint-/);
    expect(vc.squashSpy).toHaveBeenCalled();
    expect(vc.mergeSpy).toHaveBeenCalled();
    expect(report.consolidated).toBe(1);
    expect(report.promoted).toBe(1);
    expect(report.commitSha).toBe('final-sha');
    expect(state.saved[0].last_lint).toBe('2026-04-10T12:00:00.000Z');
    expect(vc.removeSpy).toHaveBeenCalledWith(vc.createdWorktree!.path, undefined);
  });

  it('discards worktree and keeps state untouched when consolidate throws', async () => {
    const service = new LintService({
      mainRepoRoot: '/main',
      mainFileStore: mainFs,
      mainVerbatimStore: vs,
      versionControl: vc,
      searchEngine,
      fileStoreFactory: fsFactory,
      verbatimStoreFactory: () => vs,
      stateStore: state,
      archiver,
      makeConsolidatePhase: () => ({
        name: 'consolidate',
        async run() {
          throw new LlmUnavailableError('boom');
        },
      }),
      makePromotePhase: () => stubPromote(),
      makeHealthPhase: () => stubHealth(),
      now: () => new Date(),
    });

    await expect(service.lint({})).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(vc.removeSpy).toHaveBeenCalledWith(vc.createdWorktree!.path, true);
    expect(vc.mergeSpy).not.toHaveBeenCalled();
    expect(state.saved).toEqual([]);
  });

  it('preserves worktree on GitConflictError and does NOT stamp state', async () => {
    vc.mergeResponse = new GitConflictError('/tmp/wt/lint-1');
    const service = new LintService({
      mainRepoRoot: '/main',
      mainFileStore: mainFs,
      mainVerbatimStore: vs,
      versionControl: vc,
      searchEngine,
      fileStoreFactory: fsFactory,
      verbatimStoreFactory: () => vs,
      stateStore: state,
      archiver,
      makeConsolidatePhase: () => stubConsolidate(['wiki/x.md']),
      makePromotePhase: () => stubPromote(),
      makeHealthPhase: () => stubHealth(),
      now: () => new Date(),
    });
    await expect(service.lint({})).rejects.toBeInstanceOf(GitConflictError);
    expect(vc.removeSpy).not.toHaveBeenCalled();
    expect(state.saved).toEqual([]);
  });

  it('honors explicit phases filter', async () => {
    const healthIssues = [
      HealthIssue.create({ type: HealthIssueType.Orphan, page: 'wiki/a.md', description: 'x' }),
    ];
    const consolidateSpy = vi.fn();
    const promoteSpy = vi.fn();
    const service = new LintService({
      mainRepoRoot: '/main',
      mainFileStore: mainFs,
      mainVerbatimStore: vs,
      versionControl: vc,
      searchEngine,
      fileStoreFactory: fsFactory,
      verbatimStoreFactory: () => vs,
      stateStore: state,
      archiver,
      makeConsolidatePhase: () => ({
        name: 'consolidate',
        async run() {
          consolidateSpy();
          return { consolidatedCount: 0, touchedPaths: [] };
        },
      }),
      makePromotePhase: () => ({
        name: 'promote',
        async run() {
          promoteSpy();
          return { promotedCount: 0, touchedPaths: [] };
        },
      }),
      makeHealthPhase: () => stubHealth(healthIssues),
      now: () => new Date(),
    });

    const report = await service.lint({ phases: ['health'] });

    expect(consolidateSpy).not.toHaveBeenCalled();
    expect(promoteSpy).not.toHaveBeenCalled();
    expect(report.issues).toHaveLength(1);
  });

  it('invokes archiver for every consolidated verbatim path when consolidate produces edits', async () => {
    const phase: LintPhase<'consolidate'> = {
      name: 'consolidate',
      async run() {
        return {
          consolidatedCount: 2,
          touchedPaths: ['wiki/x.md'],
          archivedEntries: [
            { sourcePath: '/main/log/claude-code/raw/2026-04-09-sessA-uuid1.md' },
            { sourcePath: '/main/log/claude-code/raw/2026-04-09-sessB-uuid2.md' },
          ],
        };
      },
    };
    const service = new LintService({
      mainRepoRoot: '/main',
      mainFileStore: mainFs,
      mainVerbatimStore: vs,
      versionControl: vc,
      searchEngine,
      fileStoreFactory: fsFactory,
      verbatimStoreFactory: () => vs,
      stateStore: state,
      archiver,
      makeConsolidatePhase: () => phase,
      makePromotePhase: () => stubPromote(),
      makeHealthPhase: () => stubHealth(),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    await service.lint({});

    expect(archiver.calls).toHaveLength(1);
    expect(archiver.calls[0].entries).toHaveLength(2);
    // Archive target is absolute under mainRepoRoot and bucketed by month+agent.
    expect(archiver.calls[0].path).toBe('/main/.archive/2026-04-claude-code.7z');
  });

  it('reindexes wiki + projects pages touched by lint, skipping log wildcard', async () => {
    // Seed the MAIN file store with the WikiPageData that readWikiPage
    // should return after the merge lands. Only wiki/projects entries
    // get indexed; 'log' (a directory wildcard in touchedPaths) and the
    // `projects/` one that has no corresponding page must be ignored.
    mainFs.pages['wiki/tools/postgresql.md'] = {
      frontmatter: {
        title: 'PostgreSQL',
        created: '2026-04-10',
        updated: '2026-04-10',
        confidence: 0.8,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: '## Summary\nConsolidated.',
    };
    mainFs.pages['wiki/patterns/no-db-mocking.md'] = {
      frontmatter: {
        title: 'No DB mocking',
        created: '2026-04-10',
        updated: '2026-04-10',
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: ['promoted'],
      },
      content: '## Summary\nPrefer testcontainers.',
    };

    const service = new LintService({
      mainRepoRoot: '/main',
      mainFileStore: mainFs,
      mainVerbatimStore: vs,
      versionControl: vc,
      searchEngine,
      fileStoreFactory: fsFactory,
      verbatimStoreFactory: () => vs,
      stateStore: state,
      archiver,
      makeConsolidatePhase: () => stubConsolidate(['wiki/tools/postgresql.md']),
      makePromotePhase: () => stubPromote(['wiki/patterns/no-db-mocking.md']),
      makeHealthPhase: () => stubHealth(),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    await service.lint({});

    const indexedPaths = searchEngine.indexed.map((e) => e.path).sort();
    expect(indexedPaths).toEqual([
      'wiki/patterns/no-db-mocking.md',
      'wiki/tools/postgresql.md',
    ]);
    // 'log' wildcard added by the consolidate branch must not hit the
    // search engine — it is not a wiki/projects path.
    expect(searchEngine.indexed.some((e) => e.path === 'log')).toBe(false);
  });

  it('does NOT reindex when no file writes happened (health-only run)', async () => {
    const service = new LintService({
      mainRepoRoot: '/main',
      mainFileStore: mainFs,
      mainVerbatimStore: vs,
      versionControl: vc,
      searchEngine,
      fileStoreFactory: fsFactory,
      verbatimStoreFactory: () => vs,
      stateStore: state,
      archiver,
      makeConsolidatePhase: () => stubConsolidate(),
      makePromotePhase: () => stubPromote(),
      makeHealthPhase: () => stubHealth([]),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    await service.lint({ phases: ['health'] });

    expect(searchEngine.indexed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm -F @llm-wiki/core test lint-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement LintService**

Create `packages/core/src/services/lint-service.ts`:

```ts
import path from 'node:path';
import { GitConflictError, WikiError } from '../domain/errors.js';
import { LintReport } from '../domain/lint-report.js';
import type { IFileStore, FileStoreFactory } from '../ports/file-store.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { IVersionControl } from '../ports/version-control.js';
import type { IStateStore } from '../ports/state-store.js';
import type { ISearchEngine } from '../ports/search-engine.js';
import type { IArchiver, ArchiveEntry } from '../ports/archiver.js';
import type { HealthIssue } from '../domain/health-issue.js';

export type LintPhaseName = 'consolidate' | 'promote' | 'health';

export interface ConsolidateRunResult {
  consolidatedCount: number;
  touchedPaths: string[];
  /** Source files the orchestrator should back up to `.archive/` after
   *  merge. The originals stay on main per the spec's SSOT rule. */
  archivedEntries?: ArchiveEntry[];
}

export interface PromoteRunResult {
  promotedCount: number;
  touchedPaths: string[];
}

export interface HealthRunResult {
  issues: HealthIssue[];
}

export interface LintPhase<N extends LintPhaseName> {
  readonly name: N;
  run(): Promise<
    N extends 'consolidate'
      ? ConsolidateRunResult
      : N extends 'promote'
        ? PromoteRunResult
        : HealthRunResult
  >;
}

export interface LintRequest {
  phases?: LintPhaseName[];
}

export interface VerbatimStoreFactory {
  (fileStore: IFileStore): IVerbatimStore;
}

export interface LintServiceDeps {
  /** Absolute filesystem path of the main wiki repo. Used both to resolve
   *  main-branch files for the archiver and to anchor every archive path
   *  inside `.archive/`. Must match the root FsFileStore was built on. */
  mainRepoRoot: string;
  mainFileStore: IFileStore;
  mainVerbatimStore: IVerbatimStore;
  versionControl: IVersionControl;
  /** Incremental reindex target for wiki/projects pages touched by lint.
   *  Spec `Lint / Consolidation / Promote` pipeline and the worktree-writes
   *  lifecycle both mandate a post-merge reindex so the search index never
   *  falls behind the merged wiki state. Same contract as IngestService. */
  searchEngine: ISearchEngine;
  fileStoreFactory: FileStoreFactory;
  verbatimStoreFactory: VerbatimStoreFactory;
  stateStore: IStateStore;
  archiver: IArchiver;
  makeConsolidatePhase: (fs: IFileStore, vs: IVerbatimStore) => LintPhase<'consolidate'>;
  makePromotePhase: (fs: IFileStore) => LintPhase<'promote'>;
  makeHealthPhase: (fs: IFileStore) => LintPhase<'health'>;
  now?: () => Date;
}

const ALL_PHASES: LintPhaseName[] = ['consolidate', 'promote', 'health'];

/**
 * wiki_lint orchestrator.
 *
 * Lifecycle per call:
 *   1. Create a worktree via `IVersionControl` (INV-9 — main untouched).
 *   2. Build a worktree-scoped IFileStore + IVerbatimStore via the provided
 *      factories, then hand them to each phase factory.
 *   3. Run requested phases in fixed order (consolidate → promote → health).
 *   4. Squash + fast-forward merge the worktree into main.
 *   5. **Reindex** every wiki/projects page touched by consolidate or
 *      promote through `ISearchEngine`. Mandatory — `search.db` must
 *      always reflect merged main-branch files, not worktree files.
 *      Without this step, lint-created pages stay invisible to
 *      `wiki_query` until the next mtime-triggered staleness sweep.
 *   6. Stamp `last_lint` in the state store.
 *   7. Remove the worktree.
 *   8. **Then** archive the just-consolidated verbatim entries into
 *      per-month, per-agent `.7z` files under `<mainRepoRoot>/.archive/`.
 *      Archival is a trailing operational backup — markdown files in
 *      `log/` stay on main and in git history (spec SSOT rule). Steps 6
 *      and 7 must complete BEFORE this so a failed archive cannot block
 *      state stamping or worktree cleanup. Retention / pruning of old
 *      entries is a separate concern deferred to a follow-up milestone.
 *
 * Failure modes:
 *   - Phase throw (LlmUnavailableError, LintPhaseError, etc.): discard the
 *     worktree with `force=true` and rethrow. State is never written.
 *   - `mergeWorktree` throws `GitConflictError`: leave the worktree on disk
 *     (user recoverable), rethrow. State is never written.
 *   - Archiver failure after merge: state has already been stamped and
 *     the worktree has already been removed by the time archival runs.
 *     The error propagates to the caller so they know the backup
 *     snapshot is missing, but the wiki lifecycle is already complete:
 *     main holds the merged content, search.db is up to date, and
 *     log/ still has the originals. Archival can be retried later via
 *     an out-of-band command.
 */
export class LintService {
  private readonly now: () => Date;

  constructor(private readonly deps: LintServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async lint(req: LintRequest = {}): Promise<LintReport> {
    const phaseSet = new Set<LintPhaseName>(req.phases ?? ALL_PHASES);

    const worktree = await this.deps.versionControl.createWorktree('lint');
    const wtFileStore = this.deps.fileStoreFactory(worktree.path);
    const wtVerbatimStore = this.deps.verbatimStoreFactory(wtFileStore);

    let report = LintReport.empty();
    let consolidateResult: ConsolidateRunResult | null = null;
    const touchedPaths = new Set<string>();

    try {
      if (phaseSet.has('consolidate')) {
        const phase = this.deps.makeConsolidatePhase(wtFileStore, wtVerbatimStore);
        consolidateResult = await phase.run();
        for (const p of consolidateResult.touchedPaths) touchedPaths.add(p);
        // Worktree verbatim files are rewritten with `consolidated: true`,
        // so their paths must also be part of the commit.
        // `markConsolidated` rewrote each file via the worktree store — we
        // know the set of paths only through listing; simplest is to add
        // every file under log/ that the phase processed. For the MVP we
        // commit the full log/ directory as a wildcard.
        touchedPaths.add('log');
        report = report.merge(
          LintReport.from({
            consolidated: consolidateResult.consolidatedCount,
            promoted: 0,
            issues: [],
            commitSha: null,
          }),
        );
      }

      if (phaseSet.has('promote')) {
        const phase = this.deps.makePromotePhase(wtFileStore);
        const result = await phase.run();
        for (const p of result.touchedPaths) touchedPaths.add(p);
        report = report.merge(
          LintReport.from({
            consolidated: 0,
            promoted: result.promotedCount,
            issues: [],
            commitSha: null,
          }),
        );
      }

      if (phaseSet.has('health')) {
        const phase = this.deps.makeHealthPhase(wtFileStore);
        const result = await phase.run();
        report = report.merge(
          LintReport.from({
            consolidated: 0,
            promoted: 0,
            issues: result.issues,
            commitSha: null,
          }),
        );
      }
    } catch (err) {
      await this.safeRemoveWorktree(worktree.path, true);
      throw err;
    }

    // No file writes happened? Skip commit/merge entirely.
    const hasChanges = touchedPaths.size > 0 && (
      (consolidateResult?.consolidatedCount ?? 0) > 0 ||
      report.promoted > 0
    );

    let commitSha: string | null = null;
    if (hasChanges) {
      try {
        await this.deps.versionControl.commitInWorktree(
          worktree.path,
          [...touchedPaths],
          ':recycle: [lint] consolidate + promote',
        );
        await this.deps.versionControl.squashWorktree(
          worktree.path,
          ':recycle: [lint] consolidate + promote',
        );
        commitSha = await this.deps.versionControl.mergeWorktree(worktree.path);
      } catch (err) {
        if (err instanceof GitConflictError) throw err; // preserve worktree
        await this.safeRemoveWorktree(worktree.path, true);
        throw err;
      }
    }

    // -- Post-merge reindex -----------------------------------------------
    // Every wiki/projects page that consolidate or promote touched must be
    // re-indexed against the MAIN-branch copy (INV: search.db is always
    // updated against merged files, never worktree files). `log/` is a
    // directory wildcard in touchedPaths — filter it out along with any
    // other non-wiki path. IngestService follows the same pattern.
    if (hasChanges) {
      for (const p of touchedPaths) {
        if (!p.startsWith('wiki/') && !p.startsWith('projects/')) continue;
        const data = await this.deps.mainFileStore.readWikiPage(p);
        if (!data) continue;
        await this.deps.searchEngine.index({
          path: p,
          title: data.frontmatter.title,
          content: data.content,
          updated: data.frontmatter.updated,
        });
      }
    }

    // -- Stamp state + cleanup worktree BEFORE archival ------------------
    // Archival is a trailing operational backup. The merge has already
    // landed and main is in its final state — state and cleanup must
    // commit now so a later archiver failure cannot block either.
    await this.deps.stateStore.update({ last_lint: this.now().toISOString() });
    await this.safeRemoveWorktree(worktree.path);

    // -- Archival (may fail independently) -------------------------------
    // Originals in log/ stay on main either way (spec SSOT), so a
    // failed archive only means a missing backup snapshot — the wiki
    // lifecycle is already complete. We still rethrow so the caller
    // knows the backup didn't land and can retry it out-of-band.
    if (consolidateResult?.archivedEntries && consolidateResult.archivedEntries.length > 0) {
      const grouped = this.groupByMonthAndAgent(consolidateResult.archivedEntries);
      for (const [archivePath, entries] of grouped) {
        await this.deps.archiver.createArchive(archivePath, entries);
      }
    }

    return commitSha ? report.withCommit(commitSha) : report;
  }

  /**
   * Group ArchiveEntry by `YYYY-MM` + agent, derived from the absolute
   * source path. Every sourcePath must contain the segment sequence
   * `.../log/<agent>/raw/<YYYY-MM-DD-...>.md`; we locate the last `log`
   * segment and read the two following entries to get agent + filename.
   *
   * Archive targets are absolute: `<mainRepoRoot>/.archive/<YYYY-MM>-<agent>.7z`.
   * This matches the `IArchiver` contract's "archivePath must be absolute"
   * requirement and is stable regardless of process CWD.
   */
  private groupByMonthAndAgent(entries: ArchiveEntry[]): Map<string, ArchiveEntry[]> {
    const groups = new Map<string, ArchiveEntry[]>();
    for (const entry of entries) {
      const normalised = entry.sourcePath.split(path.sep).join('/');
      const segments = normalised.split('/');
      const logIdx = segments.lastIndexOf('log');
      if (logIdx === -1 || segments.length < logIdx + 4) continue;
      const agent = segments[logIdx + 1];
      const raw = segments[logIdx + 2];
      const filename = segments[logIdx + 3] ?? '';
      if (raw !== 'raw') continue;
      const yearMonth = filename.slice(0, 7); // YYYY-MM
      const archivePath = `${this.deps.mainRepoRoot}/.archive/${yearMonth}-${agent}.7z`;
      const bucket = groups.get(archivePath) ?? [];
      bucket.push(entry);
      groups.set(archivePath, bucket);
    }
    return groups;
  }

  private async safeRemoveWorktree(worktreePath: string, force = false): Promise<void> {
    try {
      await this.deps.versionControl.removeWorktree(worktreePath, force || undefined);
    } catch {
      // intentional swallow — caller is already on an error or success path
    }
  }
}
```

- [ ] **Step 4: Re-export from services index**

Edit `packages/core/src/services/index.ts`, append:

```ts
export { LintService } from './lint-service.js';
export type {
  LintPhase,
  LintPhaseName,
  LintRequest,
  LintServiceDeps,
  ConsolidateRunResult,
  PromoteRunResult,
  HealthRunResult,
  VerbatimStoreFactory,
} from './lint-service.js';
export { ConsolidatePhase, CONSOLIDATE_BATCH_LIMIT } from './lint/consolidate-phase.js';
export type { ConsolidatePhaseResult } from './lint/consolidate-phase.js';
export { PromotePhase } from './lint/promote-phase.js';
export type { PromotePhaseResult } from './lint/promote-phase.js';
export { HealthPhase } from './lint/health-phase.js';
export type { HealthPhaseResult, HealthPhaseOptions } from './lint/health-phase.js';
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm -F @llm-wiki/core test lint-service`
Expected: PASS on all seven cases (happy path, LlmUnavailable, GitConflict, phases filter, archiver, reindex, reindex-skip).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/lint-service.ts \
        packages/core/src/services/index.ts \
        packages/core/tests/services/lint-service.test.ts
git commit -m ":sparkles: [core] Add LintService orchestrator with reindex, archival, worktree"
```

---

## Task 10: Wire ConsolidatePhase to emit archivedEntries

**Files:**
- Modify: `packages/core/src/services/lint/consolidate-phase.ts`
- Modify: `packages/core/tests/services/lint/consolidate-phase.test.ts`

Task 9 introduced `ConsolidateRunResult.archivedEntries`. The phase implementation from Task 6 doesn't populate it yet — it needs to produce an absolute `sourcePath` for every entry in the batch so the orchestrator can hand the list to `IArchiver` (the port rejects relative paths). The main-branch repo root is passed to `ConsolidatePhase` as a new constructor argument and prepended to each entry's wiki-relative file path.

- [ ] **Step 1: Add a test for `archivedEntries` population**

Edit `packages/core/tests/services/lint/consolidate-phase.test.ts` and add a new case inside the main `describe`:

```ts
it('returns archivedEntries with absolute source paths when mainRoot is provided', async () => {
  await seed(2);
  llm.response = {
    pages: [
      {
        path: 'wiki/a.md',
        title: 'A',
        content: 'x',
        source_entries: [...verbatimStore.entries.keys()],
      },
    ],
  };
  const phase = new ConsolidatePhase(fileStore, verbatimStore, llm, '/abs/repo');
  const result = await phase.run();
  expect(result.archivedEntries).toBeDefined();
  expect(result.archivedEntries).toHaveLength(2);
  for (const entry of result.archivedEntries!) {
    expect(entry.sourcePath.startsWith('/abs/repo/log/')).toBe(true);
  }
});

it('omits archivedEntries when no mainRepoRoot is provided', async () => {
  await seed(1);
  llm.response = { pages: [] };
  const phase = new ConsolidatePhase(fileStore, verbatimStore, llm);
  const result = await phase.run();
  expect(result.archivedEntries).toBeUndefined();
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm -F @llm-wiki/core test consolidate-phase`
Expected: FAIL — the new case's assertions on `archivedEntries` are undefined.

- [ ] **Step 3: Update ConsolidatePhase (full file replacement)**

Overwrite `packages/core/src/services/lint/consolidate-phase.ts` with the expanded version — constructor accepts an optional `mainRepoRoot`, result type gains `archivedEntries`, and `run()` emits the archive list at the end. Every other method is unchanged from Task 6:

```ts
import { LintPhaseError, LlmUnavailableError } from '../../domain/errors.js';
import type { IFileStore } from '../../ports/file-store.js';
import type { IVerbatimStore } from '../../ports/verbatim-store.js';
import type { ILlmClient } from '../../ports/llm-client.js';
import type { ArchiveEntry } from '../../ports/archiver.js';
import type { VerbatimEntry } from '../../domain/verbatim-entry.js';

export const CONSOLIDATE_BATCH_LIMIT = 50;

export interface ConsolidatePhaseResult {
  consolidatedCount: number;
  touchedPaths: string[];
  archivedEntries?: ArchiveEntry[];
}

interface ProposedPage {
  path: string;
  title: string;
  content: string;
  source_entries: string[];
}

const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

const CONSOLIDATE_SYSTEM_PROMPT =
  'You are a wiki editor. Merge verbatim memory entries into durable wiki or project pages. ' +
  'Respond with a JSON object: {"pages":[{"path":"wiki/...","title":"...","content":"...","source_entries":["log/..."]}]}. ' +
  'Only emit pages when the entries contain reusable knowledge. An empty pages array is valid.';

export class ConsolidatePhase {
  constructor(
    private readonly worktreeFileStore: IFileStore,
    private readonly worktreeVerbatimStore: IVerbatimStore,
    private readonly llmClient: ILlmClient,
    private readonly mainRepoRoot?: string,
  ) {}

  async run(): Promise<ConsolidatePhaseResult> {
    const batch = await this.collectBatch();
    if (batch.length === 0) {
      return { consolidatedCount: 0, touchedPaths: [] };
    }

    let pages: ProposedPage[];
    try {
      pages = await this.askLlm(batch);
    } catch (err) {
      if (err instanceof LlmUnavailableError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(message);
    }

    for (const page of pages) {
      this.validatePagePath(page.path);
    }

    const touchedPaths: string[] = [];
    for (const page of pages) {
      const body = this.renderPage(page);
      await this.worktreeFileStore.writeFile(page.path, body);
      touchedPaths.push(page.path);
    }

    for (const entry of batch) {
      await this.worktreeVerbatimStore.markConsolidated(entry.filePath);
    }

    const archivedEntries: ArchiveEntry[] | undefined = this.mainRepoRoot
      ? batch.map((entry) => ({
          sourcePath: `${this.mainRepoRoot}/${entry.filePath}`,
        }))
      : undefined;

    return {
      consolidatedCount: batch.length,
      touchedPaths,
      archivedEntries,
    };
  }

  private async collectBatch(): Promise<VerbatimEntry[]> {
    const logRoot = await this.worktreeFileStore.listFiles('log');
    const agents = new Set<string>();
    for (const info of logRoot) {
      const parts = info.path.split('/');
      if (parts.length >= 3 && parts[0] === 'log') agents.add(parts[1]);
    }

    const batch: VerbatimEntry[] = [];
    for (const agent of [...agents].sort()) {
      if (batch.length >= CONSOLIDATE_BATCH_LIMIT) break;
      const unconsolidated = await this.worktreeVerbatimStore.listUnconsolidated(agent);
      unconsolidated.sort((a, b) => a.path.localeCompare(b.path));
      for (const info of unconsolidated) {
        if (batch.length >= CONSOLIDATE_BATCH_LIMIT) break;
        const entry = await this.worktreeVerbatimStore.readEntry(info.path);
        if (entry) batch.push(entry);
      }
    }
    return batch;
  }

  private async askLlm(batch: VerbatimEntry[]): Promise<ProposedPage[]> {
    const userPayload = batch.map((e) => ({
      path: e.filePath,
      agent: e.agent,
      project: e.project,
      content: e.content,
    }));
    const response = await this.llmClient.complete({
      system: CONSOLIDATE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            `Consolidate the following ${batch.length} entries. ` +
            'Reply with JSON: {"pages":[...]}.\n\n' +
            JSON.stringify(userPayload, null, 2),
        },
      ],
      temperature: 0.1,
    });

    const trimmed = this.stripCodeFence(response.content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(`model returned non-JSON: ${message}`);
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { pages?: unknown }).pages)
    ) {
      throw new LlmUnavailableError('model response missing "pages" array');
    }
    const pages = (parsed as { pages: unknown[] }).pages;
    const result: ProposedPage[] = [];
    for (const raw of pages) {
      if (
        typeof raw !== 'object' ||
        raw === null ||
        typeof (raw as { path?: unknown }).path !== 'string' ||
        typeof (raw as { title?: unknown }).title !== 'string' ||
        typeof (raw as { content?: unknown }).content !== 'string' ||
        !Array.isArray((raw as { source_entries?: unknown }).source_entries)
      ) {
        throw new LlmUnavailableError('malformed page entry in model response');
      }
      const obj = raw as ProposedPage;
      result.push({
        path: obj.path,
        title: obj.title,
        content: obj.content,
        source_entries: obj.source_entries,
      });
    }
    return result;
  }

  private validatePagePath(requestedPath: string): void {
    if (!requestedPath || requestedPath.includes('\\') || requestedPath.startsWith('/')) {
      throw new LintPhaseError('consolidate', `invalid path ${JSON.stringify(requestedPath)}`);
    }
    const segments = requestedPath.split('/');
    for (const seg of segments) {
      if (seg === '' || seg === '.' || seg === '..') {
        throw new LintPhaseError('consolidate', `invalid segment in ${requestedPath}`);
      }
    }
    if (!requestedPath.endsWith('.md')) {
      throw new LintPhaseError('consolidate', `path must end with .md: ${requestedPath}`);
    }
    if (segments[0] === 'wiki' && segments.length >= 2) return;
    if (segments[0] === 'projects' && segments.length >= 3 && PROJECT_NAME_RE.test(segments[1])) {
      return;
    }
    throw new LintPhaseError(
      'consolidate',
      `path must be wiki/... or projects/<name>/...: ${requestedPath}`,
    );
  }

  private renderPage(page: ProposedPage): string {
    const today = new Date().toISOString().slice(0, 10);
    const sources = page.source_entries
      .map((s) => `  - ${this.yamlString(s)}`)
      .join('\n');
    const fm = [
      '---',
      `title: ${this.yamlString(page.title)}`,
      `created: ${today}`,
      `updated: ${today}`,
      'confidence: 0.8',
      sources.length > 0 ? `sources:\n${sources}` : 'sources: []',
      'supersedes: null',
      'tags: []',
      '---',
      '',
    ].join('\n');
    return `${fm}\n${page.content.trim()}\n`;
  }

  private stripCodeFence(content: string): string {
    const trimmed = content.trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return match ? match[1] : trimmed;
  }

  private yamlString(value: string): string {
    if (/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/.test(value)) return value;
    return JSON.stringify(value);
  }
}
```

- [ ] **Step 4: Run all consolidate-phase tests to confirm pass**

Run: `pnpm -F @llm-wiki/core test consolidate-phase`
Expected: PASS on all seven cases (five from Task 6 plus the two new cases: `archivedEntries` populated, and `archivedEntries` omitted when `mainRepoRoot` is not supplied).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/lint/consolidate-phase.ts \
        packages/core/tests/services/lint/consolidate-phase.test.ts
git commit -m ":sparkles: [core] ConsolidatePhase emits archivedEntries for LintService"
```

---

## Task 11: ImportService orchestration

**Files:**
- Modify: `packages/core/src/domain/verbatim-entry.ts` (add optional `createdAt` to `VerbatimEntry.create`)
- Modify: `packages/core/tests/domain/verbatim-entry.test.ts` (regression test for the new option)
- Create: `packages/core/src/services/import-service.ts`
- Create: `packages/core/tests/services/import-service.test.ts`
- Modify: `packages/core/src/services/index.ts`

`ImportService` loops over registered `IAgentMemoryReader` instances, asks each for items newer than its last import timestamp, converts every item to a `VerbatimEntry`, writes them through `IVerbatimStore`, and stamps `imports[agent].last_import` in the state store.

**Idempotency strategy — important:** a rerun of the same import must NOT produce duplicate verbatim entries. `VerbatimEntry.filename` is `${date}-${sessionId}-${uuid}.md`, so two ingredients must be stable across reruns:

1. **date** — today currently comes from `new Date()` inside `VerbatimEntry.create()`, which breaks idempotency across calendar days. Step 1 below extends `CreateVerbatimEntryOptions` with an optional `createdAt?: Date` so `ImportService` can pass `new Date(item.mtime)` (the memory file's own mtime). Existing callers (`RememberService`, test suites) are unaffected — they keep getting `new Date()`.
2. **uuid** — `ImportService` supplies a deterministic `idGenerator` per item, derived from a hash of `item.sourcePath + item.mtime`. Same input file at the same mtime → same filename.

With both pieces deterministic, `ImportService` guards writes with `verbatimStore.readEntry(entry.filePath)` — if an entry already exists at that path, increment `skipped` and move on; no overwrite, no append.

A per-agent failure is captured into the response's `error` field but does NOT abort the sweep — other agents still run. `imports[agent].last_import` is stamped only for agents that completed without throwing.

- [ ] **Step 0: Extend `VerbatimEntry.create` with `createdAt?: Date`**

Add a failing regression test in `packages/core/tests/domain/verbatim-entry.test.ts`:

```ts
it('honours an explicit createdAt for both filename date and created field', () => {
  const entry = VerbatimEntry.create({
    content: 'x',
    agent: 'claude-code',
    sessionId: 'sess',
    idGenerator: () => 'deadbeef',
    createdAt: new Date('2025-11-30T08:15:30Z'),
  });
  expect(entry.filename).toBe('2025-11-30-sess-deadbeef.md');
  expect(entry.created).toBe('2025-11-30T08:15:30.000Z');
});
```

Run: `pnpm -F @llm-wiki/core test verbatim-entry`
Expected: FAIL — `createdAt` is not part of `CreateVerbatimEntryOptions`.

Edit `packages/core/src/domain/verbatim-entry.ts`:

```ts
export interface CreateVerbatimEntryOptions {
  content: string;
  agent: string;
  sessionId: string;
  project?: string;
  tags?: string[];
  idGenerator?: () => string;
  /** Override the entry's creation timestamp. Used by ImportService to
   *  derive deterministic filenames from the source file's mtime instead
   *  of the current wall clock. Defaults to `new Date()`. */
  createdAt?: Date;
}
```

Inside `VerbatimEntry.create`, replace the `now` + `date` lines:

```ts
const now = opts.createdAt ?? new Date();
const date = now.toISOString().slice(0, 10);
```

Run: `pnpm -F @llm-wiki/core test verbatim-entry`
Expected: PASS on all existing cases plus the new one.

Commit:

```bash
git add packages/core/src/domain/verbatim-entry.ts \
        packages/core/tests/domain/verbatim-entry.test.ts
git commit -m ":sparkles: [core] Allow VerbatimEntry.create to take an explicit createdAt"
```

- [ ] **Step 1: Write failing test**

Create `packages/core/tests/services/import-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportService } from '../../src/services/import-service.js';
import { AgentMemoryItem } from '../../src/domain/agent-memory-item.js';
import { ImportReaderNotRegisteredError } from '../../src/domain/errors.js';
import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';
import type {
  IAgentMemoryReader,
  IVerbatimStore,
  IStateStore,
  AgentMemoryDiscoveryOptions,
  FileInfo,
} from '../../src/ports/index.js';
import type { VerbatimEntry } from '../../src/domain/verbatim-entry.js';

class FakeReader implements IAgentMemoryReader {
  public readonly agent: string;
  public items: AgentMemoryItem[] = [];
  public shouldThrow: Error | null = null;
  public discoverSpy = vi.fn<(o: AgentMemoryDiscoveryOptions) => void>();

  constructor(agent: string) {
    this.agent = agent;
  }

  async discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]> {
    this.discoverSpy(options);
    if (this.shouldThrow) throw this.shouldThrow;
    return this.items;
  }
}

class FakeVerbatimStore implements IVerbatimStore {
  public written: VerbatimEntry[] = [];
  private byPath: Map<string, VerbatimEntry> = new Map();
  async writeEntry(e: VerbatimEntry): Promise<void> {
    this.written.push(e);
    this.byPath.set(e.filePath, e);
  }
  async listUnconsolidated(): Promise<FileInfo[]> {
    return [];
  }
  async countUnconsolidated(): Promise<number> {
    return 0;
  }
  async readEntry(filePath: string): Promise<VerbatimEntry | null> {
    return this.byPath.get(filePath) ?? null;
  }
  async markConsolidated(): Promise<void> {}
}

class FakeStateStore implements IStateStore {
  private state: WikiRuntimeState = { ...EMPTY_RUNTIME_STATE };
  async load(): Promise<WikiRuntimeState> {
    return this.state;
  }
  async save(s: WikiRuntimeState): Promise<void> {
    this.state = s;
  }
  async update(p: Partial<WikiRuntimeState>): Promise<WikiRuntimeState> {
    this.state = { ...this.state, ...p };
    return this.state;
  }
}

describe('ImportService', () => {
  let verbatim: FakeVerbatimStore;
  let state: FakeStateStore;
  let readerA: FakeReader;
  let readerB: FakeReader;
  let configs: Record<string, { enabled: boolean; paths: string[] }>;

  beforeEach(() => {
    verbatim = new FakeVerbatimStore();
    state = new FakeStateStore();
    readerA = new FakeReader('claude-code');
    readerB = new FakeReader('cursor');
    configs = {
      'claude-code': { enabled: true, paths: ['~/.claude/projects'] },
      'cursor': { enabled: true, paths: ['~/.cursor'] },
    };
  });

  it('writes VerbatimEntries from each enabled reader and stamps state', async () => {
    readerA.items = [
      AgentMemoryItem.create({
        agent: 'claude-code',
        sourcePath: '/a/mem.md',
        sessionId: 'sess1',
        project: 'cli-relay',
        content: 'fact',
        mtime: '2026-04-09T10:00:00Z',
      }),
    ];
    readerB.items = [
      AgentMemoryItem.create({
        agent: 'cursor',
        sourcePath: '/b/mem.md',
        sessionId: 'sess2',
        content: 'other fact',
        mtime: '2026-04-09T11:00:00Z',
      }),
    ];
    const service = new ImportService({
      readers: new Map([
        ['claude-code', readerA],
        ['cursor', readerB],
      ]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: configs,
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const result = await service.importAll({});

    expect(result.agents).toHaveLength(2);
    expect(verbatim.written).toHaveLength(2);
    const agents = result.agents.map((a) => a.agent).sort();
    expect(agents).toEqual(['claude-code', 'cursor']);
    const reloaded = await state.load();
    expect(reloaded.imports['claude-code'].last_import).toBe('2026-04-10T12:00:00.000Z');
    expect(reloaded.imports['cursor'].last_import).toBe('2026-04-10T12:00:00.000Z');
  });

  it('passes last_import as `since` to each reader', async () => {
    await state.update({
      imports: {
        'claude-code': { last_import: '2026-04-01T00:00:00Z' },
        'cursor': { last_import: null },
      },
    });
    const service = new ImportService({
      readers: new Map([
        ['claude-code', readerA],
        ['cursor', readerB],
      ]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: configs,
      now: () => new Date(),
    });
    await service.importAll({});
    expect(readerA.discoverSpy).toHaveBeenCalledWith({
      paths: ['~/.claude/projects'],
      since: '2026-04-01T00:00:00Z',
    });
    expect(readerB.discoverSpy).toHaveBeenCalledWith({
      paths: ['~/.cursor'],
      since: null,
    });
  });

  it('skips disabled agents', async () => {
    configs['cursor'].enabled = false;
    const service = new ImportService({
      readers: new Map([
        ['claude-code', readerA],
        ['cursor', readerB],
      ]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: configs,
      now: () => new Date(),
    });
    await service.importAll({});
    expect(readerB.discoverSpy).not.toHaveBeenCalled();
  });

  it('records per-agent failure without aborting other agents', async () => {
    readerA.shouldThrow = new Error('fs broke');
    readerB.items = [
      AgentMemoryItem.create({
        agent: 'cursor',
        sourcePath: '/b/mem.md',
        sessionId: 'sess2',
        content: 'ok',
        mtime: '2026-04-09T11:00:00Z',
      }),
    ];
    const service = new ImportService({
      readers: new Map([
        ['claude-code', readerA],
        ['cursor', readerB],
      ]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: configs,
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const result = await service.importAll({});

    const aResult = result.agents.find((a) => a.agent === 'claude-code')!;
    expect(aResult.error).toMatch(/fs broke/);
    expect(aResult.imported).toBe(0);

    const bResult = result.agents.find((a) => a.agent === 'cursor')!;
    expect(bResult.error).toBeUndefined();
    expect(bResult.imported).toBe(1);

    // State only stamps successful agents.
    const reloaded = await state.load();
    expect(reloaded.imports['cursor'].last_import).toBe('2026-04-10T12:00:00.000Z');
    expect(reloaded.imports['claude-code']?.last_import ?? null).toBeNull();
  });

  it('is rerun-idempotent: same items skip on second sweep, imports 0 new', async () => {
    const item = AgentMemoryItem.create({
      agent: 'claude-code',
      sourcePath: '/a/mem.md',
      sessionId: 'sess1',
      content: 'fact',
      mtime: '2026-04-09T10:00:00Z',
    });
    readerA.items = [item];
    const service = new ImportService({
      readers: new Map([['claude-code', readerA]]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: { 'claude-code': { enabled: true, paths: ['~/.claude'] } },
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const first = await service.importAll({});
    expect(first.agents[0].imported).toBe(1);
    expect(first.agents[0].skipped).toBe(0);
    expect(verbatim.written).toHaveLength(1);

    // Second sweep — reader returns the same item, ImportService must see
    // the existing file and skip it without writing a duplicate.
    const second = await service.importAll({});
    expect(second.agents[0].imported).toBe(0);
    expect(second.agents[0].skipped).toBe(1);
    expect(verbatim.written).toHaveLength(1); // still only the first write
  });

  it('throws ImportReaderNotRegisteredError when agent filter hits an unknown agent', async () => {
    const service = new ImportService({
      readers: new Map([['claude-code', readerA]]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: { 'claude-code': { enabled: true, paths: [] } },
      now: () => new Date(),
    });
    await expect(service.importAll({ agents: ['ghost'] })).rejects.toBeInstanceOf(
      ImportReaderNotRegisteredError,
    );
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm -F @llm-wiki/core test import-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ImportService**

Create `packages/core/src/services/import-service.ts`:

```ts
import { ImportReaderNotRegisteredError } from '../domain/errors.js';
import { VerbatimEntry } from '../domain/verbatim-entry.js';
import type { AgentMemoryItem } from '../domain/agent-memory-item.js';
import type { IAgentMemoryReader } from '../ports/agent-memory-reader.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { IStateStore } from '../ports/state-store.js';

export interface AgentConfig {
  enabled: boolean;
  paths: string[];
}

export interface ImportRequest {
  /** Optional subset of agents to run. Unknown agent → error. */
  agents?: string[];
}

export interface AgentImportResult {
  agent: string;
  discovered: number;
  imported: number;
  skipped: number;
  error?: string;
}

export interface ImportResponse {
  agents: AgentImportResult[];
}

export interface ImportServiceDeps {
  readers: Map<string, IAgentMemoryReader>;
  verbatimStore: IVerbatimStore;
  stateStore: IStateStore;
  agentConfigs: Record<string, AgentConfig>;
  now?: () => Date;
  /**
   * Override the per-item id derivation. Defaults to a stable 8-char hash
   * of `sourcePath + mtime`, which makes re-runs of the same import
   * idempotent. Tests use this hook to assert deterministic filenames
   * without depending on the hash function's bit layout.
   */
  idGenerator?: (item: AgentMemoryItem) => string;
}

/**
 * Periodic sweep over registered agent memory stores. For each enabled
 * agent:
 *
 *   1. Ask its reader for items newer than `state.imports[agent].last_import`.
 *   2. For each item build a VerbatimEntry with a **deterministic**
 *      filename: `${item.mtime date}-${sessionId}-${hash(sourcePath+mtime)}.md`.
 *      Both the date segment and the uuid are derived from the item's
 *      own mtime, not from wall clock, so reruns produce identical paths.
 *   3. Before writing, check `verbatimStore.readEntry(entry.filePath)` —
 *      if an entry already exists at that path, count as `skipped` and
 *      move on. This is how rerun-safety is achieved: the first run
 *      writes, subsequent runs see the file and no-op.
 *   4. Stamp `imports[agent].last_import = now()` once the sweep for that
 *      agent completed without throwing.
 *
 * A per-agent failure is captured into the response's `error` field and
 * the sweep continues with other agents. State is only updated for
 * agents that completed without throwing.
 */
export class ImportService {
  private readonly now: () => Date;
  private readonly idGen: (item: AgentMemoryItem) => string;

  constructor(private readonly deps: ImportServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.idGen = deps.idGenerator ?? ((item) => ImportService.stableHash(`${item.sourcePath}|${item.mtime}`));
  }

  async importAll(req: ImportRequest): Promise<ImportResponse> {
    const selected = this.resolveAgents(req.agents);

    const state = await this.deps.stateStore.load();
    const results: AgentImportResult[] = [];
    const stateUpdates: Record<string, { last_import: string }> = {};

    for (const agent of selected) {
      const config = this.deps.agentConfigs[agent];
      if (!config || !config.enabled) continue;
      const reader = this.deps.readers.get(agent)!;
      const since = state.imports[agent]?.last_import ?? null;

      try {
        const items = await reader.discover({ paths: config.paths, since });
        let imported = 0;
        let skipped = 0;
        for (const item of items) {
          const entry = this.toVerbatim(item);
          const existing = await this.deps.verbatimStore.readEntry(entry.filePath);
          if (existing !== null) {
            skipped++;
            continue;
          }
          await this.deps.verbatimStore.writeEntry(entry);
          imported++;
        }
        results.push({ agent, discovered: items.length, imported, skipped });
        stateUpdates[agent] = { last_import: this.now().toISOString() };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ agent, discovered: 0, imported: 0, skipped: 0, error: message });
      }
    }

    if (Object.keys(stateUpdates).length > 0) {
      await this.deps.stateStore.update({
        imports: { ...state.imports, ...stateUpdates },
      });
    }

    return { agents: results };
  }

  private resolveAgents(filter?: string[]): string[] {
    if (filter && filter.length > 0) {
      for (const agent of filter) {
        if (!this.deps.readers.has(agent)) {
          throw new ImportReaderNotRegisteredError(agent);
        }
      }
      return filter;
    }
    return [...this.deps.readers.keys()].sort();
  }

  private toVerbatim(item: AgentMemoryItem): VerbatimEntry {
    const createdAt = new Date(item.mtime);
    return VerbatimEntry.create({
      content: item.content,
      agent: item.agent,
      sessionId: item.sessionId,
      project: item.project,
      createdAt,
      idGenerator: () => this.idGen(item),
    });
  }

  /**
   * Cheap deterministic 32-bit hash rendered as an 8-char lowercase hex
   * string. Collision risk is irrelevant for import dedupe because the
   * sessionId is already part of the filename — the hash only needs to
   * disambiguate items that share the same session. Using a plain JS
   * function keeps core dependency-free; no crypto module import.
   */
  private static stableHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
```

- [ ] **Step 4: Re-export from services index**

Edit `packages/core/src/services/index.ts`, append:

```ts
export { ImportService } from './import-service.js';
export type {
  ImportRequest,
  ImportResponse,
  ImportServiceDeps,
  AgentImportResult,
  AgentConfig,
} from './import-service.js';
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm -F @llm-wiki/core test import-service`
Expected: PASS on all six cases (original five plus the rerun-idempotency case).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/import-service.ts \
        packages/core/src/services/index.ts \
        packages/core/tests/services/import-service.test.ts
git commit -m ":sparkles: [core] Add ImportService for native agent memory sweeps"
```

---

## Task 12: ClaudeCodeMemoryReader adapter

**Files:**
- Create: `packages/infra/src/claude-code-memory-reader.ts`
- Create: `packages/infra/tests/claude-code-memory-reader.test.ts`
- Modify: `packages/infra/src/index.ts`
- Modify: `packages/infra/package.json` (add `globby`)

Claude Code stores per-project memory in `~/.claude/projects/<project-hash>/memory/*.md`. The reader enumerates those files via `globby`, reads frontmatter to extract `session` + `project` (if present) or derives them from the path, and converts each file into an `AgentMemoryItem`.

- [ ] **Step 1: Install globby**

Run: `pnpm -F @llm-wiki/infra add globby@^14.0.0`

- [ ] **Step 2: Write failing test**

Create `packages/infra/tests/claude-code-memory-reader.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeCodeMemoryReader } from '../src/claude-code-memory-reader.js';

describe('ClaudeCodeMemoryReader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cc-reader-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeMem(
    projectHash: string,
    filename: string,
    body: string,
    mtime?: Date,
  ): Promise<string> {
    const dir = path.join(root, 'projects', projectHash, 'memory');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, filename);
    await writeFile(file, body);
    if (mtime) await utimes(file, mtime, mtime);
    return file;
  }

  it('discovers memory files under the configured paths', async () => {
    await writeMem(
      'cli-relay-abc',
      'session-001.md',
      '---\nsession: sess001\nproject: cli-relay\n---\n\nPGX rule\n',
      new Date('2026-04-09T10:00:00Z'),
    );

    const reader = new ClaudeCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'projects', '*', 'memory', '*.md')],
      since: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].agent).toBe('claude-code');
    expect(items[0].sessionId).toBe('sess001');
    expect(items[0].project).toBe('cli-relay');
    expect(items[0].content).toContain('PGX rule');
    expect(items[0].mtime).toBe('2026-04-09T10:00:00.000Z');
  });

  it('filters out files older than `since`', async () => {
    await writeMem(
      'p',
      'old.md',
      '---\nsession: old\n---\n\ncontent\n',
      new Date('2026-03-01T00:00:00Z'),
    );
    await writeMem(
      'p',
      'new.md',
      '---\nsession: new\n---\n\ncontent\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    const reader = new ClaudeCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'projects', '*', 'memory', '*.md')],
      since: '2026-04-01T00:00:00Z',
    });
    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('new');
  });

  it('derives sessionId from filename when frontmatter is missing', async () => {
    await writeMem(
      'p',
      '2026-04-09-sess42.md',
      '# raw body only\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    const reader = new ClaudeCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'projects', '*', 'memory', '*.md')],
      since: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('sess42');
  });

  it('returns empty on missing paths without throwing', async () => {
    const reader = new ClaudeCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'does', 'not', 'exist', '*.md')],
      since: null,
    });
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm -F @llm-wiki/infra test claude-code-memory-reader`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement ClaudeCodeMemoryReader**

Create `packages/infra/src/claude-code-memory-reader.ts`:

```ts
import { globby } from 'globby';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import {
  AgentMemoryItem,
  type IAgentMemoryReader,
  type AgentMemoryDiscoveryOptions,
} from '@llm-wiki/core';

const IDENTIFIER_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Reads Claude Code's per-project memory storage and converts each file
 * into an AgentMemoryItem. Paths are globbed via `globby`, so callers can
 * pass either directory globs (`.../memory/*.md`) or absolute file paths.
 *
 * Session and project are sourced from (in order):
 *   1. frontmatter `session` / `project` fields
 *   2. filename convention `YYYY-MM-DD-<session>.md`
 *   3. fallback: the basename without extension, sanitised to the slug set
 */
export class ClaudeCodeMemoryReader implements IAgentMemoryReader {
  public readonly agent = 'claude-code';

  async discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]> {
    const files = await globby(options.paths, {
      absolute: true,
      dot: false,
      onlyFiles: true,
      suppressErrors: true,
    });

    const sinceMs = options.since ? Date.parse(options.since) : null;
    const items: AgentMemoryItem[] = [];

    for (const file of files) {
      let info;
      try {
        info = await stat(file);
      } catch {
        continue;
      }
      const mtimeIso = info.mtime.toISOString();
      if (sinceMs !== null && info.mtime.getTime() <= sinceMs) continue;

      let raw: string;
      try {
        raw = await readFile(file, 'utf8');
      } catch {
        continue;
      }

      const parsed = matter(raw);
      const basename = path.basename(file, '.md');
      const sessionId = this.pickSessionId(parsed.data, basename);
      if (!sessionId) continue;
      const project = this.pickProject(parsed.data);
      const content = parsed.content.trim() || raw.trim();
      if (!content) continue;

      try {
        items.push(
          AgentMemoryItem.create({
            agent: this.agent,
            sourcePath: file,
            sessionId,
            project,
            content,
            mtime: mtimeIso,
          }),
        );
      } catch {
        // Invalid identifier or missing field — skip quietly (import phase
        // is best-effort, one bad file should not abort the sweep).
      }
    }

    return items;
  }

  private pickSessionId(data: Record<string, unknown>, basename: string): string | null {
    const fromFm = typeof data.session === 'string' ? data.session : null;
    if (fromFm && IDENTIFIER_SAFE.test(fromFm)) return fromFm;
    // YYYY-MM-DD-<session> convention
    const match = basename.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
    if (match && IDENTIFIER_SAFE.test(match[1])) return match[1];
    if (IDENTIFIER_SAFE.test(basename)) return basename;
    return null;
  }

  private pickProject(data: Record<string, unknown>): string | undefined {
    if (typeof data.project === 'string' && IDENTIFIER_SAFE.test(data.project)) {
      return data.project;
    }
    return undefined;
  }
}
```

- [ ] **Step 5: Re-export from infra index**

Edit `packages/infra/src/index.ts`:

```ts
export { ClaudeCodeMemoryReader } from './claude-code-memory-reader.js';
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm -F @llm-wiki/infra test claude-code-memory-reader`
Expected: PASS on all four cases.

- [ ] **Step 7: Commit**

```bash
git add packages/infra/src/claude-code-memory-reader.ts \
        packages/infra/src/index.ts \
        packages/infra/tests/claude-code-memory-reader.test.ts \
        packages/infra/package.json \
        pnpm-lock.yaml
git commit -m ":sparkles: [infra] Add ClaudeCodeMemoryReader adapter"
```

---

## Task 13: Lint E2E integration test (real git + 7zip + mock LLM)

**Files:**
- Create: `packages/infra/tests/integration/lint-e2e.test.ts`

This test is the executable proof of INV-5 and INV-9. It exercises `LintService` wired to every real adapter (`FsFileStore`, `FsVerbatimStore`, `GitVersionControl`, `RuVectorSearchEngine`, `SevenZipArchiver`, `YamlStateStore`) with a mocked LLM. It seeds the wiki with verbatim entries, runs `lint()`, and verifies:

1. **Main branch stays clean during phases — checked mid-flight, not just before/after.** A before/after HEAD comparison only proves that a merge eventually happened; it does not distinguish a merge that landed at the end of a clean worktree lifecycle from one where phases mutated main directly. To prove INV-9 we wrap `GitVersionControl` with a test-only subclass that runs a probe callback immediately before `mergeWorktree` calls the real merge. The probe captures main-branch HEAD and filesystem state at that exact moment; the test then asserts HEAD is unchanged and the consolidated wiki page does not yet exist on main.
2. Every seeded entry has `consolidated: true` in the committed tree (INV-5).
3. A `.archive/<YYYY-MM>-claude-code.7z` file exists on main after lint.
4. The consolidated wiki page is indexed in `search.db` (post-merge reindex).
5. `state.last_lint` is stamped.
6. On LLM failure, main branch is untouched, state unchanged.

- [ ] **Step 1: Write the failing test**

Create `packages/infra/tests/integration/lint-e2e.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { MockLanguageModelV2, MockEmbeddingModelV2 } from 'ai/test';
import {
  FsFileStore,
  FsVerbatimStore,
  GitVersionControl,
  YamlStateStore,
  SevenZipArchiver,
  AiSdkLlmClient,
  AiSdkEmbeddingClient,
  RuVectorSearchEngine,
} from '../../src/index.js';
import {
  LintService,
  ConsolidatePhase,
  PromotePhase,
  HealthPhase,
  VerbatimEntry,
} from '@llm-wiki/core';

function okGen(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: 'stop' as const,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    warnings: [],
  };
}

/**
 * IVersionControl wrapper that runs a probe callback immediately BEFORE
 * calling `mergeWorktree`. This is how the INV-9 proof captures main
 * branch state at the exact moment the worktree is about to land — a
 * plain before/after HEAD comparison can only confirm "merge happened",
 * not "main was untouched while phases ran".
 */
class ProbingGitVersionControl extends GitVersionControl {
  public probeBeforeMerge: (() => void | Promise<void>) | null = null;

  async mergeWorktree(worktreePath: string): Promise<string> {
    if (this.probeBeforeMerge) await this.probeBeforeMerge();
    return super.mergeWorktree(worktreePath);
  }
}

describe('Lint E2E', () => {
  let wiki: string;

  beforeEach(async () => {
    wiki = await mkdtemp(path.join(tmpdir(), 'llm-wiki-lint-e2e-'));
    execSync('git init -q -b main', { cwd: wiki });
    execSync('git config user.email t@e.com', { cwd: wiki });
    execSync('git config user.name T', { cwd: wiki });
    execSync('git config commit.gpgsign false', { cwd: wiki });
    await writeFile(path.join(wiki, 'README.md'), '# seed');
    await writeFile(path.join(wiki, '.gitignore'), '.worktrees/\n.local/\n');
    execSync('git add README.md .gitignore && git commit -q -m seed', { cwd: wiki });
  });

  afterEach(async () => {
    await rm(wiki, { recursive: true, force: true });
  });

  async function seedVerbatim(count: number): Promise<void> {
    const mainFs = new FsFileStore(wiki);
    const store = new FsVerbatimStore(mainFs);
    for (let i = 0; i < count; i++) {
      await store.writeEntry(
        VerbatimEntry.create({
          content: `fact ${i}`,
          agent: 'claude-code',
          sessionId: `sess${i}`,
          idGenerator: () => `uuid${i}`,
        }),
      );
    }
    // Commit seeded entries so lint is the only source of change.
    execSync('git add log && git commit -q -m seed-verbatim', { cwd: wiki });
  }

  interface Harness {
    service: LintService;
    vc: ProbingGitVersionControl;
    search: RuVectorSearchEngine;
  }

  function makeService(llmThrows: boolean): Harness {
    const mainFs = new FsFileStore(wiki);
    const mainVerbatim = new FsVerbatimStore(mainFs);
    const vc = new ProbingGitVersionControl(wiki);
    const stateStore = new YamlStateStore(new FsFileStore(wiki));

    const dims = 8;
    const embed = (s: string): number[] => {
      const v = new Array(dims).fill(0);
      for (let i = 0; i < s.length; i++) v[s.charCodeAt(i) % dims] += 1;
      const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
      return v.map((x) => x / n);
    };
    const embeddings = new AiSdkEmbeddingClient(
      new MockEmbeddingModelV2<string>({
        maxEmbeddingsPerCall: 100,
        supportsParallelCalls: true,
        doEmbed: async ({ values }) => ({
          embeddings: values.map((v: string) => embed(v)),
          usage: { tokens: values.length },
        }),
      }),
      dims,
    );
    const search = new RuVectorSearchEngine(path.join(wiki, '.local/search.db'), embeddings);

    const llm = new AiSdkLlmClient(
      new MockLanguageModelV2({
        doGenerate: async () => {
          if (llmThrows) throw new Error('DOWN');
          return okGen(
            JSON.stringify({
              pages: [
                {
                  path: 'wiki/tools/postgresql.md',
                  title: 'PostgreSQL',
                  content: '## Summary\nConsolidated.',
                  source_entries: [],
                },
              ],
            }),
          );
        },
      }),
    );

    const archiver = new SevenZipArchiver();

    const service = new LintService({
      mainRepoRoot: wiki,
      mainFileStore: mainFs,
      mainVerbatimStore: mainVerbatim,
      versionControl: vc,
      searchEngine: search,
      fileStoreFactory: (root) => new FsFileStore(root),
      verbatimStoreFactory: (fs) => new FsVerbatimStore(fs),
      stateStore,
      archiver,
      makeConsolidatePhase: (fs, vs) => new ConsolidatePhase(fs, vs, llm, wiki),
      makePromotePhase: (fs) => new PromotePhase(fs, llm),
      makeHealthPhase: (fs) => new HealthPhase(fs),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });
    return { service, vc, search };
  }

  it('INV-5 + INV-9: mid-flight probe proves main untouched during phases, then lint commits', async () => {
    await seedVerbatim(3);
    const { service, vc, search } = makeService(false);

    const headBefore = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
    const pageOnMain = path.join(wiki, 'wiki', 'tools', 'postgresql.md');

    // Mid-flight probe: captured at the exact moment GitVersionControl
    // is about to merge the worktree. At this point consolidate + promote
    // have already written to the worktree, but the merge has NOT yet
    // landed. Main branch must still be in its seed state.
    let probeHead: string | null = null;
    let probePageExists: boolean | null = null;
    vc.probeBeforeMerge = () => {
      probeHead = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
      probePageExists = existsSync(pageOnMain);
    };

    const report = await service.lint({});

    // INV-9 proof: at merge time, main HEAD and filesystem were the
    // seed state — no phase wrote to main directly.
    expect(probeHead).toBe(headBefore);
    expect(probePageExists).toBe(false);

    expect(report.consolidated).toBe(3);
    expect(report.commitSha).not.toBeNull();

    const headAfter = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
    expect(headAfter).not.toBe(headBefore); // merge landed after the probe

    // INV-5: every verbatim entry committed is marked consolidated.
    const mainFs = new FsFileStore(wiki);
    const mainVerbatim = new FsVerbatimStore(mainFs);
    const remaining = await mainVerbatim.listUnconsolidated('claude-code');
    expect(remaining).toEqual([]);

    // Consolidated wiki page is on main after the merge.
    expect(await mainFs.exists('wiki/tools/postgresql.md')).toBe(true);

    // Archive exists.
    const archivePath = path.join(wiki, '.archive', '2026-04-claude-code.7z');
    const archiveInfo = await stat(archivePath);
    expect(archiveInfo.isFile()).toBe(true);

    // Post-merge reindex landed: the lint-created page was indexed with
    // an updated timestamp matching its frontmatter.
    const indexed = await search.lastIndexedAt('wiki/tools/postgresql.md');
    expect(indexed).not.toBeNull();

    // last_lint stamped.
    const state = await new YamlStateStore(new FsFileStore(wiki)).load();
    expect(state.last_lint).toBe('2026-04-10T12:00:00.000Z');
  });

  it('INV-9: LLM failure discards worktree, main branch and state untouched', async () => {
    await seedVerbatim(2);
    const { service } = makeService(true);

    const headBefore = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
    await expect(service.lint({})).rejects.toThrow();

    const headAfter = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
    expect(headAfter).toBe(headBefore);

    const mainFs = new FsFileStore(wiki);
    const mainVerbatim = new FsVerbatimStore(mainFs);
    const remaining = await mainVerbatim.listUnconsolidated('claude-code');
    expect(remaining).toHaveLength(2);

    expect(await mainFs.exists('wiki/tools/postgresql.md')).toBe(false);

    const state = await new YamlStateStore(new FsFileStore(wiki)).load();
    expect(state.last_lint).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm -F @llm-wiki/infra test lint-e2e`
Expected: FAIL — at this point you may see either a compile error (if prior tasks missed an export) or a runtime mismatch. Iterate on the source files, not the test, until the test passes.

- [ ] **Step 3: Iterate until the test passes**

Common fixes you may need at this stage:

- `ConsolidatePhase` was built in Task 6 with a `FakeVerbatimStore` that records `.marked`; the real `FsVerbatimStore` rewrites file contents and the `log/` directory must be staged in the orchestrator's commit (see Task 9 note on the `log` wildcard in `touchedPaths`).
- The consolidated wiki page must live at the path the LLM mock returned (`wiki/tools/postgresql.md`). If that path's parent directory did not exist, `FsFileStore.writeFile` should auto-create it — confirm by reading `packages/infra/src/fs-file-store.ts`.
- `LintService` passes `log` (a directory, not a file) in `touchedPaths`; `GitVersionControl.commitInWorktree` calls `git add log` which correctly stages the whole dir.

Run: `pnpm -F @llm-wiki/infra test lint-e2e`
Expected: PASS on both cases.

- [ ] **Step 4: Commit**

```bash
git add packages/infra/tests/integration/lint-e2e.test.ts
git commit -m ":white_check_mark: [infra] Add Lint E2E test — INV-5, INV-9 coverage"
```

---

## Task 14: Import E2E integration test

**Files:**
- Create: `packages/infra/tests/integration/import-e2e.test.ts`

End-to-end exercise of `ImportService` + `ClaudeCodeMemoryReader` + `FsVerbatimStore` + `YamlStateStore`, all against a real temp filesystem. Confirms that an import sweep creates verbatim entries on disk and stamps `imports[agent].last_import`.

- [ ] **Step 1: Write the failing test**

Create `packages/infra/tests/integration/import-e2e.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  FsFileStore,
  FsVerbatimStore,
  YamlStateStore,
  ClaudeCodeMemoryReader,
} from '../../src/index.js';
import { ImportService } from '@llm-wiki/core';

describe('Import E2E', () => {
  let wiki: string;
  let sourceRoot: string;

  beforeEach(async () => {
    wiki = await mkdtemp(path.join(tmpdir(), 'llm-wiki-import-e2e-'));
    sourceRoot = await mkdtemp(path.join(tmpdir(), 'cc-memory-'));
  });

  afterEach(async () => {
    await rm(wiki, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
  });

  async function seedMemory(file: string, body: string, mtime: Date): Promise<void> {
    const full = path.join(sourceRoot, 'projects', 'hash', 'memory', file);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    await utimes(full, mtime, mtime);
  }

  it('imports new files into log/claude-code/raw and stamps state', async () => {
    await seedMemory(
      'session-alpha.md',
      '---\nsession: alpha\nproject: cli-relay\n---\n\nMemory item 1\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    await seedMemory(
      'session-bravo.md',
      '---\nsession: bravo\n---\n\nMemory item 2\n',
      new Date('2026-04-09T11:00:00Z'),
    );

    const mainFs = new FsFileStore(wiki);
    const verbatim = new FsVerbatimStore(mainFs);
    const state = new YamlStateStore(new FsFileStore(wiki));
    const reader = new ClaudeCodeMemoryReader();

    const service = new ImportService({
      readers: new Map([['claude-code', reader]]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: {
        'claude-code': {
          enabled: true,
          paths: [path.join(sourceRoot, 'projects', '*', 'memory', '*.md')],
        },
      },
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const result = await service.importAll({});

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].imported).toBe(2);
    expect(result.agents[0].skipped).toBe(0);

    const rawDir = path.join(wiki, 'log', 'claude-code', 'raw');
    const files = await readdir(rawDir);
    expect(files).toHaveLength(2);

    const reloaded = await state.load();
    expect(reloaded.imports['claude-code'].last_import).toBe('2026-04-10T12:00:00.000Z');

    // NOTE: rerun idempotency is unit-tested in `import-service.test.ts`
    // using a FakeReader that does not apply the `since` filter. We do
    // NOT re-assert it here because the real ClaudeCodeMemoryReader
    // filters out files with mtime <= since — and after the first sweep
    // `last_import` was stamped at 2026-04-10T12:00:00Z, well past every
    // seeded file's mtime (2026-04-09). So a second sweep through this
    // service would legitimately return discovered=0, not
    // skipped=<prev count>. The two properties (dedupe + since filter)
    // compose cleanly; testing them together at this layer is
    // contradictory.
  });

  it('skips files older than the stored last_import timestamp', async () => {
    await seedMemory(
      'old.md',
      '---\nsession: old\n---\n\nold\n',
      new Date('2026-03-01T00:00:00Z'),
    );
    await seedMemory(
      'new.md',
      '---\nsession: new\n---\n\nnew\n',
      new Date('2026-04-09T10:00:00Z'),
    );

    const mainFs = new FsFileStore(wiki);
    const verbatim = new FsVerbatimStore(mainFs);
    const state = new YamlStateStore(new FsFileStore(wiki));
    await state.update({
      imports: {
        'claude-code': { last_import: '2026-04-01T00:00:00Z' },
      },
    });
    const reader = new ClaudeCodeMemoryReader();

    const service = new ImportService({
      readers: new Map([['claude-code', reader]]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: {
        'claude-code': {
          enabled: true,
          paths: [path.join(sourceRoot, 'projects', '*', 'memory', '*.md')],
        },
      },
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const result = await service.importAll({});
    expect(result.agents[0].imported).toBe(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure, then iterate**

Run: `pnpm -F @llm-wiki/infra test import-e2e`
Expected: FAIL then PASS after any trailing fixes.

- [ ] **Step 3: Commit**

```bash
git add packages/infra/tests/integration/import-e2e.test.ts
git commit -m ":white_check_mark: [infra] Add Import E2E test covering Claude Code memory sweep"
```

---

## Task 15: Build, coverage, and final verification

**Files:**
- No new files. Verification only.

- [ ] **Step 1: Run the full workspace build**

Run: `pnpm -r build`
Expected: PASS for both `@llm-wiki/core` and `@llm-wiki/infra`. Any type error here means the exports added in Tasks 1–12 don't line up with how Task 13/14 consume them.

- [ ] **Step 2: Run the full test suite with coverage**

Run: `pnpm -r test -- --coverage`
Expected: PASS, with coverage numbers:

- `@llm-wiki/core` overall ≥ 95% lines / branches (core business logic threshold)
- `@llm-wiki/infra` overall ≥ 70% lines / branches (infrastructure threshold)

If any file is below threshold, add a focused test — do NOT disable the coverage gate. The failing file is almost always one of: `lint-service.ts` (check the skip-commit branch), `consolidate-phase.ts` (check the empty-batch branch), or `import-service.ts` (check the `ImportReaderNotRegisteredError` branch).

- [ ] **Step 3: Confirm every M3 invariant has test coverage**

Grep the new test files:

```bash
rtk grep -rn "INV-5\|INV-9" packages/core/tests packages/infra/tests
```

Expected: at least one match per invariant across the suite (lint-service.test, consolidate-phase.test, lint-e2e.test).

- [ ] **Step 4: Confirm no TODO / placeholder strings landed in source**

```bash
rtk grep -n "TODO\|TBD\|FIXME\|XXX" packages/core/src packages/infra/src
```

Expected: zero matches in the files created by this milestone.

- [ ] **Step 5: Update the top-level package.json test script if needed**

Open `package.json` at the repo root. If it already runs `pnpm -r test`, nothing to change. Otherwise add:

```json
{
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  }
}
```

- [ ] **Step 6: Final push-ready commit**

If any coverage top-ups or config touch-ups happened in this task, stage and commit them:

```bash
git status
git add -u
git commit -m ":white_check_mark: [m3] Verify Milestone 3 build, coverage, and invariants"
```

- [ ] **Step 7: Confirm the branch is ready for PR**

Run: `rtk git log --oneline main..HEAD`
Expected: a clean list of `:wrench:` / `:sparkles:` / `:white_check_mark:` commits covering Tasks 0–15 on `claude/milestone-3-lint-import-archiver` (Task 0 lands the per-package `test` scripts as a `:wrench:` commit before any feature work). No reverts, no fixup commits.

---

## Post-plan: Handoff to Milestone 4

Once this plan is merged, the following will be true:

- Every application-layer service from the spec exists in `@llm-wiki/core`.
- Every port has at least one infra adapter in `@llm-wiki/infra`.
- All 13 invariants in the spec's acceptance criteria have test coverage.
- The wiki's full lifecycle — remember → consolidate → promote → archive, plus one-shot imports — can be driven from a direct service call.

Milestone 4 picks up from here and adds the three transport packages (`@llm-wiki/mcp-server`, `@llm-wiki/cli`, `@llm-wiki/claude-code`), with no further changes to `core` or `infra` expected beyond thin DI wiring.
