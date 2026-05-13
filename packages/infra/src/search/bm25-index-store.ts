import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import MiniSearch from 'minisearch';

export interface DocFields {
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

function createMiniSearch(): MiniSearch<DocFields> {
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

export class Bm25IndexStore {
  private constructor(
    private readonly dbPath: string,
    private readonly index: MiniSearch<DocFields>,
    private readonly indexedAt: Record<string, string>,
  ) {}

  static async load(dbPath: string): Promise<Bm25IndexStore> {
    const filePath = path.join(dbPath, BM25_FILE);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Bm25FileV1;
      if (parsed.version !== 1) {
        throw new Error(`unsupported BM25 file version: ${parsed.version}`);
      }
      const index = MiniSearch.loadJSON<DocFields>(JSON.stringify(parsed.index), {
        idField: 'id',
        fields: ['title', 'content'],
        storeFields: ['path', 'title', 'content', 'updated'],
        searchOptions: {
          prefix: true,
          fuzzy: 0.2,
          boost: { title: 2 },
        },
      });
      return new Bm25IndexStore(dbPath, index, parsed.lastIndexedAt ?? {});
    } catch {
      return new Bm25IndexStore(dbPath, createMiniSearch(), {});
    }
  }

  filePath(): string {
    return path.join(this.dbPath, BM25_FILE);
  }

  documentCount(): number {
    return this.index.documentCount;
  }

  has(pathId: string): boolean {
    return this.index.has(pathId);
  }

  discard(pathId: string): void {
    this.index.discard(pathId);
  }

  add(entry: DocFields): void {
    this.index.add(entry);
  }

  removeAll(): void {
    this.index.removeAll();
  }

  search(query: string): Array<Record<string, unknown>> {
    return this.index.search(query) as Array<Record<string, unknown>>;
  }

  markIndexed(pathId: string): void {
    this.indexedAt[pathId] = new Date().toISOString();
  }

  deleteIndexed(pathId: string): void {
    delete this.indexedAt[pathId];
  }

  resetIndexedAt(): void {
    for (const key of Object.keys(this.indexedAt)) {
      delete this.indexedAt[key];
    }
  }

  indexedPaths(): string[] {
    return Object.keys(this.indexedAt);
  }

  lastIndexedAt(pathId: string): string | null {
    return this.indexedAt[pathId] ?? null;
  }

  lastIndexedAtMany(paths: string[]): Record<string, string | null> {
    const result: Record<string, string | null> = {};
    for (const p of paths) {
      result[p] = this.indexedAt[p] ?? null;
    }
    return result;
  }

  async persist(): Promise<void> {
    const file: Bm25FileV1 = {
      version: 1,
      index: this.index.toJSON(),
      lastIndexedAt: this.indexedAt,
    };
    const target = this.filePath();
    const tmp = `${target}.tmp`;
    await writeFile(tmp, JSON.stringify(file), 'utf-8');
    try {
      await rename(tmp, target);
    } catch (err) {
      try {
        await unlink(tmp);
      } catch {
        // ignore cleanup failures
      }
      throw err;
    }
  }
}
