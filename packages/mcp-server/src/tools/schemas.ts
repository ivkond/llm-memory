/**
 * Zod input schemas for the 7 MCP tools.
 *
 * These mirror the domain request types (RememberFactRequest, QueryRequest,
 * RecallRequest, IngestRequest, LintRequest, StatusRequest) and are final for
 * Phase 1 — Phase 2/3 only swap handler bodies, never the schemas or registry.
 *
 * The SDK (@modelcontextprotocol/sdk@^1.29.0) consumes Zod shapes (plain
 * `z.object({...}).shape` or the shape literal) and converts them to JSON
 * Schema for tools/list automatically. We export the raw shape objects to
 * match the SDK's `registerTool({ inputSchema })` contract.
 */

import { z } from 'zod';

export const wikiQueryShape = {
  question: z.string().min(1).describe('Natural-language question to search the wiki for'),
  scope: z
    .string()
    .optional()
    .describe('Scope expression (wiki, project name, or combination) to limit search'),
  project: z.string().optional().describe('Project name; overrides cwd-based resolution'),
  cwd: z
    .string()
    .optional()
    .describe('Client working directory; used to resolve project if not provided'),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe('Max ranked hits to return (1-50)'),
};

export const wikiRecallShape = {
  cwd: z.string().min(1).describe('Client working directory; drives project detection'),
  max_tokens: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Approximate token budget for the returned context'),
};

export const wikiRememberFactShape = {
  content: z.string().min(1).describe('Fact text to remember (sanitization applied before store)'),
  agent: z.string().min(1).describe('Agent identifier, e.g. "claude-code"'),
  sessionId: z.string().min(1).describe('Session identifier; facts from the same session coalesce'),
  project: z.string().optional().describe('Project name; defaults to cwd-derived project'),
  tags: z.array(z.string()).optional().describe('Optional list of free-form tags'),
  idempotencyKey: z.string().optional().describe('Optional idempotency key for safe retries'),
  source_uri: z.string().optional().describe('Optional source URI/path for provenance'),
  source_digest: z.string().optional().describe('Optional source digest for provenance'),
  operation_id: z.string().optional().describe('Optional operation ID for traceability'),
  model_provider: z.string().optional().describe('Optional model provider'),
  model_name: z.string().optional().describe('Optional model name'),
  call_id: z.string().optional().describe('Optional model call identifier'),
  tool_call_id: z.string().optional().describe('Optional tool call identifier'),
};

export const wikiRememberSessionShape = {
  summary: z.string().min(1).describe('Session summary text (deduplicated by sessionId)'),
  agent: z.string().min(1).describe('Agent identifier'),
  sessionId: z.string().min(1).describe('Session identifier used as the dedup key'),
  project: z.string().optional().describe('Project name; defaults to cwd-derived project'),
  idempotencyKey: z.string().optional().describe('Optional idempotency key for safe retries'),
  source_uri: z.string().optional().describe('Optional source URI/path for provenance'),
  source_digest: z.string().optional().describe('Optional source digest for provenance'),
  operation_id: z.string().optional().describe('Optional operation ID for traceability'),
  model_provider: z.string().optional().describe('Optional model provider'),
  model_name: z.string().optional().describe('Optional model name'),
  call_id: z.string().optional().describe('Optional model call identifier'),
  tool_call_id: z.string().optional().describe('Optional tool call identifier'),
};

export const wikiIngestShape = {
  source: z.string().min(1).describe('File path or URL of the source to ingest'),
  hint: z
    .string()
    .optional()
    .describe('Optional hint to guide LLM placement (e.g. target project / section)'),
  project: z
    .string()
    .optional()
    .describe(
      'Deprecated/unsupported for now: project-scoped ingest is not implemented and passing this field returns PROJECT_SCOPE_UNSUPPORTED',
    ),
  idempotencyKey: z.string().optional().describe('Optional idempotency key for safe retries'),
};

export const wikiLintShape = {
  phases: z
    .array(z.enum(['consolidate', 'promote', 'health']))
    .optional()
    .describe('Subset of lint phases to run; default is all three in order'),
  project: z
    .string()
    .optional()
    .describe(
      'Deprecated/unsupported for now: project-scoped lint is not implemented and passing this field returns PROJECT_SCOPE_UNSUPPORTED',
    ),
  idempotencyKey: z.string().optional().describe('Optional idempotency key for safe retries'),
};

export const wikiStatusShape = {};
