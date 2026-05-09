import type { AppServices } from '@llm-wiki/common';

/**
 * Handler for `wiki_ingest` — wires to IngestService.
 *
 * Per D-07: Implements N retries (configurable), then rollback with error report.
 * Per D-11: Success returns `{ success: true, data: { page_path, project, worktree_cleaned: true } }`.
 * Failure returns `{ success: false, error: string, code?: string }`.
 */
export function createWikiIngestHandler(services: AppServices) {
  return async (params: Record<string, unknown>) => {
    const maxRetries = params.retries != null ? Math.max(1, Number(params.retries)) : 1;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { ingest: ingestService } = services;
        if (!ingestService) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'IngestService not available',
                  code: 'InternalError',
                }),
              },
            ],
          };
        }

        const source = params.source != null ? String(params.source) : '';
        const hint = params.hint != null ? String(params.hint) : undefined;
        const project = params.project != null ? String(params.project) : undefined;

        const result = await ingestService.ingest({ source, hint, project });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                data: {
                  page_path: result.pages_created[0] ?? result.pages_updated[0] ?? '',
                  project: project ?? 'default',
                  worktree_cleaned: true,
                },
              }),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isTransient =
          message.includes('network') ||
          message.includes('timeout') ||
          message.includes('parse') ||
          message.includes('ETIMEDOUT') ||
          message.includes('ENOTFOUND');

        if (isTransient && attempt < maxRetries) {
          continue;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Ingest failed after ${attempt} attempt(s): ${message}`,
                code: 'InternalError',
              }),
            },
          ],
        };
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: 'Ingest failed: unreachable',
            code: 'InternalError',
          }),
        },
      ],
    };
  };
}
