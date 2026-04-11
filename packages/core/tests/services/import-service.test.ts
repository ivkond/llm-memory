import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportService } from '../../src/services/import-service.js';
import { AgentMemoryItem } from '../../src/domain/agent-memory-item.js';
import { ImportReaderNotRegisteredError } from '../../src/domain/errors.js';
import { EMPTY_RUNTIME_STATE, type WikiRuntimeState } from '../../src/domain/runtime-state.js';
import type {
  IAgentMemoryReader,
  IVerbatimStore,
  IStateStore,
  AgentMemoryDiscoveryOptions,
  FileInfo,
} from '../../src/ports/index.js';
import type { VerbatimEntry } from '../../src/domain/verbatim-entry.js';

class FakeReader implements IAgentMemoryReader {
  public readonly agent: string;
  public items: AgentMemoryItem[] = [];
  public shouldThrow: Error | null = null;
  public discoverSpy = vi.fn<(o: AgentMemoryDiscoveryOptions) => void>();

  constructor(agent: string) {
    this.agent = agent;
  }

  async discover(options: AgentMemoryDiscoveryOptions): Promise<AgentMemoryItem[]> {
    this.discoverSpy(options);
    if (this.shouldThrow) throw this.shouldThrow;
    return this.items;
  }
}

class FakeVerbatimStore implements IVerbatimStore {
  public written: VerbatimEntry[] = [];
  private byPath: Map<string, VerbatimEntry> = new Map();
  async writeEntry(e: VerbatimEntry): Promise<void> {
    this.written.push(e);
    this.byPath.set(e.filePath, e);
  }
  async listUnconsolidated(): Promise<FileInfo[]> {
    return [];
  }
  async countUnconsolidated(): Promise<number> {
    return 0;
  }
  async listAgents(): Promise<string[]> {
    return [];
  }
  async readEntry(filePath: string): Promise<VerbatimEntry | null> {
    return this.byPath.get(filePath) ?? null;
  }
  async markConsolidated(): Promise<void> {}
}

class FakeStateStore implements IStateStore {
  private state: WikiRuntimeState = { ...EMPTY_RUNTIME_STATE };
  async load(): Promise<WikiRuntimeState> {
    return this.state;
  }
  async save(s: WikiRuntimeState): Promise<void> {
    this.state = s;
  }
  async update(p: Partial<WikiRuntimeState>): Promise<WikiRuntimeState> {
    this.state = { ...this.state, ...p };
    return this.state;
  }
}

