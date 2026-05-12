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
      const sourceUri = params.source_uri != null ? String(params.source_uri) : undefined;
      const sourceDigest =
        params.source_digest != null ? String(params.source_digest) : undefined;
      const operationId =
        params.operation_id != null ? String(params.operation_id) : undefined;
      const modelProvider =
        params.model_provider != null ? String(params.model_provider) : undefined;
      const modelName = params.model_name != null ? String(params.model_name) : undefined;
      const callId = params.call_id != null ? String(params.call_id) : undefined;
      const toolCallId = params.tool_call_id != null ? String(params.tool_call_id) : undefined;

      const result = await rememberService.rememberSession({
        summary,
        agent,
        sessionId,
        project,
        sourceUri,
        sourceDigest,
        operationId,
        modelProvider,
        modelName,
        callId,
        toolCallId,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              data: {
                entry_id: result.entry_id,
                session_id: sessionId,
                created_at: result.created_at,
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
