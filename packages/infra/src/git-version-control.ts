import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { IVersionControl, ManagedWorktreeInfo, WorktreeInfo } from '@ivkond-llm-wiki/core';
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
 * On merge conflicts, simple-git surfaces a `GitError` whose message
 * mentions `CONFLICT` — this adapter translates it into the domain-level
 * `GitConflictError` without removing the worktree, so `IngestService` /
 * `LintService` can decide what to do with the in-progress work.
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

    try {
      // simple-git's high-level `merge` throws on conflict. We explicitly
      // request a fast-forward merge; IngestService always squashes first,
      // so the worktree branch is always a linear descendant of main.
      await this.git.merge([branch, '--ff-only']);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/conflict|CONFLICT|not possible to fast-forward|Merge conflict/i.test(message)) {
        throw new GitConflictError(worktreePath, message);
      }
      throw err;
    }

    const sha = await this.git.revparse(['HEAD']);
    return sha.trim();
  }

  async listManagedWorktrees(): Promise<ManagedWorktreeInfo[]> {
    const raw = await this.git.raw(['worktree', 'list', '--porcelain']);
    const blocks = raw
      .trim()
      .split('\n\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const managedRoot = path.resolve(this.repoRoot, '.worktrees') + path.sep;
    const entries: ManagedWorktreeInfo[] = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      const wtPath = lines[0]?.startsWith('worktree ') ? lines[0].slice('worktree '.length) : null;
      if (!wtPath) continue;
      const absPath = path.resolve(wtPath);

      if (!absPath.startsWith(managedRoot)) continue;

      let branch: string | null = null;
      let isPrunable = false;
      for (const line of lines.slice(1)) {
        if (line.startsWith('branch ')) {
          branch = line.slice('branch '.length).replace('refs/heads/', '');
        }
        if (line.startsWith('prunable')) {
          isPrunable = true;
        }
      }

      if (isPrunable) {
        entries.push({ path: absPath, branch, status: 'stale', isManaged: true });
        continue;
      }

      const wtGit = simpleGit(absPath);
      const status = await wtGit.status();
      let classified: ManagedWorktreeInfo['status'] = 'clean';
      if (status.conflicted.length > 0) {
        classified = 'conflicted';
      } else if (!status.isClean()) {
        classified = 'dirty';
      } else if (branch && (await this.isDivergedFromMain(branch))) {
        // Production conflict path can leave the preserved worktree index
        // clean while main rejects `--ff-only` due to branch divergence.
        classified = 'conflicted';
      }

      entries.push({ path: absPath, branch, status: classified, isManaged: true });
    }

    return entries;
  }

  private async isDivergedFromMain(branch: string): Promise<boolean> {
    const baseBranch = await this.resolveMergeBaseBranch();
    if (branch === baseBranch) return false;

    const [mainSha, branchSha, mergeBase] = await Promise.all([
      this.git.revparse([baseBranch]),
      this.git.revparse([branch]),
      this.git.raw(['merge-base', baseBranch, branch]),
    ]);
    const main = mainSha.trim();
    const wt = branchSha.trim();
    const base = mergeBase.trim();

    // True divergence: both branches have unique commits since split.
    return base !== main && base !== wt;
  }

  private async resolveMergeBaseBranch(): Promise<string> {
    try {
      await this.git.revparse(['--verify', 'main']);
      return 'main';
    } catch {
      const head = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return head.trim();
    }
  }
}
