/**
 * ingest command - Ingest content from a source
 *
 * Sources can be:
 * - Local file paths (file://...)
 * - URLs (http://..., https://...)
 *
 * Content is processed into wiki pages via worktree.
 */
import { Command } from 'commander';

export const ingestCommand = new Command()
  .name('ingest')
  .description('Ingest content from a source')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-d, --dry-run', 'Dry run (no changes)', false)
  .argument('<source>', 'Source to ingest (file path or URL)')
  .action(async (source: string, options: { verbose?: boolean; dryRun?: boolean }) => {
    const verbose = options.verbose ?? false;
    const dryRun = options.dryRun ?? false;

    if (dryRun) {
      console.log('[DRY RUN] Would ingest from:', source);
    } else {
      console.log('Ingesting from:', source);
    }

    // TODO: Wire up to IngestService.ingest
    console.log('Ingest command not yet fully implemented');
    console.log('Source:', source);
    console.log('Options:', { verbose, dryRun });
  });
