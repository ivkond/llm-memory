import matter from 'gray-matter';
import { VerbatimEntry } from '@ivkond-llm-wiki/core';
import type { IVerbatimStore, IFileStore, FileInfo } from '@ivkond-llm-wiki/core';

export class FsVerbatimStore implements IVerbatimStore {
  constructor(private readonly fileStore: IFileStore) {}

  async writeEntry(entry: VerbatimEntry): Promise<void> {
    const data = entry.toData();
    const rawFm: Record<string, unknown> = {
      entry_id: data.entry_id,
      session: data.session,
      agent: data.agent,
      source: cleanObject(data.source),
      model: cleanObject(data.model),
      operation_id: data.operation_id,
      processing: cleanObject(data.processing),
      consolidated: data.consolidated,
      created: data.processing?.created_at ?? data.created,
    };
    const fm = Object.fromEntries(Object.entries(rawFm).filter(([, v]) => v !== undefined));
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
      entry_id: parsed.data.entry_id ? String(parsed.data.entry_id) : undefined,
      source:
        parsed.data.source && typeof parsed.data.source === 'object'
          ? {
              type: String((parsed.data.source as Record<string, unknown>).type ?? 'legacy'),
              uri: (parsed.data.source as Record<string, unknown>).uri
                ? String((parsed.data.source as Record<string, unknown>).uri)
                : undefined,
              digest: (parsed.data.source as Record<string, unknown>).digest
                ? String((parsed.data.source as Record<string, unknown>).digest)
                : undefined,
              adapter: (parsed.data.source as Record<string, unknown>).adapter
                ? String((parsed.data.source as Record<string, unknown>).adapter)
                : undefined,
            }
          : undefined,
      model:
        parsed.data.model && typeof parsed.data.model === 'object'
          ? {
              provider: (parsed.data.model as Record<string, unknown>).provider
                ? String((parsed.data.model as Record<string, unknown>).provider)
                : undefined,
              model: (parsed.data.model as Record<string, unknown>).model
                ? String((parsed.data.model as Record<string, unknown>).model)
                : undefined,
              call_id: (parsed.data.model as Record<string, unknown>).call_id
                ? String((parsed.data.model as Record<string, unknown>).call_id)
                : undefined,
              tool_call_id: (parsed.data.model as Record<string, unknown>).tool_call_id
                ? String((parsed.data.model as Record<string, unknown>).tool_call_id)
                : undefined,
            }
          : undefined,
      operation_id: parsed.data.operation_id ? String(parsed.data.operation_id) : undefined,
      processing:
        parsed.data.processing && typeof parsed.data.processing === 'object'
          ? {
              created_at:
                normalizeTimestamp(
                  (parsed.data.processing as Record<string, unknown>).created_at ??
                    parsed.data.created,
                ) ?? '',
              ingested_at: (parsed.data.processing as Record<string, unknown>).ingested_at
                ? String((parsed.data.processing as Record<string, unknown>).ingested_at)
                : undefined,
              imported_at: (parsed.data.processing as Record<string, unknown>).imported_at
                ? String((parsed.data.processing as Record<string, unknown>).imported_at)
                : undefined,
              consolidated_at: (parsed.data.processing as Record<string, unknown>).consolidated_at
                ? String((parsed.data.processing as Record<string, unknown>).consolidated_at)
                : undefined,
              updated_at: (parsed.data.processing as Record<string, unknown>).updated_at
                ? String((parsed.data.processing as Record<string, unknown>).updated_at)
                : undefined,
            }
          : undefined,
      consolidated: parsed.data.consolidated === true,
      created: normalizeTimestamp(parsed.data.created) ?? '',
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
    const processing =
      parsed.data.processing && typeof parsed.data.processing === 'object'
        ? { ...(parsed.data.processing as Record<string, unknown>) }
        : {};
    if (!processing.consolidated_at) {
      processing.consolidated_at = new Date().toISOString();
    }
    const nextFm = { ...parsed.data, consolidated: true, processing };
    const rewritten = matter.stringify(parsed.content, nextFm);
    await this.fileStore.writeFile(filePath, rewritten);
  }
}

function cleanObject<T extends object>(value: T | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
    if (fieldValue !== undefined) {
      cleaned[key] = fieldValue;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
