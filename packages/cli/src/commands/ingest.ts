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
import path from 'node:path';
import { ConfigLoader } from '@ivkond-llm-wiki/infra';
import { buildContainer } from '@ivkond-llm-wiki/common';

async function findWikiRoot(): Promise<string | null> {
  // Check common locations
  const candidates = [process.cwd(), path.join(process.env.HOME ?? '', '.llm-wiki')];
  for (const candidate of candidates) {
    try {
      const configPath = path.join(candidate, '.config', 'settings.shared.yaml');
      const { access } = await import('node:fs/promises');
      await access(configPath);
      return candidate;
    } catch {
      // Config not found here, continue
    }
  }
  return null;
}

function getWikiPathArg(args: string[], options: Record<string, unknown>): string | null {
  if (options.wiki) {
    return String(options.wiki);
  }
  const envPath = process.env.LLM_WIKI_PATH;
  if (envPath) return envPath;
  return null;
}

export const ingestCommand = new Command()
  .name('ingest')
  .description('Ingest content from a source')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-d, --dry-run', 'Dry run (no changes)', false)
  .option('-w, --wiki <path>', 'Wiki directory path')
  .argument('<source>', 'Source to ingest (file path or URL)')
  .action(
    async (source: string, options: { verbose?: boolean; dryRun?: boolean; wiki?: string }) => {
      const verbose = options.verbose ?? false;
      const dryRun = options.dryRun ?? false;

      // Find wiki directory
      const wikiArg = getWikiPathArg([], options);
      const wikiPath = wikiArg ?? (await findWikiRoot());

      if (!wikiPath) {
        console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
        console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
        process.exit(1);
      }

      if (verbose) console.log(`Wiki path: ${wikiPath}`);
      if (verbose) console.log(`Source: ${source}`);

      try {
        // Load config and build services
        const configLoader = new ConfigLoader(wikiPath);
        const config = await configLoader.load();
        const services = buildContainer(config);

        if (dryRun) {
          console.log('[DRY RUN] Would ingest from:', source);
          console.log('Skipping service call (dry-run mode)');
          return;
        }

        console.log('Ingesting from:', source);

        const startTime = Date.now();
        const result = await services.ingest.ingest({ source });

        const elapsed = Date.now() - startTime;

        if (result.pages_created.length > 0) {
          console.log('\x1b[32m%s\x1b[0m', `✓ Created ${result.pages_created.length} page(s):`);
          for (const p of result.pages_created) {
            console.log(`  - ${p}`);
          }
        }
        if (result.pages_updated.length > 0) {
          console.log('\x1b[33m%s\x1b[0m', `↑ Updated ${result.pages_updated.length} page(s):`);
          for (const p of result.pages_updated) {
            console.log(`  - ${p}`);
          }
        }
        console.log(`\nCommit: ${result.commit_sha.slice(0, 7)}`);

        if (verbose) {
          console.log(`Completed in ${elapsed}ms`);
        }
      } catch (error) {
        const lockOperation = coordinationOperation(error);
        const message = lockOperation
          ? `Another write is in progress (${lockOperation}). Retry after it completes.`
          : error instanceof Error
            ? error.message
            : String(error);
        console.error(`\x1b[31m%s\x1b[0m`, `Error: ${message}`);
        if (verbose) {
          console.error(error);
        }
        process.exit(1);
      }
    },
  );

function coordinationOperation(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  const operation = (error as { operation?: unknown }).operation;
  if (
    (code === 'WRITE_LOCK_TIMEOUT' || code === 'WRITE_LOCK_ACQUISITION_FAILED') &&
    typeof operation === 'string'
  ) {
    return operation;
  }
  return null;
}
