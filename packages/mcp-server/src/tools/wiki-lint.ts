import type { AppServices } from '@llm-wiki/common';

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
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'LintService not available',
                code: 'InternalError',
              }),
            },
          ],
        };
      }

      let phases: LintPhaseName[] | undefined;
      if (params.phases != null) {
        if (Array.isArray(params.phases)) {
          phases = params.phases.map((p) => {
            const phase = String(p);
            if (phase === 'consolidate' || phase === 'promote' || phase === 'health') {
              return phase;
            }
            throw new Error(`Invalid phase: ${phase}`);
          });
        } else if (String(params.phases) === 'all') {
          phases = undefined;
        }
      }

      const project = params.project != null ? String(params.project) : undefined;

      const report = await lintService.lint({ phases, project });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              data: {
                phases_run: phases ?? ['consolidate', 'promote', 'health'],
                report: {
                  consolidated: report.consolidated,
                  promoted: report.promoted,
                  issues_count: report.issues.length,
                  commit_sha: report.commitSha,
                },
                entries_consolidated: report.consolidated,
                entries_promoted: report.promoted,
              },
            }),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes('Invalid phase') ? 'InvalidParams' : 'InternalError';

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
