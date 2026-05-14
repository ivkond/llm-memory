import { describe, it, expect } from 'vitest';
import { SearchResult } from '../../src/domain/search-result.js';

describe('SearchResult', () => {
  it('test_create_validData_constructsAllFields', () => {
    const result = new SearchResult(
      'wiki/patterns/testing.md',
      'Testing Patterns',
      'Use testcontainers for integration tests.',
      0.85,
      'hybrid',
    );

    expect(result.path).toBe('wiki/patterns/testing.md');
    expect(result.title).toBe('Testing Patterns');
    expect(result.excerpt).toBe('Use testcontainers for integration tests.');
    expect(result.score).toBe(0.85);
    expect(result.source).toBe('hybrid');
  });

  it.each([
    { score: 0.9, expected: true, name: 'above 0.8' },
    { score: 0.8, expected: true, name: 'exactly 0.8' },
    { score: 0.5, expected: false, name: 'below 0.8' },
  ])('test_isHighConfidence_$name_returns$expected', ({ score, expected }) => {
    const result = new SearchResult('p', 't', 'e', score, 'hybrid');
    expect(result.isHighConfidence).toBe(expected);
  });

  it('test_sortByScoreDesc_correctOrder', () => {
    const results = [
      new SearchResult('a', 'A', 'a', 0.5, 'bm25'),
      new SearchResult('b', 'B', 'b', 0.9, 'vector'),
      new SearchResult('c', 'C', 'c', 0.7, 'hybrid'),
    ];
    const sorted = SearchResult.sortByScore(results);
    expect(sorted[0].path).toBe('b');
    expect(sorted[1].path).toBe('c');
    expect(sorted[2].path).toBe('a');
  });

  it('test_sortByScoreDesc_doesNotMutateInput', () => {
    const results = [
      new SearchResult('a', 'A', 'a', 0.5, 'bm25'),
      new SearchResult('b', 'B', 'b', 0.9, 'vector'),
    ];
    SearchResult.sortByScore(results);
    expect(results[0].path).toBe('a');
    expect(results[1].path).toBe('b');
  });
});
