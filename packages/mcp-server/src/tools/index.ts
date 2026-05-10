import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppServices } from '@ivkond-llm-wiki/common';
import {
  wikiQueryShape,
  wikiRecallShape,
  wikiRememberFactShape,
  wikiRememberSessionShape,
  wikiIngestShape,
  wikiLintShape,
  wikiStatusShape,
} from './schemas.js';
import { createWikiQueryHandler } from './wiki-query.js';
import { createWikiRecallHandler } from './wiki-recall.js';
import { createWikiRememberFactHandler } from './wiki-remember-fact.js';
import { createWikiRememberSessionHandler } from './wiki-remember-session.js';
import { createWikiIngestHandler } from './wiki-ingest.js';
import { createWikiLintHandler } from './wiki-lint.js';
import { createWikiStatusHandler } from './wiki-status.js';

/**
 * Canonical list of MCP tool names exposed by the server. Order is stable for
 * tests and documentation; never sort/mutate at runtime.
 */
export const TOOL_NAMES = [
  'wiki_query',
  'wiki_recall',
  'wiki_remember_fact',
  'wiki_remember_session',
  'wiki_ingest',
  'wiki_lint',
  'wiki_status',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * Register all 7 tools on the given McpServer instance. Phase 1 registers
 * final-shape schemas with stub handlers; Phase 2/3 only replace the handler
 * bodies, never this registry.
 */
export function registerAllTools(server: McpServer, services: AppServices): void {
  server.registerTool(
    'wiki_query',
    {
      title: 'Query Wiki',
      description: 'Hybrid search (BM25 + vector) with LLM-synthesized answer and citations',
      inputSchema: wikiQueryShape,
    },
    createWikiQueryHandler(services),
  );
  server.registerTool(
    'wiki_recall',
    {
      title: 'Recall Project Context',
      description: 'Deterministic recency-sorted context loader (no LLM)',
      inputSchema: wikiRecallShape,
    },
    createWikiRecallHandler(services),
  );
  server.registerTool(
    'wiki_remember_fact',
    {
      title: 'Remember Fact',
      description: 'Store a sanitized verbatim fact in the session log',
      inputSchema: wikiRememberFactShape,
    },
    createWikiRememberFactHandler(services),
  );
  server.registerTool(
    'wiki_remember_session',
    {
      title: 'Remember Session',
      description: 'Store a deduped session summary (key = sessionId)',
      inputSchema: wikiRememberSessionShape,
    },
    createWikiRememberSessionHandler(services),
  );
  server.registerTool(
    'wiki_ingest',
    {
      title: 'Ingest Source',
      description: 'Ingest a file or URL into the wiki via worktree-isolated pipeline',
      inputSchema: wikiIngestShape,
    },
    createWikiIngestHandler(services),
  );
  server.registerTool(
    'wiki_lint',
    {
      title: 'Lint Wiki',
      description: 'Consolidate verbatim, promote cross-project patterns, run health checks',
      inputSchema: wikiLintShape,
    },
    createWikiLintHandler(services),
  );
  server.registerTool(
    'wiki_status',
    {
      title: 'Wiki Status',
      description: 'Report wiki health and statistics (pages, projects, index)',
      inputSchema: wikiStatusShape,
    },
    createWikiStatusHandler(services),
  );
}
