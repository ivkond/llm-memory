import { describe, it, expect, beforeEach } from 'vitest';
import { WikiStatusService } from '../../src/services/status-service.js';
import { WikiNotInitializedError } from '../../src/domain/errors.js';
import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';
import type {
  IFileStore,
  IVerbatimStore,
  ISearchEngine,
  IStateStore,
  FileInfo,
  IndexEntry,
  SearchQuery,
  IndexHealth,
} from '../../src/ports/index.js';
import type { WikiPageData } from '../../src/domain/wiki-page.js';
import type { SearchResult } from '../../src/domain/search-result.js';
import { indexSnapshotFromLastIndexedMap } from './test-helpers.js';

class FakeFileStore implements IFileStore {
  public files: Record<string, { info: FileInfo; page: WikiPageData }> = {};
  public existingPaths = new Set<string>();
  async readFile(): Promise<string | null> {
    return null;
  }
  async writeFile(): Promise<void> {}
  async listFiles(directory: string): Promise<FileInfo[]> {
    const dir = directory.replace(/\/$/, '');
    return Object.values(this.files)
      .map((f) => f.info)
      .filter((info) => info.path === dir || info.path.startsWith(`${dir}/`));
  }
  async exists(relativePath: string): Promise<boolean> {
    return this.existingPaths.has(relativePath);
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    return this.files[p]?.page ?? null;
  }
}

class FakeVerbatimStore implements IVerbatimStore {
  public unconsolidated = 0;
  async writeEntry(): Promise<void> {}
  async listUnconsolidated(): Promise<FileInfo[]> {
    return [];
  }
  async countUnconsolidated(): Promise<number> {
    return this.unconsolidated;
  }
}

class FakeSearchEngine implements ISearchEngine {
  public healthValue: IndexHealth = 'ok';
  public lastIndexedMap: Record<string, string | null> = {};

  async index(_e: IndexEntry): Promise<void> {}
  async remove(): Promise<void> {}
  async search(_q: SearchQuery): Promise<SearchResult[]> {
    return [];
  }
  async rebuild(): Promise<void> {}
  async health(): Promise<IndexHealth> {
    return this.healthValue;
  }
  async lastIndexedAt(p: string): Promise<string | null> {
    return this.lastIndexedMap[p] ?? null;
  }
  async lastIndexedAtMany(paths: string[]): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    for (const p of paths) result[p] = this.lastIndexedMap[p] ?? null;
    return result;
  }
  async inspectIndex() {
    return indexSnapshotFromLastIndexedMap(this.lastIndexedMap, this.healthValue);
  }
}

class FakeStateStore implements IStateStore {
  public state: WikiRuntimeState = structuredClone(EMPTY_RUNTIME_STATE);
  async load(): Promise<WikiRuntimeState> {
    return structuredClone(this.state);
  }
  async save(s: WikiRuntimeState): Promise<void> {
    this.state = structuredClone(s);
  }
  async update(patch: Partial<WikiRuntimeState>): Promise<WikiRuntimeState> {
    this.state = { ...this.state, ...patch };
    return structuredClone(this.state);
  }
}

function makePage(
  filePath: string,
  title: string,
  updated: string,
): { info: FileInfo; page: WikiPageData } {
  return {
    info: { path: filePath, updated },
    page: {
      frontmatter: {
        title,
        created: updated,
        updated,
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: 'body',
    },
  };
}

describe('WikiStatusService', () => {
  let fileStore: FakeFileStore;
  let verbatimStore: FakeVerbatimStore;
  let searchEngine: FakeSearchEngine;
  let stateStore: FakeStateStore;
  let service: WikiStatusService;

  beforeEach(() => {
    fileStore = new FakeFileStore();
    verbatimStore = new FakeVerbatimStore();
    searchEngine = new FakeSearchEngine();
    stateStore = new FakeStateStore();
    service = new WikiStatusService(fileStore, verbatimStore, searchEngine, stateStore);
  });

  it('test_status_emptyWiki_throwsWikiNotInitialized', async () => {
    await expect(service.status()).rejects.toBeInstanceOf(WikiNotInitializedError);
  });

  it('test_status_initializedButEmptyWiki_returnsZeroPages', async () => {
    fileStore.existingPaths.add('.config/settings.shared.yaml');
    fileStore.existingPaths.add('wiki');
    fileStore.existingPaths.add('projects');
    searchEngine.healthValue = 'missing';

    const response = await service.status();
    expect(response.total_pages).toBe(0);
    expect(response.projects).toEqual([]);
    expect(response.index_health).toBe('missing');
  });

  it('test_status_nonEmptyWiki_returnsTotalPagesAndProjects', async () => {
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    fileStore.files['projects/foo/x.md'] = makePage(
      'projects/foo/x.md',
      'X',
      '2026-04-09T00:00:00Z',
    );
    fileStore.files['projects/bar/y.md'] = makePage(
      'projects/bar/y.md',
      'Y',
      '2026-04-09T00:00:00Z',
    );

    // All pages are already indexed so the health check stays 'ok'.
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';
    searchEngine.lastIndexedMap['projects/foo/x.md'] = '2026-04-10T00:00:00Z';
    searchEngine.lastIndexedMap['projects/bar/y.md'] = '2026-04-10T00:00:00Z';

    const response = await service.status();
    expect(response.total_pages).toBe(3);
    expect(response.projects.sort()).toEqual(['bar', 'foo']);
  });

  it('test_status_unconsolidatedCountPropagatedFromVerbatimStore', async () => {
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';
    verbatimStore.unconsolidated = 7;

    const response = await service.status();
    expect(response.unconsolidated).toBe(7);
  });

  it('test_status_indexHealth_missing_returnsMissing', async () => {
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.healthValue = 'missing';

    const response = await service.status();
    expect(response.index_health).toBe('missing');
  });

  it('test_status_staleFiles_indexHealthReportsStale', async () => {
    // Engine says 'ok', but one file's updated timestamp is newer than its
    // lastIndexedAt — the service must upgrade the health signal to 'stale'.
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', '2026-04-10T12:00:00Z');
    searchEngine.healthValue = 'ok';
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-09T00:00:00Z';

    const response = await service.status();
    expect(response.index_health).toBe('stale');
  });

  it('test_status_allFilesFresh_indexHealthRemainsOk', async () => {
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.healthValue = 'ok';
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';

    const response = await service.status();
    expect(response.index_health).toBe('ok');
  });

  it('test_status_lastLintAndLastIngest_fromStateStore', async () => {
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';
    stateStore.state = {
      imports: {},
      last_lint: '2026-04-08T00:00:00Z',
      last_ingest: '2026-04-09T00:00:00Z',
    };

    const response = await service.status();
    expect(response.last_lint).toBe('2026-04-08T00:00:00Z');
    expect(response.last_ingest).toBe('2026-04-09T00:00:00Z');
  });

  it('test_status_freshState_lastLintAndLastIngestAreNull', async () => {
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';

    const response = await service.status();
    expect(response.last_lint).toBeNull();
    expect(response.last_ingest).toBeNull();
  });

  it('test_status_unindexedFile_reportsStale', async () => {
    // A file exists but has never been indexed at all. The health signal
    // must upgrade to 'stale' so wiki_status surfaces the work to do.
    fileStore.files['wiki/new.md'] = makePage('wiki/new.md', 'New', '2026-04-10T00:00:00Z');
    searchEngine.healthValue = 'ok';
    // lastIndexedMap is empty → lastIndexedAt returns null.

    const response = await service.status();
    expect(response.index_health).toBe('stale');
  });
});
