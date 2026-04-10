export interface IProjectResolver {
  /**
   * Resolve cwd to a project name.
   * Returns null if the directory is not a git repo or not mapped to any project.
   */
  resolve(cwd: string): Promise<string | null>;

  /**
   * Get the git remote URL for a directory.
   * Returns null if not a git repo.
   */
  getRemoteUrl(cwd: string): Promise<string | null>;
}
