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
import { ConfigLoader } from '@ivkond-llm-wiki/infra';
import type { AppServices } from '@ivkond-llm-wiki/common';
import { buildContainer } from '@ivkond-llm-wiki/common';
import { findWikiRoot, printIdempotencyReplay, toOptionalCliString } from './wiki-context.js';

function getWikiPathArg(args: string[], options: Record<string, unknown>): string | null {
  const wiki = toOptionalCliString(options.wiki);
  if (wiki) return wiki;
  const envPath = process.env.LLM_WIKI_PATH;
  if (envPath) return envPath;
  return null;
}

function printNoWikiError(): never {
  console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
  console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
  process.exit(1);
}

function logIngestedPages(kind: 'created' | 'updated', paths: string[]): void {
  if (paths.length === 0) return;
  const label = kind === 'created' ? '✓ Created' : '↑ Updated';
  const color = kind === 'created' ? '\x1b[32m%s\x1b[0m' : '\x1b[33m%s\x1b[0m';
  console.log(color, `${label} ${paths.length} page(s):`);
  for (const filePath of paths) {
    console.log(`  - ${filePath}`);
  }
}

async function runIngest(
  services: AppServices,
  source: string,
  idempotencyKey: string | undefined,
  verbose: boolean,
): Promise<void> {
  console.log('Ingesting from:', source);
  const startTime = Date.now();
  const result = await services.ingest.ingest({ source, idempotencyKey });
  const elapsed = Date.now() - startTime;

  logIngestedPages('created', result.pages_created);
  logIngestedPages('updated', result.pages_updated);

  console.log(`\nCommit: ${result.commit_sha.slice(0, 7)}`);
  printIdempotencyReplay(result.idempotency_replayed, idempotencyKey);
  if (verbose) console.log(`Completed in ${elapsed}ms`);
}

export const ingestCommand = new Command()
  .name('ingest')
  .description('Ingest content from a source')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-d, --dry-run', 'Dry run (no changes)', false)
  .option('-w, --wiki <path>', 'Wiki directory path')
  .option('--idempotency-key <key>', 'Idempotency key for retry-safe ingest')
  .argument('<source>', 'Source to ingest (file path or URL)')
  .action(
    async (
      source: string,
      options: { verbose?: boolean; dryRun?: boolean; wiki?: string; idempotencyKey?: string },
    ) => {
      const verbose = options.verbose ?? false;
      const dryRun = options.dryRun ?? false;

      // Find wiki directory
      const wikiArg = getWikiPathArg([], options);
      const wikiPath = wikiArg ?? (await findWikiRoot());

      if (!wikiPath) {
        printNoWikiError();
      }

      if (verbose) console.log(`Wiki path: ${wikiPath}`);
      if (verbose) console.log(`Source: ${source}`);

      try {
        const configLoader = new ConfigLoader(wikiPath);
        const config = await configLoader.load();
        const services = buildContainer(config);

        if (dryRun) {
          console.log('[DRY RUN] Would ingest from:', source);
          console.log('Skipping service call (dry-run mode)');
          return;
        }
        await runIngest(services, source, options.idempotencyKey, verbose);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\x1b[31m%s\x1b[0m`, `Error: ${message}`);
        if (verbose) {
          console.error(error);
        }
        process.exit(1);
      }
    },
  );
