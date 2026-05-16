import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeCodeMemoryReader } from '../src/claude-code-memory-reader.js';

describe('ClaudeCodeMemoryReader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'cc-reader-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeMem(
    projectHash: string,
    filename: string,
    body: string,
    mtime?: Date,
  ): Promise<string> {
    const dir = path.join(root, 'projects', projectHash, 'memory');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, filename);
    await writeFile(file, body);
    if (mtime) await utimes(file, mtime, mtime);
    return file;
  }

  it('discovers memory files under the configured paths', async () => {
    await writeMem(
      'cli-relay-abc',
      'session-001.md',
      '---\nsession: sess001\nproject: cli-relay\n---\n\nPGX rule\n',
      new Date('2026-04-09T10:00:00Z'),
    );

    const reader = new ClaudeCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'projects', '*', 'memory', '*.md').replaceAll('\\', '/')],
      since: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].agent).toBe('claude-code');
    expect(items[0].sessionId).toBe('sess001');
    expect(items[0].project).toBe('cli-relay');
    expect(items[0].content).toContain('PGX rule');
    expect(items[0].mtime).toBe('2026-04-09T10:00:00.000Z');
    expect(items[0].sourceType).toBe('claude-code-memory');
    expect(items[0].sourceUri).toMatch(/session-001\.md$/);
    expect(items[0].sourceMtime).toBe('2026-04-09T10:00:00.000Z');
    expect(items[0].sourceDigest).toMatch(/^[a-f0-9]{8}$/);
  });

  it('filters out files older than `since`', async () => {
    await writeMem(
      'p',
      'old.md',
      '---\nsession: old\n---\n\ncontent\n',
      new Date('2026-03-01T00:00:00Z'),
    );
    await writeMem(
      'p',
      'new.md',
      '---\nsession: new\n---\n\ncontent\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    const reader = new ClaudeCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'projects', '*', 'memory', '*.md').replaceAll('\\', '/')],
      since: '2026-04-01T00:00:00Z',
    });
    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('new');
  });

  it('derives sessionId from filename when frontmatter is missing', async () => {
    await writeMem(
      'p',
      '2026-04-09-sess42.md',
      '# raw body only\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    const reader = new ClaudeCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'projects', '*', 'memory', '*.md').replaceAll('\\', '/')],
      since: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('sess42');
  });

  it('returns empty on missing paths without throwing', async () => {
    const reader = new ClaudeCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'does', 'not', 'exist', '*.md').replaceAll('\\', '/')],
      since: null,
    });
    expect(items).toEqual([]);
  });

  it('produces deterministic source digest for unchanged file content', async () => {
    await writeMem(
      'cli-relay-abc',
      'session-001.md',
      '---\nsession: sess001\nproject: cli-relay\n---\n\nPGX rule\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    const reader = new ClaudeCodeMemoryReader();
    const pattern = path.join(root, 'projects', '*', 'memory', '*.md').replaceAll('\\', '/');
    const first = await reader.discover({ paths: [pattern], since: null });
    const second = await reader.discover({ paths: [pattern], since: null });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].sourceDigest).toBe(second[0].sourceDigest);
  });
});
