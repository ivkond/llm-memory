import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MockEmbeddingModelV2 } from 'ai/test';
import { RuVectorSearchEngine, AiSdkEmbeddingClient } from '../../src/index.js';

/**
 * INV-6: `search.db` can be deleted and rebuilt from markdown files with
 * identical results. We drive the real RuVectorSearchEngine twice — once
 * to seed, once to rebuild from a fresh directory — and compare the
 * ordered path list of a known query.
 */
describe('search.db rebuild (INV-6)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-rebuild-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // Deterministic offline embedder — same text in, same vector out.
  const dims = 16;
  const embed = (text: string): number[] => {
    const v = new Array(dims).fill(0);
    const lower = text.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const c = lower.charCodeAt(i);
      v[c % dims] += 1;
      v[(c * 31 + 7) % dims] += 0.5;
    }
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    return v.map((x) => x / n);
  };

  function engine(dbPath: string): RuVectorSearchEngine {
    const embeddings = new AiSdkEmbeddingClient(
      new MockEmbeddingModelV2<string>({
        maxEmbeddingsPerCall: 100,
        supportsParallelCalls: true,
        doEmbed: async ({ values }) => ({
          embeddings: values.map((v: string) => embed(v)),
          usage: { tokens: values.length },
        }),
      }),
      dims,
    );
    return new RuVectorSearchEngine(dbPath, embeddings);
  }

  it('test_deleteAndRebuild_returnsIdenticalResults', async () => {
    const entries = [
      { path: 'wiki/a.md', title: 'A', content: 'apple banana', updated: '2026-04-09' },
      { path: 'wiki/b.md', title: 'B', content: 'apple cherry', updated: '2026-04-09' },
      { path: 'wiki/c.md', title: 'C', content: 'durian elderberry', updated: '2026-04-09' },
    ];

    const first = engine(path.join(dir, 'first.db'));
    for (const e of entries) await first.index(e);
    const before = await first.search({ text: 'apple' });
    expect(before.length).toBeGreaterThan(0);

    // Fresh engine, different storage directory — rebuild from scratch.
    const second = engine(path.join(dir, 'second.db'));
    await second.rebuild(entries);
    const after = await second.search({ text: 'apple' });

    // Ordered path list is the INV-6 guarantee: identical retrieval from
    // the same source of truth.
    expect(after.map((r) => r.path)).toEqual(before.map((r) => r.path));
  });
});
