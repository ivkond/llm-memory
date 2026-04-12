import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    vi.unstubAllEnvs();
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
    await store.writeFile(
      '.local/settings.local.yaml',
      'llm:\n  model: gpt-4o\n  api_key: yaml-key',
    );

    vi.stubEnv('LLM_WIKI_LLM_API_KEY', 'env-key');

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.llm.model).toBe('gpt-4o');
    expect(config.llm.api_key).toBe('env-key');
  });

  it('test_load_noYamlNoEnv_returnsDefaultMcpHostAndPort', async () => {
    // Ensure no stray env leaks from outer process.
    vi.stubEnv('LLM_WIKI_MCP_HOST', '');
    vi.stubEnv('LLM_WIKI_MCP_PORT', '');
    vi.unstubAllEnvs();

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.mcp.host).toBe('127.0.0.1');
    expect(config.mcp.port).toBe(7849);
    expect(typeof config.mcp.port).toBe('number');
  });

  it('test_load_sharedYamlSetsMcpHost_sharedWinsOverDefault', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile(
      '.config/settings.shared.yaml',
      "mcp:\n  host: '0.0.0.0'\n  port: 9000\n",
    );

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.mcp.host).toBe('0.0.0.0');
    expect(config.mcp.port).toBe(9000);
    expect(typeof config.mcp.port).toBe('number');
  });

  it('test_load_localYamlOverridesShared_localWins', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile(
      '.config/settings.shared.yaml',
      "mcp:\n  host: '0.0.0.0'\n  port: 9000\n",
    );
    await store.writeFile('.local/settings.local.yaml', 'mcp:\n  port: 9100\n');

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.mcp.host).toBe('0.0.0.0');
    expect(config.mcp.port).toBe(9100);
  });

  it('test_load_envOverridesAll_envWins', async () => {
    const store = new FsFileStore(tempDir);
    await store.writeFile('.local/settings.local.yaml', 'mcp:\n  port: 9100\n');

    vi.stubEnv('LLM_WIKI_MCP_HOST', '127.0.0.1');
    vi.stubEnv('LLM_WIKI_MCP_PORT', '7777');

    const loader = new ConfigLoader(tempDir);
    const config = await loader.load();

    expect(config.mcp.host).toBe('127.0.0.1');
    expect(config.mcp.port).toBe(7777);
    expect(typeof config.mcp.port).toBe('number');
  });

  it('test_load_envPortInvalid_throwsConfigError', async () => {
    vi.stubEnv('LLM_WIKI_MCP_PORT', 'notanumber');

    const loader = new ConfigLoader(tempDir);

    await expect(loader.load()).rejects.toThrow(/Invalid LLM_WIKI_MCP_PORT/);
  });

  it('test_load_envPortOutOfRange_throwsConfigError', async () => {
    vi.stubEnv('LLM_WIKI_MCP_PORT', '70000');

    const loader = new ConfigLoader(tempDir);

    await expect(loader.load()).rejects.toThrow(/1-65535/);
  });
});
