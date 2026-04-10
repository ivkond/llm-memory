import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IEmbeddingClient, IndexEntry } from '@llm-wiki/core';
import { RuVectorSearchEngine } from '../src/ruvector-search-engine.js';

/**
 * Deterministic offline embedding fake.
 *
 * Produces a repeatable, content-dependent unit vector of a fixed length so
 * RuVector's HNSW index can do non-trivial nearest-neighbour work without any
 * network / model. Simply hashes each character into dimension buckets and
 * L2-normalizes the result.
 */
class FakeEmbeddingClient implements IEmbeddingClient {
  public embedSpy = vi.fn();
  constructor(private readonly dims: number = 16) {}

  async embed(texts: string[]): Promise<number[][]> {
    this.embedSpy(texts);
    return texts.map((text) => this.encode(text));
  }

  dimensions(): number {
    return this.dims;
  }

  private encode(text: string): number[] {
    const vec = new Array(this.dims).fill(0);
    const lower = text.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const c = lower.charCodeAt(i);
      // Hash each character into two buckets so different words don't all
      // collide into the same slot
      vec[c % this.dims] += 1;
      vec[(c * 31 + 7) % this.dims] += 0.5;
    }
    // L2 normalize for stable cosine similarity
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return vec.map((v) => v / norm);
  }
}

describe('RuVectorSearchEngine', () => {
  let dir: string;
  let dbPath: string;
  let embeddings: FakeEmbeddingClient;
  let engine: RuVectorSearchEngine;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ruvec-search-'));
    dbPath = path.join(dir, 'search.db');
    embeddings = new FakeEmbeddingClient(16);
    engine = new RuVectorSearchEngine(dbPath, embeddings);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('test_index_then_search_findsDocument', async () => {
    await engine.index({
      path: 'wiki/patterns/testing.md',
      title: 'Testing Patterns',
      content: 'Use testcontainers for integration tests.',
      updated: '2026-04-09',
    });

    const results = await engine.search({ text: 'testcontainers' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('wiki/patterns/testing.md');
    expect(results[0].title).toBe('Testing Patterns');
    expect(results[0].excerpt).toContain('testcontainers');
  });

  it('test_search_noMatches_returnsEmptyArray', async () => {
    const results = await engine.search({ text: 'nothing' });
    expect(results).toEqual([]);
  });

  it('test_remove_then_search_missing', async () => {
    await engine.index({
      path: 'wiki/a.md',
      title: 'A',
      content: 'alpha beta gamma',
      updated: '2026-04-09',
    });
    let results = await engine.search({ text: 'alpha' });
    expect(results.map((r) => r.path)).toContain('wiki/a.md');

    await engine.remove('wiki/a.md');
    results = await engine.search({ text: 'alpha' });
    expect(results.map((r) => r.path)).not.toContain('wiki/a.md');
    expect(await engine.lastIndexedAt('wiki/a.md')).toBeNull();
  });

  it('test_rebuild_fromEntries_recreatesIndex', async () => {
    const entries: IndexEntry[] = [
      { path: 'wiki/a.md', title: 'A', content: 'apple banana', updated: '2026-04-09' },
      { path: 'wiki/b.md', title: 'B', content: 'cherry durian', updated: '2026-04-09' },
    ];
    await engine.rebuild(entries);

    const apple = await engine.search({ text: 'apple' });
    expect(apple.map((r) => r.path)).toContain('wiki/a.md');

    const cherry = await engine.search({ text: 'cherry' });
    expect(cherry.map((r) => r.path)).toContain('wiki/b.md');
  });

  it('test_health_returnsMissingBeforeIndex_okAfter', async () => {
    expect(await engine.health()).toBe('missing');
    await engine.index({
      path: 'wiki/a.md',
      title: 'A',
      content: 'hello',
      updated: '2026-04-09',
    });
    expect(await engine.health()).toBe('ok');
  });

  it('test_lastIndexedAt_returnsTimestamp', async () => {
    expect(await engine.lastIndexedAt('wiki/a.md')).toBeNull();
    await engine.index({
      path: 'wiki/a.md',
      title: 'A',
      content: 'hello',
      updated: '2026-04-09',
    });
    const ts = await engine.lastIndexedAt('wiki/a.md');
    expect(ts).not.toBeNull();
    // ISO-8601 round-trip
    expect(new Date(ts!).toISOString()).toBe(ts);
  });

  it('test_hybrid_ranksMoreRelevantFirst', async () => {
    // Entry A has exact keyword match, entry B is semantically close but lacks
    // the keyword. With hybrid BM25 + vector, A should beat B on a keyword query.
    await engine.index({
      path: 'wiki/exact.md',
      title: 'Keyword match',
      content: 'The exact keyword testcontainers appears here.',
      updated: '2026-04-09',
    });
    await engine.index({
      path: 'wiki/related.md',
      title: 'Related topic',
      content: 'Integration testing with Docker.',
      updated: '2026-04-09',
    });

    const results = await engine.search({ text: 'testcontainers' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('wiki/exact.md');
  });

  it('test_scope_filtersByPrefix', async () => {
    await engine.index({
      path: 'wiki/patterns/testing.md',
      title: 'Wiki testing',
      content: 'general testing advice',
      updated: '2026-04-09',
    });
    await engine.index({
      path: 'projects/foo/testing.md',
      title: 'Project testing',
      content: 'project-specific testing',
      updated: '2026-04-09',
    });

    const wikiOnly = await engine.search({ text: 'testing', scope: 'wiki/' });
    expect(wikiOnly.length).toBeGreaterThan(0);
    for (const r of wikiOnly) {
      expect(r.path.startsWith('wiki/')).toBe(true);
    }

    const projectOnly = await engine.search({ text: 'testing', scope: 'projects/foo/' });
    expect(projectOnly.length).toBeGreaterThan(0);
    for (const r of projectOnly) {
      expect(r.path.startsWith('projects/foo/')).toBe(true);
    }
  });

  it('test_index_callsEmbeddingClient_once', async () => {
    await engine.index({
      path: 'wiki/a.md',
      title: 'A',
      content: 'hello world',
      updated: '2026-04-09',
    });
    expect(embeddings.embedSpy).toHaveBeenCalledTimes(1);
    const [texts] = embeddings.embedSpy.mock.calls[0] as [string[]];
    expect(texts.length).toBe(1);
  });

  it('test_search_callsEmbeddingClient_once_perQuery', async () => {
    await engine.index({
      path: 'wiki/a.md',
      title: 'A',
      content: 'hello world',
      updated: '2026-04-09',
    });
    embeddings.embedSpy.mockClear();
    await engine.search({ text: 'hello' });
    expect(embeddings.embedSpy).toHaveBeenCalledTimes(1);
    const [texts] = embeddings.embedSpy.mock.calls[0] as [string[]];
    expect(texts).toEqual(['hello']);
  });

  it('test_reindex_sameDoc_overwritesWithoutDuplicate', async () => {
    await engine.index({
      path: 'wiki/a.md',
      title: 'Old title',
      content: 'old content',
      updated: '2026-04-09',
    });
    await engine.index({
      path: 'wiki/a.md',
      title: 'New title',
      content: 'new content with different words',
      updated: '2026-04-10',
    });

    const results = await engine.search({ text: 'new' });
    const matchingPaths = results.filter((r) => r.path === 'wiki/a.md');
    expect(matchingPaths.length).toBe(1);
    expect(matchingPaths[0].title).toBe('New title');
  });
});
