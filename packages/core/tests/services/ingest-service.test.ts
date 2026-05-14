import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IngestService, MAX_SOURCE_TOKENS } from '../../src/services/ingest-service.js';
import {
  LlmUnavailableError,
  SourceNotFoundError,
  SourceParseError,
  GitConflictError,
  IngestPathViolationError,
  ProjectScopeUnsupportedError,
} from '../../src/domain/errors.js';
import type {
  FileStoreFactory,
} from '../../src/ports/index.js';
import {
  FakeIngestLlmClient,
  FakeSearchEngine,
  FakeSourceReader,
  FakeStateStore,
  FakeVersionControl,
  FakeWorktreeFileStore,
} from '../_helpers/core-test-fakes.js';

describe('IngestService', () => {
  let sourceReader: FakeSourceReader;
  let llm: FakeIngestLlmClient;
  let search: FakeSearchEngine;
  let vcs: FakeVersionControl;
  let mainStore: FakeWorktreeFileStore;
  let worktreeStores: FakeWorktreeFileStore[];
  let factory: FileStoreFactory;
  let stateStore: FakeStateStore;
  let service: IngestService;

  beforeEach(() => {
    sourceReader = new FakeSourceReader();
    llm = new FakeIngestLlmClient();
    search = new FakeSearchEngine();
    vcs = new FakeVersionControl();
    mainStore = new FakeWorktreeFileStore('/tmp/repo');
    worktreeStores = [];
    factory = (root: string) => {
      const s = new FakeWorktreeFileStore(root);
      worktreeStores.push(s);
      return s;
    };
    stateStore = new FakeStateStore();
    // Simulate the effect of a real git merge: files written to the
    // worktree become visible in the main store after mergeWorktree
    // succeeds. Real FsFileStore + GitVersionControl gives this for free
    // because both stores read the same filesystem; the fakes are separate
    // objects so we mirror by hand.
    vcs.onMergeSuccess = () => {
      const latest = worktreeStores[worktreeStores.length - 1];
      if (!latest) return;
      for (const [p, content] of Object.entries(latest.files)) {
        mainStore.files[p] = content;
      }
    };
    service = new IngestService(sourceReader, llm, search, vcs, mainStore, factory, stateStore);
  });

  it('test_ingest_validSource_createsWikiPagesInWorktree', async () => {
    // The main store is empty so the only writes must land on the worktree
    // store — proving INV-13 (ingest never touches main directly).
    await service.ingest({ source: '/tmp/src.md' });

    expect(worktreeStores.length).toBe(1);
    expect(worktreeStores[0].writeSpy).toHaveBeenCalled();
    expect(mainStore.writeSpy).not.toHaveBeenCalled();
    const writtenPaths = worktreeStores[0].writeSpy.mock.calls.map((c) => c[0]);
    expect(writtenPaths).toContain('wiki/tools/postgresql.md');
  });

  it('test_ingest_sourceOverTokenLimit_throwsSourceParseError', async () => {
    sourceReader.response = {
      uri: '/tmp/huge.md',
      content: 'x',
      bytes: 1,
      estimatedTokens: MAX_SOURCE_TOKENS + 1,
    };
    await expect(service.ingest({ source: '/tmp/huge.md' })).rejects.toBeInstanceOf(
      SourceParseError,
    );
    expect(vcs.createSpy).not.toHaveBeenCalled();
  });

  it('test_ingest_projectScopeProvided_throwsProjectScopeUnsupported', async () => {
    await expect(service.ingest({ source: '/tmp/src.md', project: 'acme' })).rejects.toBeInstanceOf(
      ProjectScopeUnsupportedError,
    );
    expect(sourceReader.readSpy).not.toHaveBeenCalled();
    expect(vcs.createSpy).not.toHaveBeenCalled();
  });

  it('test_ingest_sourceMissing_throwsSourceNotFoundError', async () => {
    sourceReader.response = new SourceNotFoundError('/nope.md');
    await expect(service.ingest({ source: '/nope.md' })).rejects.toBeInstanceOf(
      SourceNotFoundError,
    );
    expect(vcs.createSpy).not.toHaveBeenCalled();
  });

  it('test_ingest_llmFails_worktreeDiscarded_mainBranchUntouched_stateUnchanged', async () => {
    llm.response = new Error('model down');

    await expect(service.ingest({ source: '/tmp/src.md' })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );

    expect(vcs.createSpy).toHaveBeenCalled();
    expect(vcs.removeSpy).toHaveBeenCalledWith(expect.stringContaining('.worktrees/ingest-'), true);
    expect(mainStore.writeSpy).not.toHaveBeenCalled();
    expect(stateStore.updateSpy).not.toHaveBeenCalled();
    // Worktree did not produce a commit — make sure we never tried to merge.
    expect(vcs.mergeSpy).not.toHaveBeenCalled();
  });

  it('test_ingest_success_pagesCommittedSquashedMerged_thenReindexed_stateUpdated', async () => {
    const result = await service.ingest({ source: '/tmp/src.md' });

    expect(result.pages_created).toEqual(['wiki/tools/postgresql.md']);
    expect(vcs.commitInWorktreeSpy).toHaveBeenCalledTimes(1);
    expect(vcs.squashSpy).toHaveBeenCalledTimes(1);
    expect(vcs.mergeSpy).toHaveBeenCalledTimes(1);
    // The adapter should re-index every newly-merged file
    expect(search.indexSpy).toHaveBeenCalled();
    const indexedPaths = search.indexSpy.mock.calls.map((c) => c[0].path);
    expect(indexedPaths).toContain('wiki/tools/postgresql.md');
    // Non-force remove on success
    expect(vcs.removeSpy).toHaveBeenCalledWith(
      expect.stringContaining('.worktrees/ingest-'),
      undefined,
    );
    // State updated exactly once with a valid ISO timestamp
    expect(stateStore.updateSpy).toHaveBeenCalledTimes(1);
    const patch = stateStore.updateSpy.mock.calls[0][0];
    expect(patch.last_ingest).toBeTruthy();
    expect(new Date(patch.last_ingest as string).toISOString()).toBe(patch.last_ingest);
  });

  it('test_ingest_mergeConflict_worktreePreserved_returnsPath_stateUnchanged', async () => {
    vcs.mergeResponse = new GitConflictError('/tmp/repo/.worktrees/ingest-1', 'conflict.md');

    await expect(service.ingest({ source: '/tmp/src.md' })).rejects.toBeInstanceOf(
      GitConflictError,
    );

    expect(vcs.removeSpy).not.toHaveBeenCalled();
    expect(stateStore.updateSpy).not.toHaveBeenCalled();
  });

  // ---- Path validation (Problem 1 from blocksorg review) -------------------

  it.each([
    ['package.json', 'top-level config file'],
    ['pnpm-lock.yaml', 'lock file'],
    ['.github/workflows/ci.yml', 'CI workflow'],
    ['README.md', 'top-level markdown outside wiki/'],
    ['docs/foo.md', 'unsupported top-level directory'],
    ['wiki', 'directory without file'],
    ['wiki/foo.txt', 'non-markdown suffix'],
    ['wiki/../package.json', 'parent traversal segment'],
    ['wiki/./foo.md', 'current-dir segment'],
    ['/etc/passwd', 'absolute path'],
    ['projects/foo.md', 'projects without project name'],
    ['projects/with space/foo.md', 'invalid project name'],
    ['projects/..foo/bar.md', 'leading dot in project name'],
    ['wiki\\foo.md', 'backslash separator'],
    ['wiki//foo.md', 'empty segment'],
  ])('test_ingest_rejectsMaliciousPath_%s', async (badPath, _description) => {
    llm.response = [{ path: badPath, title: 'Evil', content: '# oops' }];

    await expect(service.ingest({ source: '/tmp/src.md' })).rejects.toBeInstanceOf(
      IngestPathViolationError,
    );

    // Worktree was created (validation runs after createWorktree) but must be
    // force-removed, main store must be untouched, and state must NOT be
    // updated — matching INV-4 semantics.
    expect(vcs.createSpy).toHaveBeenCalled();
    expect(vcs.removeSpy).toHaveBeenCalledWith(expect.stringContaining('.worktrees/ingest-'), true);
    expect(mainStore.writeSpy).not.toHaveBeenCalled();
    expect(stateStore.updateSpy).not.toHaveBeenCalled();
    // No files were written to the worktree either
    if (worktreeStores.length > 0) {
      expect(worktreeStores[0].writeSpy).not.toHaveBeenCalled();
    }
    // Never attempted a merge on the poisoned worktree
    expect(vcs.mergeSpy).not.toHaveBeenCalled();
  });

  it('test_ingest_rejectsFirstBadPath_doesNotWriteLaterGoodPages', async () => {
    // Mixed batch — second page is valid, first is not. The whole ingest
    // must fail atomically: no files written even to the worktree.
    llm.response = [
      { path: '.github/workflows/ci.yml', title: 'Bad', content: 'bad' },
      { path: 'wiki/tools/ok.md', title: 'OK', content: '## ok' },
    ];

    await expect(service.ingest({ source: '/tmp/src.md' })).rejects.toBeInstanceOf(
      IngestPathViolationError,
    );
    if (worktreeStores.length > 0) {
      expect(worktreeStores[0].writeSpy).not.toHaveBeenCalled();
    }
  });

  it('test_ingest_acceptsValidWikiAndProjectPaths', async () => {
    // Both a wiki/ and a projects/<name>/ target with identifier-shaped
    // name and valid .md suffix should be accepted.
    llm.response = [
      { path: 'wiki/patterns/testing.md', title: 'T', content: '## ok' },
      { path: 'projects/cli-relay_v2/architecture.md', title: 'A', content: '## ok' },
    ];

    const result = await service.ingest({ source: '/tmp/src.md' });
    expect(result.pages_created.length + result.pages_updated.length).toBe(2);
    expect(vcs.mergeSpy).toHaveBeenCalled();
    expect(stateStore.updateSpy).toHaveBeenCalled();
  });

  it('test_ingest_rerunSameSource_updatesExistingPage_noDuplicate', async () => {
    // First run — the LLM produces one page.
    await service.ingest({ source: '/tmp/src.md' });
    expect(worktreeStores[0].writeSpy).toHaveBeenCalledTimes(1);

    // Main store now contains the page (simulate the merge effect)
    mainStore.files['wiki/tools/postgresql.md'] =
      '---\ntitle: PostgreSQL\n---\n## Summary\nMaxConns rule.';

    // Second run — same LLM response. The service must overwrite the existing
    // page in the (fresh) worktree, not create a sibling.
    const result = await service.ingest({ source: '/tmp/src.md' });

    expect(worktreeStores.length).toBe(2);
    const secondWrites = worktreeStores[1].writeSpy.mock.calls.map((c) => c[0]);
    expect(secondWrites).toEqual(['wiki/tools/postgresql.md']);
    // The page existed in main before the second run, so it must be
    // reported as updated, not created, and must appear exactly once.
    expect(result.pages_created).toEqual([]);
    expect(result.pages_updated).toEqual(['wiki/tools/postgresql.md']);
  });
});
