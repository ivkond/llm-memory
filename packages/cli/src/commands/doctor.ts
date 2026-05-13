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

export const doctorCommand = new Command()
  .name('doctor')
  .description('Run non-mutating recovery diagnostics')
  .option('-f, --format <format>', 'Output format (rich, json)', 'rich')
  .option('--strict', 'Exit with failure on warnings', false)
  .option('-w, --wiki <path>', 'Wiki directory path')
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (options: { format?: string; strict?: boolean; wiki?: string; verbose?: boolean }) => {
    const format = options.format ?? 'rich';
    const strict = options.strict ?? false;
    const verbose = options.verbose ?? false;
    const wikiPath = options.wiki ?? (await findWikiRoot());

    if (!wikiPath) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
      process.exit(1);
    }

    try {
      const config = await new ConfigLoader(wikiPath).load();
      const result = await buildContainer(config).recovery.doctor();

      if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n\x1b[1mDoctor\x1b[0m\n');
        if (result.findings.length === 0) {
          console.log('No findings');
        }
        for (const finding of result.findings) {
          const evidence = finding.evidence ? ` (${finding.evidence})` : '';
          console.log(`- [${finding.severity}] ${finding.component}/${finding.code}: ${finding.message}${evidence}`);
          if (finding.repair_command) {
            console.log(`  repair: ${finding.repair_command}`);
          }
        }
      }

      const hasErrors = result.findings.some((f) => f.severity === 'error');
      const hasWarnings = result.findings.some((f) => f.severity === 'warning');
      if (hasErrors || (strict && hasWarnings)) {
        process.exit(1);
      }

      if (verbose) {
        console.log(`Checked wiki: ${wikiPath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('\x1b[31m%s\x1b[0m', `Error: ${message}`);
      process.exit(1);
    }
  });
