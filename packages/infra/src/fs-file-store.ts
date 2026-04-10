import { readFile, writeFile, readdir, stat, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { IFileStore, FileInfo } from '@llm-wiki/core';
import type { WikiPageData } from '@llm-wiki/core';
import { PathEscapeError } from '@llm-wiki/core';

export class FsFileStore implements IFileStore {
  private readonly normalizedRoot: string;

  constructor(private readonly rootDir: string) {
    this.normalizedRoot = path.resolve(rootDir);
  }

  /**
   * Resolve a user-provided relative path under rootDir and reject any value
   * that would escape the wiki root (e.g. '..' segments, absolute paths,
   * mixed separators). Returns the resolved absolute path on success.
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

  async readFile(relativePath: string): Promise<string | null> {
    const safePath = this.resolveSafePath(relativePath);
    try {
      return await readFile(safePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolveSafePath(relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  async listFiles(directory: string): Promise<FileInfo[]> {
    const dirPath = this.resolveSafePath(directory);
    try {
      await access(dirPath);
    } catch {
      return [];
    }

    const results: FileInfo[] = [];
    await this.walkDir(dirPath, directory, results);

    results.sort((a, b) => {
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    return results;
  }

  private async walkDir(absDir: string, relDir: string, results: FileInfo[]): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const relPath = path.join(relDir, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        await this.walkDir(absPath, relPath, results);
      } else if (entry.name.endsWith('.md')) {
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
    try {
      await access(safePath);
      return true;
    } catch {
      return false;
    }
  }

  async readWikiPage(relativePath: string): Promise<WikiPageData | null> {
    // Goes through readFile → resolveSafePath, no need to re-validate here.
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
