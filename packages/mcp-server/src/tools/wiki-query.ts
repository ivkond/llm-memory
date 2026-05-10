import type { AppServices } from '@ivkond-llm-wiki/common';

/**
 * Handler for `wiki_query` — wires to QueryService.
 *
 * Per D-04: Success returns `{ success: true, data: T }`, failure returns `{ success: false, error: string, code?: string }`.
 * Per D-09: Returns raw citations when LLM fails (empty answer but citations populated).
 */
export function createWikiQueryHandler(services: AppServices) {
  return async (params: Record<string, unknown>) => {
    try {
      const { query: queryService } = services;
      if (!queryService) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'QueryService not available',
                code: 'InternalError',
              }),
            },
          ],
        };
      }

      const request = {
        question: String(params.question ?? ''),
        scope: params.scope ? String(params.scope) : undefined,
        project: params.project ? String(params.project) : undefined,
        cwd: params.cwd ? String(params.cwd) : undefined,
        maxResults: typeof params.maxResults === 'number' ? params.maxResults : undefined,
        maxTokens: typeof params.maxTokens === 'number' ? params.maxTokens : undefined,
      };

      const result = await queryService.query(request);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, data: result }) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes('search returned no results')
        ? 'InvalidParams'
        : 'InternalError';

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ success: false, error: message, code }) },
        ],
      };
    }
  };
}
