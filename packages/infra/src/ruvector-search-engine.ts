import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
// `ruvector` exposes VectorDb as the wrapper class with metadata support.
// It does not ship declaration files that re-export the class in a way
// TypeScript under NodeNext accepts cleanly; we cast to a minimal structural
// type inside this file to avoid leaking `any` through the rest of the infra.
import { VectorDb as RuVectorDb } from 'ruvector';
import MiniSearch from 'minisearch';
import { SearchResult } from '@ivkond-llm-wiki/core';
import type {
  IEmbeddingClient,
  ISearchEngine,
  IndexEntry,
  IndexHealth,
  SearchQuery,
  SearchSource,
} from '@ivkond-llm-wiki/core';

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

interface DocFields {
  id: string;
  path: string;
  title: string;
  content: string;
  updated: string;
}

interface Bm25FileV1 {
  version: 1;
  index: unknown;
  lastIndexedAt: Record<string, string>;
}

const BM25_FILE = 'bm25.json';
const VECTORS_FILE = 'vectors.db';
const RRF_K = 60;

/**
 * Hybrid search engine backed by:
 *   - ruvector    → dense HNSW vector index (native Rust bindings)
 *   - minisearch  → in-process BM25 / sparse index
 *
 * Both halves are persisted inside the directory passed to the constructor
 * (`<dbPath>/vectors.db` and `<dbPath>/bm25.json`). Fusion is Reciprocal Rank
 * Fusion (RRF) performed inside this class — neither backing library fuses on
 * its own.
 *
 * The adapter is lazily initialised on first use so that construction is
 * cheap and tests can introspect `health()` before any index() call.
 *
 * Concurrency model:
 *
 *   - `init()` caches its in-flight promise so concurrent first-callers all
 *     await the same one-shot initialisation and the ruvector DB is opened
 *     exactly once.
 *   - All mutating operations (`index`, `remove`, `rebuild`) run through a
 *     chained-promise mutex (`runExclusive`) so read-modify-write of both
 *     the in-memory MiniSearch index and its `bm25.json` sidecar is atomic
 *     relative to other mutators. No "last writer wins" race or torn JSON.
 *   - `persist()` writes to `<bm25>.tmp` and `rename()`s on success —
 *     the `bm25.json` file on disk is never observed in a half-written
 *     state, even if the process dies mid-serialise.
 *   - Reads (`search`, `lastIndexedAt`) still only await `init()`. They
 *     consume the in-memory snapshots directly, so a concurrent mutator
 *     either hasn't reached its in-memory update yet (read sees old state)
 *     or has finished (read sees new state) — never an interleaved mix.
 *
 * Cross-process coordination is out of scope for this adapter. The
 * intended deployment is a single-writer wiki root (CLI or MCP server,
 * not both concurrently) and that assumption is enforced by callers.
 */
