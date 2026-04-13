import type { AppServices } from '@llm-wiki/common';

/**
 * Handler for `wiki_remember_fact` — wires to RememberService.
 *
 * Per D-01: Uses REDACT mode (sanitizer configured by RememberService).
 * Per D-03: Success returns `{ success: true, data: { entry_id, project, path } }`.
 * Failure returns `{ success: false, error: string, code?: string }`.
 */
export function createWikiRememberFactHandler(services: AppServices) {
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

      const content = params.content != null ? String(params.content) : '';
      const agent = params.agent != null ? String(params.agent) : '';
      const sessionId = params.sessionId != null ? String(params.sessionId) : '';
      const project = params.project != null ? String(params.project) : undefined;
      const tags = params.tags
        ? Array.isArray(params.tags)
          ? params.tags.map((t) => String(t))
          : [String(params.tags)]
        : undefined;

      const result = await rememberService.rememberFact({
        content,
        agent,
        sessionId,
        project,
        tags,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              data: {
                entry_id: result.entry_id,
                project: project ?? 'default',
                path: result.file,
              },
            }),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes('content') ? 'InvalidParams' : 'InternalError';

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
