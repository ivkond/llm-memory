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
    this.idGen =
      deps.idGenerator ?? ((item) => ImportService.stableHash(`${item.sourcePath}|${item.mtime}`));
  }

  async importAll(req: ImportRequest): Promise<ImportResponse> {
    const selected = this.resolveAgents(req.agents);

    const state = await this.deps.stateStore.load();
    const results: AgentImportResult[] = [];
    const stateUpdates: Record<string, { last_import: string }> = {};

    for (const agent of selected) {
      const config = this.deps.agentConfigs[agent];
      if (!config || !config.enabled) continue;
      const reader = this.deps.readers.get(agent);
      if (!reader) continue;
      const since = state.imports[agent]?.last_import ?? null;

      try {
        const items = await reader.discover({ paths: config.paths, since });
        let imported = 0;
        let skipped = 0;
        for (const item of items) {
          const entry = this.toVerbatim(item);
          const existing = await this.deps.verbatimStore.readEntry(entry.filePath);
          if (existing !== null) {
            skipped++;
            continue;
          }
          await this.deps.verbatimStore.writeEntry(entry);
          imported++;
        }
        results.push({ agent, discovered: items.length, imported, skipped });
        stateUpdates[agent] = { last_import: this.now().toISOString() };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ agent, discovered: 0, imported: 0, skipped: 0, error: message });
      }
    }

    if (Object.keys(stateUpdates).length > 0) {
      await this.deps.stateStore.update({
        imports: { ...state.imports, ...stateUpdates },
      });
    }

    return { agents: results };
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
    return [...this.deps.readers.keys()].sort();
  }

  private toVerbatim(item: AgentMemoryItem): VerbatimEntry {
    const createdAt = new Date(item.mtime);
    return VerbatimEntry.create({
      content: item.content,
      agent: item.agent,
      sessionId: item.sessionId,
      project: item.project,
      createdAt,
      idGenerator: () => this.idGen(item),
    });
  }

  private static stableHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
