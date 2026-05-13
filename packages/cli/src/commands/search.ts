/**
 * search command - Search the wiki
 *
 * Uses hybrid search (BM25 + vector) with RRF fusion.
 */
import { Command } from 'commander';
import path from 'node:path';
import { ConfigLoader } from '@ivkond-llm-wiki/infra';
import { buildContainer } from '@ivkond-llm-wiki/common';

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

export const searchCommand = new Command()
  .name('search')
  .description('Search the wiki')
  .option('-l, --limit <limit>', 'Maximum results (default: 10)', '10')
  .option('-f, --format <format>', 'Output format (rich, json)', 'rich')
  .option('--include-stale', 'Include stale citations when staleness exclusion is enabled', false)
  .option(
    '--staleness-mode <mode>',
    'Staleness behavior: prefer_fresh or exclude_stale (default: prefer_fresh)',
    'prefer_fresh',
  )
  .option('-w, --wiki <path>', 'Wiki directory path')
  .option('-v, --verbose', 'Verbose output', false)
  .argument('<query>', 'Search query')
  .action(
    async (
      query: string,
      options: {
        limit?: string;
        format?: string;
        wiki?: string;
        verbose?: boolean;
        includeStale?: boolean;
        stalenessMode?: string;
      },
    ) => {
      const limit = parseInt(options.limit ?? '10', 10);
      const format = options.format ?? 'rich';
      const verbose = options.verbose ?? false;

      // Find wiki directory
      const wikiPath = options.wiki ?? (await findWikiRoot());

      if (!wikiPath) {
        console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
        console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
        process.exit(1);
      }

      if (verbose) console.log(`Wiki path: ${wikiPath}`);
      if (verbose) console.log(`Query: ${query}`);

      try {
        const stalenessMode = options.stalenessMode ?? 'prefer_fresh';
        if (stalenessMode !== 'prefer_fresh' && stalenessMode !== 'exclude_stale') {
          throw new Error(
            `Invalid --staleness-mode '${stalenessMode}'. Use 'prefer_fresh' or 'exclude_stale'.`,
          );
        }

        // Load config and build services
        const configLoader = new ConfigLoader(wikiPath);
        const config = await configLoader.load();
        const services = buildContainer(config);

        const startTime = Date.now();
        const request = {
          question: query,
          maxResults: limit,
          includeStale: options.includeStale ?? false,
          stalenessMode,
        };
        const result = await services.query.query(request);

        const elapsed = Date.now() - startTime;

        // Display results
        if (result.citations.length === 0) {
          console.log('No results found');
          return;
        }

        if (format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\n\x1b[1mResults for "${query}"\x1b[0m\n`);
          console.log(
            `Scope: ${result.scope_used}${result.project_used ? ` (project: ${result.project_used})` : ''}\n`,
          );

          for (let i = 0; i < result.citations.length; i++) {
            const citation = result.citations[i];
            console.log(`\x1b[33m${i + 1}.\x1b[0m \x1b[1m${citation.title}\x1b[0m`);
            console.log(`   ${citation.page}`);
            console.log(
              `   ${citation.excerpt.slice(0, 200)}${citation.excerpt.length > 200 ? '...' : ''}`,
            );
            console.log(`   Score: ${citation.score.toFixed(2)}`);
            if (citation.freshness_status !== 'fresh') {
              const reasons =
                citation.freshness_reasons.length > 0
                  ? ` (${citation.freshness_reasons.join(', ')})`
                  : '';
              console.log(`   Freshness: ${citation.freshness_status}${reasons}`);
            }
          }

          if (result.answer) {
            console.log(`\n\x1b[1mAnswer:\x1b[0m\n${result.answer}`);
          }
        }

        if (verbose) {
          console.log(`\nFound ${result.citations.length} results in ${elapsed}ms`);
        }
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
