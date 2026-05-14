import { describe, it, expect, beforeEach } from 'vitest';
import { QueryService } from '../../src/services/query-service.js';
import { SearchResult } from '../../src/domain/search-result.js';
import { SearchEmptyError, LlmUnavailableError } from '../../src/domain/errors.js';
import type {
  FileInfo,
} from '../../src/ports/index.js';
import { FakeLlmClient, FakePageFileStore, FakeProjectResolver, FakeSearchEngine } from '../_helpers/core-test-fakes.js';
import { makePageRecord } from '../_helpers/wiki-page-factories.js';

describe('QueryService', () => {
  let searchEngine: FakeSearchEngine;
  let llmClient: FakeLlmClient;
  let fileStore: FakePageFileStore;
  let projectResolver: FakeProjectResolver;
  let service: QueryService;

  beforeEach(() => {
    searchEngine = new FakeSearchEngine();
    llmClient = new FakeLlmClient();
    fileStore = new FakePageFileStore();
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
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-10T12:00:00Z', 'body');
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
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-09T00:00:00Z', 'body');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T12:00:00Z';
    searchEngine.documents = [new SearchResult('wiki/a.md', 'A', 'body', 0.9, 'hybrid')];

    await service.query({ question: 'q' });
    expect(searchEngine.indexSpy).not.toHaveBeenCalled();
  });

  it('test_query_syncStaleFiles_usesBulkLookupPerDirectory', async () => {
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-09T00:00:00Z', 'body');
    fileStore.files['wiki/b.md'] = makePageRecord('wiki/b.md', 'B', '2026-04-09T00:00:00Z', 'body');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T12:00:00Z';
    searchEngine.lastIndexedMap['wiki/b.md'] = '2026-04-10T12:00:00Z';
    searchEngine.documents = [new SearchResult('wiki/a.md', 'A', 'body', 0.9, 'hybrid')];

    await service.query({ question: 'q' });

    expect(searchEngine.lastIndexedManySpy).toHaveBeenCalledTimes(2);
    expect(searchEngine.lastIndexedManySpy).toHaveBeenCalledWith(['wiki/a.md', 'wiki/b.md']);
    expect(searchEngine.indexSpy).not.toHaveBeenCalled();
  });

  it('test_query_unindexedFile_triggersIndexBeforeSearch', async () => {
    fileStore.files['wiki/new.md'] = makePageRecord('wiki/new.md', 'New', '2026-04-10T00:00:00Z', 'body');
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
