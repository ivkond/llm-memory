import type { AppServices } from '@llm-wiki/common';

/**
 * Phase 1 handlers never touch the service container (they all throw
 * `not_implemented`). Tests pass an opaque fake object cast to AppServices
 * to keep startServer's signature honest without pulling infra adapters.
 */
export function makeFakeAppServices(): AppServices {
  return Object.freeze({
    remember: {},
    recall: {},
    query: {},
    ingest: {},
    status: {},
    lint: {},
    import_: {},
  }) as unknown as AppServices;
}

const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

export async function postMcp(
  baseUrl: string,
  body: unknown,
  init?: { headers?: Record<string, string> },
): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { ...MCP_HEADERS, ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
  });
}

export async function readJsonRpc(res: Response): Promise<JsonRpcResponse> {
  const text = await res.text();
  try {
    return JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new Error(`expected JSON response, got:\n${text}`);
  }
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ToolsListResult {
  tools: Array<{ name: string; inputSchema?: { type?: string } }>;
}

export interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export const MINIMAL_TOOL_ARGS: Record<string, Record<string, unknown>> = {
  wiki_query: { question: 'x' },
  wiki_recall: { cwd: '/tmp' },
  wiki_remember_fact: { content: 'x', agent: 'a', sessionId: 's' },
  wiki_remember_session: { summary: 'x', agent: 'a', sessionId: 's' },
  wiki_ingest: { source: '/tmp/x' },
  wiki_lint: {},
  wiki_status: {},
};
