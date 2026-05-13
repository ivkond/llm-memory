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
      // Continue searching
    }
  }
  return null;
}

export const repairIndexCommand = new Command()
  .name('repair-index')
  .description('Rebuild search index from wiki markdown pages')
  .option('--dry-run', 'Report what would be indexed without writing', false)
  .option('-f, --format <format>', 'Output format (rich, json)', 'rich')
  .option('-w, --wiki <path>', 'Wiki directory path')
  .action(async (options: { dryRun?: boolean; format?: string; wiki?: string }) => {
    const dryRun = options.dryRun ?? false;
    const format = options.format ?? 'rich';
    const wikiPath = options.wiki ?? (await findWikiRoot());

    if (!wikiPath) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
      process.exit(1);
    }

    try {
      const config = await new ConfigLoader(wikiPath).load();
      const result = await buildContainer(config).recovery.repairIndex({ dryRun });

      if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const mode = dryRun ? 'Dry run' : 'Rebuilt';
        console.log(`${mode} index entries: ${result.indexed}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('\x1b[31m%s\x1b[0m', `Error: ${message}`);
      process.exit(1);
    }
  });
