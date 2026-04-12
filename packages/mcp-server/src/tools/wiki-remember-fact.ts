import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { AppServices } from '@llm-wiki/common';

/**
 * Stub handler for `wiki_remember_fact`. Phase 3 wires the real RememberService call.
 */
export function createWikiRememberFactHandler(_services: AppServices) {
  return async (): Promise<never> => {
    throw new McpError(ErrorCode.InternalError, 'wiki_remember_fact: not_implemented (Phase 3)');
  };
}
