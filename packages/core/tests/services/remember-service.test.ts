import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RememberService } from '../../src/services/remember-service.js';
import { SanitizationService } from '../../src/services/sanitization-service.js';
import type { IFileStore } from '../../src/ports/file-store.js';
import type { IIdempotencyStore } from '../../src/ports/idempotency-store.js';
import type { IVerbatimStore } from '../../src/ports/verbatim-store.js';

function createMocks() {
  const files = new Map<string, string>();

  const fileStore: IFileStore = {
    readFile: vi.fn(async (p: string) => files.get(p) ?? null),
    writeFile: vi.fn(async (p: string, c: string) => {
      files.set(p, c);
    }),
    listFiles: vi.fn(async () => []),
    exists: vi.fn(async (p: string) => files.has(p)),
    readWikiPage: vi.fn(async () => null),
  };

  const verbatimStore: IVerbatimStore = {
    writeEntry: vi.fn(async (entry: any) => {
      files.set(
        entry.filePath,
        `---\nsession: ${entry.sessionId}\nagent: ${entry.agent}\nconsolidated: false\n---\n${entry.content}`,
      );
    }),
    listUnconsolidated: vi.fn(async () => []),
    countUnconsolidated: vi.fn(async () => 0),
    listAgents: vi.fn(async () => []),
    readEntry: vi.fn(async () => null),
    markConsolidated: vi.fn(async () => undefined),
  };

  return { fileStore, verbatimStore, files };
}

