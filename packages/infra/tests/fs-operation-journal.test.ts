import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FsOperationJournal } from '../src/fs-operation-journal.js';

describe('FsOperationJournal', () => {
  let dir: string;
  let journal: FsOperationJournal;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-operation-journal-'));
    journal = new FsOperationJournal(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('test_append_createsDirectoryAndAppendsRecord', async () => {
    await journal.append({
      id: 'op-1',
      type: 'remember_fact',
      status: 'running',
      startedAt: '2026-05-14T00:00:00Z',
      updatedAt: '2026-05-14T00:00:00Z',
      metadata: {
        request: { requestId: 'req-1', source: 'cli' },
        touchedPaths: ['wiki/facts/hello.md'],
      },
    });
    const body = await readFile(path.join(dir, '.local/operations/journal.jsonl'), 'utf-8');
    expect(body).toContain('"id":"op-1"');
    expect(body).toContain('"type":"remember_fact"');
  });

  it('test_load_roundTripsRecords_andIgnoresUnrelatedFiles', async () => {
    await journal.append({
      id: 'op-2',
      type: 'lint',
      status: 'succeeded',
      startedAt: '2026-05-14T00:00:00Z',
      updatedAt: '2026-05-14T00:01:00Z',
      finishedAt: '2026-05-14T00:01:00Z',
      metadata: { touchedPaths: ['wiki/index.md'], commitSha: 'abc123' },
    });
    await writeFile(path.join(dir, '.local/operations/readme.txt'), 'ignore me', 'utf-8');
    const loaded = await journal.load();
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0].id).toBe('op-2');
    expect(loaded.disabledReason).toBeNull();
    expect(loaded.degradedReasons).toEqual([]);
  });

  it('test_load_malformedAndPartialRecords_reportsDegradedReasons', async () => {
    const journalPath = path.join(dir, '.local/operations/journal.jsonl');
    await mkdir(path.dirname(journalPath), { recursive: true });
    await writeFile(
      journalPath,
      [
        '{"id":"op-good","type":"ingest","status":"running","startedAt":"2026-05-14T00:00:00Z","updatedAt":"2026-05-14T00:00:00Z","metadata":{"touchedPaths":[]}}',
        '{bad json line}',
        '{"id":"op-partial"',
      ].join('\n'),
      'utf-8',
    );
    const loaded = await journal.load();
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0].id).toBe('op-good');
    expect(loaded.degradedReasons.some((reason) => reason.includes('line 2'))).toBe(true);
    expect(loaded.degradedReasons.some((reason) => reason.includes('line 3'))).toBe(true);
    expect(
      loaded.degradedReasons.some((reason) => reason.includes('trailing partial journal record')),
    ).toBe(true);
  });

  it('test_append_redactsUnsafeRequestMetadataFields', async () => {
    await journal.append({
      id: 'op-3',
      type: 'import',
      status: 'failed',
      startedAt: '2026-05-14T00:00:00Z',
      updatedAt: '2026-05-14T00:00:01Z',
      metadata: {
        request: {
          requestId: 'req-3',
          source: 'cli',
          ...({ prompt: 'do not persist', apiKey: 'sk-test' } as Record<string, string>),
        },
        touchedPaths: ['wiki/imports/log.md'],
      },
    });
    const body = await readFile(path.join(dir, '.local/operations/journal.jsonl'), 'utf-8');
    expect(body).not.toContain('do not persist');
    expect(body).not.toContain('sk-test');
    expect(body).toContain('"requestId":"req-3"');
  });

  it('test_append_redactsUnsafeErrorAndReasonMetadataFields', async () => {
    await journal.append({
      id: 'op-err',
      type: 'lint',
      status: 'failed',
      startedAt: '2026-05-14T00:00:00Z',
      updatedAt: '2026-05-14T00:00:01Z',
      metadata: {
        touchedPaths: [],
        error: {
          name: 'ExampleError',
          message: 'prompt body leaked sk-abc123def456ghi789jkl012mno345pqr678',
        },
        disabledReason: 'token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij detected',
        resumeReason: 'retry db://user:s3cretPass@localhost:5432/app',
      },
    });
    const body = await readFile(path.join(dir, '.local/operations/journal.jsonl'), 'utf-8');
    expect(body).not.toContain('sk-abc123def456ghi789jkl012mno345pqr678');
    expect(body).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    expect(body).not.toContain('s3cretPass');
    expect(body).toContain('[REDACTED_SECRET]');
  });

  it('test_load_symlinkedLocalDirOutsideRoot_setsDisabledReason', async () => {
    await rm(path.join(dir, '.local'), { recursive: true, force: true });
    const outside = await mkdtemp(path.join(tmpdir(), 'llm-wiki-operation-outside-'));
    await symlink(outside, path.join(dir, '.local'), 'dir');
    try {
      await expect(
        journal.append({
          id: 'op-4',
          type: 'reindex',
          status: 'running',
          startedAt: '2026-05-14T00:00:00Z',
          updatedAt: '2026-05-14T00:00:00Z',
          metadata: { touchedPaths: [] },
        }),
      ).rejects.toThrow();
      await expect(stat(path.join(outside, 'operations'))).rejects.toThrow();
      const loaded = await journal.load();
      expect(loaded.records).toEqual([]);
      expect(loaded.disabledReason).toContain('disabled');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('test_append_preexistingJournalSymlinkOutsideRoot_rejectedOutsideFileUnchanged', async () => {
    const outsideDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-operation-outside-file-'));
    const outsideFile = path.join(outsideDir, 'outside-journal.jsonl');
    await writeFile(outsideFile, 'outside-original\n', 'utf-8');
    await mkdir(path.join(dir, '.local/operations'), { recursive: true });
    await symlink(outsideFile, path.join(dir, '.local/operations/journal.jsonl'), 'file');

    try {
      await expect(
        journal.append({
          id: 'op-escape',
          type: 'archive',
          status: 'running',
          startedAt: '2026-05-14T00:00:00Z',
          updatedAt: '2026-05-14T00:00:00Z',
          metadata: { touchedPaths: [] },
        }),
      ).rejects.toThrow();

      const outsideBody = await readFile(outsideFile, 'utf-8');
      expect(outsideBody).toBe('outside-original\n');
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });
});
