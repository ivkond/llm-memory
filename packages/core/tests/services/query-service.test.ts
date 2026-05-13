import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryService } from '../../src/services/query-service.js';
import { SearchResult } from '../../src/domain/search-result.js';
import { SearchEmptyError, LlmUnavailableError } from '../../src/domain/errors.js';
import type {
  ISearchEngine,
  ILlmClient,
  IFileStore,
  IProjectResolver,
  FileInfo,
  IndexEntry,
  SearchQuery,
} from '../../src/ports/index.js';
import type { WikiPageData } from '../../src/domain/wiki-page.js';

/**
 * Minimal in-memory ISearchEngine fake.
 *
 * - `documents` drives the search result list per scope prefix.
 * - `lastIndexedMap` backs lastIndexedAt; `indexSpy` records each index() call.
 * - `searchSpy` records the full SearchQuery seen on search() so tests can
 *   assert on scope and ordering.
 */
class FakeSearchEngine implements ISearchEngine {
  public readonly indexSpy = vi.fn<(entry: IndexEntry) => void>();
  public readonly searchSpy = vi.fn<(query: SearchQuery) => void>();
  public readonly removeSpy = vi.fn<(path: string) => void>();
  public readonly lastIndexedManySpy = vi.fn<(paths: string[]) => void>();
  public documents: SearchResult[] = [];
  public lastIndexedMap: Record<string, string | null> = {};

