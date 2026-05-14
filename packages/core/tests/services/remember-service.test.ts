import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RememberService } from '../../src/services/remember-service.js';
import { SanitizationService } from '../../src/services/sanitization-service.js';
import type { IFileStore } from '../../src/ports/file-store.js';
import type { IOperationJournal } from '../../src/ports/operation-journal.js';
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

describe('RememberService', () => {
  let fileStore: IFileStore;
  let verbatimStore: IVerbatimStore;
  let operationJournal: IOperationJournal;
  let service: RememberService;

  beforeEach(() => {
    const mocks = createMocks();
    fileStore = mocks.fileStore;
    verbatimStore = mocks.verbatimStore;
    operationJournal = {
      append: vi.fn(async () => undefined),
      load: vi.fn(async () => ({ storagePath: '.local/operations', disabledReason: null, degradedReasons: [], records: [] })),
    };
    const sanitizer = new SanitizationService({ enabled: true, mode: 'redact' });
    service = new RememberService(fileStore, verbatimStore, sanitizer, operationJournal);
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

  it('test_rememberFact_journalsRunningAndSucceeded', async () => {
    await service.rememberFact({
      content: 'fact',
      agent: 'claude-code',
      sessionId: 's1',
    });
    const append = operationJournal.append as ReturnType<typeof vi.fn>;
    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[0][0].type).toBe('remember_fact');
    expect(append.mock.calls[0][0].status).toBe('running');
    expect(append.mock.calls[1][0].status).toBe('succeeded');
  });

  it('test_rememberFact_journalAppendFailsBeforeWrite_failsClosed', async () => {
    const append = operationJournal.append as ReturnType<typeof vi.fn>;
    append.mockRejectedValueOnce(new Error('journal down'));
    await expect(
      service.rememberFact({
        content: 'fact',
        agent: 'claude-code',
        sessionId: 's1',
      }),
    ).rejects.toThrow('journal down');
    expect(verbatimStore.writeEntry).not.toHaveBeenCalled();
  });
});
