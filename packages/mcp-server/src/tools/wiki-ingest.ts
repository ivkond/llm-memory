import type { AppServices } from '@ivkond-llm-wiki/common';
import { isCoordinationError } from './write-coordination-error.js';

/**
 * Handler for `wiki_ingest` — wires to IngestService.
 *
 * Per D-07: Implements N retries (configurable), then rollback with error report.
 * Per D-11: Success returns `{ success: true, data: { page_path, project, worktree_cleaned: true } }`.
 * Failure returns `{ success: false, error: string, code?: string }`.
 */
export function createWikiIngestHandler(services: AppServices) {
  return async (params: Record<string, unknown>) => {
    const maxRetries = parseRetryCount(params.retries);
    if (maxRetries === null) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'retries must be a finite number',
              code: 'InvalidParams',
            }),
          },
        ],
      };
    }
    const project = params.project != null ? String(params.project) : undefined;
    if (project) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'project-scoped ingest is not supported yet',
              code: 'PROJECT_SCOPE_UNSUPPORTED',
            }),
          },
        ],
      };
    }

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

        const result = await ingestService.ingest({ source, hint });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                data: {
                  page_path: result.pages_created[0] ?? result.pages_updated[0] ?? '',
                  project: 'default',
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
                code: isCoordinationError(error) ? 'WRITE_COORDINATION_FAILED' : 'InternalError',
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

function parseRetryCount(raw: unknown): number | null {
  if (raw == null) return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  // Bound retries to prevent untrusted inputs from causing excessive loops.
  return Math.max(1, Math.min(5, Math.trunc(parsed)));
}
