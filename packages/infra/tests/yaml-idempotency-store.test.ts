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

  it('allows only one concurrent acquire across independent store instances', async () => {
    const storeA = new YamlIdempotencyStore(new FsFileStore(dir), dir);
    const storeB = new YamlIdempotencyStore(new FsFileStore(dir), dir);

    const [a, b] = await Promise.all([
      storeA.acquire('lint', 'same-key', 'fp-1'),
      storeB.acquire('lint', 'same-key', 'fp-1'),
    ]);

    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['acquired', 'in_progress']);
  });

  it('returns conflict for same key with different fingerprint', async () => {
    const storeA = new YamlIdempotencyStore(new FsFileStore(dir), dir);
    const storeB = new YamlIdempotencyStore(new FsFileStore(dir), dir);

    const first = await storeA.acquire('ingest', 'k', 'fp-a');
    expect(first.kind).toBe('acquired');

    const second = await storeB.acquire('ingest', 'k', 'fp-b');
    expect(second.kind).toBe('conflict');
  });
});
