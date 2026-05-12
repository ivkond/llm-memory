/**
 * lint command - Run lint operations
 *
 * Lint phases:
 * - consolidate: Merge verbatim entries into wiki pages
 * - promote: Promote cross-project patterns to wiki/patterns
 * - health: Check for orphaned pages, stale content, broken links
 */
import { Command } from 'commander';
import path from 'node:path';
import { ConfigLoader } from '@ivkond-llm-wiki/infra';
import { buildContainer } from '@ivkond-llm-wiki/common';

type LintPhaseName = 'consolidate' | 'promote' | 'health';

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

const VALID_PHASES: LintPhaseName[] = ['consolidate', 'promote', 'health'];

export const lintCommand = new Command()
  .name('lint')
  .description('Run lint operations')
  .option(
    '-p, --phases <phases>',
    'Comma-separated phases (consolidate,promote,health)',
    'consolidate,promote,health',
  )
  .option('-v, --verbose', 'Verbose output', false)
  .option('-w, --wiki <path>', 'Wiki directory path')
  .option('--idempotency-key <key>', 'Idempotency key for retry-safe lint')
  .action(async (options: { phases?: string; verbose?: boolean; wiki?: string; idempotencyKey?: string }) => {
    const phasesInput = options.phases ?? 'consolidate,promote,health';
    const verbose = options.verbose ?? false;

    // Parse phases
    const phases = phasesInput
      .split(',')
      .map((p) => p.trim() as LintPhaseName)
      .filter((p) => VALID_PHASES.includes(p));

    if (phases.length === 0) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: No valid phases specified');
      console.error('Valid phases:', VALID_PHASES.join(', '));
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
    if (verbose) console.log(`Phases: ${phases.join(', ')}`);

    try {
      // Load config and build services
      const configLoader = new ConfigLoader(wikiPath);
      const config = await configLoader.load();
      const services = buildContainer(config);

      console.log(`Running lint phases: ${phases.join(', ')}`);

      const startTime = Date.now();
      const report = await services.lint.lint({ phases, idempotencyKey: options.idempotencyKey });

      const elapsed = Date.now() - startTime;

      // Display results
      console.log('\n\x1b[32m%s\x1b[0m', '✓ Lint complete');

      if (report.consolidated > 0) {
        console.log(`  Consolidated: ${report.consolidated} entries`);
      }
      if (report.promoted > 0) {
        console.log(`  Promoted: ${report.promoted} pages`);
      }
      if (report.issues.length > 0) {
        console.log(`\n\x1b[33m%s\x1b[0m`, `⚠ Found ${report.issues.length} issue(s):`);
        for (const issue of report.issues.slice(0, 10)) {
          console.log(`  - [${issue.type}] ${issue.page}: ${issue.description}`);
        }
        if (report.issues.length > 10) {
          console.log(`  ... and ${report.issues.length - 10} more`);
        }
      }

      if (report.commitSha) {
        console.log(`\nCommit: ${report.commitSha.slice(0, 7)}`);
      }
      if (report.idempotencyReplayed && options.idempotencyKey) {
        console.log(`Replayed idempotent result for key ${options.idempotencyKey}`);
      }

      if (verbose) {
        console.log(`Completed in ${elapsed}ms`);
      }

      // Exit with error if there are issues
      if (report.issues.length > 0) {
        process.exit(1);
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
