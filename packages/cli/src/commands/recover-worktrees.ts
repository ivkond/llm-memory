import { Command } from 'commander';
import path from 'node:path';
import { ConfigLoader, GitVersionControl } from '@ivkond-llm-wiki/infra';

async function findWikiRoot(): Promise<string | null> {
  const candidates = [process.cwd(), path.join(process.env.HOME ?? '', '.llm-wiki')];
  for (const candidate of candidates) {
    try {
      const configPath = path.join(candidate, '.config', 'settings.shared.yaml');
      const { access } = await import('node:fs/promises');
      await access(configPath);
      return candidate;
    } catch {
      // Continue
    }
  }
  return null;
}

type Options = {
  wiki?: string;
  pruneClean?: boolean;
  worktree?: string;
  force?: boolean;
};

export const recoverWorktreesCommand = new Command()
  .name('recover-worktrees')
  .description('Diagnose managed worktrees and optionally prune safe stale/clean ones')
  .option('-w, --wiki <path>', 'Wiki directory path')
  .option('--prune-clean', 'Prune clean/stale managed worktrees', false)
  .option('--worktree <path>', 'Target one specific managed worktree for cleanup')
  .option('--force', 'Allow cleanup when worktree is dirty/conflicted or main repo is dirty', false)
  .action(async (options: Options) => {
    const wikiPath = options.wiki ?? (await findWikiRoot());
    if (!wikiPath) {
      console.error('\x1b[31m%s\x1b[0m', 'Error: No wiki found');
      console.error('Run "llm-wiki init" first, or use --wiki to specify the path');
      process.exit(1);
    }

    const config = await new ConfigLoader(wikiPath).load();
    const vcs = new GitVersionControl(config.wiki.path);
    const managed = await vcs.listManagedWorktrees();

    console.log(`\n\x1b[1mManaged Worktrees\x1b[0m\n`);
    if (managed.length === 0) {
      console.log('  none');
    } else {
      for (const wt of managed) {
        const branch = wt.branch ?? '(detached)';
        console.log(`  - ${wt.status.padEnd(10)} ${wt.path} [${branch}]`);
      }
    }

    const requested =
      options.worktree != null
        ? managed.filter((wt) => wt.path === path.resolve(options.worktree as string))
        : options.pruneClean
          ? managed.filter((wt) => wt.status === 'clean' || wt.status === 'stale')
          : [];

    if (options.worktree && requested.length === 0) {
      console.error('\n\x1b[31m%s\x1b[0m', 'Error: specified worktree is not a managed worktree');
      process.exit(1);
    }

    const planned = requested.filter((wt) => {
      if (options.force) return true;
      return wt.status === 'clean' || wt.status === 'stale';
    });
    const blocked = requested.filter((wt) => !planned.includes(wt));

    if (!options.pruneClean && !options.worktree) {
      console.log('\nNo cleanup flags passed. Dry-run diagnostics only.');
      return;
    }

    if (blocked.length > 0) {
      console.log('\nPreserved by default (use --force to override):');
      for (const wt of blocked) {
        console.log(`  - ${wt.path} (${wt.status})`);
      }
    }

    console.log('\nPlanned cleanup actions:');
    if (planned.length === 0) {
      console.log('  none');
      return;
    }
    for (const wt of planned) {
      console.log(`  - remove ${wt.path} (${wt.status})`);
    }

    const mainDirty = await vcs.hasUncommittedChanges();
    if (mainDirty && !options.force) {
      console.log('\nMain repository is dirty. No cleanup executed (use --force to override).');
      return;
    }

    for (const wt of planned) {
      const forceRemove = options.force || wt.status !== 'clean';
      await vcs.removeWorktree(wt.path, forceRemove);
      console.log(`Executed: removed ${wt.path}`);
    }
  });
