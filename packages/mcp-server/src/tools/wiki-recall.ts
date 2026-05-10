import type { AppServices } from '@ivkond-llm-wiki/common';

/**
 * Handler for `wiki_recall` — wires to RecallService.
 *
 * Per D-04: Success returns `{ success: true, data: T }`, failure returns `{ success: false, error: string, code?: string }`.
 * Per D-06: Returns `{ project, pages, unconsolidated_count, total_pages }`.
 */
export function createWikiRecallHandler(services: AppServices) {
  return async (params: Record<string, unknown>) => {
    try {
      const { recall: recallService } = services;
      if (!recallService) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'RecallService not available',
                code: 'InternalError',
              }),
            },
          ],
        };
      }

      const request = {
        cwd: String(params.cwd ?? ''),
        max_tokens: typeof params.max_tokens === 'number' ? params.max_tokens : undefined,
      };

      const result = await recallService.recall(request);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, data: result }) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: message, code: 'InternalError' }),
          },
        ],
      };
    }
  };
}
