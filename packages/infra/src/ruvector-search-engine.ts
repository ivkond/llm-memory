import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
// `ruvector` exposes VectorDb as the wrapper class with metadata support.
// It does not ship declaration files that re-export the class in a way
// TypeScript under NodeNext accepts cleanly; we cast to a minimal structural
// type inside this file to avoid leaking `any` through the rest of the infra.
import { VectorDb as RuVectorDb } from 'ruvector';
import { SearchResult } from '@ivkond-llm-wiki/core';
import type { IEmbeddingClient, ISearchEngine, IndexEntry, IndexHealth, SearchQuery } from '@ivkond-llm-wiki/core';
import { Bm25IndexStore } from './search/bm25-index-store.js';
import { fuseSearchResults } from './search/rrf-fusion.js';
import { excerptFirstParagraph } from './search/search-excerpter.js';

/** Minimal structural type for the ruvector VectorDBWrapper we rely on. */
interface VectorDbLike {
  insert(entry: {
    id?: string;
    vector: Float32Array | number[];
    metadata?: Record<string, unknown>;
  }): Promise<string>;
  search(query: {
    vector: Float32Array | number[];
    k: number;
    filter?: Record<string, unknown>;
  }): Promise<
    Array<{
      id: string;
      score: number;
      vector?: Float32Array;
      metadata?: Record<string, unknown>;
    }>
  >;
  delete(id: string): Promise<boolean>;
  get(id: string): Promise<{ id?: string; metadata?: Record<string, unknown> } | null>;
  len(): Promise<number>;
}

const VECTORS_FILE = 'vectors.db';

/**
 * Hybrid search engine backed by:
 *   - ruvector    → dense HNSW vector index (native Rust bindings)
 *   - minisearch  → in-process BM25 / sparse index
 *
 * Both halves are persisted inside the directory passed to the constructor
 * (`<dbPath>/vectors.db` and `<dbPath>/bm25.json`). Fusion is Reciprocal Rank
 * Fusion (RRF) via infra-local helper modules.
 */
export class RuVectorSearchEngine implements ISearchEngine {
  private vectorDb: VectorDbLike | null = null;
  private bm25Store: Bm25IndexStore | null = null;
  private initialized = false;
  /**
   * Cached init promise. The first caller assigns this; every concurrent
   * caller awaits the same promise, so `doInit()` runs exactly once even
   * under heavy concurrency.
   */
  private initPromise: Promise<void> | null = null;
  /**
   * Write mutex — each mutating op schedules itself after the previous
   * mutation's completion.
   */
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly dbPath: string,
    private readonly embeddingClient: IEmbeddingClient,
  ) {}

  private vectorsFilePath(): string {
    return path.join(this.dbPath, VECTORS_FILE);
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise === null) {
      this.initPromise = this.doInit();
    }
    await this.initPromise;
  }

  private async doInit(): Promise<void> {
    await mkdir(this.dbPath, { recursive: true });

    // Dense side — ruvector uses a single file at storagePath
    this.vectorDb = new (RuVectorDb as unknown as new (opts: {
      dimensions: number;
      storagePath?: string;
    }) => VectorDbLike)({
      dimensions: this.embeddingClient.dimensions(),
      storagePath: this.vectorsFilePath(),
    });

    this.bm25Store = await Bm25IndexStore.load(this.dbPath);
    this.initialized = true;
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(() => fn());
    this.writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async index(entry: IndexEntry): Promise<void> {
    await this.init();
    return this.runExclusive(() => this.indexUnsafe(entry));
  }

  /** Assumes the caller holds the write mutex. */
  private async indexUnsafe(entry: IndexEntry): Promise<void> {
    const [vector] = await this.embeddingClient.embed([`${entry.title}\n${entry.content}`]);

    try {
      await this.vectorDb!.delete(entry.path);
    } catch {
      /* no existing entry */
    }
    if (this.bm25Store!.has(entry.path)) {
      this.bm25Store!.discard(entry.path);
    }

    await this.vectorDb!.insert({
      id: entry.path,
      vector,
      metadata: {
        path: entry.path,
        title: entry.title,
        content: entry.content,
        updated: entry.updated,
      },
    });

    this.bm25Store!.add({
      id: entry.path,
      path: entry.path,
      title: entry.title,
      content: entry.content,
      updated: entry.updated,
    });

    this.bm25Store!.markIndexed(entry.path);
    await this.bm25Store!.persist();
  }

  async remove(docPath: string): Promise<void> {
    await this.init();
    return this.runExclusive(() => this.removeUnsafe(docPath));
  }

  /** Assumes the caller holds the write mutex. */
  private async removeUnsafe(docPath: string): Promise<void> {
    try {
      await this.vectorDb!.delete(docPath);
    } catch {
      /* no existing entry */
    }
    if (this.bm25Store!.has(docPath)) {
      this.bm25Store!.discard(docPath);
    }
    this.bm25Store!.deleteIndexed(docPath);
    await this.bm25Store!.persist();
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    await this.init();
    const maxResults = query.maxResults ?? 10;

    if (this.bm25Store!.documentCount() === 0) return [];

    const fetchK = Math.max(maxResults * 3, 10);
    const [qVector] = await this.embeddingClient.embed([query.text]);

    const denseRaw = await this.vectorDb!.search({
      vector: qVector,
      k: Math.min(fetchK, this.bm25Store!.documentCount()),
    });

    const sparseRaw = this.bm25Store!.search(query.text);
    const fused = fuseSearchResults({
      denseRaw,
      sparseRaw,
      maxResults,
      scope: query.scope,
    });

    return fused.map(
      (entry) =>
        new SearchResult(
          entry.path,
          entry.title,
          excerptFirstParagraph(entry.content),
          entry.score,
          entry.source,
        ),
    );
  }

  async rebuild(entries: IndexEntry[]): Promise<void> {
    await this.init();
    return this.runExclusive(async () => {
      for (const id of this.bm25Store!.indexedPaths()) {
        try {
          await this.vectorDb!.delete(id);
        } catch {
          /* ignore */
        }
      }
      this.bm25Store!.removeAll();
      this.bm25Store!.resetIndexedAt();
      for (const entry of entries) {
        await this.indexUnsafe(entry);
      }
    });
  }

  async health(): Promise<IndexHealth> {
    try {
      await access(this.bm25Store ? this.bm25Store.filePath() : path.join(this.dbPath, 'bm25.json'));
      return 'ok';
    } catch {
      return 'missing';
    }
  }

  async lastIndexedAt(docPath: string): Promise<string | null> {
    await this.init();
    return this.bm25Store!.lastIndexedAt(docPath);
  }

  async lastIndexedAtMany(paths: string[]): Promise<Record<string, string | null>> {
    await this.init();
    return this.bm25Store!.lastIndexedAtMany(paths);
  }
}
