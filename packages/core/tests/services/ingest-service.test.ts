import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IngestService, MAX_SOURCE_TOKENS } from '../../src/services/ingest-service.js';
import {
  LlmUnavailableError,
  SourceNotFoundError,
  SourceParseError,
  GitConflictError,
} from '../../src/domain/errors.js';
import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';
import type {
  ISearchEngine,
  ILlmClient,
  IFileStore,
  IVersionControl,
  ISourceReader,
  SourceContent,
  IStateStore,
  WorktreeInfo,
  FileStoreFactory,
  FileInfo,
  IndexEntry,
  SearchQuery,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '../../src/ports/index.js';
import type { SearchResult } from '../../src/domain/search-result.js';
import type { WikiPageData } from '../../src/domain/wiki-page.js';

// ---------------------------------------------------------------------------
// Lightweight in-memory fakes so IngestService tests can assert orchestration
// wiring without pulling in any real infra adapters.
// ---------------------------------------------------------------------------

class FakeSourceReader implements ISourceReader {
  public readSpy = vi.fn();
  public response: SourceContent | Error = {
    uri: '/tmp/src.md',
    content: '# Source\n\nBody.',
    mimeType: 'text/markdown',
    bytes: 20,
    estimatedTokens: 5,
  };

  async read(uri: string): Promise<SourceContent> {
    this.readSpy(uri);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

class FakeLlmClient implements ILlmClient {
  public completeSpy = vi.fn();
  public response:
    | LlmCompletionResponse
    | Error
    | Array<{ path: string; title: string; content: string }>;

  constructor() {
    this.response = [
      {
        path: 'wiki/tools/postgresql.md',
        title: 'PostgreSQL',
        content: '## Summary\nMaxConns rule.',
      },
    ];
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.completeSpy(request);
    if (this.response instanceof Error) throw this.response;
    if (Array.isArray(this.response)) {
      return {
        content: JSON.stringify(this.response),
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    }
    return this.response;
  }
}

class FakeSearchEngine implements ISearchEngine {
  public indexSpy = vi.fn<(entry: IndexEntry) => void>();
  async index(entry: IndexEntry): Promise<void> {
    this.indexSpy(entry);
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

class FakeVersionControl implements IVersionControl {
  public createSpy = vi.fn();
  public removeSpy = vi.fn<(p: string, force?: boolean) => void>();
  public commitInWorktreeSpy = vi.fn();
  public squashSpy = vi.fn();
  public mergeSpy = vi.fn<(p: string) => void>();
  public mergeResponse: string | Error = 'abc1234567';
  public onMergeSuccess: (worktreePath: string) => void = () => {};
  private worktreeCounter = 0;

  async commit(): Promise<string> {
    return 'main-sha';
  }
  async hasUncommittedChanges(): Promise<boolean> {
    return false;
  }
  async createWorktree(name: string): Promise<WorktreeInfo> {
    this.worktreeCounter += 1;
    this.createSpy(name);
    return {
      path: `/tmp/repo/.worktrees/${name}-${this.worktreeCounter}`,
      branch: `${name}-${this.worktreeCounter}`,
    };
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
    this.onMergeSuccess(p);
    return this.mergeResponse;
  }
  async commitInWorktree(p: string, files: string[], m: string): Promise<string> {
    this.commitInWorktreeSpy(p, files, m);
    return 'wt-sha';
  }
}

/** An in-memory file store whose parent dir can be anywhere — suitable for
 *  both the main store and a per-test fileStoreFactory. */
class FakeFileStore implements IFileStore {
  constructor(public readonly root: string) {}
  public files: Record<string, string> = {};
  public writeSpy = vi.fn<(p: string, c: string) => void>();

  async readFile(p: string): Promise<string | null> {
    return this.files[p] ?? null;
  }
  async writeFile(p: string, c: string): Promise<void> {
    this.writeSpy(p, c);
    this.files[p] = c;
  }
  async listFiles(directory: string): Promise<FileInfo[]> {
    const dir = directory.replace(/\/$/, '');
    return Object.keys(this.files)
      .filter((p) => p === dir || p.startsWith(`${dir}/`))
      .map((p) => ({ path: p, updated: '2026-04-10T00:00:00Z' }));
  }
  async exists(p: string): Promise<boolean> {
    return p in this.files;
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    if (!(p in this.files)) return null;
    return {
      frontmatter: {
        title: 'T',
        created: '2026-04-10',
        updated: '2026-04-10',
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: this.files[p],
    };
  }
}

class FakeStateStore implements IStateStore {
  public state: WikiRuntimeState = structuredClone(EMPTY_RUNTIME_STATE);
  public updateSpy = vi.fn<(patch: Partial<WikiRuntimeState>) => void>();

  async load(): Promise<WikiRuntimeState> {
    return structuredClone(this.state);
  }
  async save(s: WikiRuntimeState): Promise<void> {
    this.state = structuredClone(s);
  }
  async update(patch: Partial<WikiRuntimeState>): Promise<WikiRuntimeState> {
    this.updateSpy(patch);
    this.state = { ...this.state, ...patch };
    return structuredClone(this.state);
  }
}

// ---------------------------------------------------------------------------

describe('IngestService', () => {
  let sourceReader: FakeSourceReader;
  let llm: FakeLlmClient;
  let search: FakeSearchEngine;
  let vcs: FakeVersionControl;
  let mainStore: FakeFileStore;
  let worktreeStores: FakeFileStore[];
  let factory: FileStoreFactory;
  let stateStore: FakeStateStore;
  let service: IngestService;

  beforeEach(() => {
    sourceReader = new FakeSourceReader();
    llm = new FakeLlmClient();
    search = new FakeSearchEngine();
    vcs = new FakeVersionControl();
    mainStore = new FakeFileStore('/tmp/repo');
    worktreeStores = [];
    factory = (root: string) => {
      const s = new FakeFileStore(root);
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
