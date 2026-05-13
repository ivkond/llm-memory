import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';
import { RecoveryDiagnosticsService } from '../../src/services/recovery-diagnostics-service.js';
import type {
  IFileStore,
  IStateStore,
  ISearchEngine,
  IVersionControl,
  FileInfo,
  IndexEntry,
  SearchQuery,
  IndexHealth,
} from '../../src/ports/index.js';
import type { WikiPageData } from '../../src/domain/wiki-page.js';
import type { SearchResult } from '../../src/domain/search-result.js';

class FakeFileStore implements IFileStore {
  public files: Record<string, { info: FileInfo; page: WikiPageData }> = {};
  public existingPaths = new Set<string>();
  async readFile(): Promise<string | null> {
    return null;
  }
  async writeFile(): Promise<void> {}
  async listFiles(directory: string): Promise<FileInfo[]> {
    return Object.values(this.files)
      .map((f) => f.info)
      .filter((info) => info.path === directory || info.path.startsWith(`${directory}/`));
  }
  async exists(relativePath: string): Promise<boolean> {
    return this.existingPaths.has(relativePath);
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    return this.files[p]?.page ?? null;
  }
}

class FakeSearchEngine implements ISearchEngine {
  public healthValue: IndexHealth = 'ok';
  public rebuildSpy = vi.fn(async (_entries: IndexEntry[]) => undefined);
  async index(_entry: IndexEntry): Promise<void> {}
  async remove(_path: string): Promise<void> {}
  async search(_query: SearchQuery): Promise<SearchResult[]> {
    return [];
  }
  async rebuild(entries: IndexEntry[]): Promise<void> {
    await this.rebuildSpy(entries);
  }
  async health(): Promise<IndexHealth> {
    return this.healthValue;
  }
  async lastIndexedAt(): Promise<string | null> {
    return null;
  }
}

class FakeStateStore implements IStateStore {
  public state: WikiRuntimeState = structuredClone(EMPTY_RUNTIME_STATE);
  public throwOnLoad = false;

  async load(): Promise<WikiRuntimeState> {
    if (this.throwOnLoad) {
      throw new Error('bad yaml');
    }
    return structuredClone(this.state);
  }
  async save(state: WikiRuntimeState): Promise<void> {
    this.state = state;
  }
  async update(patch: Partial<WikiRuntimeState>): Promise<WikiRuntimeState> {
    this.state = { ...this.state, ...patch };
    return this.state;
  }
}

class FakeVersionControl implements IVersionControl {
  public dirty = false;
  public throwOnStatus = false;

  async commit(): Promise<string> {
    return 'sha';
  }
  async hasUncommittedChanges(): Promise<boolean> {
    if (this.throwOnStatus) {
      throw new Error('not a git repo');
    }
    return this.dirty;
  }
  async createWorktree() {
    return { path: '/tmp/worktree', branch: 'worktree' };
  }
  async removeWorktree(): Promise<void> {}
  async squashWorktree(): Promise<string> {
    return 'sha';
  }
  async mergeWorktree(): Promise<string> {
    return 'sha';
  }
  async commitInWorktree(): Promise<string> {
    return 'sha';
  }
}

function addPage(fileStore: FakeFileStore, path: string, title: string): void {
  fileStore.files[path] = {
    info: { path, updated: '2026-05-10T00:00:00Z' },
    page: {
      frontmatter: {
        title,
        created: '2026-05-10T00:00:00Z',
        updated: '2026-05-10T00:00:00Z',
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: `${title} body`,
    },
  };
}

describe('RecoveryDiagnosticsService', () => {
  let fileStore: FakeFileStore;
  let search: FakeSearchEngine;
  let state: FakeStateStore;
  let vcs: FakeVersionControl;
  let service: RecoveryDiagnosticsService;

  beforeEach(() => {
    fileStore = new FakeFileStore();
    search = new FakeSearchEngine();
    state = new FakeStateStore();
    vcs = new FakeVersionControl();
    service = new RecoveryDiagnosticsService(fileStore, search, state, vcs);

    fileStore.existingPaths.add('.config/settings.shared.yaml');
    fileStore.existingPaths.add('wiki');
    fileStore.existingPaths.add('projects');
    fileStore.existingPaths.add('.local');
  });

  it('doctor returns ok when no findings', async () => {
    const result = await service.doctor();
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('doctor reports stale index and dirty git as warnings', async () => {
    search.healthValue = 'stale';
    vcs.dirty = true;

    const result = await service.doctor();
    expect(result.ok).toBe(true);
    expect(result.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['index_stale', 'git_dirty']));
  });

  it('verifyState returns error for unreadable runtime state', async () => {
    state.throwOnLoad = true;

    const result = await service.verifyState();
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'state_unreadable')).toBe(true);
  });

  it('repairIndex rebuilds entries from wiki and projects', async () => {
    addPage(fileStore, 'wiki/a.md', 'A');
    addPage(fileStore, 'projects/p1/b.md', 'B');

    const result = await service.repairIndex();
    expect(result.indexed).toBe(2);
    expect(search.rebuildSpy).toHaveBeenCalledTimes(1);
  });

  it('repairIndex dry-run does not rebuild', async () => {
    addPage(fileStore, 'wiki/a.md', 'A');

    const result = await service.repairIndex({ dryRun: true });
    expect(result.dry_run).toBe(true);
    expect(result.indexed).toBe(1);
    expect(search.rebuildSpy).not.toHaveBeenCalled();
  });
});
