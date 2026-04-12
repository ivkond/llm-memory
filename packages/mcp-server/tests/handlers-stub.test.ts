import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type ServerHandle, TOOL_NAMES } from '../src/index.js';
import {
  makeFakeAppServices,
  postMcp,
  readJsonRpc,
  MINIMAL_TOOL_ARGS,
  type ToolCallResult,
} from './_helpers.js';

describe('tools/call stubs (integration)', () => {
  let handle: ServerHandle;

  beforeEach(async () => {
    handle = await startServer(makeFakeAppServices(), { host: '127.0.0.1', port: 0 });
  });

  afterEach(async () => {
    await handle.close();
  });

  it.each(TOOL_NAMES.map((name) => [name] as const))(
    'test_toolCall_%s_returnsNotImplementedError',
    async (name) => {
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

      expect(result.isError).toBe(true);
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(typeof result.content[0]?.text).toBe('string');
      expect(result.content[0]?.text).toContain('not_implemented');
    },
  );

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