  async index(entry: IndexEntry): Promise<void> {
    this.indexSpy(entry);
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
  async health(): Promise<'ok' | 'stale' | 'missing'> {
    return 'ok';
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

class FakeLlmClient implements ILlmClient {
  public readonly completeSpy = vi.fn();
  public response: string | Error = 'Generated answer';
  public lastRequest: {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
    temperature?: number;
  } | null = null;

  async complete(request: {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }) {
    this.completeSpy(request);
    this.lastRequest = request;
    if (this.response instanceof Error) throw this.response;
    return {
      content: this.response,
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }
}

class FakeFileStore implements IFileStore {
  public files: Record<string, { info: FileInfo; page: WikiPageData }> = {};

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
  async exists(): Promise<boolean> {
    return true;
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    return this.files[p]?.page ?? null;
  }
}

class FakeProjectResolver implements IProjectResolver {
  constructor(public project: string | null = null) {}
  async resolve(): Promise<string | null> {
    return this.project;
  }
  async getRemoteUrl(): Promise<string | null> {
    return null;
  }
}

function makePage(
  filePath: string,
  title: string,
  content: string,
  updated: string,
): { info: FileInfo; page: WikiPageData } {
  return {
    info: { path: filePath, updated },
    page: {
      frontmatter: {
        title,
        created: updated,
        updated,
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content,
    },
  };
}

describe('QueryService', () => {
  let searchEngine: FakeSearchEngine;
  let llmClient: FakeLlmClient;
  let fileStore: FakeFileStore;
  let projectResolver: FakeProjectResolver;
  let service: QueryService;

  beforeEach(() => {
    searchEngine = new FakeSearchEngine();
    llmClient = new FakeLlmClient();
    fileStore = new FakeFileStore();
    projectResolver = new FakeProjectResolver();
    service = new QueryService(searchEngine, llmClient, projectResolver, fileStore);
  });

  it('test_query_validQuestion_returnsAnswerAndCitations', async () => {
    searchEngine.documents = [
      new SearchResult('wiki/a.md', 'A', 'alpha snippet', 0.9, 'hybrid'),
      new SearchResult('wiki/b.md', 'B', 'beta snippet', 0.7, 'bm25'),
    ];
    llmClient.response = 'Answer with refs.';

    const response = await service.query({ question: 'alpha?', cwd: '/tmp' });

    expect(response.answer).toBe('Answer with refs.');
    expect(response.citations).toHaveLength(2);
    expect(response.citations[0].page).toBe('wiki/a.md');
    expect(response.citations[0].title).toBe('A');
    expect(response.citations[0].excerpt).toBe('alpha snippet');
    expect(response.citations[0].score).toBe(0.9);
  });

  it('test_query_explicitScope_searchEngineReceivesScope', async () => {
    searchEngine.documents = [
      new SearchResult('wiki/patterns/testing.md', 'T', 'x', 0.9, 'hybrid'),
    ];
    await service.query({ question: 'q', scope: 'wiki/patterns/' });

    expect(searchEngine.searchSpy).toHaveBeenCalledTimes(1);
    const [call] = searchEngine.searchSpy.mock.calls[0];
    expect(call.scope).toBe('wiki/patterns/');
  });

  it('test_query_cascadeByProject_projectFirst_thenWiki_thenAll', async () => {
    // Only a wiki doc matches — the project scope is empty, so the cascade
    // must fall through project -> wiki and surface the wiki result.
    projectResolver.project = 'cli-relay';
    searchEngine.documents = [
      new SearchResult('wiki/patterns/testing.md', 'T', 'x', 0.9, 'hybrid'),
    ];

    const response = await service.query({ question: 'q', cwd: '/tmp/cli-relay' });

    // Three search calls in cascade order
    expect(searchEngine.searchSpy).toHaveBeenCalled();
    const scopes = searchEngine.searchSpy.mock.calls.map((c) => c[0].scope);
    expect(scopes[0]).toBe('projects/cli-relay/');
    expect(scopes[1]).toBe('wiki/');
    expect(response.scope_used).toBe('wiki/');
    expect(response.project_used).toBe('cli-relay');
    expect(response.citations[0].page).toBe('wiki/patterns/testing.md');
  });

  it('test_query_cascadeByProject_projectHits_usesProjectResults', async () => {
    projectResolver.project = 'cli-relay';
    searchEngine.documents = [
      new SearchResult('projects/cli-relay/arch.md', 'A', 'x', 0.9, 'hybrid'),
      new SearchResult('wiki/patterns/testing.md', 'T', 'y', 0.8, 'hybrid'),
    ];

    const response = await service.query({ question: 'q', cwd: '/tmp/cli-relay' });

    expect(response.scope_used).toBe('projects/cli-relay/');
    expect(response.citations[0].page).toBe('projects/cli-relay/arch.md');
    // Project scope already hit — should not fall through to wiki or all.
    const scopes = searchEngine.searchSpy.mock.calls.map((c) => c[0].scope);
    expect(scopes).toEqual(['projects/cli-relay/']);
  });

  it('test_query_llmThrows_returnsRawResultsAsCitations', async () => {
    // INV-3: LLM_UNAVAILABLE — return raw search results in citations
    searchEngine.documents = [new SearchResult('wiki/a.md', 'A', 'alpha', 0.9, 'hybrid')];
    llmClient.response = new LlmUnavailableError('rate limit');

    const response = await service.query({ question: 'q' });

    expect(response.answer).toBe('');
    expect(response.citations).toHaveLength(1);
    expect(response.citations[0].page).toBe('wiki/a.md');
  });

  it('test_query_llmThrowsGenericError_stillReturnsCitations', async () => {
    // Any thrown error from the LLM — not just LlmUnavailableError — should
    // degrade gracefully. INV-3 is about the USER visible guarantee, not
    // specifically the domain error class.
    searchEngine.documents = [new SearchResult('wiki/a.md', 'A', 'alpha', 0.9, 'hybrid')];
    llmClient.response = new Error('transient');

    const response = await service.query({ question: 'q' });
    expect(response.answer).toBe('');
    expect(response.citations).toHaveLength(1);
  });

  it('test_query_noSearchResults_throwsSearchEmpty', async () => {
    searchEngine.documents = [];
    await expect(service.query({ question: 'nothing' })).rejects.toBeInstanceOf(SearchEmptyError);
  });

  it('test_query_staleFile_triggersReindexBeforeSearch', async () => {
    // File is stale: its mtime is AFTER the index's lastIndexedAt
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', 'body', '2026-04-10T12:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-09T00:00:00Z';
    searchEngine.documents = [new SearchResult('wiki/a.md', 'A', 'body', 0.9, 'hybrid')];

    await service.query({ question: 'q' });

    expect(searchEngine.indexSpy).toHaveBeenCalled();
    const indexed = searchEngine.indexSpy.mock.calls.map((c) => c[0].path);
    expect(indexed).toContain('wiki/a.md');

    // index() must happen before search() — record the invocation order
    const indexOrder = searchEngine.indexSpy.mock.invocationCallOrder[0];
    const searchOrder = searchEngine.searchSpy.mock.invocationCallOrder[0];
    expect(indexOrder).toBeLessThan(searchOrder);
  });

  it('test_query_freshFile_doesNotReindex', async () => {
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', 'body', '2026-04-09T00:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T12:00:00Z';
    searchEngine.documents = [new SearchResult('wiki/a.md', 'A', 'body', 0.9, 'hybrid')];

    await service.query({ question: 'q' });
    expect(searchEngine.indexSpy).not.toHaveBeenCalled();
  });

  it('test_query_syncStaleFiles_usesBulkLookupPerDirectory', async () => {
    fileStore.files['wiki/a.md'] = makePage('wiki/a.md', 'A', 'body', '2026-04-09T00:00:00Z');
    fileStore.files['wiki/b.md'] = makePage('wiki/b.md', 'B', 'body', '2026-04-09T00:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T12:00:00Z';
    searchEngine.lastIndexedMap['wiki/b.md'] = '2026-04-10T12:00:00Z';
    searchEngine.documents = [new SearchResult('wiki/a.md', 'A', 'body', 0.9, 'hybrid')];

    await service.query({ question: 'q' });

    expect(searchEngine.lastIndexedManySpy).toHaveBeenCalledTimes(2);
    expect(searchEngine.lastIndexedManySpy).toHaveBeenCalledWith(['wiki/a.md', 'wiki/b.md']);
    expect(searchEngine.indexSpy).not.toHaveBeenCalled();
  });

  it('test_query_unindexedFile_triggersIndexBeforeSearch', async () => {
    fileStore.files['wiki/new.md'] = makePage('wiki/new.md', 'New', 'body', '2026-04-10T00:00:00Z');
    // No lastIndexedMap entry -> null
    searchEngine.documents = [new SearchResult('wiki/new.md', 'New', 'body', 0.9, 'hybrid')];

    await service.query({ question: 'q' });
    const indexed = searchEngine.indexSpy.mock.calls.map((c) => c[0].path);
    expect(indexed).toContain('wiki/new.md');
  });

  it('test_query_citationsCappedAt20', async () => {
    // 25 results — cap should drop the response to exactly 20 citations.
    searchEngine.documents = Array.from(
      { length: 25 },
      (_, i) => new SearchResult(`wiki/${i}.md`, `T${i}`, `e${i}`, 1 - i * 0.01, 'hybrid'),
    );

    const response = await service.query({ question: 'q', maxResults: 25 });
    expect(response.citations.length).toBe(20);
  });

  it('test_query_answerRespectsMaxTokens', async () => {
    searchEngine.documents = [new SearchResult('wiki/a.md', 'A', 'alpha', 0.9, 'hybrid')];
    await service.query({ question: 'q', maxTokens: 512 });

    expect(llmClient.lastRequest).not.toBeNull();
    expect(llmClient.lastRequest!.maxTokens).toBe(512);
  });
});
