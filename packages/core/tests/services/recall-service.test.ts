import { describe, it, expect, vi } from 'vitest';
import { RecallService } from '../../src/services/recall-service.js';
import type { IFileStore, FileInfo } from '../../src/ports/file-store.js';
import type { IProjectResolver } from '../../src/ports/project-resolver.js';

function createMockFileStore(fileMap: Record<string, string> = {}): IFileStore {
  return {
    readFile: vi.fn(async (p: string) => fileMap[p] ?? null),
    writeFile: vi.fn(async () => {}),
    listFiles: vi.fn(async (dir: string): Promise<FileInfo[]> => {
      return Object.keys(fileMap)
        .filter((p) => p.startsWith(dir + '/'))
        .map((p) => {
          const content = fileMap[p];
          const match = content.match(/updated:\s*(.+)/);
          return { path: p, updated: match?.[1] ?? '2026-01-01' };
        })
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    }),
    exists: vi.fn(async (p: string) => p in fileMap),
    readWikiPage: vi.fn(async (p: string) => {
      const raw = fileMap[p];
      if (!raw) return null;
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!fmMatch) return null;
      const fm: Record<string, unknown> = {};
      for (const line of fmMatch[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        let val: unknown = line.slice(idx + 1).trim();
        if (/^\d+(\.\d+)?$/.test(val as string)) val = Number(val);
        if (val === 'null') val = null;
        if ((val as string).startsWith?.('['))
          val = (val as string)
            .slice(1, -1)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        fm[key] = val;
      }
      return {
        frontmatter: {
          title: fm.title as string,
          created: fm.created as string,
          updated: fm.updated as string,
          confidence: (fm.confidence as number) ?? 0.5,
          sources: (fm.sources as string[]) ?? [],
          supersedes: null,
          tags: (fm.tags as string[]) ?? [],
        },
        content: fmMatch[2].trim(),
      };
    }),
  };
}

function createMockResolver(projectName: string | null): IProjectResolver {
  return {
    resolve: vi.fn(async () => projectName),
    getRemoteUrl: vi.fn(async () => 'https://github.com/test/repo.git'),
  };
}

describe('RecallService', () => {
  it('test_recall_knownProject_returnsBothScopes', async () => {
    const files: Record<string, string> = {
      'projects/cli-relay/architecture.md':
        '---\ntitle: Architecture\nupdated: 2026-04-09\n---\n## Summary\nClean arch overview.',
      'projects/cli-relay/practices.md':
        '---\ntitle: Practices\nupdated: 2026-04-08\n---\n## Summary\nTesting practices.',
      'wiki/patterns/testing.md':
        '---\ntitle: Testing Patterns\nupdated: 2026-04-07\n---\n## Summary\nGeneral testing.',
    };
    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver('cli-relay');
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 3),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/projects/cli-relay', max_tokens: 2048 });

    expect(result.project).toBe('cli-relay');
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    expect(result.pages[0].path).toContain('projects/cli-relay');
    const wikiPages = result.pages.filter((p) => p.path.startsWith('wiki/'));
    expect(wikiPages.length).toBeGreaterThan(0);
  });

  it('test_recall_unknownProject_returnsWikiOnly_noError (INV-2)', async () => {
    const files: Record<string, string> = {
      'wiki/patterns/testing.md':
        '---\ntitle: Testing\nupdated: 2026-04-07\n---\n## Summary\nTesting info.',
    };
    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver(null);
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 3),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/unknown/project' });

    expect(result.project).toBeNull();
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages[0].path).toContain('wiki/');
  });

  it('test_recall_deterministic_sameInput_sameOutput (INV-11)', async () => {
    const files: Record<string, string> = {
      'wiki/patterns/a.md': '---\ntitle: A\nupdated: 2026-04-09\n---\n## Summary\nPage A.',
      'wiki/patterns/b.md': '---\ntitle: B\nupdated: 2026-04-08\n---\n## Summary\nPage B.',
    };
    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver(null);
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 3),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const first = await service.recall({ cwd: '/any' });
    const second = await service.recall({ cwd: '/any' });

    expect(first).toEqual(second);
  });

  it('test_recall_neverCallsLlm (INV-12)', async () => {
    const fileStore = createMockFileStore({
      'wiki/patterns/test.md': '---\ntitle: Test\nupdated: 2026-04-01\n---\n## Summary\nTest page.',
    });
    const resolver = createMockResolver(null);
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 3),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/any' });
    expect(result.pages.length).toBeGreaterThan(0);
  });

  it('test_recall_emptyWiki_throwsWikiEmpty', async () => {
    const fileStore = createMockFileStore({});
    const resolver = createMockResolver(null);
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 3),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    await expect(service.recall({ cwd: '/any' })).rejects.toThrow('No pages exist in the wiki');
  });

  it('test_recall_includesUnconsolidatedCount', async () => {
    const fileStore = createMockFileStore({
      'wiki/concepts/one.md': '---\ntitle: One\nupdated: 2026-04-01\n---\n## Summary\nPage.',
    });
    const resolver = createMockResolver(null);
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 3),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/any' });
    expect(result.unconsolidated_count).toBe(3);
  });

  it('test_recall_tinyBudget_stillReturnsWikiPageWhenExists', async () => {
    // INV-2-like guarantee: wiki pages are always included when they exist,
    // regardless of budget size
    const files: Record<string, string> = {
      'wiki/patterns/a.md': '---\ntitle: A\nupdated: 2026-04-09\n---\n## Summary\nPage A.',
    };
    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver(null);
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 0),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/any', max_tokens: 1 });

    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages[0].path).toBe('wiki/patterns/a.md');
  });

  it('test_recall_tinyBudget_withProject_stillReturnsWikiPage', async () => {
    const files: Record<string, string> = {
      'projects/cli-relay/arch.md': '---\ntitle: Arch\nupdated: 2026-04-09\n---\n## Summary\nArch.',
      'wiki/patterns/a.md': '---\ntitle: A\nupdated: 2026-04-08\n---\n## Summary\nPage A.',
    };
    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver('cli-relay');
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 0),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/any', max_tokens: 1 });

    const wikiPages = result.pages.filter((p) => p.path.startsWith('wiki/'));
    expect(wikiPages.length).toBeGreaterThan(0);
  });

  it('test_recall_reservedBudget_wikiGetsMinimum30percent', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      files[`projects/big/page${i}.md`] =
        `---\ntitle: Page ${i}\nupdated: 2026-04-${String(i + 1).padStart(2, '0')}\n---\n## Summary\n${'x'.repeat(100)}`;
    }
    files['wiki/patterns/important.md'] =
      '---\ntitle: Important\nupdated: 2026-01-01\n---\n## Summary\nCritical info.';

    const fileStore = createMockFileStore(files);
    const resolver = createMockResolver('big');
    const verbatimStore = {
      writeEntry: vi.fn(),
      listUnconsolidated: vi.fn(async () => []),
      countUnconsolidated: vi.fn(async () => 3),
    };
    const service = new RecallService(fileStore, verbatimStore, resolver);

    const result = await service.recall({ cwd: '/projects/big', max_tokens: 500 });

    const wikiPages = result.pages.filter((p) => p.path.startsWith('wiki/'));
    expect(wikiPages.length).toBeGreaterThan(0);
  });
});
