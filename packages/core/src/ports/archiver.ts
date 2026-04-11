export interface ArchiveEntry {
  /** Absolute path on disk of the source file to include in the archive. */
  sourcePath: string;
}

export interface ArchiveResult {
  /** Absolute path of the produced `.7z` file. */
  archivePath: string;
  /** Number of files written into the archive. */
  fileCount: number;
  /** Size of the resulting archive on disk in bytes. */
  bytes: number;
}

export interface IArchiver {
  /**
   * Produce a single compressed archive at `archivePath` containing every
   * entry from `entries`.
   *
   * Contract:
   *   - `archivePath` MUST be an absolute path. Relative paths are rejected
   *     by the adapter because their meaning depends on process CWD, which
   *     is unstable across the CLI, MCP server, and test runners.
   *   - The archive MUST be created atomically: on failure no partial file
   *     is left at `archivePath`.
   *   - In-archive layout is determined by the adapter (MVP: node-7z default
   *     layout). Callers that need to locate files inside the archive must
   *     rely on file basename, not on any prescribed sub-path.
   *
   * Throws `ArchiveError` on any I/O or compression failure.
   */
  createArchive(archivePath: string, entries: ArchiveEntry[]): Promise<ArchiveResult>;
}
