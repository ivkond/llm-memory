import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RepairIndexService } from '../../src/services/repair-index-service.js';
import type {
  IFileStore,
  FileInfo,
  ISearchEngine,
  IndexEntry,
  SearchQuery,
  IndexHealth,
} from '../../src/ports/index.js';
import type { WikiPageData } from '../../src/domain/wiki-page.js';
import type { SearchResult } from '../../src/domain/search-result.js';

class FakeFileStore implements IFileStore {
  public files: Record<string, WikiPageData> = {};
  public listedWiki: FileInfo[] = [];
  public listedProjects: FileInfo[] = [];

  async readFile(): Promise<string | null> {
    return null;
  }

  async writeFile(): Promise<void> {}

  async listFiles(directory: string): Promise<FileInfo[]> {
    if (directory === 'wiki') return this.listedWiki;
    if (directory === 'projects') return this.listedProjects;
    return [];
  }

  async exists(): Promise<boolean> {
    return false;
  }

  async readWikiPage(relativePath: string): Promise<WikiPageData | null> {
    return this.files[relativePath] ?? null;
  }
}

class FakeSearchEngine implements ISearchEngine {
  public rebuildSpy = vi.fn<(entries: IndexEntry[]) => Promise<void>>();

  async index(): Promise<void> {}
  async remove(): Promise<void> {}
  async search(_query: SearchQuery): Promise<SearchResult[]> {
    return [];
  }
  async rebuild(entries: IndexEntry[]): Promise<void> {
    await this.rebuildSpy(entries);
  }
  async health(): Promise<IndexHealth> {
    return 'ok';
  }
  async lastIndexedAt(): Promise<string | null> {
    return null;
  }
  async lastIndexedAtMany(_paths: string[]): Promise<Record<string, string | null>> {
    return {};
  }
}

function page(title: string, updated: string): WikiPageData {
  return {
    frontmatter: {
      title,
      created: updated,
      updated,
      confidence: 0.9,
      sources: [],
      supersedes: null,
      tags: [],
    },
    content: `${title} body`,
  };
}

describe('RepairIndexService', () => {
  let fileStore: FakeFileStore;
  let searchEngine: FakeSearchEngine;
  let service: RepairIndexService;

  beforeEach(() => {
    fileStore = new FakeFileStore();
    searchEngine = new FakeSearchEngine();
    service = new RepairIndexService(fileStore, searchEngine);
  });

  it('filters to canonical markdown candidates and excludes operational paths', async () => {
    fileStore.listedWiki = [
      { path: 'wiki/a.md', updated: '2026-05-01T00:00:00Z' },
      { path: 'wiki/.local/skip.md', updated: '2026-05-01T00:00:00Z' },
      { path: 'wiki/log/skip.md', updated: '2026-05-01T00:00:00Z' },
    ];
    fileStore.listedProjects = [
      { path: 'projects/app/b.md', updated: '2026-05-01T00:00:00Z' },
      { path: 'projects/.worktrees/tmp.md', updated: '2026-05-01T00:00:00Z' },
      { path: 'projects/app/note.txt', updated: '2026-05-01T00:00:00Z' },
    ];
    fileStore.files['wiki/a.md'] = page('A', '2026-05-01T00:00:00Z');
    fileStore.files['projects/app/b.md'] = page('B', '2026-05-01T00:00:00Z');

    const result = await service.repair();

    expect(result.paths.sort()).toEqual(['projects/app/b.md', 'wiki/a.md']);
    expect(result.candidates).toBe(2);
    expect(result.indexed).toBe(2);
    expect(result.status).toBe('rebuilt');
    expect(searchEngine.rebuildSpy).toHaveBeenCalledTimes(1);
  });

  it('dry-run reports planned work without mutating index', async () => {
    fileStore.listedWiki = [{ path: 'wiki/a.md', updated: '2026-05-01T00:00:00Z' }];
    fileStore.files['wiki/a.md'] = page('A', '2026-05-01T00:00:00Z');

    const result = await service.repair({ dryRun: true });

    expect(result.status).toBe('planned');
    expect(result.dry_run).toBe(true);
    expect(result.candidates).toBe(1);
    expect(result.indexed).toBe(0);
    expect(searchEngine.rebuildSpy).not.toHaveBeenCalled();
  });
});
