import type { AppServices } from '@ivkond-llm-wiki/common';
import { toolError, toolSuccess, toOptionalString } from './tool-response.js';

type LintPhaseName = 'consolidate' | 'promote' | 'health';

/**
 * Handler for `wiki_lint` — wires to LintService.
 *
 * Per D-12: Supports all 3 phases: consolidate, promote, health.
 * Per D-13: Default runs all phases unless `phases` param specifies subset.
 * Per D-15: Success returns `{ success: true, data: { phases_run, report, entries_consolidated, entries_promoted } }`.
 * Failure returns `{ success: false, error: string, code?: string }`.
 */
export function createWikiLintHandler(services: AppServices) {
  return async (params: Record<string, unknown>) => {
    try {
      const { lint: lintService } = services;
      if (!lintService) {
        return toolError('LintService not available', 'InternalError');
      }

      let phases: LintPhaseName[] | undefined;
      if (params.phases != null) {
        if (Array.isArray(params.phases)) {
          phases = params.phases.map((p) => {
            const phase = toOptionalString(p);
            if (!phase) throw new Error('Invalid phase: non-string value');
            if (phase === 'consolidate' || phase === 'promote' || phase === 'health') {
              return phase;
            }
            throw new Error(`Invalid phase: ${phase}`);
          });
        } else if (toOptionalString(params.phases) === 'all') {
          phases = undefined;
        }
      }

      const project = toOptionalString(params.project);
      const idempotencyKey = toOptionalString(params.idempotencyKey);
      if (project) {
        return toolError('project-scoped lint is not supported yet', 'PROJECT_SCOPE_UNSUPPORTED');
      }

      const report = await lintService.lint({ phases, idempotencyKey });

      return toolSuccess({
        phases_run: phases ?? ['consolidate', 'promote', 'health'],
        report: {
          consolidated: report.consolidated,
          promoted: report.promoted,
          issues_count: report.issues.length,
          commit_sha: report.commitSha,
        },
        entries_consolidated: report.consolidated,
        entries_promoted: report.promoted,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes('Invalid phase') ? 'InvalidParams' : 'InternalError';

      return toolError(message, code);
    }
  };
}
