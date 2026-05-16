import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

type ConsoleTap = {
  stdout: string[];
  stderr: string[];
  restore: () => void;
};

function tapConsole(): ConsoleTap {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  });

  return {
    stdout,
    stderr,
    restore: () => {
      logSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

function mockExit(): () => void {
  const spy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code);
  }) as typeof process.exit);
  return () => spy.mockRestore();
}

async function writeWikiConfig(wikiPath: string): Promise<void> {
  await mkdir(path.join(wikiPath, '.config'), { recursive: true });
  await mkdir(path.join(wikiPath, '.local'), { recursive: true });
  await writeFile(
    path.join(wikiPath, '.config', 'settings.shared.yaml'),
    `wiki:
  path: ${wikiPath}
llm:
  model: shared-model
mcp:
  port: 7849
`,
  );
  await writeFile(
    path.join(wikiPath, '.local', 'settings.local.yaml'),
    `llm:
  model: local-model
`,
  );
}

async function runCommand(modulePath: string, exportName: string, argv: string[]): Promise<void> {
  vi.resetModules();
  const mod = await import(modulePath);
  const command = mod[exportName];
  await command.parseAsync(argv, { from: 'user' });
}

describe('CLI command coverage', () => {
  let cwd: string;
  let home: string;
  let oldCwd: string;
  let oldHome: string | undefined;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'cli-cwd-'));
    home = await mkdtemp(path.join(tmpdir(), 'cli-home-'));
    oldCwd = process.cwd();
    oldHome = process.env.HOME;
    process.chdir(cwd);
    process.env.HOME = home;
  });

  afterEach(() => {
    process.chdir(oldCwd);
    process.env.HOME = oldHome;
    vi.restoreAllMocks();
    vi.unmock('@ivkond-llm-wiki/infra');
    vi.unmock('@ivkond-llm-wiki/common');
    vi.unmock('simple-git');
  });

  it('init: creates wiki structure and initializes git', async () => {
    const git = {
      init: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ isClean: () => false }),
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      raw: vi.fn().mockResolvedValue('Test User'),
    };
    git.raw.mockResolvedValueOnce('Test User').mockResolvedValueOnce('test@example.com');

    vi.doMock('simple-git', () => ({ simpleGit: () => git }));

    const tap = tapConsole();
    const restoreExit = mockExit();
    const wikiPath = path.join(cwd, 'my-wiki');

    await runCommand('../src/commands/init.ts', 'initCommand', [wikiPath]);

    restoreExit();
    tap.restore();

    await access(path.join(wikiPath, 'wiki', '.gitkeep'));
    await access(path.join(wikiPath, 'projects', '.gitkeep'));
    await access(path.join(wikiPath, '.local', '.gitkeep'));
    const config = await readFile(path.join(wikiPath, '.config', 'settings.shared.yaml'), 'utf-8');
    expect(git.init).toHaveBeenCalled();
    expect(git.commit).toHaveBeenCalledWith('Initial commit');
    expect(config).toContain(`path: ${wikiPath}`);
    expect(config).toContain('model: gpt-4o-mini');
    expect(tap.stdout.join('\n')).toContain('Wiki initialized successfully');
  });

  it('init: exits with actionable message when git identity is missing', async () => {
    const git = {
      init: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ isClean: () => false }),
      add: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      raw: vi.fn().mockResolvedValue(''),
    };
    vi.doMock('simple-git', () => ({ simpleGit: () => git }));

    const tap = tapConsole();
    const restoreExit = mockExit();
    const wikiPath = path.join(cwd, 'wiki-no-identity');
    const oldAuthorName = process.env.GIT_AUTHOR_NAME;
    const oldAuthorEmail = process.env.GIT_AUTHOR_EMAIL;
    const oldCommitterName = process.env.GIT_COMMITTER_NAME;
    const oldCommitterEmail = process.env.GIT_COMMITTER_EMAIL;
    delete process.env.GIT_AUTHOR_NAME;
    delete process.env.GIT_AUTHOR_EMAIL;
    delete process.env.GIT_COMMITTER_NAME;
    delete process.env.GIT_COMMITTER_EMAIL;

    try {
      await expect(
        runCommand('../src/commands/init.ts', 'initCommand', [wikiPath]),
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      process.env.GIT_AUTHOR_NAME = oldAuthorName;
      process.env.GIT_AUTHOR_EMAIL = oldAuthorEmail;
      process.env.GIT_COMMITTER_NAME = oldCommitterName;
      process.env.GIT_COMMITTER_EMAIL = oldCommitterEmail;
      restoreExit();
      tap.restore();
    }

    const err = tap.stderr.join('\n');
    expect(err).toContain('Git author identity is not configured');
    expect(err).toContain('git config --global user.name');
    expect(err).toContain('git config --global user.email');
    expect(git.init).not.toHaveBeenCalled();
  });

  it('init: exits when wiki already exists and --force is not used', async () => {
    const wikiPath = path.join(cwd, 'existing-wiki');
    await mkdir(path.join(wikiPath, '.config'), { recursive: true });

    const tap = tapConsole();
    const restoreExit = mockExit();

    await expect(
      runCommand('../src/commands/init.ts', 'initCommand', [wikiPath]),
    ).rejects.toMatchObject({ code: 1 });

    restoreExit();
    tap.restore();

    expect(tap.stderr.join('\n')).toContain('Wiki already exists');
  });

  it('ingest: resolves wiki path from flag and calls service', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-ingest-wiki-'));
    await writeWikiConfig(wikiPath);
    const ingest = vi.fn().mockResolvedValue({
      pages_created: ['wiki/new.md'],
      pages_updated: [],
      commit_sha: '1234567890abcdef',
    });
    const buildContainer = vi.fn(() => ({ ingest: { ingest } }));

    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer,
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await runCommand('../src/commands/ingest.ts', 'ingestCommand', [
      'file.md',
      '--wiki',
      wikiPath,
      '--verbose',
    ]);

    restoreExit();
    tap.restore();

    expect(ingest).toHaveBeenCalledWith({ source: 'file.md' });
    expect(buildContainer).toHaveBeenCalled();
    expect(buildContainer.mock.calls[0]?.[0].wiki.path).toBe(wikiPath);
    expect(buildContainer.mock.calls[0]?.[0].llm.model).toBe('local-model');
    expect(tap.stdout.join('\n')).toContain('Created 1 page(s)');
  });

  it('ingest: exits when no wiki root can be found', async () => {
    const tap = tapConsole();
    const restoreExit = mockExit();

    await expect(
      runCommand('../src/commands/ingest.ts', 'ingestCommand', ['file.md']),
    ).rejects.toMatchObject({ code: 1 });

    restoreExit();
    tap.restore();

    expect(tap.stderr.join('\n')).toContain('Error: No wiki found');
  });

  it('lint: parses phases and exits with nonzero when issues are present', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-lint-wiki-'));
    await writeWikiConfig(wikiPath);
    const lint = vi.fn().mockResolvedValue({
      consolidated: 1,
      promoted: 0,
      issues: [{ type: 'stale', page: 'wiki/a.md', description: 'old' }],
      commitSha: 'abcdef123456',
    });
    const buildContainer = vi.fn(() => ({ lint: { lint } }));

    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer,
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await expect(
      runCommand('../src/commands/lint.ts', 'lintCommand', [
        '--wiki',
        wikiPath,
        '--phases',
        'promote,invalid,health',
      ]),
    ).rejects.toMatchObject({ code: 1 });

    restoreExit();
    tap.restore();

    expect(lint).toHaveBeenCalledWith({ phases: ['promote', 'health'] });
    expect(buildContainer.mock.calls[0]?.[0].wiki.path).toBe(wikiPath);
    expect(buildContainer.mock.calls[0]?.[0].llm.model).toBe('local-model');
    expect(tap.stdout.join('\n')).toContain('Found 1 issue(s)');
  });

  it('import: validates agent names and exits on unknown agent', async () => {
    const tap = tapConsole();
    const restoreExit = mockExit();

    await expect(
      runCommand('../src/commands/import-cmd.ts', 'importCommand', ['--agent', 'unknown']),
    ).rejects.toMatchObject({ code: 1 });

    restoreExit();
    tap.restore();

    expect(tap.stderr.join('\n')).toContain('Unknown agent');
  });

  it('import: runs service and reports totals', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-import-wiki-'));
    await writeWikiConfig(wikiPath);
    const importAll = vi.fn().mockResolvedValue({
      agents: [{ agent: 'claude-code', imported: 2, skipped: 1, discovered: 3, error: null }],
    });
    const buildContainer = vi.fn(() => ({ import_: { importAll } }));

    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer,
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await runCommand('../src/commands/import-cmd.ts', 'importCommand', [
      '--wiki',
      wikiPath,
      '--agent',
      'claude-code',
      '--verbose',
    ]);

    restoreExit();
    tap.restore();

    expect(importAll).toHaveBeenCalledWith({ agents: ['claude-code'] });
    expect(buildContainer.mock.calls[0]?.[0].wiki.path).toBe(wikiPath);
    expect(buildContainer.mock.calls[0]?.[0].llm.model).toBe('local-model');
    expect(tap.stdout.join('\n')).toContain('Total: 2 imported, 1 skipped');
  });

  it('import: supports amp agent and forwards it to importAll', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-import-amp-wiki-'));
    await writeWikiConfig(wikiPath);
    const importAll = vi.fn().mockResolvedValue({
      agents: [{ agent: 'amp', imported: 1, skipped: 0, discovered: 1, error: null }],
    });
    const buildContainer = vi.fn(() => ({ import_: { importAll } }));
    vi.doMock('@ivkond-llm-wiki/common', () => ({ buildContainer }));

    const tap = tapConsole();
    const restoreExit = mockExit();
    await runCommand('../src/commands/import-cmd.ts', 'importCommand', ['--wiki', wikiPath, '--agent', 'amp']);
    restoreExit();
    tap.restore();

    expect(importAll).toHaveBeenCalledWith({ agents: ['amp'] });
    expect(tap.stdout.join('\n')).toContain('Total: 1 imported, 0 skipped');
  });

  it('import: supports --agent all', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-import-all-wiki-'));
    await writeWikiConfig(wikiPath);
    const importAll = vi.fn().mockResolvedValue({
      agents: [
        { agent: 'claude-code', imported: 0, skipped: 0, discovered: 0, error: null },
        { agent: 'amp', imported: 0, skipped: 0, discovered: 0, error: null },
      ],
    });
    const buildContainer = vi.fn(() => ({ import_: { importAll } }));
    vi.doMock('@ivkond-llm-wiki/common', () => ({ buildContainer }));

    const restoreExit = mockExit();
    await runCommand('../src/commands/import-cmd.ts', 'importCommand', ['--wiki', wikiPath, '--agent', 'all']);
    restoreExit();

    expect(importAll).toHaveBeenCalledWith({ agents: undefined });
  });

  it('search: emits json output with parsed limit', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-search-wiki-'));
    await writeWikiConfig(wikiPath);
    const query = vi.fn().mockResolvedValue({
      citations: [{ title: 'A', page: 'wiki/a.md', excerpt: 'excerpt', score: 0.9 }],
      scope_used: 'wiki/',
      project_used: null,
      answer: null,
    });
    const buildContainer = vi.fn(() => ({ query: { query } }));

    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer,
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await runCommand('../src/commands/search.ts', 'searchCommand', [
      'testing',
      '--wiki',
      wikiPath,
      '--format',
      'json',
      '--limit',
      '3',
    ]);

    restoreExit();
    tap.restore();

    expect(query).toHaveBeenCalledWith({ question: 'testing', maxResults: 3 });
    expect(buildContainer.mock.calls[0]?.[0].wiki.path).toBe(wikiPath);
    expect(buildContainer.mock.calls[0]?.[0].llm.model).toBe('local-model');
    expect(tap.stdout[0]).toContain('"citations"');
  });

  it('status: prints health and verbose details from config and service', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-status-wiki-'));
    await writeWikiConfig(wikiPath);
    const status = vi.fn().mockResolvedValue({
      total_pages: 5,
      projects: ['api'],
      index_health: 'ok',
      unconsolidated: 2,
      last_ingest: null,
      last_lint: '2026-05-01T12:00:00Z',
    });
    const buildContainer = vi.fn(() => ({ status: { status } }));

    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer,
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await runCommand('../src/commands/status.ts', 'statusCommand', [
      '--wiki',
      wikiPath,
      '--verbose',
    ]);

    restoreExit();
    tap.restore();

    expect(status).toHaveBeenCalled();
    const out = tap.stdout.join('\n');
    expect(out).toContain('Wiki Status');
    expect(out).toContain('Index health');
    expect(out).toContain(`Config wiki path: ${wikiPath}`);
    expect(out).toContain('LLM model: local-model');
    expect(buildContainer.mock.calls[0]?.[0].wiki.path).toBe(wikiPath);
    expect(buildContainer.mock.calls[0]?.[0].llm.model).toBe('local-model');
  });

  it('status: exits when service throws', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-status-fail-wiki-'));
    await writeWikiConfig(wikiPath);
    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer: () => ({ status: { status: vi.fn().mockRejectedValue(new Error('boom')) } }),
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await expect(
      runCommand('../src/commands/status.ts', 'statusCommand', ['--wiki', wikiPath]),
    ).rejects.toMatchObject({ code: 1 });

    restoreExit();
    tap.restore();

    expect(tap.stderr.join('\n')).toContain('Error: boom');
  });

  it('lint: exits when all requested phases are invalid', async () => {
    const tap = tapConsole();
    const restoreExit = mockExit();

    await expect(
      runCommand('../src/commands/lint.ts', 'lintCommand', ['--phases', 'invalid']),
    ).rejects.toMatchObject({ code: 1 });

    restoreExit();
    tap.restore();

    expect(tap.stderr.join('\n')).toContain('No valid phases specified');
  });

  it('ingest: dry-run skips service invocation', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-ingest-dry-wiki-'));
    await writeWikiConfig(wikiPath);
    const ingest = vi.fn();
    const buildContainer = vi.fn(() => ({ ingest: { ingest } }));

    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer,
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await runCommand('../src/commands/ingest.ts', 'ingestCommand', [
      'file.md',
      '--wiki',
      wikiPath,
      '--dry-run',
    ]);

    restoreExit();
    tap.restore();

    expect(ingest).not.toHaveBeenCalled();
    expect(buildContainer.mock.calls[0]?.[0].llm.model).toBe('local-model');
    expect(tap.stdout.join('\n')).toContain('[DRY RUN] Would ingest from:');
  });

  it('search: prints no results message when query returns empty citations', async () => {
    const wikiPath = await mkdtemp(path.join(tmpdir(), 'cli-search-empty-wiki-'));
    await writeWikiConfig(wikiPath);
    const query = vi.fn().mockResolvedValue({
      citations: [],
      scope_used: 'wiki/',
      project_used: null,
      answer: null,
    });
    const buildContainer = vi.fn(() => ({ query: { query } }));

    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer,
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await runCommand('../src/commands/search.ts', 'searchCommand', ['testing', '--wiki', wikiPath]);

    restoreExit();
    tap.restore();

    expect(tap.stdout.join('\n')).toContain('No results found');
    expect(buildContainer.mock.calls[0]?.[0].llm.model).toBe('local-model');
  });

  it('ingest: resolves wiki root from current directory config when --wiki is omitted', async () => {
    const configDir = path.join(cwd, '.config');
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'settings.shared.yaml'), 'wiki:\n  path: /fake/wiki\n');

    const ingest = vi.fn().mockResolvedValue({
      pages_created: [],
      pages_updated: [],
      commit_sha: '1234567890abcdef',
    });
    const buildContainer = vi.fn(() => ({ ingest: { ingest } }));
    vi.doMock('@ivkond-llm-wiki/common', () => ({
      buildContainer,
    }));

    const tap = tapConsole();
    const restoreExit = mockExit();

    await runCommand('../src/commands/ingest.ts', 'ingestCommand', ['file.md']);

    restoreExit();
    tap.restore();

    expect(ingest).toHaveBeenCalledWith({ source: 'file.md' });
    expect(buildContainer.mock.calls[0]?.[0].wiki.path).toBe('/fake/wiki');
  });
});
