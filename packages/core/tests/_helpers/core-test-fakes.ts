import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';
import type { SearchResult } from '../../src/domain/search-result.js';
import type { VerbatimEntry } from '../../src/domain/verbatim-entry.js';
import type { WikiPageData } from '../../src/domain/wiki-page.js';
import type {
  ArchiveEntry,
  ArchiveResult,
  FileInfo,
  IArchiver,
  IFileStore,
  ILlmClient,
  IProjectResolver,
  ISearchEngine,
  ISourceReader,
  IStateStore,
  IVerbatimStore,
  IVersionControl,
  IndexEntry,
  IndexHealth,
  LlmCompletionRequest,
  LlmCompletionResponse,
  SearchQuery,
  SourceContent,
  WorktreeInfo,
} from '../../src/ports/index.js';
import { vi } from 'vitest';

export class FakeSearchEngine implements ISearchEngine {
  public readonly indexSpy = vi.fn<(entry: IndexEntry) => void>();
  public readonly searchSpy = vi.fn<(query: SearchQuery) => void>();
  public readonly removeSpy = vi.fn<(path: string) => void>();
  public readonly lastIndexedManySpy = vi.fn<(paths: string[]) => void>();
  public documents: SearchResult[] = [];
  public indexed: IndexEntry[] = [];
  public healthValue: IndexHealth = 'ok';
  public lastIndexedMap: Record<string, string | null> = {};

  async index(entry: IndexEntry): Promise<void> {
    this.indexSpy(entry);
    this.indexed.push(entry);
    this.lastIndexedMap[entry.path] = new Date().toISOString();
  }
  async remove(p: string): Promise<void> {
    this.removeSpy(p);
  }
  async search(query: SearchQuery): Promise<SearchResult[]> {
    this.searchSpy(query);
    const scope = query.scope ?? '';
    const hits = this.documents.filter((d) => (scope ? d.path.startsWith(scope) : true));
    return hits.slice(0, query.maxResults ?? 10);
  }
  async rebuild(): Promise<void> {}
  async health(): Promise<IndexHealth> {
    return this.healthValue;
  }
  async lastIndexedAt(p: string): Promise<string | null> {
    return this.lastIndexedMap[p] ?? null;
  }
  async lastIndexedAtMany(paths: string[]): Promise<Record<string, string | null>> {
    this.lastIndexedManySpy(paths);
    const result: Record<string, string | null> = {};
    for (const p of paths) result[p] = this.lastIndexedMap[p] ?? null;
    return result;
  }
}

export class FakeLlmClient implements ILlmClient {
  public readonly completeSpy = vi.fn();
  public response: string | Error = 'Generated answer';
  public lastRequest: LlmCompletionRequest | null = null;

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.completeSpy(request);
    this.lastRequest = request;
    if (this.response instanceof Error) throw this.response;
    return {
      content: this.response,
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }
}

export class FakeIngestLlmClient implements ILlmClient {
  public completeSpy = vi.fn();
  public response: LlmCompletionResponse | Error | Array<{ path: string; title: string; content: string }> = [
    {
      path: 'wiki/tools/postgresql.md',
      title: 'PostgreSQL',
      content: '## Summary\nMaxConns rule.',
    },
  ];

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.completeSpy(request);
    if (this.response instanceof Error) throw this.response;
    if (Array.isArray(this.response)) {
      return {
        content: JSON.stringify(this.response),
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    }
    return this.response;
  }
}

export class FakePageFileStore implements IFileStore {
  public files: Record<string, { info: FileInfo; page: WikiPageData }> = {};
  public existingPaths = new Set<string>();

  async readFile(): Promise<string | null> {
    return null;
  }
  async writeFile(): Promise<void> {}
  async listFiles(directory: string): Promise<FileInfo[]> {
    const dir = directory.replace(/\/$/, '');
    return Object.values(this.files)
      .map((f) => f.info)
      .filter((info) => info.path === dir || info.path.startsWith(`${dir}/`));
  }
  async exists(relativePath: string): Promise<boolean> {
    return this.existingPaths.has(relativePath);
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    return this.files[p]?.page ?? null;
  }
}

export class FakeWorktreeFileStore implements IFileStore {
  constructor(public readonly root: string) {}
  public files: Record<string, string> = {};
  public pages: Record<string, WikiPageData> = {};
  public writeSpy = vi.fn<(p: string, c: string) => void>();

