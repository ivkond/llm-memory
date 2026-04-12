import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AppServices } from '@llm-wiki/common';

/**
 * Stub handler for `wiki_remember_session`. Phase 3 wires the real RememberService call.
 */
export function createWikiRememberSessionHandler(_services: AppServices) {
  return async (): Promise<never> => {
    throw new McpError(ErrorCode.InternalError, 'wiki_remember_session: not_implemented (Phase 3)');
  };
}
