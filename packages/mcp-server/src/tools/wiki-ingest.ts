import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AppServices } from '@llm-wiki/common';

/**
 * Stub handler for `wiki_ingest`. Phase 3 wires the real IngestService call.
 */
export function createWikiIngestHandler(_services: AppServices) {
  return async (): Promise<never> => {
    throw new McpError(ErrorCode.InternalError, 'wiki_ingest: not_implemented (Phase 3)');
  };
}