export class RuVectorSearchEngine implements ISearchEngine {
  private vectorDb: VectorDbLike | null = null;
  private bm25: MiniSearch<DocFields> | null = null;
  private indexedAt: Record<string, string> = {};
  private initialized = false;
  /**
   * Cached init promise. The first caller assigns this; every concurrent
   * caller awaits the same promise, so `doInit()` runs exactly once even
   * under heavy concurrency. `initPromise` is intentionally never reset —
   * initialisation is idempotent and there is no recovery path that would
   * require re-running it.
   */
  private initPromise: Promise<void> | null = null;
  /**
   * Write mutex — each mutating op schedules itself after the previous
   * mutation's completion. Errors are swallowed on the chain itself so a
   * failed write does not permanently poison future mutations; the failure
   * still surfaces via the per-call return value.
   */
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly dbPath: string,
    private readonly embeddingClient: IEmbeddingClient,
  ) {}

  private bm25FilePath(): string {
    return path.join(this.dbPath, BM25_FILE);
  }

  private vectorsFilePath(): string {
    return path.join(this.dbPath, VECTORS_FILE);
  }

  private createMiniSearch(): MiniSearch<DocFields> {
    return new MiniSearch<DocFields>({
      idField: 'id',
      fields: ['title', 'content'],
      storeFields: ['path', 'title', 'content', 'updated'],
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: { title: 2 },
      },
    });
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    // Cache the in-flight init promise so two concurrent first-callers
    // BOTH await the same doInit() invocation. Without this the TOCTOU
    // window between `if (!this.initialized)` and `this.initialized = true`
    // would let a second caller open the ruvector DB a second time and
    // racing MiniSearch.loadJSON could clobber the in-memory index.
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

    // Sparse side — load persisted BM25 JSON if present, else fresh index
    try {
      const raw = await readFile(this.bm25FilePath(), 'utf-8');
      const parsed = JSON.parse(raw) as Bm25FileV1;
      if (parsed.version !== 1) {
        throw new Error(`unsupported BM25 file version: ${parsed.version}`);
      }
      this.bm25 = MiniSearch.loadJSON<DocFields>(JSON.stringify(parsed.index), {
        idField: 'id',
        fields: ['title', 'content'],
        storeFields: ['path', 'title', 'content', 'updated'],
        searchOptions: {
          prefix: true,
          fuzzy: 0.2,
          boost: { title: 2 },
        },
      });
      this.indexedAt = parsed.lastIndexedAt ?? {};
    } catch {
      this.bm25 = this.createMiniSearch();
      this.indexedAt = {};
    }

    this.initialized = true;
  }

  /**
   * Serialise `fn` against all other mutating operations on this engine.
   * Each scheduled op runs strictly after the previous one's promise
   * settles, even if the previous one rejected — a thrown mutation does
   * not permanently poison the chain, but its caller still receives the
   * rejection. Matches the YamlStateStore pattern.
   */
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.writeChain.then(() => fn());
    // `next` may reject; swallow that on the chain (not on `next` itself)
    // so callers still see the error but the serial ordering continues.
    this.writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /**
   * Persist the BM25 JSON sidecar atomically: write to `<bm25>.tmp` and
   * rename over the target. On POSIX `rename` is atomic on the same
   * filesystem, so the file on disk is always either the previous snapshot
   * or the new snapshot — never a torn mix that would fail `JSON.parse`
   * on the next `doInit()`.
   *
   * Callers MUST hold the write mutex. Invoking `persist()` outside
   * `runExclusive` can interleave two renames and lose updates.
   */
  private async persist(): Promise<void> {
    if (!this.bm25) return;
    const file: Bm25FileV1 = {
      version: 1,
      index: this.bm25.toJSON(),
      lastIndexedAt: this.indexedAt,
    };
    const target = this.bm25FilePath();
    const tmp = `${target}.tmp`;
    await writeFile(tmp, JSON.stringify(file), 'utf-8');
    try {
      await rename(tmp, target);
    } catch (err) {
      // If rename failed, do not leave the tmp file lying around.
      try {
        await unlink(tmp);
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  async index(entry: IndexEntry): Promise<void> {
    await this.init();
    return this.runExclusive(() => this.indexUnsafe(entry));
  }

  /** Assumes the caller holds the write mutex. */
  private async indexUnsafe(entry: IndexEntry): Promise<void> {
    const [vector] = await this.embeddingClient.embed([`${entry.title}\n${entry.content}`]);

    // Overwrite: delete any existing doc from both halves before re-inserting.
    // ruvector's delete is a no-op for unknown ids; MiniSearch's discard is
    // idempotent. discard() is cheaper than remove() because it does not
    // require the original document shape.
    try {
      await this.vectorDb!.delete(entry.path);
    } catch {
      /* no existing entry */
    }
    if (this.bm25!.has(entry.path)) {
      this.bm25!.discard(entry.path);
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

    this.bm25!.add({
      id: entry.path,
      path: entry.path,
      title: entry.title,
      content: entry.content,
      updated: entry.updated,
    });

    this.indexedAt[entry.path] = new Date().toISOString();
    await this.persist();
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
    if (this.bm25!.has(docPath)) {
      this.bm25!.discard(docPath);
    }
    delete this.indexedAt[docPath];
    await this.persist();
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    await this.init();
    const maxResults = query.maxResults ?? 10;

    // If the index is empty, short-circuit: ruvector throws on k=0.
    if (this.bm25!.documentCount === 0) return [];

    // Over-fetch so post-filter scope + RRF have enough material to work with.
    const fetchK = Math.max(maxResults * 3, 10);

    const [qVector] = await this.embeddingClient.embed([query.text]);

    // Dense half
    const denseRaw = await this.vectorDb!.search({
      vector: qVector,
      k: Math.min(fetchK, this.bm25!.documentCount),
    });

    // Sparse half
    const sparseRaw = this.bm25!.search(query.text);

    const scope = query.scope;
    const inScope = (p: string): boolean => (scope ? p.startsWith(scope) : true);

    interface FusionEntry {
      rankDense: number | null;
      rankSparse: number | null;
      path: string;
      title: string;
      content: string;
    }

    const fused = new Map<string, FusionEntry>();

    let denseRank = 0;
    for (const r of denseRaw) {
      const meta = r.metadata as Partial<DocFields> | undefined;
      if (!meta?.path) continue;
      if (!inScope(meta.path)) continue;
      denseRank += 1;
      fused.set(meta.path, {
        rankDense: denseRank,
        rankSparse: null,
        path: meta.path,
        title: meta.title ?? meta.path,
        content: meta.content ?? '',
      });
    }

    let sparseRank = 0;
    for (const r of sparseRaw) {
      const docPath = (r.path as string | undefined) ?? (r.id as string);
      if (!inScope(docPath)) continue;
      sparseRank += 1;
      const existing = fused.get(docPath);
      if (existing) {
        existing.rankSparse = sparseRank;
      } else {
        fused.set(docPath, {
          rankDense: null,
          rankSparse: sparseRank,
          path: docPath,
          title: (r.title as string | undefined) ?? docPath,
          content: (r.content as string | undefined) ?? '',
        });
      }
    }

    if (fused.size === 0) return [];

    interface Scored {
      entry: FusionEntry;
      fused: number;
      source: SearchSource;
    }

    const scored: Scored[] = [];
    for (const entry of fused.values()) {
      const dScore = entry.rankDense !== null ? 1 / (RRF_K + entry.rankDense) : 0;
      const sScore = entry.rankSparse !== null ? 1 / (RRF_K + entry.rankSparse) : 0;
      const fusedScore = dScore + sScore;
      const source: SearchSource =
        entry.rankDense !== null && entry.rankSparse !== null
          ? 'hybrid'
          : entry.rankDense !== null
            ? 'vector'
            : 'bm25';
      scored.push({ entry, fused: fusedScore, source });
    }

    scored.sort((a, b) => b.fused - a.fused);

    // Normalize fused scores into [0, 1] for downstream consumers (QueryService
    // uses the raw numbers; SearchResult.isHighConfidence uses 0.8 as the
    // threshold). Division by the top score keeps the ranking monotone.
    const top = scored[0].fused || 1;

    return scored
      .slice(0, maxResults)
      .map(
        ({ entry, fused, source }) =>
          new SearchResult(
            entry.path,
            entry.title,
            this.excerpt(entry.content),
            top > 0 ? fused / top : 0,
            source,
          ),
      );
  }

  async rebuild(entries: IndexEntry[]): Promise<void> {
    await this.init();
    return this.runExclusive(async () => {
      // Clear the BM25 side wholesale. ruvector lacks a bulk clear, so
      // delete each known id individually before re-indexing.
      for (const id of Object.keys(this.indexedAt)) {
        try {
          await this.vectorDb!.delete(id);
        } catch {
          /* ignore */
        }
      }
      this.bm25!.removeAll();
      this.indexedAt = {};
      // Reuse indexUnsafe (not index()) — calling the public method here
      // would try to re-enter the mutex and deadlock.
      for (const entry of entries) {
        await this.indexUnsafe(entry);
      }
    });
  }

  async health(): Promise<IndexHealth> {
    try {
      await access(this.bm25FilePath());
      return 'ok';
    } catch {
      return 'missing';
    }
  }

  async lastIndexedAt(docPath: string): Promise<string | null> {
    await this.init();
    return this.indexedAt[docPath] ?? null;
  }

  async lastIndexedAtMany(paths: string[]): Promise<Record<string, string | null>> {
    await this.init();
    const result: Record<string, string | null> = {};
    for (const p of paths) {
      result[p] = this.indexedAt[p] ?? null;
    }
    return result;
  }

  private excerpt(content: string): string {
    const lines = content.split('\n');
    const paragraph: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        if (paragraph.length > 0) break;
        continue;
      }
      if (line.startsWith('#')) continue;
      paragraph.push(line);
    }
    const text = paragraph.join(' ');
    return text.length > 240 ? `${text.slice(0, 237)}...` : text;
  }
}
