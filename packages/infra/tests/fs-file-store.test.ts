import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsFileStore } from '../src/fs-file-store.js';
import { PathEscapeError } from '@llm-wiki/core';

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

  describe('path traversal defense', () => {
    it('test_readFile_parentEscape_throwsPathEscape', async () => {
      await expect(store.readFile('../outside.md')).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('test_readFile_deepParentEscape_throwsPathEscape', async () => {
      await expect(store.readFile('wiki/../../../etc/passwd')).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('test_readFile_absolutePath_throwsPathEscape', async () => {
      await expect(store.readFile('/etc/passwd')).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('test_writeFile_parentEscape_throwsPathEscape', async () => {
      await expect(store.writeFile('../pwned.md', 'x')).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('test_exists_parentEscape_throwsPathEscape', async () => {
      await expect(store.exists('../outside.md')).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('test_listFiles_parentEscape_throwsPathEscape', async () => {
      await expect(store.listFiles('../')).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('test_readWikiPage_parentEscape_throwsPathEscape', async () => {
      await expect(store.readWikiPage('../outside.md')).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('test_readFile_siblingPrefixAttack_throwsPathEscape', async () => {
      // If rootDir is /tmp/llm-wiki-test-abc, a relative path like
      // '../llm-wiki-test-abc-other/file.md' would resolve to a sibling
      // directory that shares the prefix — must still be rejected.
      const sibling = path.basename(tempDir) + '-other/file.md';
      await expect(store.readFile(`../${sibling}`)).rejects.toBeInstanceOf(PathEscapeError);
    });

    it('test_writeFile_normalNestedPath_stillWorks', async () => {
      // Defense must not break legitimate nested writes.
      await store.writeFile('wiki/concepts/safe.md', '# safe');
      expect(await store.readFile('wiki/concepts/safe.md')).toBe('# safe');
    });
  });
});
