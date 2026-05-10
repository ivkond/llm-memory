import { execSync } from 'node:child_process';
import matter from 'gray-matter';
import type { IProjectResolver, IFileStore } from '@ivkond-llm-wiki/core';

export class GitProjectResolver implements IProjectResolver {
  constructor(private readonly fileStore: IFileStore) {}

  async resolve(cwd: string): Promise<string | null> {
    const remoteUrl = await this.getRemoteUrl(cwd);

    const projects = await this.fileStore.listFiles('projects');
    for (const file of projects) {
      if (!file.path.endsWith('/_config.md')) continue;
      const content = await this.fileStore.readFile(file.path);
      if (!content) continue;
      const { data } = matter(content);

      if (remoteUrl && data.git_remote === remoteUrl) {
        return data.name as string;
      }
    }

    if (!remoteUrl) {
      const dirName = cwd.split(/[/\\]/).filter(Boolean).pop();
      if (dirName) {
        const configExists = await this.fileStore.exists(`projects/${dirName}/_config.md`);
        if (configExists) return dirName;
      }
    }

    return null;
  }

  async getRemoteUrl(cwd: string): Promise<string | null> {
    try {
      const url = execSync('git remote get-url origin', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return url || null;
    } catch {
      return null;
    }
  }
}
