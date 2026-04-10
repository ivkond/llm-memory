import { readFile, writeFile, readdir, stat, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { IFileStore, FileInfo } from '@llm-wiki/core';
import type { WikiPageData } from '@llm-wiki/core';

export class FsFileStore implements IFileStore {
  constructor(private readonly rootDir: string) {}

  async readFile(relativePath: string): Promise<string | null> {
    try {
      return await readFile(path.join(this.rootDir, relativePath), 'utf-8');
    } catch {
      return null;
    }
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.rootDir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  async listFiles(directory: string): Promise<FileInfo[]> {
    const dirPath = path.join(this.rootDir, directory);
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
    try {
      await access(path.join(this.rootDir, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async readWikiPage(relativePath: string): Promise<WikiPageData | null> {
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
