import { basename } from 'node:path';
import type { AppServices } from '@ivkond-llm-wiki/common';

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
      const agent = params.agent != null ? String(params.agent) : '';
      const sessionId = params.sessionId != null ? String(params.sessionId) : '';
      const project = params.project != null ? String(params.project) : undefined;
      const idempotencyKey =
        params.idempotencyKey != null ? String(params.idempotencyKey) : undefined;

      const result = await rememberService.rememberSession({
        summary,
        agent,
        sessionId,
        project,
        idempotencyKey,
      });
      const entryId = basename(result.file);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              data: {
                entry_id: entryId,
                session_id: sessionId,
                created_at: inferCreatedAtFromEntryId(entryId),
                facts_count: result.facts_count,
              },
            }),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes('summary') ? 'InvalidParams' : 'InternalError';

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

function inferCreatedAtFromEntryId(entryId: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(entryId);
  if (!match) return null;
  return `${match[1]}T00:00:00.000Z`;
}
