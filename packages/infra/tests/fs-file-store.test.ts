import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsFileStore } from '../src/fs-file-store.js';

describe('FsFileStore', () => {
  let tempDir: string;
  let store: FsFileStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-test-'));
    store = new FsFileStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('test_writeFile_then_readFile_returnsContent', async () => {
    await store.writeFile('wiki/test.md', '# Hello');
    const content = await store.readFile('wiki/test.md');
    expect(content).toBe('# Hello');
  });

  it('test_readFile_nonExistent_returnsNull', async () => {
    const content = await store.readFile('does/not/exist.md');
    expect(content).toBeNull();
  });

  it('test_writeFile_createsParentDirs', async () => {
    await store.writeFile('deep/nested/dir/file.md', 'content');
    const content = await store.readFile('deep/nested/dir/file.md');
    expect(content).toBe('content');
  });

  it('test_listFiles_returnsSortedByMtimeDesc', async () => {
    await store.writeFile('wiki/old.md', '---\nupdated: 2026-01-01\n---\nold');
    await new Promise(r => setTimeout(r, 50));
    await store.writeFile('wiki/new.md', '---\nupdated: 2026-04-01\n---\nnew');

    const files = await store.listFiles('wiki');
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('wiki/new.md');
    expect(files[1].path).toBe('wiki/old.md');
  });

  it('test_listFiles_emptyDir_returnsEmpty', async () => {
    const files = await store.listFiles('nonexistent');
    expect(files).toEqual([]);
  });

  it('test_exists_existingFile_returnsTrue', async () => {
    await store.writeFile('test.md', 'content');
    expect(await store.exists('test.md')).toBe(true);
  });

  it('test_exists_missingFile_returnsFalse', async () => {
    expect(await store.exists('missing.md')).toBe(false);
  });

  it('test_readWikiPage_parsesMarkdownFrontmatter', async () => {
    await store.writeFile('wiki/test.md', '---\ntitle: Test\nupdated: 2026-04-09\nconfidence: 0.9\nsources: []\nsupersedes: null\ntags: []\n---\n\n## Summary\n\nContent here.');
    const data = await store.readWikiPage('wiki/test.md');
    expect(data).not.toBeNull();
    expect(data!.frontmatter.title).toBe('Test');
    expect(data!.frontmatter.confidence).toBe(0.9);
    expect(data!.content).toContain('Content here.');
  });

  it('test_readWikiPage_nonExistent_returnsNull', async () => {
    const data = await store.readWikiPage('missing.md');
    expect(data).toBeNull();
  });
});
