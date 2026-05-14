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

export const repairIndexCommand = new Command()
  .name('repair-index')
  .description('Rebuild search index from canonical wiki/projects markdown')
  .option('-w, --wiki <path>', 'Wiki directory path')
  .option('--dry-run', 'Report candidates without rebuilding index', false)
  .option('-f, --format <format>', 'Output format (rich, json)', 'rich')
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (options: { wiki?: string; dryRun?: boolean; format?: string; verbose?: boolean }) => {
    const wikiPath = options.wiki ?? (await findWikiRoot());

    if (!wikiPath) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
      console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
      process.exit(1);
    }

    try {
      const configLoader = new ConfigLoader(wikiPath);
      const config = await configLoader.load();
      const services = buildContainer(config);

      const startTime = Date.now();
      const result = await services.repairIndex.repair({ dryRun: options.dryRun ?? false });
      const elapsed = Date.now() - startTime;

      if ((options.format ?? 'rich') === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const mode = result.dry_run ? 'DRY RUN' : 'REBUILD';
        console.log(`\n\x1b[1mRepair Index (${mode})\x1b[0m\n`);
        console.log(`  Status: ${result.status}`);
        console.log(`  Candidates: ${result.candidates}`);
        console.log(`  Indexed: ${result.indexed}`);
        console.log(`  Skipped: ${result.skipped}`);
      }

      if (options.verbose) {
        console.log(`\nCompleted in ${elapsed}ms`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('\x1b[31m%s\x1b[0m', `Error: ${message}`);
      if (options.verbose) {
        console.error(error);
      }
      process.exit(1);
    }
  });
