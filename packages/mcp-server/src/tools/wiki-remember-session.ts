import type { AppServices } from '@ivkond-llm-wiki/common';
import { readCommonRememberParams } from './wiki-remember-params.js';

/**
 * Handler for `wiki_remember_session` — wires to RememberService.
 *
 * Per D-04: Uses dedup-by-session behavior from RememberService.
 * Per D-06: Success returns `{ success: true, data: { entry_id, session_id, created_at } }`.
 * Failure returns `{ success: false, error: string, code?: string }`.
 */
export function createWikiRememberSessionHandler(services: AppServices) {
  return async (params: Record<string, unknown>) => {
    try {
      const { remember: rememberService } = services;
      if (!rememberService) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'RememberService not available',
                code: 'InternalError',
              }),
            },
          ],
        };
      }

      const summary = params.summary != null ? String(params.summary) : '';
      const common = readCommonRememberParams(params);

      const result = await rememberService.rememberSession({
        summary,
        ...common,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              data: {
                entry_id: result.entry_id,
                session_id: common.sessionId,
                created_at: result.created_at,
                facts_count: result.facts_count,
              },
            }),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        isCoordinationError(error)
          ? 'WRITE_COORDINATION_FAILED'
          : message.includes('summary')
            ? 'InvalidParams'
            : 'InternalError';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: message,
              code,
            }),
          },
        ],
      };
    }
  };
}

function isCoordinationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'WRITE_LOCK_TIMEOUT' || code === 'WRITE_LOCK_ACQUISITION_FAILED';
}
