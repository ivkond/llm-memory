import { describe, it, expect, beforeEach } from 'vitest';
import { WikiStatusService } from '../../src/services/status-service.js';
import { WikiNotInitializedError } from '../../src/domain/errors.js';
import { FakePageFileStore, FakeSearchEngine, FakeStateStore, FakeVerbatimStore } from '../_helpers/core-test-fakes.js';
import { makePageRecord } from '../_helpers/wiki-page-factories.js';

describe('WikiStatusService', () => {
  let fileStore: FakePageFileStore;
  let verbatimStore: FakeVerbatimStore;
  let searchEngine: FakeSearchEngine;
  let stateStore: FakeStateStore;
  let service: WikiStatusService;

  beforeEach(() => {
    fileStore = new FakePageFileStore();
    verbatimStore = new FakeVerbatimStore();
    searchEngine = new FakeSearchEngine();
    stateStore = new FakeStateStore();
    service = new WikiStatusService(fileStore, verbatimStore, searchEngine, stateStore);
  });

  it('test_status_emptyWiki_throwsWikiNotInitialized', async () => {
    await expect(service.status()).rejects.toBeInstanceOf(WikiNotInitializedError);
  });

  it('test_status_initializedButEmptyWiki_returnsZeroPages', async () => {
    fileStore.existingPaths.add('.config/settings.shared.yaml');
    fileStore.existingPaths.add('wiki');
    fileStore.existingPaths.add('projects');
    searchEngine.healthValue = 'missing';

    const response = await service.status();
    expect(response.total_pages).toBe(0);
    expect(response.projects).toEqual([]);
    expect(response.index_health).toBe('missing');
  });

  it('test_status_nonEmptyWiki_returnsTotalPagesAndProjects', async () => {
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    fileStore.files['projects/foo/x.md'] = makePageRecord('projects/foo/x.md', 'X', '2026-04-09T00:00:00Z');
    fileStore.files['projects/bar/y.md'] = makePageRecord('projects/bar/y.md', 'Y', '2026-04-09T00:00:00Z');

    // All pages are already indexed so the health check stays 'ok'.
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';
    searchEngine.lastIndexedMap['projects/foo/x.md'] = '2026-04-10T00:00:00Z';
    searchEngine.lastIndexedMap['projects/bar/y.md'] = '2026-04-10T00:00:00Z';

    const response = await service.status();
    expect(response.total_pages).toBe(3);
    expect(response.projects.sort()).toEqual(['bar', 'foo']);
  });

  it('test_status_unconsolidatedCountPropagatedFromVerbatimStore', async () => {
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';
    verbatimStore.unconsolidated = 7;

    const response = await service.status();
    expect(response.unconsolidated).toBe(7);
  });

  it('test_status_indexHealth_missing_returnsMissing', async () => {
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.healthValue = 'missing';

    const response = await service.status();
    expect(response.index_health).toBe('missing');
  });

  it('test_status_staleFiles_indexHealthReportsStale', async () => {
    // Engine says 'ok', but one file's updated timestamp is newer than its
    // lastIndexedAt — the service must upgrade the health signal to 'stale'.
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-10T12:00:00Z');
    searchEngine.healthValue = 'ok';
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-09T00:00:00Z';

    const response = await service.status();
    expect(response.index_health).toBe('stale');
  });

  it('test_status_allFilesFresh_indexHealthRemainsOk', async () => {
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.healthValue = 'ok';
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';

    const response = await service.status();
    expect(response.index_health).toBe('ok');
  });

  it('test_status_lastLintAndLastIngest_fromStateStore', async () => {
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';
    stateStore.state = {
      imports: {},
      last_lint: '2026-04-08T00:00:00Z',
      last_ingest: '2026-04-09T00:00:00Z',
    };

    const response = await service.status();
    expect(response.last_lint).toBe('2026-04-08T00:00:00Z');
    expect(response.last_ingest).toBe('2026-04-09T00:00:00Z');
  });

  it('test_status_freshState_lastLintAndLastIngestAreNull', async () => {
    fileStore.files['wiki/a.md'] = makePageRecord('wiki/a.md', 'A', '2026-04-09T00:00:00Z');
    searchEngine.lastIndexedMap['wiki/a.md'] = '2026-04-10T00:00:00Z';

    const response = await service.status();
    expect(response.last_lint).toBeNull();
    expect(response.last_ingest).toBeNull();
  });

  it('test_status_unindexedFile_reportsStale', async () => {
    // A file exists but has never been indexed at all. The health signal
    // must upgrade to 'stale' so wiki_status surfaces the work to do.
    fileStore.files['wiki/new.md'] = makePageRecord('wiki/new.md', 'New', '2026-04-10T00:00:00Z');
    searchEngine.healthValue = 'ok';
    // lastIndexedMap is empty → lastIndexedAt returns null.

    const response = await service.status();
    expect(response.index_health).toBe('stale');
  });
});
