export interface FileInfo {
  path: string;
  updated: string;
}

export interface IFileStore {
  /** Read raw file content. Returns null if not found. */
  readFile(relativePath: string): Promise<string | null>;

  /** Write content to a file. Creates parent dirs if needed. */
  writeFile(relativePath: string, content: string): Promise<void>;

  /** List all markdown files under a directory. */
  listFiles(directory: string): Promise<FileInfo[]>;

  /** Check if a file exists. */
  exists(relativePath: string): Promise<boolean>;

  /** Read and parse a markdown file into WikiPageData. Returns null if not found.
   *  Parsing (gray-matter) is owned by infra — single parser path. */
  readWikiPage(relativePath: string): Promise<import('../domain/wiki-page.js').WikiPageData | null>;
}

/** Factory for building an IFileStore rooted at an arbitrary directory.
 *  Used by IngestService / LintService to write inside a git worktree
 *  without coupling services to any concrete adapter. */
export type FileStoreFactory = (rootDir: string) => IFileStore;
