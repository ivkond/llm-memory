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
import path from 'node:path';
import { ConfigLoader } from '@llm-wiki/infra';
import { buildContainer } from '@llm-wiki/common';

async function findWikiRoot(): Promise<string | null> {
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'never';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

export const statusCommand = new Command()
  .name('status')
  .description('Show wiki status')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-w, --wiki <path>', 'Wiki directory path')
  .action(async (options: { verbose?: boolean; wiki?: string }) => {
    const verbose = options.verbose ?? false;

    // Find wiki directory
    const wikiPath = options.wiki ?? (await findWikiRoot());

    if (!wikiPath) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
      console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
      process.exit(1);
    }

    if (verbose) console.log(`Wiki path: ${wikiPath}`);

    try {
      // Load config and build services
      const configLoader = new ConfigLoader(wikiPath);
      const config = await configLoader.load();
      const services = buildContainer(config);

      const startTime = Date.now();
      const status = await services.status.status();

      const elapsed = Date.now() - startTime;

      // Display status
      console.log(`\n\x1b[1mWiki Status\x1b[0m\n`);
      console.log(`  Wiki path: ${wikiPath}`);
      console.log(`  Total pages: ${status.total_pages}`);
      console.log(
        `  Projects: ${status.projects.length > 0 ? status.projects.join(', ') : 'none'}`,
      );

      // Index health
      const healthColors: Record<string, string> = {
        ok: '\x1b[32m',
        stale: '\x1b[33m',
        missing: '\x1b[31m',
      };
      const healthColor = healthColors[status.index_health] || '';
      console.log(`  Index health: ${healthColor}${status.index_health}\x1b[0m`);

      // Verbatim entries
      console.log(`  Unconsolidated entries: ${status.unconsolidated}`);

      // Timestamps
      console.log(`  Last ingest: ${formatDate(status.last_ingest)}`);
      console.log(`  Last lint: ${formatDate(status.last_lint)}`);

      if (verbose) {
        console.log(`\nCompleted in ${elapsed}ms`);
        console.log(`\n\x1b[1mDetails:\x1b[0m`);
        console.log(`  Config wiki path: ${config.wiki.path}`);
        console.log(`  LLM model: ${config.llm.model}`);
        console.log(`  Embedding model: ${config.embedding.model}`);
        console.log(`  Search db: ${config.search.db_path}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\x1b[31m%s\x1b[0m`, `Error: ${message}`);
      if (verbose) {
        console.error(error);
      }
      process.exit(1);
    }
  });
