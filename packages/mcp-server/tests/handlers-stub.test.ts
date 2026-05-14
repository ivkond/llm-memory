import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsFileStore, FsVerbatimStore } from '@ivkond-llm-wiki/infra';
import { RememberService, SanitizationService } from '@ivkond-llm-wiki/core';
import type { AppServices } from '@ivkond-llm-wiki/common';
import { startServer, type ServerHandle } from '../src/index.js';
import { createWikiIngestHandler } from '../src/tools/wiki-ingest.js';
import { postMcp, readJsonRpc, type ToolCallResult } from './_helpers.js';

function parsePayload(result: ToolCallResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('tools/call (integration)', () => {
  let handle: ServerHandle;

  afterEach(async () => {
    await handle?.close();
  });

  it('test_toolCall_wiki_query_callsServiceWithMappedParams', async () => {
    const queryResult = {
      answer: 'ok',
      citations: [{ page: 'wiki/p.md', title: 'P', excerpt: 'E', score: 0.9 }],
      scope_used: 'wiki/',
      project_used: 'proj',
    };
    const query = vi.fn().mockResolvedValue(queryResult);
    handle = await startServer(makeServices({ query: { query } }), { host: '127.0.0.1', port: 0 });

    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'wiki_query',
        arguments: { question: 'q', scope: 'wiki/', project: 'proj', cwd: '/w', maxResults: 7 },
      },
    });

    const body = await readJsonRpc(res);
    expect(query).toHaveBeenCalledWith({
      question: 'q',
      scope: 'wiki/',
      project: 'proj',
      cwd: '/w',
      maxResults: 7,
      maxTokens: undefined,
    });
    const payload = parsePayload(body.result as ToolCallResult);
    expect(payload).toEqual({ success: true, data: queryResult });
  });

  it('test_toolCall_wiki_recall_callsServiceWithMappedParams', async () => {
    const recall = vi
      .fn()
      .mockResolvedValue({ project: null, pages: [], unconsolidated_count: 0, total_pages: 0 });
    handle = await startServer(makeServices({ recall: { recall } }), {
      host: '127.0.0.1',
      port: 0,
    });

    const body = await callTool(handle.url, 'wiki_recall', { cwd: '/repo', max_tokens: 123 });
    expect(recall).toHaveBeenCalledWith({ cwd: '/repo', max_tokens: 123 });
    expect(parsePayload(body.result as ToolCallResult)).toEqual({
      success: true,
      data: { project: null, pages: [], unconsolidated_count: 0, total_pages: 0 },
    });
  });

  it('test_toolCall_wiki_remember_fact_callsServiceWithMappedParams', async () => {
    const rememberFact = vi
      .fn()
      .mockResolvedValue({ ok: true, file: 'log/a/raw/fact.md', entry_id: 'fact.md' });
    handle = await startServer(
      makeServices({ remember: { rememberFact, rememberSession: vi.fn() } }),
      { host: '127.0.0.1', port: 0 },
    );

    const body = await callTool(handle.url, 'wiki_remember_fact', {
      content: 'fact',
      agent: 'claude',
      sessionId: 's1',
      project: 'proj',
      tags: ['a', 'b'],
    });

    expect(rememberFact).toHaveBeenCalledWith({
      content: 'fact',
      agent: 'claude',
      sessionId: 's1',
      project: 'proj',
      tags: ['a', 'b'],
      sourceType: 'mcp_fact',
      sourceUri: undefined,
      sourceDigest: undefined,
      operationId: undefined,
      modelProvider: undefined,
      modelName: undefined,
      callId: undefined,
      toolCallId: undefined,
    });
    expect(parsePayload(body.result as ToolCallResult)).toEqual({
      success: true,
      data: { entry_id: 'fact.md', project: 'proj', path: 'log/a/raw/fact.md' },
    });
  });

  it('test_toolCall_wiki_remember_session_dedupUsesServiceResult', async () => {
    const rememberSession = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        file: 'log/a/raw/2026-05-08_s1.md',
        entry_id: 'entry-123',
        created_at: '2026-05-08T01:02:03.000Z',
        facts_count: 2,
      });
    handle = await startServer(
      makeServices({ remember: { rememberFact: vi.fn(), rememberSession } }),
      { host: '127.0.0.1', port: 0 },
    );

    const body = await callTool(handle.url, 'wiki_remember_session', {
      summary: 'sum',
      agent: 'claude',
      sessionId: 's1',
      project: 'proj',
    });

    expect(rememberSession).toHaveBeenCalledWith({
      summary: 'sum',
      agent: 'claude',
      sessionId: 's1',
      project: 'proj',
      sourceUri: undefined,
      sourceDigest: undefined,
      operationId: undefined,
      modelProvider: undefined,
      modelName: undefined,
      callId: undefined,
      toolCallId: undefined,
    });
    const payload = parsePayload(body.result as ToolCallResult);
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual({
      entry_id: 'entry-123',
      session_id: 's1',
      created_at: '2026-05-08T01:02:03.000Z',
      facts_count: 2,
    });
  });

  it('test_toolCall_wiki_ingest_projectUnsupported_returnsProjectScopeUnsupported', async () => {
    const ingest = vi
      .fn()
      .mockResolvedValue({ pages_created: ['wiki/x.md'], pages_updated: [], commit_sha: 'abc' });
    handle = await startServer(makeServices({ ingest: { ingest } }), {
      host: '127.0.0.1',
      port: 0,
    });

    const body = await callTool(handle.url, 'wiki_ingest', {
      source: '/tmp/s.md',
      hint: 'h',
      project: 'proj',
    });
    expect(ingest).not.toHaveBeenCalled();
    expect(parsePayload(body.result as ToolCallResult)).toEqual({
      success: false,
      error: 'project-scoped ingest is not supported yet',
      code: 'PROJECT_SCOPE_UNSUPPORTED',
    });
  });

  it('test_toolCall_wiki_lint_projectUnsupported_returnsProjectScopeUnsupported', async () => {
    const lint = vi
      .fn()
      .mockResolvedValue({ consolidated: 0, promoted: 0, issues: [], commitSha: null });
    handle = await startServer(makeServices({ lint: { lint } }), { host: '127.0.0.1', port: 0 });

    const body = await callTool(handle.url, 'wiki_lint', { phases: ['health'], project: 'proj' });
    expect(lint).not.toHaveBeenCalled();
    expect(parsePayload(body.result as ToolCallResult)).toEqual({
      success: false,
      error: 'project-scoped lint is not supported yet',
      code: 'PROJECT_SCOPE_UNSUPPORTED',
    });
  });

  it('test_toolCall_wiki_status_callsServiceWithoutArgs', async () => {
    const status = vi.fn().mockResolvedValue({
      total_pages: 1,
      projects: ['p'],
      unconsolidated: 0,
      last_lint: null,
      last_ingest: null,
      index_health: 'ok',
    });
    handle = await startServer(makeServices({ status: { status } }), {
      host: '127.0.0.1',
      port: 0,
    });

    const body = await callTool(handle.url, 'wiki_status', {});
    expect(status).toHaveBeenCalledTimes(1);
    expect(parsePayload(body.result as ToolCallResult)).toEqual({
      success: true,
      data: {
        total_pages: 1,
        projects: ['p'],
        unconsolidated: 0,
        last_lint: null,
        last_ingest: null,
        index_health: 'ok',
      },
    });
  });

  it('test_toolCall_validationError_returnsInvalidParams', async () => {
    const ingest = vi
      .fn()
      .mockResolvedValue({ pages_created: [], pages_updated: [], commit_sha: 'sha' });
    handle = await startServer(makeServices({ ingest: { ingest } }), {
      host: '127.0.0.1',
      port: 0,
    });

    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: { name: 'wiki_ingest', arguments: {} },
    });
    const body = await readJsonRpc(res);

    if (body.error) {
      expect(body.error.code).toBe(-32602);
      expect(ingest).not.toHaveBeenCalled();
      return;
    }

    const result = body.result as ToolCallResult;
    const text = result.content[0]?.text ?? '';
    if (text.startsWith('{')) {
      const payload = parsePayload(result);
      expect(payload.success).toBe(false);
      expect(String(payload.error ?? '')).toContain('Invalid arguments');
      expect(ingest).not.toHaveBeenCalled();
      return;
    }
    expect(text).toContain('Invalid arguments');
    expect(ingest).not.toHaveBeenCalled();
  });

  it('test_toolCall_handlerError_mapsToInvalidParams', async () => {
    const rememberFact = vi.fn().mockRejectedValue(new Error('content must not be empty'));
    handle = await startServer(
      makeServices({ remember: { rememberFact, rememberSession: vi.fn() } }),
      { host: '127.0.0.1', port: 0 },
    );

    const body = await callTool(handle.url, 'wiki_remember_fact', {
      content: 'x',
      agent: 'a',
      sessionId: 's',
    });
    const payload = parsePayload(body.result as ToolCallResult);

    expect(payload.success).toBe(false);
    expect(payload.code).toBe('InvalidParams');
  });
});

