import { ImportReaderNotRegisteredError } from '../domain/errors.js';
import { VerbatimEntry } from '../domain/verbatim-entry.js';
import type { AgentMemoryItem } from '../domain/agent-memory-item.js';
import type { IAgentMemoryReader } from '../ports/agent-memory-reader.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { IStateStore } from '../ports/state-store.js';

export interface AgentConfig {
  enabled: boolean;
  paths: string[];
}

export interface ImportRequest {
  agents?: string[];
}

export interface AgentImportResult {
  agent: string;
  discovered: number;
  imported: number;
  skipped: number;
  error?: string;
}

export interface ImportResponse {
  agents: AgentImportResult[];
}

export interface ImportServiceDeps {
  readers: Map<string, IAgentMemoryReader>;
  verbatimStore: IVerbatimStore;
  stateStore: IStateStore;
  agentConfigs: Record<string, AgentConfig>;
  now?: () => Date;
  idGenerator?: (item: AgentMemoryItem) => string;
}

export class ImportService {
  private readonly now: () => Date;
  private readonly idGen: (item: AgentMemoryItem) => string;

  constructor(private readonly deps: ImportServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.idGen = deps.idGenerator ?? ((item) => this.stableIdentity(item));
  }

  async importAll(req: ImportRequest): Promise<ImportResponse> {
    const selected = this.resolveAgents(req.agents);

    const state = await this.deps.stateStore.load();
    const results: AgentImportResult[] = [];
    const stateUpdates: Record<string, { last_import: string }> = {};

    for (const agent of selected) {
      const reader = this.readerForEnabledAgent(agent);
      if (!reader) continue;
      const config = this.deps.agentConfigs[agent];
      const since = state.imports[agent]?.last_import ?? null;
      const result = await this.sweepAgent(agent, reader, config.paths, since);
      results.push(result);
      if (!result.error) {
        stateUpdates[agent] = { last_import: this.now().toISOString() };
      }
    }

    if (Object.keys(stateUpdates).length > 0) {
      await this.deps.stateStore.update({
        imports: { ...state.imports, ...stateUpdates },
      });
    }

    return { agents: results };
  }

  private readerForEnabledAgent(agent: string): IAgentMemoryReader | null {
    const config = this.deps.agentConfigs[agent];
    if (!config?.enabled) return null;
    return this.deps.readers.get(agent) ?? null;
  }

  private async sweepAgent(
    agent: string,
    reader: IAgentMemoryReader,
    paths: string[],
    since: string | null,
  ): Promise<AgentImportResult> {
    try {
      const items = await reader.discover({ paths, since });
      let imported = 0;
      let skipped = 0;
      for (const item of items) {
        if (item.agent !== agent) {
          skipped++;
          continue;
        }
        let entry: VerbatimEntry;
        try {
          entry = this.toVerbatim(agent, item);
        } catch {
          skipped++;
          continue;
        }
        if (!this.isAllowedImportFilePath(entry.filePath, agent)) {
          skipped++;
          continue;
        }
        const existing = await this.deps.verbatimStore.readEntry(entry.filePath);
        if (existing !== null) {
          skipped++;
          continue;
        }
        await this.deps.verbatimStore.writeEntry(entry);
        imported++;
      }
      return { agent, discovered: items.length, imported, skipped };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { agent, discovered: 0, imported: 0, skipped: 0, error: message };
    }
  }

  private resolveAgents(filter?: string[]): string[] {
    if (filter && filter.length > 0) {
      for (const agent of filter) {
        if (!this.deps.readers.has(agent)) {
          throw new ImportReaderNotRegisteredError(agent);
        }
      }
      return filter;
    }
    return [...this.deps.readers.keys()].sort((a, b) => a.localeCompare(b));
  }

  private toVerbatim(agent: string, item: AgentMemoryItem): VerbatimEntry {
    const createdAt = item.mtime ? new Date(item.mtime) : this.now();
    const digest =
      item.sourceDigest ??
      ImportService.stableHash(`${item.sourceUri}|${item.mtime ?? ''}|${item.content}`);
    return VerbatimEntry.create({
      content: item.content,
      agent,
      sessionId: item.sessionId,
      project: item.project,
      createdAt,
      idGenerator: () => this.idGen(item),
      source: {
        type: 'import',
        uri: item.sourceUri,
        digest,
        adapter: item.sourceType,
      },
      processing: {
        imported_at: this.now().toISOString(),
      },
    });
  }

  private stableIdentity(item: AgentMemoryItem): string {
    if (item.sourceDigest) {
      return ImportService.stableHash(`${item.sourceUri}|${item.sourceDigest}`);
    }
    return ImportService.stableHash(`${item.sourceUri}|${item.mtime ?? ''}`);
  }

  private isAllowedImportFilePath(filePath: string, agent: string): boolean {
    const expectedPrefix = `log/${agent}/raw/`;
    if (!filePath.startsWith(expectedPrefix)) return false;
    if (filePath.includes('/../') || filePath.includes('\\')) return false;
    if (filePath.startsWith('wiki/') || filePath.startsWith('projects/')) return false;
    return true;
  }

  private static stableHash(input: string): string {
    let hash = 0;
    for (const cp of input) {
      hash = Math.trunc((hash << 5) - hash + (cp.codePointAt(0) ?? 0));
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
