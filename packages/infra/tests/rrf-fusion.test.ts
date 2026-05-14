import { describe, expect, it } from 'vitest';
import { fuseSearchResults } from '../src/search/rrf-fusion.js';

describe('fuseSearchResults', () => {
  it('merges dense and sparse hits with normalized scores and sources', () => {
    const results = fuseSearchResults({
      denseRaw: [
        { metadata: { path: 'wiki/a.md', title: 'A', content: 'alpha' } },
        { metadata: { path: 'wiki/b.md', title: 'B', content: 'beta' } },
      ],
      sparseRaw: [
        { id: 'wiki/a.md', path: 'wiki/a.md', title: 'A', content: 'alpha' },
        { id: 'wiki/c.md', path: 'wiki/c.md', title: 'C', content: 'gamma' },
      ],
      maxResults: 10,
    });

    expect(results.map((r) => r.path)).toEqual(['wiki/a.md', 'wiki/b.md', 'wiki/c.md']);
    expect(results[0].source).toBe('hybrid');
    expect(results[1].source).toBe('vector');
    expect(results[2].source).toBe('bm25');
    expect(results[0].score).toBe(1);
    expect(results[1].score).toBeLessThan(1);
  });

  it('applies scope filtering before ranking counts', () => {
    const results = fuseSearchResults({
      denseRaw: [
        { metadata: { path: 'projects/x.md', title: 'X', content: 'x' } },
        { metadata: { path: 'wiki/a.md', title: 'A', content: 'a' } },
      ],
      sparseRaw: [
        { id: 'projects/y.md', path: 'projects/y.md', title: 'Y', content: 'y' },
        { id: 'wiki/b.md', path: 'wiki/b.md', title: 'B', content: 'b' },
      ],
      maxResults: 10,
      scope: 'wiki/',
    });

    expect(results.map((r) => r.path)).toEqual(['wiki/a.md', 'wiki/b.md']);
  });
});
