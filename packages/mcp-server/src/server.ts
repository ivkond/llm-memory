import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AppServices } from '@llm-wiki/common';
import { registerAllTools } from './tools/index.js';
import { logError } from './logger.js';

/**
 * Maximum accepted JSON-RPC request body size. Bodies larger than this are
 * rejected with HTTP 413 before JSON.parse runs (T-01-05 / DoS mitigation).
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const SERVER_NAME = 'llm-wiki';
const SERVER_VERSION = '0.1.0';
const MCP_PATH = '/mcp';

export interface ServerHandle {
  /** Fully qualified base URL, e.g. `http://127.0.0.1:54321`. */
  readonly url: string;
  /** Graceful shutdown. Idempotent: second call resolves immediately. */
  close(): Promise<void>;
}

/**
 * Start a Streamable-HTTP MCP server on the given host/port.
 *
 * Design invariants (see plan 01-02):
 * - Per-request `new McpServer` + `new StreamableHTTPServerTransport` — the
 *   SDK's transport is not safe to share across concurrent requests in
 *   stateless mode (RESEARCH Pitfall 1).
 * - Binds strictly to `opts.host`; callers are responsible for passing a
 *   loopback address (main.ts defaults to 127.0.0.1 via WikiConfig).
 * - `GET /mcp` → 405, anything else → 404, `POST /mcp` → MCP dispatch.
 * - Request bodies capped at MAX_BODY_BYTES; internal errors never leak
 *   raw messages to the network (T-01-07).
 */
export async function startServer(
  services: AppServices,
  opts: { host: string; port: number },
): Promise<ServerHandle> {
  const httpServer = createServer((req, res) => {
    void handleRequest(req, res, services);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      httpServer.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(opts.port, opts.host);
  });

  const addr = httpServer.address() as AddressInfo;
  const url = `http://${addr.address}:${addr.port}`;

  let closed = false;
  const close = (): Promise<void> => {
    if (closed) return Promise.resolve();
    closed = true;
    return new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
      // Force-drop any lingering idle keep-alive sockets so close() resolves
      // promptly in the shutdown test where clients don't actively hang up.
      httpServer.closeAllConnections?.();
    });
  };

  return Object.freeze({ url, close });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  services: AppServices,
): Promise<void> {
  try {
    if (req.url === MCP_PATH && req.method === 'POST') {
      const body = await readJsonBody(req);
      const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
      registerAllTools(mcpServer, services);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      // Ensure per-request resources are released once the response socket is
      // done, whether the client closed it cleanly or aborted mid-flight.
      res.on('close', () => {
        void transport.close().catch(() => undefined);
        void mcpServer.close().catch(() => undefined);
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    if (req.url === MCP_PATH) {
      res.writeHead(405, {
        'content-type': 'application/json',
        allow: 'POST',
      });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method Not Allowed' },
          id: null,
        }),
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  } catch (err) {
    handleRequestError(res, err);
  }
}

function handleRequestError(res: ServerResponse, err: unknown): void {
  logError('request handler failure', err);
  if (res.headersSent) {
    res.end();
    return;
  }
  const status = err instanceof PayloadTooLargeError ? 413 : 500;
  const message = err instanceof PayloadTooLargeError ? 'Payload Too Large' : 'Internal error';
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: status === 413 ? -32001 : -32603, message },
      id: null,
    }),
  );
}

class PayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = 'PayloadTooLargeError';
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError(MAX_BODY_BYTES);
    }
    chunks.push(buf);
  }
  if (total === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}
