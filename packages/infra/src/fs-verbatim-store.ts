import matter from 'gray-matter';
import type { IVerbatimStore, IFileStore, FileInfo } from '@llm-wiki/core';
import type { VerbatimEntry } from '@llm-wiki/core';

export class FsVerbatimStore implements IVerbatimStore {
  constructor(private readonly fileStore: IFileStore) {}

  async writeEntry(entry: VerbatimEntry): Promise<void> {
    const data = entry.toData();
    const fm: Record<string, unknown> = {
      session: data.session,
      agent: data.agent,
      consolidated: data.consolidated,
      created: data.created,
    };
    if (data.project) fm.project = data.project;
    if (data.tags && data.tags.length > 0) fm.tags = data.tags;

    const content = matter.stringify('\n' + data.content + '\n', fm);
    await this.fileStore.writeFile(entry.filePath, content);
  }

  async listUnconsolidated(agent: string): Promise<FileInfo[]> {
    const dir = `log/${agent}/raw`;
    const files = await this.fileStore.listFiles(dir);
    const unconsolidated: FileInfo[] = [];

    for (const file of files) {
      const content = await this.fileStore.readFile(file.path);
      if (content) {
        const { data } = matter(content);
        if (data.consolidated === false) {
          unconsolidated.push(file);
        }
      }
    }

    return unconsolidated;
  }

  async countUnconsolidated(): Promise<number> {
    const logEntries = await this.fileStore.listFiles('log');
    const agentNames = new Set<string>();
    for (const entry of logEntries) {
      const parts = entry.path.split('/');
      if (parts.length >= 3 && parts[0] === 'log') {
        agentNames.add(parts[1]);
      }
    }

    let count = 0;
    for (const agent of agentNames) {
      const entries = await this.listUnconsolidated(agent);
      count += entries.length;
    }
    return count;
  }
}
