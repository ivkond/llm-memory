/**
 * import command - Import from external sources
 *
 * Imports from:
 * - Claude Code memory (claude-code)
 */
import { Command } from 'commander';
import path from 'node:path';
import { ConfigLoader } from '@llm-wiki/infra';
import { buildContainer } from '@llm-wiki/common';

const SUPPORTED_AGENTS = ['claude-code'];

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

export const importCommand = new Command()
  .name('import')
  .description('Import from external sources')
  .option('-a, --agent <agent>', 'Agent to import from (claude-code, all)', 'claude-code')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-w, --wiki <path>', 'Wiki directory path')
  .action(async (options: { agent?: string; verbose?: boolean; wiki?: string }) => {
    const agent = options.agent ?? 'claude-code';
    const verbose = options.verbose ?? false;

    // Validate agent
    if (agent !== 'all' && !SUPPORTED_AGENTS.includes(agent)) {
      console.error('\x1b[31m%s\x1b[0m', `Error: Unknown agent "${agent}"`);
      console.error(`Supported agents: ${SUPPORTED_AGENTS.join(', ')}, all`);
      process.exit(1);
    }

    // Find wiki directory
    const wikiPath = options.wiki ?? (await findWikiRoot());

    if (!wikiPath) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
      console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
      process.exit(1);
    }

    if (verbose) console.log(`Wiki path: ${wikiPath}`);
    if (verbose) console.log(`Agent: ${agent}`);

    try {
      // Load config and build services
      const configLoader = new ConfigLoader(wikiPath);
      const config = await configLoader.load();
      const services = buildContainer(config);

      console.log(`Importing from: ${agent}`);

      const startTime = Date.now();
      const agents = agent === 'all' ? undefined : [agent];
      const result = await services.import_.importAll({ agents });

      const elapsed = Date.now() - startTime;

      // Display results
      let totalImported = 0;
      let totalSkipped = 0;

      for (const agentResult of result.agents) {
        totalImported += agentResult.imported;
        totalSkipped += agentResult.skipped;

        if (agentResult.error) {
          console.log(`\n\x1b[31m%s\x1b[0m`, `✗ ${agentResult.agent}: ${agentResult.error}`);
        } else {
          console.log(
            `\n\x1b[32m%s\x1b[0m`,
            `✓ ${agentResult.agent}: ${agentResult.imported} imported (${agentResult.skipped} skipped)`,
          );
          if (verbose && agentResult.discovered > 0) {
            console.log(`  Discovered: ${agentResult.discovered}`);
          }
        }
      }

      if (totalImported === 0) {
        console.log('\nNo entries to import');
      } else {
        console.log(`\nTotal: ${totalImported} imported, ${totalSkipped} skipped`);
      }

      if (verbose) {
        console.log(`Completed in ${elapsed}ms`);
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
