import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { MockLanguageModelV2, MockEmbeddingModelV2 } from 'ai/test';
import {
  FsFileStore,
  FsVerbatimStore,
  GitVersionControl,
  YamlStateStore,
  SevenZipArchiver,
  AiSdkLlmClient,
  AiSdkEmbeddingClient,
  RuVectorSearchEngine,
} from '../../src/index.js';
import {
  LintService,
  ConsolidatePhase,
  PromotePhase,
  HealthPhase,
  VerbatimEntry,
} from '@ivkond-llm-wiki/core';

function okGen(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: 'stop' as const,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    warnings: [],
  };
}

class ProbingGitVersionControl extends GitVersionControl {
  public probeBeforeMerge: (() => void | Promise<void>) | null = null;

  async mergeWorktree(worktreePath: string): Promise<string> {
    if (this.probeBeforeMerge) await this.probeBeforeMerge();
    return super.mergeWorktree(worktreePath);
  }
}

describe('Lint E2E', () => {
  let wiki: string;

  beforeEach(async () => {
    wiki = await mkdtemp(path.join(tmpdir(), 'llm-wiki-lint-e2e-'));
    execSync('git init -q -b main', { cwd: wiki });
    execSync('git config user.email t@e.com', { cwd: wiki });
    execSync('git config user.name T', { cwd: wiki });
    execSync('git config commit.gpgsign false', { cwd: wiki });
    await writeFile(path.join(wiki, 'README.md'), '# seed');
    await writeFile(path.join(wiki, '.gitignore'), '.worktrees/\n.local/\n');
    execSync('git add README.md .gitignore && git commit -q -m seed', { cwd: wiki });
  });

  afterEach(async () => {
    await rm(wiki, { recursive: true, force: true });
  });

  async function seedVerbatim(count: number): Promise<void> {
    const mainFs = new FsFileStore(wiki);
    const store = new FsVerbatimStore(mainFs);
    for (let i = 0; i < count; i++) {
      await store.writeEntry(
        VerbatimEntry.create({
          content: `fact ${i}`,
          agent: 'claude-code',
          sessionId: `sess${i}`,
          idGenerator: () => `uuid${i}`,
          createdAt: new Date(`2026-04-10T12:00:0${i}Z`),
        }),
      );
    }
    execSync('git add log && git commit -q -m seed-verbatim', { cwd: wiki });
  }

  interface Harness {
    service: LintService;
    vc: ProbingGitVersionControl;
    search: RuVectorSearchEngine;
  }

  function makeService(llmThrows: boolean): Harness {
    const mainFs = new FsFileStore(wiki);
    const mainVerbatim = new FsVerbatimStore(mainFs);
    const vc = new ProbingGitVersionControl(wiki);
    const stateStore = new YamlStateStore(new FsFileStore(wiki));

    const dims = 8;
    const embed = (s: string): number[] => {
      const v = new Array(dims).fill(0);
      for (const cp of s) v[(cp.codePointAt(0) ?? 0) % dims] += 1;
      const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
      return v.map((x) => x / n);
    };
    const embeddings = new AiSdkEmbeddingClient(
      new MockEmbeddingModelV2<string>({
        maxEmbeddingsPerCall: 100,
        supportsParallelCalls: true,
        doEmbed: async ({ values }) => ({
          embeddings: values.map((v: string) => embed(v)),
          usage: { tokens: values.length },
        }),
      }),
      dims,
    );
    const search = new RuVectorSearchEngine(path.join(wiki, '.local/search.db'), embeddings);

    const llm = new AiSdkLlmClient(
      new MockLanguageModelV2({
        doGenerate: async () => {
          if (llmThrows) throw new Error('DOWN');
          return okGen(
            JSON.stringify({
              pages: [
                {
                  path: 'wiki/tools/postgresql.md',
                  title: 'PostgreSQL',
                  content: '## Summary\nConsolidated.',
                  source_entries: [],
                },
              ],
            }),
          );
        },
      }),
    );

    const archiver = new SevenZipArchiver();

    const service = new LintService({
      mainRepoRoot: wiki,
      mainFileStore: mainFs,
      mainVerbatimStore: mainVerbatim,
      versionControl: vc,
      searchEngine: search,
      fileStoreFactory: (root) => new FsFileStore(root),
      verbatimStoreFactory: (fs) => new FsVerbatimStore(fs),
      stateStore,
      archiver,
      resolveArchivePath: (yearMonth, agent) =>
        path.resolve(wiki, '.archive', `${yearMonth}-${agent}.7z`),
      makeConsolidatePhase: (fs, vs) => new ConsolidatePhase(fs, vs, llm, wiki),
      makePromotePhase: (fs) => new PromotePhase(fs, llm),
      makeHealthPhase: (fs) => new HealthPhase(fs),
      now: () => new Date('2026-04-10T12:00:00Z'),
    });
    return { service, vc, search };
  }

  it('INV-5 + INV-9: mid-flight probe proves main untouched during phases, then lint commits', async () => {
    await seedVerbatim(3);
    const { service, vc, search } = makeService(false);

    const headBefore = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
    const pageOnMain = path.join(wiki, 'wiki', 'tools', 'postgresql.md');

    let probeHead: string | null = null;
    let probePageExists: boolean | null = null;
    vc.probeBeforeMerge = () => {
      probeHead = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
      probePageExists = existsSync(pageOnMain);
    };

    const report = await service.lint({});

    expect(probeHead).toBe(headBefore);
    expect(probePageExists).toBe(false);

    expect(report.consolidated).toBe(3);
    expect(report.commitSha).not.toBeNull();

    const headAfter = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
    expect(headAfter).not.toBe(headBefore);

    const mainFs = new FsFileStore(wiki);
    const mainVerbatim = new FsVerbatimStore(mainFs);
    const remaining = await mainVerbatim.listUnconsolidated('claude-code');
    expect(remaining).toEqual([]);

    expect(await mainFs.exists('wiki/tools/postgresql.md')).toBe(true);

    const archivePath = path.join(wiki, '.archive', '2026-04-claude-code.7z');
    const archiveInfo = await stat(archivePath);
    expect(archiveInfo.isFile()).toBe(true);

    const indexed = await search.lastIndexedAt('wiki/tools/postgresql.md');
    expect(indexed).not.toBeNull();

    const state = await new YamlStateStore(new FsFileStore(wiki)).load();
    expect(state.last_lint).toBe('2026-04-10T12:00:00.000Z');
  });

  it('INV-9: LLM failure discards worktree, main branch and state untouched', async () => {
    await seedVerbatim(2);
    const { service } = makeService(true);

    const headBefore = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
    await expect(service.lint({})).rejects.toThrow();

    const headAfter = execSync('git rev-parse HEAD', { cwd: wiki }).toString().trim();
    expect(headAfter).toBe(headBefore);

    const mainFs = new FsFileStore(wiki);
    const mainVerbatim = new FsVerbatimStore(mainFs);
    const remaining = await mainVerbatim.listUnconsolidated('claude-code');
    expect(remaining).toHaveLength(2);

    expect(await mainFs.exists('wiki/tools/postgresql.md')).toBe(false);

    const state = await new YamlStateStore(new FsFileStore(wiki)).load();
    expect(state.last_lint).toBeNull();
  });
});