describe('wiki_ingest handler (direct)', () => {
  it('test_handler_wiki_ingest_invalidRetriesString_returnsInvalidParams', async () => {
    const ingest = vi
      .fn()
      .mockResolvedValue({ pages_created: ['wiki/x.md'], pages_updated: [], commit_sha: 'abc' });
    const handler = createWikiIngestHandler(makeServices({ ingest: { ingest } }));

    const result = await handler({ source: '/tmp/s.md', retries: 'abc' });
    expect(ingest).not.toHaveBeenCalled();
    expect(parsePayload(result as ToolCallResult)).toEqual({
      success: false,
      error: 'retries must be a finite number',
      code: 'InvalidParams',
    });
  });

  it('test_handler_wiki_ingest_invalidRetriesInfinity_returnsInvalidParams', async () => {
    const ingest = vi
      .fn()
      .mockResolvedValue({ pages_created: ['wiki/x.md'], pages_updated: [], commit_sha: 'abc' });
    const handler = createWikiIngestHandler(makeServices({ ingest: { ingest } }));

    const result = await handler({ source: '/tmp/s.md', retries: Number.POSITIVE_INFINITY });
    expect(ingest).not.toHaveBeenCalled();
    expect(parsePayload(result as ToolCallResult)).toEqual({
      success: false,
      error: 'retries must be a finite number',
      code: 'InvalidParams',
    });
  });
});

