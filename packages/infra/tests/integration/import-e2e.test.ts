import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  FsFileStore,
  FsVerbatimStore,
  YamlStateStore,
  ClaudeCodeMemoryReader,
} from '../../src/index.js';
import { ImportService } from '@llm-wiki/core';

describe('Import E2E', () => {
  let wiki: string;
  let sourceRoot: string;

  beforeEach(async () => {
    wiki = await mkdtemp(path.join(tmpdir(), 'llm-wiki-import-e2e-'));
    sourceRoot = await mkdtemp(path.join(tmpdir(), 'cc-memory-'));
  });

  afterEach(async () => {
    await rm(wiki, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
  });

  async function seedMemory(file: string, body: string, mtime: Date): Promise<void> {
    const full = path.join(sourceRoot, 'projects', 'hash', 'memory', file);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    await utimes(full, mtime, mtime);
  }

  function globPath(): string {
    return path.join(sourceRoot, 'projects', '*', 'memory', '*.md').replace(/\\/g, '/');
  }

  it('imports new files into log/claude-code/raw and stamps state', async () => {
    await seedMemory(
      'session-alpha.md',
      '---\nsession: alpha\nproject: cli-relay\n---\n\nMemory item 1\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    await seedMemory(
      'session-bravo.md',
      '---\nsession: bravo\n---\n\nMemory item 2\n',
      new Date('2026-04-09T11:00:00Z'),
    );

    const mainFs = new FsFileStore(wiki);
    const verbatim = new FsVerbatimStore(mainFs);
    const state = new YamlStateStore(new FsFileStore(wiki));
    const reader = new ClaudeCodeMemoryReader();

    const service = new ImportService({
      readers: new Map([['claude-code', reader]]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: {
        'claude-code': {
          enabled: true,
          paths: [globPath()],
        },
      },
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const result = await service.importAll({});

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].imported).toBe(2);
    expect(result.agents[0].skipped).toBe(0);

    const rawDir = path.join(wiki, 'log', 'claude-code', 'raw');
    const files = await readdir(rawDir);
    expect(files).toHaveLength(2);

    const reloaded = await state.load();
    expect(reloaded.imports['claude-code'].last_import).toBe('2026-04-10T12:00:00.000Z');
  });

  it('skips files older than the stored last_import timestamp', async () => {
    await seedMemory('old.md', '---\nsession: old\n---\n\nold\n', new Date('2026-03-01T00:00:00Z'));
    await seedMemory('new.md', '---\nsession: new\n---\n\nnew\n', new Date('2026-04-09T10:00:00Z'));

    const mainFs = new FsFileStore(wiki);
    const verbatim = new FsVerbatimStore(mainFs);
    const state = new YamlStateStore(new FsFileStore(wiki));
    await state.update({
      imports: {
        'claude-code': { last_import: '2026-04-01T00:00:00Z' },
      },
    });
    const reader = new ClaudeCodeMemoryReader();

    const service = new ImportService({
      readers: new Map([['claude-code', reader]]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: {
        'claude-code': {
          enabled: true,
          paths: [globPath()],
        },
      },
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const result = await service.importAll({});
    expect(result.agents[0].imported).toBe(1);
  });
});
