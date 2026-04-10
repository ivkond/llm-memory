import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsFileStore } from '../src/fs-file-store.js';
import { ConfigLoader } from '../src/config-loader.js';

describe('ConfigLoader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cfg-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('test_load_sharedOnly_returnsDefaults', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile('.config/settings.shared.yaml', 'consolidation:\n  batch_threshold: 10');

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.consolidation.batch_threshold).toBe(10);
  });

  it('test_load_localOverridesShared', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile('.config/settings.shared.yaml', 'consolidation:\n  batch_threshold: 10');
    await store.writeFile('.local/settings.local.yaml', 'llm:\n  model: gpt-4o');

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.consolidation.batch_threshold).toBe(10);
    expect(config.llm.model).toBe('gpt-4o');
  });

  it('test_load_noFiles_returnsAllDefaults', async () => {
    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.sanitization.enabled).toBe(true);
    expect(config.sanitization.mode).toBe('redact');
  });

  it('test_load_envOverridesLocal', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile('.local/settings.local.yaml', 'llm:\n  model: gpt-4o\n  api_key: yaml-key');

    process.env.LLM_WIKI_LLM_API_KEY = 'env-key';
    try {
      const loader = new ConfigLoader(tempDir);
      const config = await loader.load();

      expect(config.llm.model).toBe('gpt-4o');
      expect(config.llm.api_key).toBe('env-key');
    } finally {
      delete process.env.LLM_WIKI_LLM_API_KEY;
    }
  });
});
