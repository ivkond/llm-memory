export type SearchSource = 'bm25' | 'vector' | 'hybrid';
export type FreshnessStatus = 'fresh' | 'low_confidence' | 'superseded';

export interface SearchResultMetadata {
  updated?: string;
  confidence?: number;
  supersedes?: string | null;
  freshness_status?: FreshnessStatus;
  freshness_reasons?: string[];
  superseded_by?: string;
}

export class SearchResult {
  constructor(
    public readonly path: string,
    public readonly title: string,
    public readonly excerpt: string,
    public readonly score: number,
    public readonly source: SearchSource,
    public readonly metadata: SearchResultMetadata = {},
  ) {}

  get isHighConfidence(): boolean {
    return this.score >= 0.8;
  }

  static sortByScore(results: SearchResult[]): SearchResult[] {
    return [...results].sort((a, b) => b.score - a.score);
  }
}
