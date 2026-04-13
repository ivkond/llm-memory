/**
 * search command - Search the wiki
 *
 * Uses hybrid search (BM25 + vector) with RRF fusion.
 */
import { Command } from 'commander';

export const searchCommand = new Command()
  .name('search')
  .description('Search the wiki')
  .option('-l, --limit <limit>', 'Maximum results (default: 10)', '10')
  .option('-f, --format <format>', 'Output format (rich, json)', 'rich')
  .argument('<query>', 'Search query')
  .action(async (query: string, options: { limit?: string; format?: string }) => {
    const limit = parseInt(options.limit ?? '10', 10);
    const format = options.format ?? 'rich';

    console.log('Searching for:', query);

    // TODO: Wire up to QueryService.query
    console.log('Search command not yet fully implemented');
    console.log('Query:', query);
    console.log('Limit:', limit);
    console.log('Format:', format);
  });
