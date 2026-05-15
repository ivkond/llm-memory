export interface WorktreeInfo {
  path: string;
  branch: string;
}

export interface IVersionControl {
  /** Commit specific files with a message. */
  commit(files: string[], message: string): Promise<string>;

  /** Check for uncommitted changes. */
  hasUncommittedChanges(): Promise<boolean>;

  /** Create a git worktree for isolated operations. */
  createWorktree(name: string): Promise<WorktreeInfo>;

  /** Remove a git worktree. */
  removeWorktree(path: string, force?: boolean): Promise<void>;

  /** Squash all commits in worktree into one. */
  squashWorktree(worktreePath: string, message: string): Promise<string>;

  /** Merge worktree branch into main. Returns commit SHA or throws GitConflictError. */
  mergeWorktree(worktreePath: string): Promise<string>;

  /** Add specific changes in a worktree and commit. */
  commitInWorktree(worktreePath: string, files: string[], message: string): Promise<string>;

  /** List tracked files in the repository, optionally constrained by git pathspec patterns. */
  listTrackedFiles(patterns?: string[]): Promise<string[]>;
}
