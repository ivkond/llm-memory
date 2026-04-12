import { describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { startServer, TOOL_NAMES } from '../src/index.js';
import { makeFakeAppServices, postMcp, readJsonRpc, type ToolsListResult } from './_helpers.js';

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address() as AddressInfo;
      const port = addr.port;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

describe('server shutdown (integration)', () => {
  it('test_handleClose_afterListen_releasesPort', async () => {
    const port = await pickFreePort();

    const first = await startServer(makeFakeAppServices(), { host: '127.0.0.1', port });
    expect(first.url).toContain(`:${port}`);
    await first.close();

    // Port must be reusable immediately after close().
    const second = await startServer(makeFakeAppServices(), { host: '127.0.0.1', port });
    expect(second.url).toContain(`:${port}`);
    await second.close();
  });

  it('test_handleClose_calledTwice_isIdempotent', async () => {
    const handle = await startServer(makeFakeAppServices(), { host: '127.0.0.1', port: 0 });
    await handle.close();
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it('test_concurrentRequests_inStatelessMode_eachGetsOwnResponse', async () => {
    const handle = await startServer(makeFakeAppServices(), { host: '127.0.0.1', port: 0 });
    try {
      const ids = [1, 2, 3, 4, 5];
      const responses = await Promise.all(
        ids.map((id) =>
          postMcp(handle.url, {
            jsonrpc: '2.0',
            id,
            method: 'tools/list',
            params: {},
          }).then(readJsonRpc),
        ),
      );

      for (let i = 0; i < ids.length; i += 1) {
        const body = responses[i];
        expect(body.error).toBeUndefined();
        expect(body.id).toBe(ids[i]);
        const result = body.result as ToolsListResult;
        expect(result.tools).toHaveLength(TOOL_NAMES.length);
        const names = [...result.tools.map((t) => t.name)].sort();
        const expected = [...TOOL_NAMES].sort();
        expect(names).toEqual(expected);
      }
    } finally {
      await handle.close();
    }
  });
});
