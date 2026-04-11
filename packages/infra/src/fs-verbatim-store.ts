import matter from 'gray-matter';
import { VerbatimEntry } from '@llm-wiki/core';
import type { IVerbatimStore, IFileStore, FileInfo } from '@llm-wiki/core';

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
    const agents = await this.listAgents();
    let count = 0;
    for (const agent of agents) {
      const entries = await this.listUnconsolidated(agent);
      count += entries.length;
    }
    return count;
  }

  async listAgents(): Promise<string[]> {
    const logEntries = await this.fileStore.listFiles('log');
    const agentNames = new Set<string>();
    for (const entry of logEntries) {
      const parts = entry.path.split('/');
      if (parts.length >= 3 && parts[0] === 'log') {
        agentNames.add(parts[1]);
      }
    }
    return [...agentNames].sort((a, b) => a.localeCompare(b));
  }

  async readEntry(filePath: string): Promise<VerbatimEntry | null> {
    const raw = await this.fileStore.readFile(filePath);
    if (raw === null) return null;
    const parsed = matter(raw);
    const filename = filePath.split('/').pop() ?? filePath;
    return VerbatimEntry.fromParsedData(filename, {
      session: String(parsed.data.session ?? ''),
      agent: String(parsed.data.agent ?? ''),
      project: parsed.data.project ? String(parsed.data.project) : undefined,
      tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : undefined,
      consolidated: parsed.data.consolidated === true,
      created: String(parsed.data.created ?? ''),
      content: parsed.content,
    });
  }

  async markConsolidated(filePath: string): Promise<void> {
    const raw = await this.fileStore.readFile(filePath);
    if (raw === null) {
      throw new Error(`Cannot mark consolidated — file not found: ${filePath}`);
    }
    const parsed = matter(raw);
    if (parsed.data.consolidated === true) return;
    const nextFm = { ...parsed.data, consolidated: true };
    const rewritten = matter.stringify(parsed.content, nextFm);
    await this.fileStore.writeFile(filePath, rewritten);
  }
}
