import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { GitVersionControl } from '../src/git-version-control.js';
import { GitConflictError } from '@ivkond-llm-wiki/core';

/**
 * Real git repos in mkdtemp directories. Initial commit is seeded in
 * beforeEach so HEAD always exists. simple-git is driven through the
 * production code path — no mocks.
 */
describe('GitVersionControl', () => {
  let repo: string;
  let vcs: GitVersionControl;

  beforeEach(async () => {
    repo = await mkdtemp(path.join(tmpdir(), 'llm-wiki-git-'));
    execSync('git init -q -b main', { cwd: repo });
    execSync('git config user.email test@example.com', { cwd: repo });
    execSync('git config user.name Test', { cwd: repo });
    // Disable commit signing inside this temp repo only. The outer
    // environment may enforce signing globally; these ephemeral test repos
    // never leave tmpdir and never get pushed, so local-config overrides
    // are the correct scope.
    execSync('git config commit.gpgsign false', { cwd: repo });
    execSync('git config tag.gpgsign false', { cwd: repo });
    await writeFile(path.join(repo, 'README.md'), '# Seed\n');
    // The adapter places worktrees at .worktrees/<name>-<ts> inside the
    // main repo. Without a .gitignore entry, git status in the main worktree
    // would report the nested worktree directory as untracked. Adding the
    // entry to the seed commit keeps hasUncommittedChanges() accurate.
    await writeFile(path.join(repo, '.gitignore'), '.worktrees/\n');
    execSync('git add README.md .gitignore && git commit -q -m seed', { cwd: repo });
    vcs = new GitVersionControl(repo);
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it('test_commit_createsCommitWithMessage', async () => {
    await writeFile(path.join(repo, 'a.md'), 'a');
    const sha = await vcs.commit(['a.md'], ':memo: add a');
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    const log = execSync('git log -1 --pretty=%s', { cwd: repo, encoding: 'utf-8' }).trim();
    expect(log).toBe(':memo: add a');
  });

  it('test_hasUncommittedChanges_detectsWorkingTreeChanges', async () => {
    expect(await vcs.hasUncommittedChanges()).toBe(false);
    await writeFile(path.join(repo, 'dirty.md'), 'x');
    expect(await vcs.hasUncommittedChanges()).toBe(true);
  });

  it('test_createWorktree_returnsInfoAndDirectoryExists', async () => {
    const info = await vcs.createWorktree('ingest');
    expect(info.path).toMatch(/[/\\]\.worktrees[/\\]ingest-/);
    expect(info.branch).toMatch(/ingest-/);
    // The worktree directory must be a real checkout with git metadata
    execSync('git status', { cwd: info.path });
    await vcs.removeWorktree(info.path);
  });

  it('test_commitInWorktree_createsCommitIsolatedFromMain', async () => {
    const info = await vcs.createWorktree('ingest');
    await writeFile(path.join(info.path, 'isolated.md'), 'x');
    const sha = await vcs.commitInWorktree(info.path, ['isolated.md'], ':memo: isolated');
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    // Main branch working tree must be untouched
    expect(await vcs.hasUncommittedChanges()).toBe(false);
    const mainLog = execSync('git log main --pretty=%s', { cwd: repo, encoding: 'utf-8' });
    expect(mainLog).not.toContain('isolated');
    await vcs.removeWorktree(info.path);
  });

  it('test_squashWorktree_collapsesMultipleCommitsIntoOne', async () => {
    const info = await vcs.createWorktree('ingest');
    await writeFile(path.join(info.path, '1.md'), '1');
    await vcs.commitInWorktree(info.path, ['1.md'], 'first');
    await writeFile(path.join(info.path, '2.md'), '2');
    await vcs.commitInWorktree(info.path, ['2.md'], 'second');

    await vcs.squashWorktree(info.path, ':memo: squashed');
    const log = execSync(`git log ${info.branch} --pretty=%s`, { cwd: repo, encoding: 'utf-8' })
      .trim()
      .split('\n');
    // Only squashed commit + the seed commit from main
    expect(log[0]).toBe(':memo: squashed');
    expect(log).toHaveLength(2);
    await vcs.removeWorktree(info.path);
  });

  it('test_mergeWorktree_fastForwardMergesToMain', async () => {
    const info = await vcs.createWorktree('ingest');
    await writeFile(path.join(info.path, 'merged.md'), 'x');
    await vcs.commitInWorktree(info.path, ['merged.md'], ':memo: merged');
    const sha = await vcs.mergeWorktree(info.path);
    expect(sha).toMatch(/^[0-9a-f]{7,}$/);
    // File now present on main
    const mainLog = execSync('git log main --pretty=%s', { cwd: repo, encoding: 'utf-8' });
    expect(mainLog).toContain(':memo: merged');
    await vcs.removeWorktree(info.path);
  });

  it('test_mergeWorktree_conflict_throwsGitConflictError_preservesWorktree', async () => {
    // Fork the worktree FIRST, then make divergent commits on both sides so
    // neither branch is a linear descendant of the other. `--ff-only` then
    // refuses the merge and we expect a GitConflictError.
    const info = await vcs.createWorktree('ingest');

    await writeFile(path.join(repo, 'conflict.md'), 'main-version');
    await vcs.commit(['conflict.md'], 'main change');

    await writeFile(path.join(info.path, 'conflict.md'), 'worktree-version');
    await vcs.commitInWorktree(info.path, ['conflict.md'], 'worktree change');

    await expect(vcs.mergeWorktree(info.path)).rejects.toBeInstanceOf(GitConflictError);
    // Worktree preserved for manual recovery
    execSync('git status', { cwd: info.path });
    await vcs.removeWorktree(info.path, true);
  });

  it('test_removeWorktree_cleansUpDirectory', async () => {
    const info = await vcs.createWorktree('ingest');
    await vcs.removeWorktree(info.path);
    expect(() => execSync('git status', { cwd: info.path })).toThrow();
  });

  it('test_listTrackedFiles_preservesExactPathSpacing', async () => {
    const exactPath = 'wiki/ spaced-file .md';
    await mkdir(path.join(repo, 'wiki'), { recursive: true });
    await writeFile(path.join(repo, exactPath), 'x');
    await vcs.commit([exactPath], 'add spaced file');

    const tracked = await vcs.listTrackedFiles(['wiki/*.md']);
    expect(tracked).toContain(exactPath);
  });
});
