export interface ArchiveEntry {
  /** Absolute path on disk of the source file to include in the archive. */
  sourcePath: string;
}

export interface ArchiveResult {
  /** Absolute path of the produced `.7z` file. */
  archivePath: string;
  /**
   * Count of entries added by THIS call (i.e. `entries.length`). When the
   * call appends to a pre-existing archive, members from earlier calls are
   * NOT included in this number — callers that need the total member count
   * must inspect the archive themselves.
   */
  fileCount: number;
  /** Size of the resulting archive on disk in bytes. */
  bytes: number;
}

export interface IArchiver {
  /**
   * Add `entries` to the compressed archive at `archivePath`, creating the
   * archive on first call and appending to it on subsequent calls.
   *
   * Contract:
   *   - `archivePath` MUST be an absolute path. Relative paths are rejected
   *     by the adapter because their meaning depends on process CWD, which
   *     is unstable across the CLI, MCP server, and test runners.
   *   - **Cumulative semantics.** If a file already exists at `archivePath`,
   *     every member of that existing archive MUST be preserved; `entries`
   *     are merged in alongside them. Adapters MUST NOT silently replace
   *     the archive with a fresh one built from `entries` alone. This is
   *     load-bearing for operational backups: `LintService` groups
   *     verbatim snapshots by calendar month per agent and reuses the same
   *     `YYYY-MM-<agent>.7z` path across multiple lint runs in the same
   *     month. Non-cumulative behaviour would silently drop earlier runs'
   *     snapshots — operational data loss.
   *   - **Atomic replace.** The transition from the old archive (if any)
   *     to the new one MUST be atomic: on any failure no partial file is
   *     left at `archivePath`, and any existing archive at that path is
   *     left untouched. Adapters typically achieve this by staging through
   *     a `<archivePath>.tmp` and renaming on success.
   *   - In-archive layout is determined by the adapter (MVP: node-7z default
   *     layout). Callers that need to locate files inside the archive must
   *     rely on file basename, not on any prescribed sub-path.
   *
   * Throws `ArchiveError` on any I/O or compression failure.
   */
  createArchive(archivePath: string, entries: ArchiveEntry[]): Promise<ArchiveResult>;
}
