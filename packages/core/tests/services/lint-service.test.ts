import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LintService, type LintPhase } from '../../src/services/lint-service.js';
import { HealthIssue, HealthIssueType } from '../../src/domain/health-issue.js';
import {
  GitConflictError,
  LlmUnavailableError,
  ProjectScopeUnsupportedError,
} from '../../src/domain/errors.js';
import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';
import type {
  IFileStore,
  IVerbatimStore,
  IVersionControl,
  IStateStore,
  IArchiver,
  IIdempotencyStore,
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
  async remove(): Promise<void> {
    // LintService only exercises index(); remove() is never called in these tests.
  }
  async search(_q: SearchQuery): Promise<SearchResult[]> {
    return [];
  }
  async rebuild(): Promise<void> {
    // LintService never rebuilds — stub to satisfy the port.
  }
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
  async writeEntry(): Promise<void> {
    // LintService never writes verbatim entries through this fake.
  }
  async listUnconsolidated(): Promise<FileInfo[]> {
    return [];
  }
  async countUnconsolidated(): Promise<number> {
    return this.unconsolidated;
  }
  async listAgents(): Promise<string[]> {
    return [];
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

class FakeIdempotencyStore implements IIdempotencyStore {
  private records = new Map<string, any>();
  async acquire(operation: any, key: string, fingerprint: string) {
    const id = `${operation}:${key}`;
    const existing = this.records.get(id);
    if (!existing) {
      this.records.set(id, {
        operation,
        key,
        fingerprint,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      });
      return { kind: 'acquired' as const };
    }
    if (existing.fingerprint !== fingerprint) return { kind: 'conflict' as const };
    if (existing.status === 'completed') return { kind: 'replay' as const, record: existing };
    return { kind: 'in_progress' as const };
  }
  async complete(operation: any, key: string, fingerprint: string, response: unknown) {
    this.records.set(`${operation}:${key}`, {
      operation,
      key,
      fingerprint,
      status: 'completed',
      response,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  }
  async abort(operation: any, key: string, fingerprint: string) {
    const id = `${operation}:${key}`;
    const existing = this.records.get(id);
    if (existing && existing.fingerprint === fingerprint && existing.status === 'in_progress') {
      this.records.delete(id);
    }
  }
  async get(operation: any, key: string) {
    return this.records.get(`${operation}:${key}`) ?? null;
  }
}

function stubConsolidate(touched: string[] = []): LintPhase<'consolidate'> {
  return {
    name: 'consolidate',
    async run() {
      return {
        consolidatedCount: touched.length,
        touchedPaths: touched,
      };
    },
  };
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
      idempotencyStore: new FakeIdempotencyStore(),
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
      idempotencyStore: new FakeIdempotencyStore(),
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
      idempotencyStore: new FakeIdempotencyStore(),
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
      idempotencyStore: new FakeIdempotencyStore(),
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

  it('rejects unsupported project scope before side effects', async () => {
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
      idempotencyStore: new FakeIdempotencyStore(),
      makeConsolidatePhase: () => stubConsolidate(),
      makePromotePhase: () => stubPromote(),
      makeHealthPhase: () => stubHealth(),
      now: () => new Date(),
    });

    await expect(service.lint({ project: 'acme' })).rejects.toBeInstanceOf(
      ProjectScopeUnsupportedError,
    );
    expect(vc.createdWorktree).toBeNull();
    expect(state.saved).toEqual([]);
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
      idempotencyStore: new FakeIdempotencyStore(),
      makeConsolidatePhase: () => phase,
      makePromotePhase: () => stubPromote(),
      makeHealthPhase: () => stubHealth(),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    await service.lint({});

    expect(archiver.calls).toHaveLength(1);
    expect(archiver.calls[0].entries).toHaveLength(2);
    expect(archiver.calls[0].path).toBe('/main/.archive/2026-04-claude-code.7z');
  });

  it('reindexes wiki + projects pages touched by lint, skipping log wildcard', async () => {
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
      idempotencyStore: new FakeIdempotencyStore(),
      makeConsolidatePhase: () => stubConsolidate(['wiki/tools/postgresql.md']),
      makePromotePhase: () => stubPromote(['wiki/patterns/no-db-mocking.md']),
      makeHealthPhase: () => stubHealth(),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    await service.lint({});

    const indexedPaths = searchEngine.indexed.map((e) => e.path).sort((a, b) => a.localeCompare(b));
    expect(indexedPaths).toEqual(['wiki/patterns/no-db-mocking.md', 'wiki/tools/postgresql.md']);
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
      idempotencyStore: new FakeIdempotencyStore(),
      makeConsolidatePhase: () => stubConsolidate(),
      makePromotePhase: () => stubPromote(),
      makeHealthPhase: () => stubHealth([]),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    await service.lint({ phases: ['health'] });

    expect(searchEngine.indexed).toEqual([]);
  });
});
