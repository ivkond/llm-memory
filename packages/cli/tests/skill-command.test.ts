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

async function runSkillCommand(argv: string[]): Promise<void> {
  vi.resetModules();
  const mod = await import('../src/commands/skill.ts');
  await mod.skillCommand.parseAsync(argv, { from: 'user' });
}

describe('skill command', () => {
  let cwd: string;
  let oldCwd: string;
  let oldSkillSourceRoot: string | undefined;

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'cli-skill-cwd-'));
    oldCwd = process.cwd();
    oldSkillSourceRoot = process.env.LLM_WIKI_SKILL_SOURCE_ROOT;
    process.chdir(cwd);
    delete process.env.LLM_WIKI_SKILL_SOURCE_ROOT;
  });

  afterEach(() => {
    process.chdir(oldCwd);
    process.env.LLM_WIKI_SKILL_SOURCE_ROOT = oldSkillSourceRoot;
    vi.restoreAllMocks();
  });

  it('installs skill, lists it, and uninstalls it', async () => {
    const sourceRoot = await mkdtemp(path.join(tmpdir(), 'cli-skill-source-'));
    const skillSource = path.join(sourceRoot, 'llm-memory');
    await mkdir(skillSource, { recursive: true });
    await writeFile(path.join(skillSource, 'SKILL.md'), '# Test skill\n');
    process.env.LLM_WIKI_SKILL_SOURCE_ROOT = sourceRoot;

    const installTap = tapConsole();
    await runSkillCommand(['install', 'llm-memory']);
    installTap.restore();

    await access(path.join(cwd, '.agent_context', 'skills', 'llm-memory', 'SKILL.md'));
    const manifestRaw = await readFile(path.join(cwd, '.agent_context', 'skills.json'), 'utf-8');
    expect(manifestRaw).toContain('"name": "llm-memory"');
    expect(installTap.stdout.join('\n')).toContain("Installed skill 'llm-memory'");

    const listTap = tapConsole();
    await runSkillCommand(['list']);
    listTap.restore();
    expect(listTap.stdout.join('\n')).toContain('Installed skills:');
    expect(listTap.stdout.join('\n')).toContain('- llm-memory');

    const uninstallTap = tapConsole();
    await runSkillCommand(['uninstall', 'llm-memory']);
    uninstallTap.restore();

    await expect(access(path.join(cwd, '.agent_context', 'skills.json'))).rejects.toBeTruthy();
    expect(uninstallTap.stdout.join('\n')).toContain("Uninstalled skill 'llm-memory'.");
  });

  it('repeated install does not duplicate manifest entries', async () => {
    const sourceRoot = await mkdtemp(path.join(tmpdir(), 'cli-skill-source-'));
    const skillSource = path.join(sourceRoot, 'llm-memory');
    await mkdir(skillSource, { recursive: true });
    await writeFile(path.join(skillSource, 'SKILL.md'), '# Test skill\n');
    process.env.LLM_WIKI_SKILL_SOURCE_ROOT = sourceRoot;

    await runSkillCommand(['install', 'llm-memory']);

    const secondInstallTap = tapConsole();
    await runSkillCommand(['install', 'llm-memory']);
    secondInstallTap.restore();

    const manifestRaw = await readFile(path.join(cwd, '.agent_context', 'skills.json'), 'utf-8');
    const manifest = JSON.parse(manifestRaw) as { skills: { name: string }[] };
    expect(manifest.skills.filter((skill) => skill.name === 'llm-memory')).toHaveLength(1);
    expect(secondInstallTap.stdout.join('\n')).toContain("Skill 'llm-memory' is already installed.");
  });

  it('fails install when source skill is missing', async () => {
    const sourceRoot = await mkdtemp(path.join(tmpdir(), 'cli-skill-source-'));
    process.env.LLM_WIKI_SKILL_SOURCE_ROOT = sourceRoot;

    const tap = tapConsole();
    const restoreExit = mockExit();

    await expect(runSkillCommand(['install', 'llm-memory'])).rejects.toMatchObject({ code: 1 });

    restoreExit();
    tap.restore();
    expect(tap.stderr.join('\n')).toContain("Failed to install skill: Skill 'llm-memory' not found");
  });

  it('fails uninstall when skill is not installed', async () => {
    const tap = tapConsole();
    const restoreExit = mockExit();

    await expect(runSkillCommand(['uninstall', 'llm-memory'])).rejects.toMatchObject({ code: 1 });

    restoreExit();
    tap.restore();
    expect(tap.stderr.join('\n')).toContain("Failed to uninstall skill: Skill 'llm-memory' is not installed.");
  });

  it.each(['../escape', '..\\escape', 'foo\\bar', 'C:\\\\escape', '\\\\server\\share'])(
    'rejects invalid skill name %s for install and uninstall',
    async (invalidName) => {
    const sourceRoot = await mkdtemp(path.join(tmpdir(), 'cli-skill-source-'));
    process.env.LLM_WIKI_SKILL_SOURCE_ROOT = sourceRoot;

      const installTap = tapConsole();
      const restoreInstallExit = mockExit();
      await expect(runSkillCommand(['install', invalidName])).rejects.toMatchObject({ code: 1 });
      restoreInstallExit();
      installTap.restore();
      expect(installTap.stderr.join('\n')).toContain('Invalid skill name');

      const uninstallTap = tapConsole();
      const restoreUninstallExit = mockExit();
      await expect(runSkillCommand(['uninstall', invalidName])).rejects.toMatchObject({ code: 1 });
      restoreUninstallExit();
      uninstallTap.restore();
      expect(uninstallTap.stderr.join('\n')).toContain('Invalid skill name');

      await expect(access(path.join(cwd, '.agent_context'))).rejects.toBeTruthy();
    },
  );

  it('list shows empty state when no skills installed', async () => {
    const tap = tapConsole();
    await runSkillCommand(['list']);
    tap.restore();

    expect(tap.stdout.join('\n')).toContain('No skills installed.');
  });
});
