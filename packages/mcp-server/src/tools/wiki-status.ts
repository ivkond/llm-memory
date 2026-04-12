import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AppServices } from '@llm-wiki/common';

/**
 * Stub handler for `wiki_status`. Phase 2 wires the real WikiStatusService call.
 */
export function createWikiStatusHandler(_services: AppServices) {
  return async (): Promise<never> => {
    throw new McpError(ErrorCode.InternalError, 'wiki_status: not_implemented (Phase 2)');
  };
}
