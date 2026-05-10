import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsFileStore } from '../src/fs-file-store.js';
import { YamlStateStore } from '../src/yaml-state-store.js';
import { EMPTY_RUNTIME_STATE } from '@ivkond-llm-wiki/core';

describe('YamlStateStore', () => {
  let dir: string;
  let fileStore: FsFileStore;
  let store: YamlStateStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-state-'));
    fileStore = new FsFileStore(dir);
    store = new YamlStateStore(fileStore);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('test_load_missingFile_returnsDefaultState', async () => {
    const state = await store.load();
    expect(state).toEqual(EMPTY_RUNTIME_STATE);
  });

  it('test_saveThenLoad_roundTripsStructurally', async () => {
    await store.save({
      imports: { 'docs.example.com': { last_import: '2026-04-09T00:00:00Z' } },
      last_lint: '2026-04-10T00:00:00Z',
      last_ingest: '2026-04-10T00:00:00Z',
    });
    const loaded = await store.load();
    expect(loaded.imports['docs.example.com'].last_import).toBe('2026-04-09T00:00:00Z');
    expect(loaded.last_lint).toBe('2026-04-10T00:00:00Z');
    expect(loaded.last_ingest).toBe('2026-04-10T00:00:00Z');
  });

  it('test_update_mergesPatchShallowlyAndReturnsNewState', async () => {
    await store.save({
      imports: { 'foo.com': { last_import: '2026-04-01T00:00:00Z' } },
      last_lint: null,
      last_ingest: null,
    });

    const updated = await store.update({ last_ingest: '2026-04-10T12:00:00Z' });
    expect(updated.last_ingest).toBe('2026-04-10T12:00:00Z');
    expect(updated.imports).toEqual({
      'foo.com': { last_import: '2026-04-01T00:00:00Z' },
    });
    expect(updated.last_lint).toBeNull();
  });

  it('test_save_createsParentDirectory', async () => {
    // `.local/state.yaml` sits under a subdirectory that may not exist yet.
    await store.save(EMPTY_RUNTIME_STATE);
    expect(await fileStore.exists('.local/state.yaml')).toBe(true);
  });

  it('test_concurrentUpdates_noWritesDropped', async () => {
    // Interleave two update() calls with different patches and assert that
    // after both complete, the merged state reflects both changes (proving
    // the store's mutex serialises the read-modify-write cycle).
    await Promise.all([
      store.update({ last_lint: '2026-04-10T01:00:00Z' }),
      store.update({ last_ingest: '2026-04-10T02:00:00Z' }),
    ]);
    const final = await store.load();
    expect(final.last_lint).toBe('2026-04-10T01:00:00Z');
    expect(final.last_ingest).toBe('2026-04-10T02:00:00Z');
  });
});
