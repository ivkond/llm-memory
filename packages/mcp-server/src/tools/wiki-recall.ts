import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AppServices } from '@llm-wiki/common';

/**
 * Stub handler for `wiki_recall`. Phase 2 wires the real RecallService call.
 */
export function createWikiRecallHandler(_services: AppServices) {
  return async (): Promise<never> => {
    throw new McpError(ErrorCode.InternalError, 'wiki_recall: not_implemented (Phase 2)');
  };
}
