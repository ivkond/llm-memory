import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { MockLanguageModelV2, MockEmbeddingModelV2 } from 'ai/test';
import {
  FsFileStore,
  RuVectorSearchEngine,
  AiSdkLlmClient,
  AiSdkEmbeddingClient,
  GitVersionControl,
  FsSourceReader,
  YamlStateStore,
  YamlIdempotencyStore,
} from '../../src/index.js';
import { IngestService } from '@ivkond-llm-wiki/core';

// v2-spec mock doGenerate helper.
function okGen(text: string, input = 10, output = 20) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: 'stop' as const,
    usage: { inputTokens: input, outputTokens: output, totalTokens: input + output },
    warnings: [],
  };
}

/**
 * End-to-end ingest flow with real FsFileStore, GitVersionControl,
 * RuVectorSearchEngine, FsSourceReader, and YamlStateStore. LLM +
 * embeddings are mocked so the test is deterministic and offline.
 *
 * Exercises INV-13 (worktree isolation) and INV-4 (main branch untouched
 * on LLM failure, state unchanged).
 */
describe('Ingest E2E', () => {
  let wiki: string;
  let sourceDir: string;
  let sourceFile: string;

  beforeEach(async () => {
    wiki = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-e2e-'));
    execSync('git init -q -b main', { cwd: wiki });
    execSync('git config user.email t@e.com', { cwd: wiki });
    execSync('git config user.name T', { cwd: wiki });
    execSync('git config commit.gpgsign false', { cwd: wiki });
    execSync('git config tag.gpgsign false', { cwd: wiki });
    await writeFile(path.join(wiki, 'README.md'), '# seed');
    // .worktrees/ and .local/ sit inside the repo but are operational
    // artifacts — the seed commit's .gitignore keeps them off main's
    // status.
    await writeFile(path.join(wiki, '.gitignore'), '.worktrees/\n.local/\n');
    execSync('git add README.md .gitignore && git commit -q -m seed', { cwd: wiki });

    sourceDir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-src-'));
    sourceFile = path.join(sourceDir, 'article.md');
    await writeFile(sourceFile, '# PostgreSQL\n\nUse MaxConns <= max_connections/3.\n');
  });

  afterEach(async () => {
    await rm(wiki, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  function makeService(llmThrows: boolean): IngestService {
    const fs = new FsFileStore(wiki);
    const dims = 16;
    const embed = (text: string): number[] => {
      const v = new Array(dims).fill(0);
      for (let i = 0; i < text.length; i++) {
        v[text.charCodeAt(i) % dims] += 1;
      }
      let n = 0;
      for (const x of v) n += x * x;
      n = Math.sqrt(n) || 1;
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
            JSON.stringify([
              {
                path: 'wiki/tools/postgresql.md',
                title: 'PostgreSQL',
                content: '## Summary\nMaxConns rule.',
              },
            ]),
            10,
            20,
          );
        },
      }),
    );
    const vcs = new GitVersionControl(wiki);
    const stateStore = new YamlStateStore(fs);
    const sourceReader = new FsSourceReader();
    return new IngestService(
      sourceReader,
      llm,
      search,
      vcs,
      fs,
      (root) => new FsFileStore(root),
      stateStore,
      new YamlIdempotencyStore(fs),
    );
  }

  it('test_ingest_success_pagesCreated_worktreeCleaned_stateUpdated (INV-13)', async () => {
    const svc = makeService(false);
    const result = await svc.ingest({ source: sourceFile });

    expect(result.pages_created.length + result.pages_updated.length).toBeGreaterThan(0);
    const touched = result.pages_created[0] ?? result.pages_updated[0];
    const fs = new FsFileStore(wiki);
    const created = await fs.readFile(touched);
    expect(created).toContain('PostgreSQL');

    // Worktree removed
    const worktreeList = execSync('git worktree list', { cwd: wiki, encoding: 'utf-8' });
    expect(worktreeList).not.toContain('.worktrees/ingest-');

    // State updated
    const state = await new YamlStateStore(fs).load();
    expect(state.last_ingest).not.toBeNull();
  });

  it('test_ingest_llmFails_mainBranchUntouched_stateUnchanged (INV-4)', async () => {
    const svc = makeService(true);
    await expect(svc.ingest({ source: sourceFile })).rejects.toThrow();

    // Main branch tree is still just the seed — the .gitignore entry keeps
    // .local/ (where the search DB lives) out of the status.
    const status = execSync('git status --porcelain', { cwd: wiki, encoding: 'utf-8' });
    expect(status.trim()).toBe('');

    // No last_ingest recorded
    const fs = new FsFileStore(wiki);
    const state = await new YamlStateStore(fs).load();
    expect(state.last_ingest).toBeNull();

    // Worktree discarded
    const worktreeList = execSync('git worktree list', { cwd: wiki, encoding: 'utf-8' });
    expect(worktreeList).not.toContain('.worktrees/ingest-');
  });
});