describe('ImportService', () => {
  let verbatim: FakeVerbatimStore;
  let state: FakeStateStore;
  let readerA: FakeReader;
  let readerB: FakeReader;
  let configs: Record<string, { enabled: boolean; paths: string[] }>;

  beforeEach(() => {
    verbatim = new FakeVerbatimStore();
    state = new FakeStateStore();
    readerA = new FakeReader('claude-code');
    readerB = new FakeReader('cursor');
    configs = {
      'claude-code': { enabled: true, paths: ['~/.claude/projects'] },
      cursor: { enabled: true, paths: ['~/.cursor'] },
    };
  });

  it('writes VerbatimEntries from each enabled reader and stamps state', async () => {
    readerA.items = [
      AgentMemoryItem.create({
        agent: 'claude-code',
        sourcePath: '/a/mem.md',
        sessionId: 'sess1',
        project: 'cli-relay',
        content: 'fact',
        mtime: '2026-04-09T10:00:00Z',
      }),
    ];
    readerB.items = [
      AgentMemoryItem.create({
        agent: 'cursor',
        sourcePath: '/b/mem.md',
        sessionId: 'sess2',
        content: 'other fact',
        mtime: '2026-04-09T11:00:00Z',
      }),
    ];
    const service = new ImportService({
      readers: new Map([
        ['claude-code', readerA],
        ['cursor', readerB],
      ]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: configs,
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const result = await service.importAll({});

    expect(result.agents).toHaveLength(2);
    expect(verbatim.written).toHaveLength(2);
    const agents = result.agents.map((a) => a.agent).sort();
    expect(agents).toEqual(['claude-code', 'cursor']);
    const reloaded = await state.load();
    expect(reloaded.imports['claude-code'].last_import).toBe('2026-04-10T12:00:00.000Z');
    expect(reloaded.imports['cursor'].last_import).toBe('2026-04-10T12:00:00.000Z');
  });

  it('passes last_import as `since` to each reader', async () => {
    await state.update({
      imports: {
        'claude-code': { last_import: '2026-04-01T00:00:00Z' },
        cursor: { last_import: null },
      },
    });
    const service = new ImportService({
      readers: new Map([
        ['claude-code', readerA],
        ['cursor', readerB],
      ]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: configs,
      now: () => new Date(),
    });
    await service.importAll({});
    expect(readerA.discoverSpy).toHaveBeenCalledWith({
      paths: ['~/.claude/projects'],
      since: '2026-04-01T00:00:00Z',
    });
    expect(readerB.discoverSpy).toHaveBeenCalledWith({
      paths: ['~/.cursor'],
      since: null,
    });
  });

  it('skips disabled agents', async () => {
    configs['cursor'].enabled = false;
    const service = new ImportService({
      readers: new Map([
        ['claude-code', readerA],
        ['cursor', readerB],
      ]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: configs,
      now: () => new Date(),
    });
    await service.importAll({});
    expect(readerB.discoverSpy).not.toHaveBeenCalled();
  });

  it('records per-agent failure without aborting other agents', async () => {
    readerA.shouldThrow = new Error('fs broke');
    readerB.items = [
      AgentMemoryItem.create({
        agent: 'cursor',
        sourcePath: '/b/mem.md',
        sessionId: 'sess2',
        content: 'ok',
        mtime: '2026-04-09T11:00:00Z',
      }),
    ];
    const service = new ImportService({
      readers: new Map([
        ['claude-code', readerA],
        ['cursor', readerB],
      ]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: configs,
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const result = await service.importAll({});

    const aResult = result.agents.find((a) => a.agent === 'claude-code')!;
    expect(aResult.error).toMatch(/fs broke/);
    expect(aResult.imported).toBe(0);

    const bResult = result.agents.find((a) => a.agent === 'cursor')!;
    expect(bResult.error).toBeUndefined();
    expect(bResult.imported).toBe(1);

    const reloaded = await state.load();
    expect(reloaded.imports['cursor'].last_import).toBe('2026-04-10T12:00:00.000Z');
    expect(reloaded.imports['claude-code']?.last_import ?? null).toBeNull();
  });

  it('is rerun-idempotent: same items skip on second sweep, imports 0 new', async () => {
    const item = AgentMemoryItem.create({
      agent: 'claude-code',
      sourcePath: '/a/mem.md',
      sessionId: 'sess1',
      content: 'fact',
      mtime: '2026-04-09T10:00:00Z',
    });
    readerA.items = [item];
    const service = new ImportService({
      readers: new Map([['claude-code', readerA]]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: { 'claude-code': { enabled: true, paths: ['~/.claude'] } },
      now: () => new Date('2026-04-10T12:00:00Z'),
    });

    const first = await service.importAll({});
    expect(first.agents[0].imported).toBe(1);
    expect(first.agents[0].skipped).toBe(0);
    expect(verbatim.written).toHaveLength(1);

    const second = await service.importAll({});
    expect(second.agents[0].imported).toBe(0);
    expect(second.agents[0].skipped).toBe(1);
    expect(verbatim.written).toHaveLength(1);
  });

  it('throws ImportReaderNotRegisteredError when agent filter hits an unknown agent', async () => {
    const service = new ImportService({
      readers: new Map([['claude-code', readerA]]),
      verbatimStore: verbatim,
      stateStore: state,
      agentConfigs: { 'claude-code': { enabled: true, paths: [] } },
      now: () => new Date(),
    });
    await expect(service.importAll({ agents: ['ghost'] })).rejects.toBeInstanceOf(
      ImportReaderNotRegisteredError,
    );
  });
});
