import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VerbatimEntry } from '@llm-wiki/core';
import { FsFileStore } from '../src/fs-file-store.js';
import { FsVerbatimStore } from '../src/fs-verbatim-store.js';

describe('FsVerbatimStore', () => {
  let tempDir: string;
  let fileStore: FsFileStore;
  let verbatimStore: FsVerbatimStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-vbs-'));
    fileStore = new FsFileStore(tempDir);
    verbatimStore = new FsVerbatimStore(fileStore);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('test_writeEntry_createsFile', async () => {
    const entry = VerbatimEntry.create({
      content: '- test fact',
      agent: 'claude-code',
      sessionId: 'abc',
    });
    await verbatimStore.writeEntry(entry);

    const content = await fileStore.readFile(entry.filePath);
    expect(content).not.toBeNull();
    expect(content).toContain('test fact');
    expect(content).toContain('session: abc');
  });

  it('test_listUnconsolidated_findsOnlyFalse', async () => {
    await fileStore.writeFile(
      'log/claude-code/raw/2026-04-09-abc-1111.md',
      '---\nconsolidated: false\n---\nfact1',
    );
    await fileStore.writeFile(
      'log/claude-code/raw/2026-04-09-abc-2222.md',
      '---\nconsolidated: true\n---\nfact2',
    );

    const entries = await verbatimStore.listUnconsolidated('claude-code');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toContain('1111');
  });

  it('test_countUnconsolidated_countsAcrossAgents', async () => {
    await fileStore.writeFile(
      'log/claude-code/raw/2026-04-09-a-1111.md',
      '---\nconsolidated: false\n---\nfact',
    );
    await fileStore.writeFile(
      'log/cursor/raw/2026-04-09-b-2222.md',
      '---\nconsolidated: false\n---\nfact',
    );

    const count = await verbatimStore.countUnconsolidated();
    expect(count).toBe(2);
  });
});
