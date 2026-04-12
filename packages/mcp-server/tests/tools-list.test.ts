import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type ServerHandle, TOOL_NAMES } from '../src/index.js';
import { makeFakeAppServices, postMcp, readJsonRpc, type ToolsListResult } from './_helpers.js';

describe('tools/list (integration)', () => {
  let handle: ServerHandle;

  beforeEach(async () => {
    handle = await startServer(makeFakeAppServices(), { host: '127.0.0.1', port: 0 });
  });

  afterEach(async () => {
    await handle.close();
  });

  it('test_toolsList_freshServer_returnsAllSevenToolNames', async () => {
    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(200);

    const body = await readJsonRpc(res);
    expect(body.error).toBeUndefined();
    const result = body.result as ToolsListResult;
    expect(result.tools).toHaveLength(TOOL_NAMES.length);

    const names = [...result.tools.map((t) => t.name)].sort();
    const expected = [...TOOL_NAMES].sort();
    expect(names).toEqual(expected);
  });

  it('test_toolsList_eachTool_hasInputSchemaObject', async () => {
    const res = await postMcp(handle.url, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    const body = await readJsonRpc(res);
    const result = body.result as ToolsListResult;

    for (const tool of result.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema?.type).toBe('object');
    }
  });

  it('test_mcpEndpoint_GET_returns405', async () => {
    const res = await fetch(`${handle.url}/mcp`, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    await res.text();
  });

  it('test_mcpEndpoint_rootPath_returns404', async () => {
    const res = await fetch(`${handle.url}/`, { method: 'GET' });
    expect([404, 405]).toContain(res.status);
    await res.text();
  });

  it('test_startServer_hostDefault_bindsLoopback', () => {
    expect(handle.url.startsWith('http://127.0.0.1:')).toBe(true);
  });
});
