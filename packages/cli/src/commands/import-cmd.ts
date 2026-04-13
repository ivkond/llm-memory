/**
 * import command - Import from external sources
 *
 * Imports from:
 * - Claude Code memory (claude-code)
 */
import { Command } from 'commander';

export const importCommand = new Command()
  .name('import')
  .description('Import from external sources')
  .option('-a, --agent <agent>', 'Agent to import from (claude-code, all)', 'claude-code')
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (options: { agent?: string; verbose?: boolean }) => {
    const agent = options.agent ?? 'claude-code';
    const verbose = options.verbose ?? false;

    console.log('Importing from agent:', agent);

    // TODO: Wire up to ImportService.run
    console.log('Import command not yet fully implemented');
    console.log('Agent:', agent);
    console.log('Verbose:', verbose);
  });
