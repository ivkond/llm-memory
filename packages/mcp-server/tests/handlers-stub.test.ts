import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type ServerHandle, TOOL_NAMES } from '../src/index.js';
import {
  makeFakeAppServices,
  postMcp,
  readJsonRpc,
  MINIMAL_TOOL_ARGS,
  type ToolCallResult,
} from './_helpers.js';

describe('tools/call (integration)', () => {
  let handle: ServerHandle;

  beforeEach(async () => {
    handle = await startServer(makeFakeAppServices(), { host: '127.0.0.1', port: 0 });
  });

  afterEach(async () => {
    await handle.close();
  });

  it('test_toolCall_wiki_query_returnsEnvelope', async () => {
    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'wiki_query', arguments: { question: 'test?' } },
    });
    expect(res.status).toBe(200);

    const body = await readJsonRpc(res);
    expect(body.error).toBeUndefined();
    const result = body.result as ToolCallResult;

    // Per D-04: returns { success: true/false, data/error } envelope in content
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    const payload = JSON.parse(result.content[0]?.text ?? '{}');
    expect(payload).toHaveProperty('success');
    expect(typeof payload.success).toBe('boolean');
  });

  it('test_toolCall_wiki_recall_returnsEnvelope', async () => {
    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'wiki_recall', arguments: { cwd: '/test' } },
    });
    expect(res.status).toBe(200);

    const body = await readJsonRpc(res);
    expect(body.error).toBeUndefined();
    const result = body.result as ToolCallResult;

    const payload = JSON.parse(result.content[0]?.text ?? '{}');
    expect(payload).toHaveProperty('success');
    expect(typeof payload.success).toBe('boolean');
  });

  it('test_toolCall_wiki_status_returnsEnvelope', async () => {
    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'wiki_status', arguments: {} },
    });
    expect(res.status).toBe(200);

    const body = await readJsonRpc(res);
    expect(body.error).toBeUndefined();
    const result = body.result as ToolCallResult;

    const payload = JSON.parse(result.content[0]?.text ?? '{}');
    expect(payload).toHaveProperty('success');
    expect(typeof payload.success).toBe('boolean');
  });

  // Write tools now wired to services (Phase 3)
  it.each(
    ['wiki_remember_fact', 'wiki_remember_session', 'wiki_ingest', 'wiki_lint'].map(
      (name) => [name] as const,
    ),
  )('test_toolCall_%s_returnsEnvelope', async (name) => {
    const args = MINIMAL_TOOL_ARGS[name];
    expect(args).toBeDefined();

    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    expect(res.status).toBe(200);

    const body = await readJsonRpc(res);
    expect(body.error).toBeUndefined();
    const result = body.result as ToolCallResult;

    // Now returns envelope { success: true/false } instead of not_implemented error
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    const payload = JSON.parse(result.content[0]?.text ?? '{}');
    expect(payload).toHaveProperty('success');
    expect(typeof payload.success).toBe('boolean');
  });

  it('test_toolCall_invalidArgs_returnsValidationError', async () => {
    // wiki_query requires `question` — send empty args to trip Zod validation.
    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 99,
      method: 'tools/call',
      params: { name: 'wiki_query', arguments: {} },
    });
    expect(res.status).toBe(200);

    const body = await readJsonRpc(res);

    // The SDK surfaces Zod validation failures either as a top-level JSON-RPC
    // error (code InvalidParams = -32602) or as a tool-result with isError=true
    // whose text does NOT contain `not_implemented`. Either is acceptable; what
    // matters is that the stub handler was never reached.
    if (body.error !== undefined) {
      expect(body.error.code).toBe(-32602);
    } else {
      const result = body.result as ToolCallResult;
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text ?? '').not.toContain('not_implemented');
    }
  });
});
