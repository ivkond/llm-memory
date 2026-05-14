import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LintService, type LintPhase } from '../../src/services/lint-service.js';
import { HealthIssue, HealthIssueType } from '../../src/domain/health-issue.js';
import {
  GitConflictError,
  LlmUnavailableError,
  ProjectScopeUnsupportedError,
} from '../../src/domain/errors.js';
import type {
  FileStoreFactory,
  ArchiveEntry,
} from '../../src/ports/index.js';
import {
  FakeArchiver,
  FakeSearchEngine,
  FakeStateStore,
  FakeVerbatimStore,
  FakeVersionControl,
  FakeWorktreeFileStore,
} from '../_helpers/core-test-fakes.js';

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
  let mainFs: FakeWorktreeFileStore;
  let vs: FakeVerbatimStore;
  let vc: FakeVersionControl;
  let state: FakeStateStore;
  let archiver: FakeArchiver;
  let searchEngine: FakeSearchEngine;

  beforeEach(() => {
    mainFs = new FakeWorktreeFileStore('/main');
    vs = new FakeVerbatimStore();
    vc = new FakeVersionControl();
    vc.mergeResponse = 'final-sha';
    state = new FakeStateStore();
    archiver = new FakeArchiver();
    searchEngine = new FakeSearchEngine();
    fsFactory = (root: string) => new FakeWorktreeFileStore(root);
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
      makeConsolidatePhase: () => stubConsolidate(),
      makePromotePhase: () => stubPromote(),
      makeHealthPhase: () => stubHealth([]),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    await service.lint({ phases: ['health'] });

    expect(searchEngine.indexed).toEqual([]);
  });
});
