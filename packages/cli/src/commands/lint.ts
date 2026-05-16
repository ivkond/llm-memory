/**
 * lint command - Run lint operations
 *
 * Lint phases:
 * - consolidate: Merge verbatim entries into wiki pages
 * - promote: Promote cross-project patterns to wiki/patterns
 * - health: Check for orphaned pages, stale content, broken links
 */
import { Command } from 'commander';
import {
  exitWithError,
  loadServicesForWiki,
  printIdempotencyReplay,
  resolveWikiPath,
} from './wiki-context.js';

type LintPhaseName = 'consolidate' | 'promote' | 'health';

const VALID_PHASES: LintPhaseName[] = ['consolidate', 'promote', 'health'];

type LintSummaryReport = {
  consolidated: number;
  promoted: number;
  issues: readonly { type: string; page: string; description: string }[];
  commitSha?: string | null;
  idempotencyReplayed?: boolean;
};

function parsePhases(phasesInput: string): LintPhaseName[] {
  return phasesInput
    .split(',')
    .map((phase) => phase.trim() as LintPhaseName)
    .filter((phase) => VALID_PHASES.includes(phase));
}

function printNoValidPhasesError(): never {
  console.error('\x1b[31m%s\x1b[0m', 'Error: No valid phases specified');
  console.error('Valid phases:', VALID_PHASES.join(', '));
  process.exit(1);
}

function printLintSummary(
  phases: LintPhaseName[],
  report: LintSummaryReport,
  idempotencyKey: string | undefined,
  verbose: boolean,
  elapsedMs: number,
): void {
  console.log('\n\x1b[32m%s\x1b[0m', '✓ Lint complete');

  if (report.consolidated > 0) console.log(`  Consolidated: ${report.consolidated} entries`);
  if (report.promoted > 0) console.log(`  Promoted: ${report.promoted} pages`);
  if (report.issues.length > 0) {
    console.log(`\n\x1b[33m%s\x1b[0m`, `⚠ Found ${report.issues.length} issue(s):`);
    for (const issue of report.issues.slice(0, 10)) {
      console.log(`  - [${issue.type}] ${issue.page}: ${issue.description}`);
    }
    if (report.issues.length > 10) console.log(`  ... and ${report.issues.length - 10} more`);
  }

  if (report.commitSha) console.log(`\nCommit: ${report.commitSha.slice(0, 7)}`);
  printIdempotencyReplay(report.idempotencyReplayed, idempotencyKey);
  if (verbose) console.log(`Completed in ${elapsedMs}ms`);
}

export const lintCommand = new Command()
  .name('lint')
  .description('Run lint operations')
  .option(
    '-p, --phases <phases>',
    'Comma-separated phases (consolidate,promote,health)',
    'consolidate,promote,health',
  )
  .option('-v, --verbose', 'Verbose output', false)
  .option('-w, --wiki <path>', 'Wiki directory path')
  .option('--idempotency-key <key>', 'Idempotency key for retry-safe lint')
  .action(async (options: { phases?: string; verbose?: boolean; wiki?: string; idempotencyKey?: string }) => {
    const phasesInput = options.phases ?? 'consolidate,promote,health';
    const verbose = options.verbose ?? false;

    const phases = parsePhases(phasesInput);

    if (phases.length === 0) {
      printNoValidPhasesError();
    }

    // Find wiki directory
    const wikiPath = await resolveWikiPath(options.wiki);

    if (verbose) console.log(`Wiki path: ${wikiPath}`);
    if (verbose) console.log(`Phases: ${phases.join(', ')}`);

    try {
      const services = await loadServicesForWiki(wikiPath);

      console.log(`Running lint phases: ${phases.join(', ')}`);

      const startTime = Date.now();
      const report = await services.lint.lint({ phases, idempotencyKey: options.idempotencyKey });

      const elapsed = Date.now() - startTime;
      printLintSummary(phases, report, options.idempotencyKey, verbose, elapsed);

      // Exit with error if there are issues
      if (report.issues.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      exitWithError(error, verbose);
    }
  });
