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

export const verifyStateCommand = new Command()
  .name('verify-state')
  .description('Verify runtime state and wiki markers')
  .option('-f, --format <format>', 'Output format (rich, json)', 'rich')
  .option('-w, --wiki <path>', 'Wiki directory path')
  .action(async (options: { format?: string; wiki?: string }) => {
    const format = options.format ?? 'rich';
    const wikiPath = options.wiki ?? (await findWikiRoot());

    if (!wikiPath) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
      process.exit(1);
    }

    try {
      const config = await new ConfigLoader(wikiPath).load();
      const result = await buildContainer(config).recovery.verifyState();

      if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n\x1b[1mVerify State\x1b[0m\n');
        if (result.findings.length === 0) {
          console.log('State is valid');
        }
        for (const finding of result.findings) {
          console.log(`- [${finding.severity}] ${finding.component}/${finding.code}: ${finding.message}`);
        }
      }

      if (result.findings.some((f) => f.severity === 'error')) {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('\x1b[31m%s\x1b[0m', `Error: ${message}`);
      process.exit(1);
    }
  });
