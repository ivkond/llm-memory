export type SearchSource = 'bm25' | 'vector' | 'hybrid';

export class SearchResult {
  constructor(
    public readonly path: string,
    public readonly title: string,
    public readonly excerpt: string,
    public readonly score: number,
    public readonly source: SearchSource,
  ) {}

  get isHighConfidence(): boolean {
    return this.score >= 0.8;
  }

  static sortByScore(results: SearchResult[]): SearchResult[] {
    return [...results].sort((a, b) => b.score - a.score);
  }
}
