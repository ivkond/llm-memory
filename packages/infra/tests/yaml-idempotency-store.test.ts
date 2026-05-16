import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsFileStore } from '../src/fs-file-store.js';
import { YamlIdempotencyStore } from '../src/yaml-idempotency-store.js';

describe('YamlIdempotencyStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-idempotency-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function createStorePair() {
    return [
      new YamlIdempotencyStore(new FsFileStore(dir), dir),
      new YamlIdempotencyStore(new FsFileStore(dir), dir),
    ] as const;
  }

  async function acquirePair(operation: 'lint' | 'ingest', key: string, fingerprint: string) {
    const [storeA, storeB] = createStorePair();
    return Promise.all([storeA.acquire(operation, key, fingerprint), storeB.acquire(operation, key, fingerprint)]);
  }

  function expectKinds(actual: string[], expected: string[]) {
    expect(new Set(actual)).toEqual(new Set(expected));
  }

  it('allows only one concurrent acquire across independent store instances', async () => {
    const [a, b] = await acquirePair('lint', 'same-key', 'fp-1');
    expectKinds([a.kind, b.kind], ['acquired', 'in_progress']);
  });

  it('returns conflict for same key with different fingerprint', async () => {
    const [storeA, storeB] = createStorePair();

    const first = await storeA.acquire('ingest', 'k', 'fp-a');
    expect(first.kind).toBe('acquired');

    const second = await storeB.acquire('ingest', 'k', 'fp-b');
    expect(second.kind).toBe('conflict');
  });
});