describe('tools/call smoke (real temp wiki)', () => {
  let root = '';
  let handle: ServerHandle;

  beforeEach(async () => {
    root = await mkdtemp(`${tmpdir()}/llm-wiki-mcp-`);
  });

  afterEach(async () => {
    await handle?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('test_toolCall_wiki_remember_session_dedupsOnSecondCall', async () => {
    const fileStore = new FsFileStore(root);
    const verbatimStore = new FsVerbatimStore(fileStore);
    const sanitizer = new SanitizationService({ enabled: false, mode: 'off' });
    const remember = new RememberService(fileStore, verbatimStore, sanitizer);

    handle = await startServer(makeServices({ remember }), { host: '127.0.0.1', port: 0 });

    const first = await callTool(handle.url, 'wiki_remember_session', {
      summary: '- one',
      agent: 'claude',
      sessionId: 's-dedup',
    });
    const second = await callTool(handle.url, 'wiki_remember_session', {
      summary: '- two',
      agent: 'claude',
      sessionId: 's-dedup',
    });

    const firstData = (parsePayload(first.result as ToolCallResult).data ?? {}) as Record<
      string,
      unknown
    >;
    const secondData = (parsePayload(second.result as ToolCallResult).data ?? {}) as Record<
      string,
      unknown
    >;
    expect(secondData.entry_id).toBe(firstData.entry_id);

    const files = await readdir(`${root}/log/claude/raw`);
    expect(files).toHaveLength(1);
    const saved = await readFile(`${root}/log/claude/raw/${files[0]}`, 'utf8');
    expect(saved).toContain('- one');
    expect(saved).not.toContain('- two');
  });
});

async function callTool(baseUrl: string, name: string, args: Record<string, unknown>) {
  const res = await postMcp(baseUrl, {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  expect(res.status).toBe(200);
  return readJsonRpc(res);
}

function makeServices(overrides: Partial<AppServices> = {}): AppServices {
  const defaults = {
    remember: {
      rememberFact: vi
        .fn()
        .mockResolvedValue({ ok: true, file: 'log/a/raw/f.md', entry_id: 'f.md' }),
      rememberSession: vi
        .fn()
        .mockResolvedValue({
          ok: true,
          file: 'log/a/raw/s.md',
          entry_id: 's',
          created_at: '2026-05-01T00:00:00.000Z',
          facts_count: 1,
        }),
    },
    recall: {
      recall: vi
        .fn()
        .mockResolvedValue({ project: null, pages: [], unconsolidated_count: 0, total_pages: 0 }),
    },
    query: {
      query: vi
        .fn()
        .mockResolvedValue({ answer: '', citations: [], scope_used: 'all', project_used: null }),
    },
    ingest: {
      ingest: vi
        .fn()
        .mockResolvedValue({ pages_created: [], pages_updated: [], commit_sha: 'sha' }),
    },
    status: {
      status: vi.fn().mockResolvedValue({
        total_pages: 1,
        projects: [],
        unconsolidated: 0,
        last_lint: null,
        last_ingest: null,
        index_health: 'ok',
      }),
    },
    lint: {
      lint: vi
        .fn()
        .mockResolvedValue({ consolidated: 0, promoted: 0, issues: [], commitSha: null }),
    },
    import_: {
      importFromAgent: vi.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
    },
  };

  return {
    ...defaults,
    ...overrides,
  } as unknown as AppServices;
}
