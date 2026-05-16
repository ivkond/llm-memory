import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VerbatimEntry } from '@ivkond-llm-wiki/core';
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

  it('test_listAgents_returnsAgentsWithEntries', async () => {
    await fileStore.writeFile(
      'log/claude-code/raw/2026-04-09-a-1111.md',
      '---\nconsolidated: false\n---\nfact',
    );
    await fileStore.writeFile(
      'log/cursor/raw/2026-04-09-b-2222.md',
      '---\nconsolidated: true\n---\nfact',
    );

    const agents = await verbatimStore.listAgents();
    expect(agents).toEqual(['claude-code', 'cursor']);
  });

  it('test_listAgents_returnsEmptyArrayWhenLogMissing', async () => {
    const agents = await verbatimStore.listAgents();
    expect(agents).toEqual([]);
  });
});

describe('FsVerbatimStore.readEntry', () => {
  it('returns null for a missing file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-read-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const result = await store.readEntry('log/claude-code/raw/missing.md');
      expect(result).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('parses a stored entry back into a VerbatimEntry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-read-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const entry = VerbatimEntry.create({
        content: 'pgx MaxConns rule',
        agent: 'claude-code',
        sessionId: 'sess1',
        project: 'cli-relay',
        idGenerator: () => 'uuid1',
      });
      await store.writeEntry(entry);
      const roundtrip = await store.readEntry(entry.filePath);
      expect(roundtrip).not.toBeNull();
      expect(roundtrip!.agent).toBe('claude-code');
      expect(roundtrip!.sessionId).toBe('sess1');
      expect(roundtrip!.project).toBe('cli-relay');
      expect(roundtrip!.consolidated).toBe(false);
      expect(roundtrip!.entryId).toBe('uuid1');
      expect(roundtrip!.source.type).toBe('manual');
      expect(roundtrip!.content).toContain('pgx MaxConns rule');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('round-trips import metadata frontmatter fields', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-read-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const entry = VerbatimEntry.create({
        content: 'imported fact',
        agent: 'claude-code',
        sessionId: 'sess1',
        idGenerator: () => 'uuid4',
        source: {
          type: 'import',
          uri: '/abs/source/memory.md',
          digest: 'abc12345',
          mtime: '2026-04-09T10:20:30.000Z',
        },
        processing: {
          imported_at: '2026-04-10T10:20:30.000Z',
          updated_at: '2026-04-11T10:20:30.000Z',
        },
      });
      await store.writeEntry(entry);

      const roundtrip = await store.readEntry(entry.filePath);
      expect(roundtrip).not.toBeNull();
      expect(roundtrip!.source.type).toBe('import');
      expect(roundtrip!.source.uri).toBe('/abs/source/memory.md');
      expect(roundtrip!.source.digest).toBe('abc12345');
      expect(roundtrip!.source.mtime).toBe('2026-04-09T10:20:30.000Z');
      expect(roundtrip!.processing.imported_at).toBe('2026-04-10T10:20:30.000Z');
      expect(roundtrip!.processing.updated_at).toBe('2026-04-11T10:20:30.000Z');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('synthesizes metadata for legacy records without entry_id and processing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-read-'));
    try {
      const fs = new FsFileStore(root);
      const store = new FsVerbatimStore(fs);
      const filePath = 'log/claude-code/raw/2026-04-09-sess1-legacyid.md';
      await fs.writeFile(
        filePath,
        [
          '---',
          'session: sess1',
          'agent: claude-code',
          'consolidated: false',
          'created: 2026-04-09T10:20:30.000Z',
          '---',
          '',
          'legacy content',
          '',
        ].join('\n'),
      );

      const entry = await store.readEntry(filePath);
      expect(entry).not.toBeNull();
      expect(entry!.entryId).toBe('2026-04-09-sess1-legacyid');
      expect(entry!.source.type).toBe('legacy');
      expect(entry!.processing.created_at).toBe('2026-04-09T10:20:30.000Z');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('FsVerbatimStore.markConsolidated', () => {
  it('flips consolidated: false → true on disk', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-mark-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const entry = VerbatimEntry.create({
        content: 'fact',
        agent: 'claude-code',
        sessionId: 'sess',
        idGenerator: () => 'uuid2',
      });
      await store.writeEntry(entry);
      await store.markConsolidated(entry.filePath);
      const reloaded = await store.readEntry(entry.filePath);
      expect(reloaded!.consolidated).toBe(true);
      expect(reloaded!.processing.consolidated_at).toBeTruthy();
      const unconsolidated = await store.listUnconsolidated('claude-code');
      expect(unconsolidated).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is idempotent when already consolidated', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-mark-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      const entry = VerbatimEntry.create({
        content: 'x',
        agent: 'claude-code',
        sessionId: 's',
        idGenerator: () => 'uuid3',
      });
      await store.writeEntry(entry);
      await store.markConsolidated(entry.filePath);
      await expect(store.markConsolidated(entry.filePath)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('throws on missing file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vs-mark-'));
    try {
      const store = new FsVerbatimStore(new FsFileStore(root));
      await expect(
        store.markConsolidated('log/claude-code/raw/does-not-exist.md'),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
