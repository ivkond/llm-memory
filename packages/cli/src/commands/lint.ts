/**
 * lint command - Run lint operations
 *
 * Lint phases:
 * - consolidate: Merge verbatim entries into wiki pages
 * - promote: Promote cross-project patterns to wiki/patterns
 * - health: Check for orphaned pages, stale content, broken links
 */
import { Command } from 'commander';

export const lintCommand = new Command()
  .name('lint')
  .description('Run lint operations')
  .option(
    '-p, --phases <phases>',
    'Comma-separated phases (consolidate,promote,health)',
    'consolidate,promote,health',
  )
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (options: { phases?: string; verbose?: boolean }) => {
    const phases = (options.phases ?? 'consolidate,promote,health').split(',').map((p) => p.trim());
    const verbose = options.verbose ?? false;

    console.log('Running lint phases:', phases.join(', '));

    // TODO: Wire up to LintService.run
    console.log('Lint command not yet fully implemented');
    console.log('Phases:', phases);
    console.log('Verbose:', verbose);
  });
