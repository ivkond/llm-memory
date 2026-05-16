/**
 * import command - Import from external sources
 *
 * Imports from:
 * - Claude Code memory (claude-code)
 */
import { Command } from 'commander';
import { ConfigLoader } from '@ivkond-llm-wiki/infra';
import { buildContainer } from '@ivkond-llm-wiki/common';
import { findWikiRoot, printIdempotencyReplay } from './wiki-context.js';

const SUPPORTED_AGENTS = ['claude-code'];

function printUnknownAgentError(agent: string): never {
  console.error('\x1b[31m%s\x1b[0m', `Error: Unknown agent "${agent}"`);
  console.error(`Supported agents: ${SUPPORTED_AGENTS.join(', ')}, all`);
  process.exit(1);
}

function printNoWikiError(): never {
  console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
  console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
  process.exit(1);
}

type ImportAgentResult = {
  agent: string;
  imported: number;
  skipped: number;
  discovered: number;
  error?: string;
};

function printImportAgentResult(agentResult: ImportAgentResult, verbose: boolean): {
  imported: number;
  skipped: number;
} {
  if (agentResult.error) {
    console.log(`\n\x1b[31m%s\x1b[0m`, `✗ ${agentResult.agent}: ${agentResult.error}`);
    return { imported: 0, skipped: 0 };
  }
  console.log(
    `\n\x1b[32m%s\x1b[0m`,
    `✓ ${agentResult.agent}: ${agentResult.imported} imported (${agentResult.skipped} skipped)`,
  );
  if (verbose && agentResult.discovered > 0) {
    console.log(`  Discovered: ${agentResult.discovered}`);
  }
  return { imported: agentResult.imported, skipped: agentResult.skipped };
}

function printImportSummary(totalImported: number, totalSkipped: number): void {
  if (totalImported === 0) {
    console.log('\nNo entries to import');
    return;
  }
  console.log(`\nTotal: ${totalImported} imported, ${totalSkipped} skipped`);
}

export const importCommand = new Command()
  .name('import')
  .description('Import from external sources')
  .option('-a, --agent <agent>', 'Agent to import from (claude-code, all)', 'claude-code')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-w, --wiki <path>', 'Wiki directory path')
  .option('--idempotency-key <key>', 'Idempotency key for retry-safe import')
  .action(async (options: { agent?: string; verbose?: boolean; wiki?: string; idempotencyKey?: string }) => {
    const agent = options.agent ?? 'claude-code';
    const verbose = options.verbose ?? false;

    // Validate agent
    if (agent !== 'all' && !SUPPORTED_AGENTS.includes(agent)) {
      printUnknownAgentError(agent);
    }

    // Find wiki directory
    const wikiPath = options.wiki ?? (await findWikiRoot());

    if (!wikiPath) {
      printNoWikiError();
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
      const result = await services.import_.importAll({
        agents,
        idempotencyKey: options.idempotencyKey,
      });

      const elapsed = Date.now() - startTime;

      // Display results
      let totalImported = 0;
      let totalSkipped = 0;

      for (const agentResult of result.agents) {
        const totals = printImportAgentResult(agentResult, verbose);
        totalImported += totals.imported;
        totalSkipped += totals.skipped;
      }
      printImportSummary(totalImported, totalSkipped);
      printIdempotencyReplay(result.idempotency_replayed, options.idempotencyKey);

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
