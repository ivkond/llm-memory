import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { QwenCodeMemoryReader } from '../src/qwen-code-memory-reader.js';

describe('QwenCodeMemoryReader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'qwen-reader-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeMem(
    project: string,
    filename: string,
    body: string,
    mtime?: Date,
    subdir = '',
  ): Promise<string> {
    const dir = path.join(root, 'projects', project, 'memory', subdir);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, filename);
    await writeFile(file, body);
    if (mtime) await utimes(file, mtime, mtime);
    return file;
  }

  function qwenGlob(): string {
    return path.join(root, 'projects', '*', 'memory', '**', '*.md').replaceAll('\\', '/');
  }

  it('discovers markdown and preserves body verbatim including frontmatter', async () => {
    await writeMem(
      'CLI Relay',
      'Session A.md',
      '---\nignored: true\n---\n\n# Header\nvalue\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    const reader = new QwenCodeMemoryReader();
    const items = await reader.discover({ paths: [qwenGlob()], since: null });
    expect(items).toHaveLength(1);
    expect(items[0].agent).toBe('qwen-code');
    expect(items[0].project).toBe('cli-relay');
    expect(items[0].sessionId).toBe('session-a');
    expect(items[0].content).toBe('---\nignored: true\n---\n\n# Header\nvalue\n');
    expect(items[0].mtime).toBe('2026-04-09T10:00:00.000Z');
  });

  it('filters files by since mtime', async () => {
    await writeMem('p', 'old.md', 'old', new Date('2026-03-01T00:00:00Z'));
    await writeMem('p', 'new.md', 'new', new Date('2026-04-10T00:00:00Z'));
    const reader = new QwenCodeMemoryReader();
    const items = await reader.discover({ paths: [qwenGlob()], since: '2026-04-01T00:00:00Z' });
    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toBe('new');
  });

  it('returns empty on missing paths', async () => {
    const reader = new QwenCodeMemoryReader();
    const items = await reader.discover({
      paths: [path.join(root, 'does', 'not', 'exist', '**', '*.md').replaceAll('\\', '/')],
      since: null,
    });
    expect(items).toEqual([]);
  });

  it('skips empty files', async () => {
    await writeMem('p', 'empty.md', ' \n\t\n', new Date('2026-04-10T00:00:00Z'));
    const reader = new QwenCodeMemoryReader();
    const items = await reader.discover({ paths: [qwenGlob()], since: null });
    expect(items).toHaveLength(0);
  });

  it('uses stable fallback sessionId when filename cannot be normalized', async () => {
    await writeMem('project_1', '!!!.md', 'body', new Date('2026-04-10T00:00:00Z'));
    const reader = new QwenCodeMemoryReader();
    const items = await reader.discover({ paths: [qwenGlob()], since: null });
    expect(items).toHaveLength(1);
    expect(items[0].sessionId).toMatch(/^qwen-project_1-/);
  });

  it('discovers files across multiple projects and nested memory paths', async () => {
    await writeMem('alpha', 'a.md', 'A', new Date('2026-04-10T00:00:00Z'), 'sessions/one');
    await writeMem('beta', 'b.md', 'B', new Date('2026-04-10T00:00:00Z'), 'sessions/two');
    const reader = new QwenCodeMemoryReader();
    const items = await reader.discover({ paths: [qwenGlob()], since: null });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.project).sort()).toEqual(['alpha', 'beta']);
  });
});
