/**
 * status command - Show wiki status
 *
 * Shows:
 * - Wiki path
 * - Number of wiki pages
 * - Number of projects
 * - Number of verbatim entries
 * - Search index health
 */
import { Command } from 'commander';

export const statusCommand = new Command()
  .name('status')
  .description('Show wiki status')
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (options: { verbose?: boolean }) => {
    const verbose = options.verbose ?? false;

    console.log('Wiki Status');

    // TODO: Wire up to WikiStatusService.status
    console.log('Status command not yet fully implemented');
    console.log('Verbose:', verbose);
  });
