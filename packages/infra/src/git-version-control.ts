import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { IVersionControl, WorktreeInfo } from '@ivkond-llm-wiki/core';
import { GitConflictError } from '@ivkond-llm-wiki/core';

/**
 * IVersionControl adapter backed by simple-git.
 *
 * Worktrees are created under `<repoRoot>/.worktrees/<name>-<timestamp>` on
 * a fresh branch `<name>-<timestamp>` forked from `main`. This keeps each
 * ingest / lint session fully isolated from the main working copy (INV-13)
 * so a failure anywhere in the pipeline can be undone by a single
 * `removeWorktree` call.
 *
 * On non-fast-forward worktree merges, this adapter checks machine-readable
 * git state and translates recoverable divergence into `GitConflictError`
 * without removing the worktree, so `IngestService` / `LintService` can
 * decide what to do with the in-progress work.
 */
export class GitVersionControl implements IVersionControl {
  private readonly git: SimpleGit;

  constructor(private readonly repoRoot: string) {
    this.git = simpleGit(repoRoot);
  }

  async commit(files: string[], message: string): Promise<string> {
    await this.git.add(files);
    const result = await this.git.commit(message, files);
    return result.commit;
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }

  async createWorktree(name: string): Promise<WorktreeInfo> {
    const timestamp = Date.now();
    const branch = `${name}-${timestamp}`;
    // Place worktrees under .worktrees/<name>-<timestamp> relative to the
    // repo root. simple-git forwards path resolution to git, which accepts
    // repo-relative paths.
    const relPath = path.join('.worktrees', `${name}-${timestamp}`);
    const absPath = path.join(this.repoRoot, relPath);

    // Create a new branch forked from main and attach a worktree to it in
    // a single `git worktree add -b` invocation.
    await this.git.raw(['worktree', 'add', '-b', branch, absPath, 'main']);

    return { path: absPath, branch };
  }

  async removeWorktree(worktreePath: string, force = false): Promise<void> {
    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(worktreePath);
    // `git worktree remove` refuses to remove a worktree with uncommitted
    // changes unless --force is passed. Our test for the conflict path uses
    // force=true because the worktree has been mutated but never cleaned up.
    await this.git.raw(args);
  }

  async commitInWorktree(worktreePath: string, files: string[], message: string): Promise<string> {
    const wtGit = simpleGit(worktreePath);
    await wtGit.add(files);
    const result = await wtGit.commit(message, files);
    return result.commit;
  }

  async squashWorktree(worktreePath: string, message: string): Promise<string> {
    const wtGit = simpleGit(worktreePath);
    // Reset soft to `main` (the worktree's fork point) so every commit the
    // worktree added since creation is collapsed into the index, then a
    // single fresh commit seals the squash. This keeps the branch pointer
    // ahead of main by exactly one commit — fast-forwardable by merge.
    await wtGit.raw(['reset', '--soft', 'main']);
    const result = await wtGit.commit(message);
    return result.commit;
  }

  async mergeWorktree(worktreePath: string): Promise<string> {
    // Identify the worktree's branch so we can ask main to merge it.
    const wtGit = simpleGit(worktreePath);
    const branchInfo = await wtGit.revparse(['--abbrev-ref', 'HEAD']);
    const branch = branchInfo.trim();

    // If merge-base(HEAD, branch) is not HEAD, main cannot be fast-forwarded
    // to the worktree branch and we preserve the worktree for recovery.
    const canFastForward = await this.canFastForwardBranch(branch);
    if (!canFastForward) {
      throw new GitConflictError(worktreePath, `Branch "${branch}" is not fast-forwardable into main`);
    }

    await this.git.merge([branch, '--ff-only']);

    const sha = await this.git.revparse(['HEAD']);
    return sha.trim();
  }

  private async canFastForwardBranch(branch: string): Promise<boolean> {
    const head = (await this.git.revparse(['HEAD'])).trim();
    const mergeBase = (await this.git.raw(['merge-base', 'HEAD', branch])).trim();
    return mergeBase === head;
  }
}
