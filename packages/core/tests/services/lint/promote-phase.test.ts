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
          confidence: 0.95,
          promotion_reason: 'Repeated across services and reusable for new projects.',
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

    expect(fileStore.files['projects/cli-relay/practices.md']).toContain(
      '[no-db-mocking](../../wiki/patterns/no-db-mocking.md)',
    );
    expect(fileStore.files['projects/other-app/practices.md']).toContain(
      '[no-db-mocking](../../wiki/patterns/no-db-mocking.md)',
    );
  });

  it('rejects promotion target outside wiki/patterns/', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## a\nb\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/tools/x.md',
          title: 'x',
          content: 'y',
          confidence: 0.95,
          promotion_reason: 'Reusable pattern.',
          sources: ['projects/x/practices.md'],
          replacement_marker: 'a',
        },
      ],
    };
    const phase = new PromotePhase(fileStore, llm);
    await expect(phase.run()).rejects.toThrow(/wiki\/patterns/);
  });

  it('ignores LLM-proposed sources outside the practice files allowlist', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## pattern-a\nDetail.\n';
    // The marker deliberately matches a heading in this file so the
    // test proves the allowlist blocks the rewrite, not just marker mismatch.
    fileStore.files['wiki/important-page.md'] = '## pattern-a\nSensitive content.\n';

    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/safe.md',
          title: 'Safe pattern',
          content: 'Extracted pattern.',
          confidence: 0.95,
          promotion_reason: 'Can be reused in multiple codebases.',
          sources: ['projects/x/practices.md', 'wiki/important-page.md'],
          replacement_marker: 'pattern-a',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm);
    const result = await phase.run();

    expect(result.promotedCount).toBe(1);
    expect(fileStore.files['wiki/important-page.md']).toBe('## pattern-a\nSensitive content.\n');
    expect(fileStore.files['projects/x/practices.md']).toContain('[pattern-a]');
  });

  it('propagates LLM failure as LlmUnavailableError', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## a\nb\n';
    llm.response = new Error('boom');
    const phase = new PromotePhase(fileStore, llm);
    await expect(phase.run()).rejects.toThrow();
  });

  it('routes below-threshold proposals to review instead of auto-promoting', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## pattern-a\nDetail.\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/pattern-a.md',
          title: 'Pattern A',
          content: 'Useful shared pattern.',
          confidence: 0.6,
          promotion_reason: 'Potentially reusable.',
          sources: ['projects/x/practices.md'],
          replacement_marker: 'pattern-a',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm, { autoPromoteConfidenceThreshold: 0.8 });
    const result = await phase.run();

    expect(result.promotedCount).toBe(0);
    expect(result.reviewCount).toBe(1);
    expect(fileStore.files['wiki/patterns/pattern-a.md']).toBeUndefined();
    expect(fileStore.files['projects/x/practices.md']).toContain('## pattern-a');
  });

  it('skips proposal safely when replacement marker does not match source', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## different-marker\nDetail.\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/pattern-a.md',
          title: 'Pattern A',
          content: 'Useful shared pattern.',
          confidence: 0.95,
          promotion_reason: 'Clearly reusable.',
          sources: ['projects/x/practices.md'],
          replacement_marker: 'pattern-a',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm);
    const result = await phase.run();

    expect(result.promotedCount).toBe(0);
    expect(fileStore.files['wiki/patterns/pattern-a.md']).toBeUndefined();
    expect(fileStore.files['projects/x/practices.md']).toContain('## different-marker');
    expect(result.skippedReasons?.some((reason) => reason.includes('replacement_marker mismatch'))).toBe(
      true,
    );
  });

  it('routes single-source proposals without rationale to review', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## pattern-a\nDetail.\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/pattern-a.md',
          title: 'Pattern A',
          content: 'Useful shared pattern.',
          confidence: 0.95,
          promotion_reason: '   ',
          sources: ['projects/x/practices.md'],
          replacement_marker: 'pattern-a',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm);
    const result = await phase.run();

    expect(result.promotedCount).toBe(0);
    expect(result.reviewCount).toBe(1);
    expect(result.skippedReasons?.some((reason) => reason.includes('insufficient sources/rationale'))).toBe(
      true,
    );
    expect(fileStore.files['wiki/patterns/pattern-a.md']).toBeUndefined();
  });

  it('routes one allowed + one disallowed source with blank rationale to review', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## pattern-a\nDetail.\n';
    fileStore.files['wiki/important-page.md'] = '## pattern-a\nSensitive content.\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/pattern-a.md',
          title: 'Pattern A',
          content: 'Useful shared pattern.',
          confidence: 0.95,
          promotion_reason: ' ',
          sources: ['projects/x/practices.md', 'wiki/important-page.md'],
          replacement_marker: 'pattern-a',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm);
    const result = await phase.run();

    expect(result.promotedCount).toBe(0);
    expect(result.reviewCount).toBe(1);
    expect(result.skippedReasons?.some((reason) => reason.includes('insufficient sources/rationale'))).toBe(
      true,
    );
    expect(fileStore.files['wiki/patterns/pattern-a.md']).toBeUndefined();
    expect(fileStore.files['projects/x/practices.md']).toContain('## pattern-a');
  });

  it('does not write promoted page when all sources are outside allowlist', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## pattern-a\nDetail.\n';
    fileStore.files['wiki/important-page.md'] = '## pattern-a\nSensitive content.\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/pattern-a.md',
          title: 'Pattern A',
          content: 'Useful shared pattern.',
          confidence: 0.95,
          promotion_reason: 'Reusable.',
          sources: ['wiki/important-page.md'],
          replacement_marker: 'pattern-a',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm);
    const result = await phase.run();

    expect(result.promotedCount).toBe(0);
    expect(result.reviewCount).toBe(1);
    expect(result.skippedReasons?.some((reason) => reason.includes('no valid project practice sources'))).toBe(
      true,
    );
    expect(fileStore.files['wiki/patterns/pattern-a.md']).toBeUndefined();
  });

  it('rejects non-string sources entries in model response', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## pattern-a\nDetail.\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/pattern-a.md',
          title: 'Pattern A',
          content: 'Useful shared pattern.',
          confidence: 0.95,
          promotion_reason: 'Reusable.',
          sources: ['projects/x/practices.md', 123],
          replacement_marker: 'pattern-a',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm);
    await expect(phase.run()).rejects.toThrow(/malformed promote entry/);
  });

  it('routes duplicate single-source evidence without rationale to review', async () => {
    fileStore.files['projects/x/practices.md'] = '---\ntitle: x\n---\n\n## pattern-a\nDetail.\n';
    llm.response = {
      promoted: [
        {
          target: 'wiki/patterns/pattern-a.md',
          title: 'Pattern A',
          content: 'Useful shared pattern.',
          confidence: 0.95,
          promotion_reason: ' ',
          sources: ['projects/x/practices.md', 'projects/x/practices.md'],
          replacement_marker: 'pattern-a',
        },
      ],
    };

    const phase = new PromotePhase(fileStore, llm);
    const result = await phase.run();

    expect(result.promotedCount).toBe(0);
    expect(result.reviewCount).toBe(1);
    expect(result.skippedReasons?.some((reason) => reason.includes('insufficient sources/rationale'))).toBe(
      true,
    );
    expect(fileStore.files['wiki/patterns/pattern-a.md']).toBeUndefined();
  });
});
