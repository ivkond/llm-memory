import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { AmpMemoryReader } from '../src/amp-memory-reader.js';

describe('AmpMemoryReader', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'amp-reader-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeDoc(relative: string, body: string, mtime?: Date): Promise<string> {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    if (mtime) await utimes(file, mtime, mtime);
    return file;
  }

  it('discovers AGENTS guidance files from configured explicit paths', async () => {
    const file = await writeDoc(
      'projects/cli-relay/AGENTS.md',
      '---\ntitle: Context\n---\n\nKeep parser strict.\n',
      new Date('2026-04-09T10:00:00Z'),
    );

    const reader = new AmpMemoryReader();
    const items = await reader.discover({ paths: [file], since: null });
    expect(items).toHaveLength(1);
    expect(items[0].agent).toBe('amp');
    expect(items[0].project).toBe('cli-relay');
    expect(items[0].content).toContain('title: Context');
    expect(items[0].content).toContain('Keep parser strict.');
  });

  it('filters out files older than since', async () => {
    const oldFile = await writeDoc(
      'a/AGENTS.md',
      'legacy instructions\n',
      new Date('2026-03-01T00:00:00Z'),
    );
    const newFile = await writeDoc(
      'b/AGENT.md',
      'new instructions\n',
      new Date('2026-04-09T10:00:00Z'),
    );
    const reader = new AmpMemoryReader();
    const items = await reader.discover({ paths: [oldFile, newFile], since: '2026-04-01T00:00:00Z' });
    expect(items).toHaveLength(1);
    expect(items[0].sourcePath).toBe(newFile);
  });

  it('skips empty files and disallowed filenames', async () => {
    const empty = await writeDoc('x/AGENTS.md', '   \n');
    const disallowed = await writeDoc('x/README.md', '# not importable\n');
    const reader = new AmpMemoryReader();
    const items = await reader.discover({ paths: [empty, disallowed], since: null });
    expect(items).toEqual([]);
  });

  it('supports multiple roots and preserves markdown verbatim', async () => {
    const a = await writeDoc('root1/AGENTS.md', '---\nk: v\n---\n\nA\n');
    const b = await writeDoc('root2/CLAUDE.md', '# B\n');
    const reader = new AmpMemoryReader();
    const items = await reader.discover({ paths: [a, b], since: null });
    expect(items).toHaveLength(2);
    const withFrontmatter = items.find((i) => i.sourcePath === a);
    expect(withFrontmatter).toBeDefined();
    const parsed = matter(withFrontmatter!.content);
    expect(parsed.data.k).toBe('v');
    expect(withFrontmatter!.content.startsWith('---')).toBe(true);
  });

  it('ignores remote URLs and hosted thread links', async () => {
    const reader = new AmpMemoryReader();
    const items = await reader.discover({
      paths: ['https://example.com/AGENTS.md', 'https://platform.example/thread/123'],
      since: null,
    });
    expect(items).toEqual([]);
  });

  it('returns empty for missing configured files', async () => {
    const reader = new AmpMemoryReader();
    const missing = path.join(root, 'missing', 'AGENTS.md');
    const items = await reader.discover({ paths: [missing], since: null });
    expect(items).toEqual([]);
  });

  it('rejects glob paths and does not scan directories', async () => {
    await writeDoc('nested/a/AGENTS.md', 'A\n');
    await writeDoc('nested/b/AGENTS.md', 'B\n');
    const reader = new AmpMemoryReader();
    const globPath = path.join(root, 'nested', '**', 'AGENTS.md').replaceAll('\\', '/');
    const items = await reader.discover({ paths: [globPath], since: null });
    expect(items).toEqual([]);
  });
});