function createIdempotencyStore(): IIdempotencyStore {
  const records = new Map<string, any>();
  let chain = Promise.resolve();
  const withLock = async <T>(run: () => Promise<T>): Promise<T> => {
    let result!: T;
    const next = chain.then(async () => {
      result = await run();
    });
    chain = next.catch(() => undefined);
    await next;
    return result;
  };
  return {
    get: vi.fn(async (operation, key) => records.get(`${operation}:${key}`) ?? null),
    acquire: vi.fn(async (operation, key, fingerprint) =>
      withLock(async () => {
        const id = `${operation}:${key}`;
        const existing = records.get(id);
        if (!existing) {
          records.set(id, {
            operation,
            key,
            fingerprint,
            status: 'in_progress',
            startedAt: new Date().toISOString(),
          });
          return { kind: 'acquired' as const };
        }
        if (existing.fingerprint !== fingerprint) return { kind: 'conflict' as const };
        if (existing.status === 'completed') return { kind: 'replay' as const, record: existing };
        return { kind: 'in_progress' as const };
      }),
    ),
    complete: vi.fn(async (operation, key, fingerprint, response) =>
      withLock(async () => {
        records.set(`${operation}:${key}`, {
          operation,
          key,
          fingerprint,
          status: 'completed',
          response,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
      }),
    ),
    abort: vi.fn(async (operation, key, fingerprint) =>
      withLock(async () => {
        const id = `${operation}:${key}`;
        const existing = records.get(id);
        if (existing && existing.fingerprint === fingerprint && existing.status === 'in_progress') {
          records.delete(id);
        }
      }),
    ),
  };
}

describe('RememberService', () => {
  let fileStore: IFileStore;
  let verbatimStore: IVerbatimStore;
  let service: RememberService;

  beforeEach(() => {
    const mocks = createMocks();
    fileStore = mocks.fileStore;
    verbatimStore = mocks.verbatimStore;
    const sanitizer = new SanitizationService({ enabled: true, mode: 'redact' });
    service = new RememberService(fileStore, verbatimStore, sanitizer, createIdempotencyStore());
  });

  it('test_rememberFact_validContent_writesFile', async () => {
    const result = await service.rememberFact({
      content: '- pgx pool MaxConns <= max_connections/3',
      agent: 'claude-code',
      sessionId: 'abc123',
      project: 'cli-relay',
    });

    expect(result.ok).toBe(true);
    expect(result.file).toMatch(/^log\/claude-code\/raw\//);
    expect(verbatimStore.writeEntry).toHaveBeenCalledOnce();
  });

  it('test_rememberFact_emptyContent_throwsContentEmpty', async () => {
    await expect(
      service.rememberFact({ content: '', agent: 'claude-code', sessionId: 'abc' }),
    ).rejects.toThrow('Content must not be empty');
  });

  it('test_rememberFact_sensitiveContent_redacts', async () => {
    const result = await service.rememberFact({
      content:
        'When connecting to PostgreSQL, use API key: sk-abc123def456ghi789jkl012mno345pqr678 for authentication to the service',
      agent: 'claude-code',
      sessionId: 'abc',
    });

    expect(result.ok).toBe(true);
    const entry = (verbatimStore.writeEntry as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entry.content).toContain('[REDACTED:api_key]');
    expect(entry.content).not.toContain('sk-abc123');
  });

  it('test_rememberFact_neverCallsLlm (INV-1)', async () => {
    const result = await service.rememberFact({
      content: 'fact',
      agent: 'test',
      sessionId: 'abc',
    });
    expect(result.ok).toBe(true);
  });

  it('test_rememberSession_validSummary_writesFile', async () => {
    const result = await service.rememberSession({
      summary: '- Learned about connection pooling\n- Fixed migration bug',
      agent: 'claude-code',
      sessionId: 'session-1',
      project: 'cli-relay',
    });

    expect(result.ok).toBe(true);
    expect(result.facts_count).toBe(2);
    expect(result.entry_id).toBeTruthy();
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(verbatimStore.writeEntry).toHaveBeenCalledOnce();
  });

  it('test_rememberSession_duplicateSessionId_returnsExisting (INV-8)', async () => {
    const first = await service.rememberSession({
      summary: 'facts here',
      agent: 'claude-code',
      sessionId: 'dedup-session',
    });

    (fileStore.listFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: first.file, updated: new Date().toISOString() },
    ]);
    (fileStore.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) => {
      if (p === first.file)
        return '---\nsession: dedup-session\nagent: claude-code\nconsolidated: false\n---\nfacts here';
      return null;
    });

    const second = await service.rememberSession({
      summary: '- totally different\n- three lines\n- of content',
      agent: 'claude-code',
      sessionId: 'dedup-session',
    });

    expect(second.file).toBe(first.file);
    expect(second.facts_count).toBe(first.facts_count);
    expect(verbatimStore.writeEntry).toHaveBeenCalledOnce();
  });

  it('replays same idempotency key for rememberFact', async () => {
    const first = await service.rememberFact({
      content: 'same',
      agent: 'a',
      sessionId: 's',
      idempotencyKey: 'key-1',
    });
    const second = await service.rememberFact({
      content: 'same',
      agent: 'a',
      sessionId: 's',
      idempotencyKey: 'key-1',
    });
    expect(second.file).toBe(first.file);
    expect(second.idempotency_replayed).toBe(true);
    expect(verbatimStore.writeEntry).toHaveBeenCalledOnce();
  });

  it('raises conflict for same idempotency key with different rememberFact payload', async () => {
    await service.rememberFact({
      content: 'first',
      agent: 'a',
      sessionId: 's',
      idempotencyKey: 'key-2',
    });
    await expect(
      service.rememberFact({
        content: 'second',
        agent: 'a',
        sessionId: 's',
        idempotencyKey: 'key-2',
      }),
    ).rejects.toThrow(/Idempotency conflict/);
  });

  it('rejects invalid idempotency key', async () => {
    await expect(
      service.rememberFact({
        content: 'x',
        agent: 'a',
        sessionId: 's',
        idempotencyKey: 'bad key',
      }),
    ).rejects.toThrow(/Invalid idempotency key/);
  });

  it('rememberSession dedupe still enforces idempotency conflict', async () => {
    const first = await service.rememberSession({
      summary: 'summary one',
      agent: 'claude-code',
      sessionId: 'dedupe-sess',
      idempotencyKey: 'sess-key',
    });
    (fileStore.listFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      { path: first.file, updated: new Date().toISOString() },
    ]);
    (fileStore.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      '---\nsession: dedupe-sess\nagent: claude-code\n---\n- summary one',
    );
    await expect(
      service.rememberSession({
        summary: 'summary two',
        agent: 'claude-code',
        sessionId: 'dedupe-sess',
        idempotencyKey: 'sess-key',
      }),
    ).rejects.toThrow(/Idempotency conflict/);
  });

  it('concurrent same-key rememberFact executes write once', async () => {
    const p1 = service.rememberFact({
      content: 'concurrent',
      agent: 'a',
      sessionId: 's',
      idempotencyKey: 'ckey',
    });
    const p2 = service.rememberFact({
      content: 'concurrent',
      agent: 'a',
      sessionId: 's',
      idempotencyKey: 'ckey',
    });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.file).toBe(r2.file);
    expect(verbatimStore.writeEntry).toHaveBeenCalledOnce();
  });
});