  async readFile(p: string): Promise<string | null> {
    return this.files[p] ?? null;
  }
  async writeFile(p: string, c: string): Promise<void> {
    this.writeSpy(p, c);
    this.files[p] = c;
  }
  async listFiles(directory = ''): Promise<FileInfo[]> {
    const dir = directory.replace(/\/$/, '');
    return Object.keys(this.files)
      .filter((p) => (dir ? p === dir || p.startsWith(`${dir}/`) : true))
      .map((p) => ({ path: p, updated: '2026-04-10T00:00:00Z' }));
  }
  async exists(p: string): Promise<boolean> {
    return p in this.files;
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    if (this.pages[p]) return this.pages[p];
    if (!(p in this.files)) return null;
    return {
      frontmatter: {
        title: 'T',
        created: '2026-04-10',
        updated: '2026-04-10',
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: this.files[p],
    };
  }
}

export class FakeProjectResolver implements IProjectResolver {
  constructor(public project: string | null = null) {}
  async resolve(): Promise<string | null> {
    return this.project;
  }
  async getRemoteUrl(): Promise<string | null> {
    return null;
  }
}

export class FakeSourceReader implements ISourceReader {
  public readSpy = vi.fn();
  public response: SourceContent | Error = {
    uri: '/tmp/src.md',
    content: '# Source\n\nBody.',
    mimeType: 'text/markdown',
    bytes: 20,
    estimatedTokens: 5,
  };

  async read(uri: string): Promise<SourceContent> {
    this.readSpy(uri);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

export class FakeVersionControl implements IVersionControl {
  public createSpy = vi.fn();
  public removeSpy = vi.fn<(p: string, force?: boolean) => void>();
  public commitInWorktreeSpy = vi.fn();
  public squashSpy = vi.fn();
  public mergeSpy = vi.fn<(p: string) => void>();
  public commitSpy = vi.fn();
  public mergeResponse: string | Error = 'abc1234567';
  public onMergeSuccess: (worktreePath: string) => void = () => {};
  public createdWorktree: WorktreeInfo | null = null;
  private worktreeCounter = 0;

  async commit(): Promise<string> {
    return 'main-sha';
  }
  async hasUncommittedChanges(): Promise<boolean> {
    return false;
  }
  async createWorktree(name: string): Promise<WorktreeInfo> {
    this.worktreeCounter += 1;
    this.createSpy(name);
    this.createdWorktree = {
      path: `/tmp/repo/.worktrees/${name}-${this.worktreeCounter}`,
      branch: `${name}-${this.worktreeCounter}`,
    };
    return this.createdWorktree;
  }
  async removeWorktree(p: string, force?: boolean): Promise<void> {
    this.removeSpy(p, force);
  }
  async squashWorktree(p: string, m: string): Promise<string> {
    this.squashSpy(p, m);
    return 'squash-sha';
  }
  async mergeWorktree(p: string): Promise<string> {
    this.mergeSpy(p);
    if (this.mergeResponse instanceof Error) throw this.mergeResponse;
    this.onMergeSuccess(p);
    return this.mergeResponse;
  }
  async commitInWorktree(p: string, files: string[], m: string): Promise<string> {
    this.commitInWorktreeSpy(p, files, m);
    this.commitSpy(p, files, m);
    return 'wt-sha';
  }
}

export class FakeVerbatimStore implements IVerbatimStore {
  public unconsolidated = 0;
  public marked: string[] = [];
  async writeEntry(): Promise<void> {}
  async listUnconsolidated(): Promise<FileInfo[]> {
    return [];
  }
  async countUnconsolidated(): Promise<number> {
    return this.unconsolidated;
  }
  async listAgents(): Promise<string[]> {
    return [];
  }
  async readEntry(): Promise<VerbatimEntry | null> {
    return null;
  }
  async markConsolidated(p: string): Promise<void> {
    this.marked.push(p);
    this.unconsolidated = Math.max(0, this.unconsolidated - 1);
  }
}

export class FakeStateStore implements IStateStore {
  public state: WikiRuntimeState = structuredClone(EMPTY_RUNTIME_STATE);
  public saved: WikiRuntimeState[] = [];
  public updateSpy = vi.fn<(patch: Partial<WikiRuntimeState>) => void>();

  async load(): Promise<WikiRuntimeState> {
    return structuredClone(this.state);
  }
  async save(s: WikiRuntimeState): Promise<void> {
    this.state = structuredClone(s);
    this.saved.push(structuredClone(this.state));
  }
  async update(patch: Partial<WikiRuntimeState>): Promise<WikiRuntimeState> {
    this.updateSpy(patch);
    this.state = { ...this.state, ...patch };
    const next = structuredClone(this.state);
    this.saved.push(next);
    return next;
  }
}

export class FakeArchiver implements IArchiver {
  public calls: Array<{ path: string; entries: ArchiveEntry[] }> = [];
  async createArchive(path: string, entries: ArchiveEntry[]): Promise<ArchiveResult> {
    this.calls.push({ path, entries });
    return { archivePath: path, fileCount: entries.length, bytes: 1 };
  }
}
