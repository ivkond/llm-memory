import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { GitProjectResolver } from '../src/git-project-resolver.js';
import { FsFileStore } from '../src/fs-file-store.js';

describe('GitProjectResolver', () => {
  let tempDir: string;
  let wikiDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-git-'));
    wikiDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-data-'));

    execSync('git init', { cwd: tempDir });
    execSync('git remote add origin https://github.com/test/my-project.git', { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(wikiDir, { recursive: true, force: true });
  });

  it('test_resolve_knownProject_returnsName', async () => {
    const store = new FsFileStore(wikiDir);
    await store.writeFile(
      'projects/my-project/_config.md',
      '---\nname: my-project\ngit_remote: https://github.com/test/my-project.git\n---\n',
    );

    const resolver = new GitProjectResolver(store);
    const name = await resolver.resolve(tempDir);
    expect(name).toBe('my-project');
  });

  it('test_resolve_unknownProject_returnsNull', async () => {
    const store = new FsFileStore(wikiDir);
    const resolver = new GitProjectResolver(store);
    const name = await resolver.resolve(tempDir);
    expect(name).toBeNull();
  });

  it('test_resolve_notGitRepo_returnsNull', async () => {
    const nonGitDir = await mkdtemp(path.join(tmpdir(), 'non-git-fallback'));
    const dirName = path.basename(nonGitDir);
    const store = new FsFileStore(wikiDir);
    await store.writeFile(
      `projects/${dirName}/_config.md`,
      `---\nname: ${dirName}\ngit_remote: ""\n---\n`,
    );
    const resolver = new GitProjectResolver(store);
    const name = await resolver.resolve(nonGitDir);
    expect(name).toBe(dirName);
    await rm(nonGitDir, { recursive: true, force: true });
  });

  it('test_resolve_notGitRepo_noMatchingProject_returnsNull', async () => {
    const nonGitDir = await mkdtemp(path.join(tmpdir(), 'unknown-'));
    const store = new FsFileStore(wikiDir);
    const resolver = new GitProjectResolver(store);
    const name = await resolver.resolve(nonGitDir);
    expect(name).toBeNull();
    await rm(nonGitDir, { recursive: true, force: true });
  });

  it('test_getRemoteUrl_returnsOriginUrl', async () => {
    const store = new FsFileStore(wikiDir);
    const resolver = new GitProjectResolver(store);
    const url = await resolver.getRemoteUrl(tempDir);
    expect(url).toBe('https://github.com/test/my-project.git');
  });
});
