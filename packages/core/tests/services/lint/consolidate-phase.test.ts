import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConsolidatePhase,
  CONSOLIDATE_BATCH_LIMIT,
} from '../../../src/services/lint/consolidate-phase.js';
import { VerbatimEntry } from '../../../src/domain/verbatim-entry.js';
import type {
  IFileStore,
  IVerbatimStore,
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
  async listAgents(): Promise<string[]> {
    const set = new Set<string>();
    for (const e of this.entries.values()) set.add(e.agent);
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  async readEntry(p: string): Promise<VerbatimEntry | null> {
    return this.entries.get(p) ?? null;
  }
  async markConsolidated(p: string): Promise<void> {
    this.marked.push(p);
    const e = this.entries.get(p);
    if (!e) throw new Error('not found');
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
    const req = llm.completeSpy.mock.calls[0][0];
    expect(req.messages[0].content).toContain('entry_id');
    expect(req.messages[0].content).toContain('source');
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
    expect(result.consolidatedCount).toBe(CONSOLIDATE_BATCH_LIMIT);
  });

  it('propagates LlmUnavailableError on LLM failure and marks nothing', async () => {
    await seed(2);
    llm.response = new Error('DOWN');
    const phase = new ConsolidatePhase(fileStore, verbatimStore, llm);
    await expect(phase.run()).rejects.toThrow();
    expect(verbatimStore.marked).toHaveLength(0);
  });

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
      expect(entry.logicalPath.startsWith('log/')).toBe(true);
    }
  });

  it('omits archivedEntries when no mainRepoRoot is provided', async () => {
    await seed(1);
    llm.response = { pages: [] };
    const phase = new ConsolidatePhase(fileStore, verbatimStore, llm);
    const result = await phase.run();
    expect(result.archivedEntries).toBeUndefined();
  });
});
