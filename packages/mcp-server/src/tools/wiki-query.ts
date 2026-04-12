import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AppServices } from '@llm-wiki/common';

/**
 * Stub handler for `wiki_query`. Phase 2 wires the real QueryService call.
 * Locked shape: throws McpError(InternalError, '<tool>: not_implemented ...').
 */
export function createWikiQueryHandler(_services: AppServices) {
  return async (): Promise<never> => {
    throw new McpError(ErrorCode.InternalError, 'wiki_query: not_implemented (Phase 2)');
  };
}
