import { readFile, writeFile, readdir, stat, mkdir, access, realpath } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { IFileStore, FileInfo } from '@llm-wiki/core';
import type { WikiPageData } from '@llm-wiki/core';
import { PathEscapeError } from '@llm-wiki/core';

export class FsFileStore implements IFileStore {
  private readonly normalizedRoot: string;
  private canonicalRootCache: string | undefined;

  constructor(private readonly rootDir: string) {
    this.normalizedRoot = path.resolve(rootDir);
  }

  /**
   * Canonical (symlink-resolved) absolute path of the wiki root. Cached on
   * first use because the root itself may legitimately be a symlink
   * (e.g. ~/.llm-wiki → /data/wiki) and must resolve once per instance.
   */
  private async getCanonicalRoot(): Promise<string> {
    if (this.canonicalRootCache === undefined) {
      this.canonicalRootCache = await realpath(this.normalizedRoot);
    }
    return this.canonicalRootCache;
  }

  /**
   * Lexical guard against the obvious escape attempts — `..` segments,
   * absolute paths, sibling-prefix tricks. Runs synchronously against the
   * path.resolve() normalization of rootDir. This is the fast first line
   * of defense; the symlink-aware second line lives in assertUnderRoot().
   */
  private resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.normalizedRoot, relativePath);
    const rootWithSep = this.normalizedRoot.endsWith(path.sep)
      ? this.normalizedRoot
      : this.normalizedRoot + path.sep;
    if (resolved !== this.normalizedRoot && !resolved.startsWith(rootWithSep)) {
      throw new PathEscapeError(relativePath);
    }
    return resolved;
  }

  /**
   * Symlink-aware guard: resolves `absolutePath` through realpath and
   * re-asserts the prefix against the canonical root. Used AFTER the
   * target exists on disk to defend against symlinks placed inside the
   * wiki that point outside of it.
   *
   * Returns the canonical path on success. Returns `null` if the target
   * does not exist (so callers can preserve their current "missing → null"
   * semantics). Throws PathEscapeError on escape, rethrows other errors.
   */
  private async assertUnderRoot(
    absolutePath: string,
    relativePath: string,
  ): Promise<string | null> {
    let canonical: string;
    try {
      canonical = await realpath(absolutePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    const canonicalRoot = await this.getCanonicalRoot();
    const rootWithSep = canonicalRoot.endsWith(path.sep) ? canonicalRoot : canonicalRoot + path.sep;
    if (canonical !== canonicalRoot && !canonical.startsWith(rootWithSep)) {
      throw new PathEscapeError(relativePath);
    }
    return canonical;
  }

  async readFile(relativePath: string): Promise<string | null> {
    const safePath = this.resolveSafePath(relativePath);
    // Resolve any symlinks in the path and re-check the prefix.
    // PathEscapeError propagates up; missing file → null.
    const canonical = await this.assertUnderRoot(safePath, relativePath);
    if (canonical === null) return null;
    try {
      return await readFile(canonical, 'utf-8');
    } catch {
      return null;
    }
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolveSafePath(relativePath);
    const parent = path.dirname(fullPath);
    await mkdir(parent, { recursive: true });
    // Canonicalize the parent directory (must exist after mkdir) and verify
    // it's still under the wiki root. This blocks a pre-planted symlinked
    // ancestor from redirecting writes outside the root.
    const canonicalParent = await this.assertUnderRoot(parent, relativePath);
    if (canonicalParent === null) {
      // mkdir -p always creates the directory, so ENOENT here means something
      // was raced away underneath us — treat it as an escape attempt.
      throw new PathEscapeError(relativePath);
    }
    const canonicalFull = path.join(canonicalParent, path.basename(fullPath));
    // If the target already exists as a symlink pointing outside the root,
    // refuse the write. A nonexistent target is fine — we'll create it.
    const existingCanonical = await this.assertUnderRoot(canonicalFull, relativePath);
    // existingCanonical is either the canonical path of an already-resident
    // file (guaranteed under root by assertUnderRoot) or null (doesn't exist
    // yet — safe to create inside the canonicalized parent).
    const target = existingCanonical ?? canonicalFull;
    await writeFile(target, content, 'utf-8');
  }

  async listFiles(directory: string): Promise<FileInfo[]> {
    const dirPath = this.resolveSafePath(directory);
    const canonicalDir = await this.assertUnderRoot(dirPath, directory);
    if (canonicalDir === null) return [];

    const results: FileInfo[] = [];
    await this.walkDir(canonicalDir, directory, results);

    results.sort((a, b) => {
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    return results;
  }

  private async walkDir(absDir: string, relDir: string, results: FileInfo[]): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip symlinks entirely during enumeration. A symlink with a `.md`
      // suffix could otherwise expose outside-of-root content via a
      // subsequent readFile on the relative path.
      if (entry.isSymbolicLink()) continue;

      const absPath = path.join(absDir, entry.name);
      const relPath = path.join(relDir, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        await this.walkDir(absPath, relPath, results);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stats = await stat(absPath);
        results.push({
          path: relPath,
          updated: stats.mtime.toISOString(),
        });
      }
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const safePath = this.resolveSafePath(relativePath);
    // assertUnderRoot returns null for ENOENT (treat as "not exists") and
    // throws PathEscapeError for canonical paths outside the wiki — propagate.
    const canonical = await this.assertUnderRoot(safePath, relativePath);
    if (canonical === null) return false;
    try {
      await access(canonical);
      return true;
    } catch {
      return false;
    }
  }

  async readWikiPage(relativePath: string): Promise<WikiPageData | null> {
    // Goes through readFile → resolveSafePath + assertUnderRoot, no need
    // to re-validate here.
    const raw = await this.readFile(relativePath);
    if (!raw) return null;
    const { data, content } = matter(raw);
    return {
      frontmatter: {
        title: data.title as string,
        created: data.created as string,
        updated: data.updated as string,
        confidence: (data.confidence as number) ?? 0.5,
        sources: (data.sources as string[]) ?? [],
        supersedes: (data.supersedes as string | null) ?? null,
        tags: (data.tags as string[]) ?? [],
      },
      content: content.trim(),
    };
  }
}
