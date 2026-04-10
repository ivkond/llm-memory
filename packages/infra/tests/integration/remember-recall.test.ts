import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RememberService, RecallService, SanitizationService } from '@llm-wiki/core';
import { FsFileStore, FsVerbatimStore, GitProjectResolver } from '@llm-wiki/infra';

describe('Remember + Recall integration', () => {
  let wikiDir: string;
  let projectDir: string;
  let fileStore: FsFileStore;
  let verbatimStore: FsVerbatimStore;
  let rememberService: RememberService;
  let recallService: RecallService;

  beforeEach(async () => {
    wikiDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-int-'));
    projectDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-proj-'));

    // Init wiki structure
    fileStore = new FsFileStore(wikiDir);
    verbatimStore = new FsVerbatimStore(fileStore);
    await fileStore.writeFile('schema.md', '# Schema\nRules here.');
    await fileStore.writeFile(
      'projects/test-project/_config.md',
      '---\nname: test-project\ngit_remote: https://github.com/test/repo.git\n---\n',
    );
    await fileStore.writeFile(
      'projects/test-project/architecture.md',
      '---\ntitle: Architecture\ncreated: 2026-04-09\nupdated: 2026-04-09\nconfidence: 0.8\nsources: []\nsupersedes: null\ntags: []\n---\n\n## Summary\n\nClean Architecture with ports/adapters.\n',
    );
    await fileStore.writeFile(
      'wiki/patterns/testing.md',
      '---\ntitle: Testing Patterns\ncreated: 2026-04-08\nupdated: 2026-04-08\nconfidence: 0.9\nsources: []\nsupersedes: null\ntags: [testing]\n---\n\n## Summary\n\nAlways use testcontainers.\n',
    );

    // Init git repo with remote
    execSync('git init', { cwd: projectDir });
    execSync('git remote add origin https://github.com/test/repo.git', { cwd: projectDir });

    const sanitizer = new SanitizationService({ enabled: true, mode: 'redact' });
    const resolver = new GitProjectResolver(fileStore);

    rememberService = new RememberService(fileStore, verbatimStore, sanitizer);
    recallService = new RecallService(fileStore, verbatimStore, resolver);
  });

  afterEach(async () => {
    await rm(wikiDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  it('test_remember_then_recall_seesUnconsolidatedCount', async () => {
    // Remember some facts
    await rememberService.rememberFact({
      content: '- pgx pool MaxConns <= max_connections/3',
      agent: 'claude-code',
      sessionId: 'test-session',
      project: 'test-project',
    });

    await rememberService.rememberFact({
      content: '- SQLC CTE bug workaround',
      agent: 'claude-code',
      sessionId: 'test-session',
      project: 'test-project',
    });

    // Recall should see the project context + unconsolidated count
    const result = await recallService.recall({ cwd: projectDir });

    expect(result.project).toBe('test-project');
    expect(result.unconsolidated_count).toBe(2);
    expect(result.pages.some(p => p.path.includes('architecture'))).toBe(true);
    expect(result.pages.some(p => p.path.includes('testing'))).toBe(true);
  });

  it('test_remember_sanitizes_before_writing', async () => {
    await rememberService.rememberFact({
      content: 'Found API key sk-abc123def456ghi789jkl012mno345pqr678 in config file at /etc/app/settings.json',
      agent: 'claude-code',
      sessionId: 'test-session',
    });

    // Read the written file directly
    const files = await fileStore.listFiles('log/claude-code/raw');
    expect(files).toHaveLength(1);

    const content = await fileStore.readFile(files[0].path);
    expect(content).toContain('[REDACTED:api_key]');
    expect(content).not.toContain('sk-abc123');
  });

  it('test_recall_deterministic_acrossMultipleCalls', async () => {
    const result1 = await recallService.recall({ cwd: projectDir });
    const result2 = await recallService.recall({ cwd: projectDir });
    expect(result1).toEqual(result2);
  });
});
