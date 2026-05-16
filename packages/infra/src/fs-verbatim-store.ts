import matter from 'gray-matter';
import { parseProcessingStatus, VerbatimEntry } from '@ivkond-llm-wiki/core';
import type { IVerbatimStore, IFileStore, FileInfo } from '@ivkond-llm-wiki/core';
import type { ProcessingStatus } from '@ivkond-llm-wiki/core';

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
      processing_status: data.processingStatus,
      consolidated: data.processingStatus === 'consolidated',
      created: data.processing?.created_at ?? data.created,
    };
    const fm = Object.fromEntries(Object.entries(rawFm).filter(([, v]) => v !== undefined));
    if (data.project) fm.project = data.project;
    if (data.tags && data.tags.length > 0) fm.tags = data.tags;

    const content = matter.stringify('\n' + data.content + '\n', fm);
    await this.fileStore.writeFile(entry.filePath, content);
  }

  async listUnconsolidated(agent: string): Promise<FileInfo[]> {
    return this.listByProcessingStatus(agent, ['new', 'seen', 'requires_review', 'failed']);
  }

  async countUnconsolidated(): Promise<number> {
    return this.countByProcessingStatus(['new', 'seen', 'requires_review', 'failed']);
  }

  async listByProcessingStatus(agent: string, statuses: ProcessingStatus[]): Promise<FileInfo[]> {
    const statusSet = new Set(statuses);
    const dir = `log/${agent}/raw`;
    const files = await this.fileStore.listFiles(dir);
    const filtered: FileInfo[] = [];

    for (const file of files) {
      const content = await this.fileStore.readFile(file.path);
      if (!content) continue;
      const { data } = matter(content);
      const status = VerbatimEntry.fromParsedFrontmatterStatus({
        processingStatus: data.processing_status,
        consolidated: data.consolidated,
      });
      if (statusSet.has(status)) filtered.push(file);
    }

    return filtered;
  }

  async countByProcessingStatus(statuses?: ProcessingStatus[]): Promise<number> {
    const effective = statuses ?? [
      'new',
      'seen',
      'consolidated',
      'ignored_low_signal',
      'requires_review',
      'failed',
    ];
    const agents = await this.listAgents();
    let count = 0;
    for (const agent of agents) {
      const entries = await this.listByProcessingStatus(agent, effective);
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
    const processingStatus = VerbatimEntry.fromParsedFrontmatterStatus({
      processingStatus: parsed.data.processing_status,
      consolidated: parsed.data.consolidated,
    });
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
      processingStatus,
      consolidated: processingStatus === 'consolidated',
      created: normalizeTimestamp(parsed.data.created) ?? '',
      content: parsed.content,
    });
  }

  async markConsolidated(filePath: string): Promise<void> {
    await this.markProcessingStatus(filePath, 'consolidated');
  }

  async markProcessingStatus(
    filePath: string,
    status: ProcessingStatus,
    reason?: string,
  ): Promise<void> {
    parseProcessingStatus(status);
    const raw = await this.fileStore.readFile(filePath);
    if (raw === null) {
      throw new Error(`Cannot mark consolidated — file not found: ${filePath}`);
    }
    const parsed = matter(raw);
    const currentStatus = VerbatimEntry.fromParsedFrontmatterStatus({
      processingStatus: parsed.data.processing_status,
      consolidated: parsed.data.consolidated,
    });
    if (currentStatus === status) return;

    const processing =
      parsed.data.processing && typeof parsed.data.processing === 'object'
        ? { ...(parsed.data.processing as Record<string, unknown>) }
        : {};
    processing.updated_at = new Date().toISOString();
    if (status === 'consolidated' && !processing.consolidated_at) {
      processing.consolidated_at = processing.updated_at;
    }

    const nextFm = {
      ...parsed.data,
      processing_status: status,
      consolidated: status === 'consolidated',
      processing,
      ...(reason ? { processing_status_reason: reason } : {}),
    };

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
