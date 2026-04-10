export interface IVersionControl {
  /** Commit specific files with a message. */
  commit(files: string[], message: string): Promise<string>;

  /** Check for uncommitted changes. */
  hasUncommittedChanges(): Promise<boolean>;
}
