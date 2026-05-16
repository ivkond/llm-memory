import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KiroMemoryReader } from '../src/kiro-memory-reader.js';

describe('KiroMemoryReader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'kiro-reader-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeSteering(rel: string, body: string, mtime?: Date): Promise<string> {
    const file = path.join(root, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    if (mtime) await utimes(file, mtime, mtime);
    return file;
  }

  it('discovers steering markdown files from multiple configured paths', async () => {
    await writeSteering(
      '.kiro/steering/standards.md',
      '# Standards\nUse explicit errors.\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    await writeSteering(
      'global/steering/architecture.md',
      '# Architecture\nNo hidden coupling.\n',
      new Date('2026-04-09T11:00:00Z'),
    );

    const reader = new KiroMemoryReader();
    const items = await reader.discover({
      paths: [
        path.join(root, '.kiro', 'steering', '**', '*.md').replaceAll('\\', '/'),
        path.join(root, 'global', 'steering', '*.md').replaceAll('\\', '/'),
      ],
      since: null,
    });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.sessionId).sort()).toEqual(['architecture', 'standards']);
    expect(items.every((i) => i.agent === 'kiro')).toBe(true);
  });

  it('filters out files older than `since`', async () => {
    await writeSteering(
      '.kiro/steering/old.md',
      'legacy',
      new Date('2026-03-01T00:00:00Z'),
    );
    await writeSteering(
      '.kiro/steering/new.md',
      'fresh',
      new Date('2026-04-09T10:00:00Z'),
    );

    const reader = new KiroMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.kiro', 'steering', '*.md').replaceAll('\\', '/')],
      since: '2026-04-01T00:00:00Z',
    });
    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('new');
  });

  it('returns empty on missing paths without throwing', async () => {
    const reader = new KiroMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'does', 'not', 'exist', '*.md').replaceAll('\\', '/')],
      since: null,
    });
    expect(items).toEqual([]);
  });

  it('skips empty files and invalid identifiers', async () => {
    await writeSteering('.kiro/steering/empty.md', '   ');
    await writeSteering('.kiro/steering/not valid.md', 'content');
    await writeSteering('.kiro/steering/ok_1.md', 'valid');

    const reader = new KiroMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.kiro', 'steering', '*.md').replaceAll('\\', '/')],
      since: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('ok_1');
  });

  it('preserves raw markdown (including frontmatter and references) without interpretation', async () => {
    const raw = `---
title: Team rules
---
Use pnpm.
See [local note](./other.md).
`;
    await writeSteering('.kiro/steering/style.md', raw, new Date('2026-04-09T10:00:00Z'));

    const reader = new KiroMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, '.kiro', 'steering', '*.md').replaceAll('\\', '/')],
      since: null,
    });

    expect(items).toHaveLength(1);
    expect(items[0].content).toBe(raw);
  });
});
