import type { AppServices } from '@llm-wiki/common';

/**
 * Handler for `wiki_status` — wires to WikiStatusService.
 *
 * Per D-04: Success returns `{ success: true, data: T }`, failure returns `{ success: false, error: string, code?: string }`.
 * Per D-07: Returns `{ total_pages, projects, unconsolidated, index_health, last_lint, last_ingest }`.
 */
export function createWikiStatusHandler(services: AppServices) {
  return async (_params: Record<string, unknown>) => {
    try {
      const { status: statusService } = services;
      if (!statusService) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'WikiStatusService not available',
                code: 'InternalError',
              }),
            },
          ],
        };
      }

      const result = await statusService.status();

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
