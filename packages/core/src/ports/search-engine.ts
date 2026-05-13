import type { SearchResult } from '../domain/search-result.js';

export interface SearchQuery {
  text: string;
  scope?: string;
  maxResults?: number;
}

export interface IndexEntry {
  path: string;
  title: string;
  content: string;
  updated: string;
}

export type IndexHealth = 'ok' | 'stale' | 'missing';

export interface ISearchEngine {
  /** Index or re-index a document. */
  index(entry: IndexEntry): Promise<void>;

  /** Remove a document from the index. */
  remove(path: string): Promise<void>;

  /** Hybrid search: BM25 + vector similarity via RRF. */
  search(query: SearchQuery): Promise<SearchResult[]>;

  /** Rebuild entire index from scratch. */
  rebuild(entries: IndexEntry[]): Promise<void>;

  /** Check if index exists and is healthy. */
  health(): Promise<IndexHealth>;

  /** Get last indexed timestamp for a file. Returns null if not indexed. */
  lastIndexedAt(path: string): Promise<string | null>;

  /** Bulk variant of `lastIndexedAt` for query-time staleness checks. */
  lastIndexedAtMany(paths: string[]): Promise<Record<string, string | null>>;
}
