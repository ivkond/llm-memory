import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MockLanguageModelV2, MockEmbeddingModelV2 } from 'ai/test';
import {
  FsFileStore,
  GitProjectResolver,
  RuVectorSearchEngine,
  AiSdkLlmClient,
  AiSdkEmbeddingClient,
} from '../../src/index.js';
import { QueryService } from '@ivkond-llm-wiki/core';

// v2-spec mock doGenerate helper. See Task 3 for the full shape.
function okGen(text: string, input = 10, output = 5) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: 'stop' as const,
    usage: { inputTokens: input, outputTokens: output, totalTokens: input + output },
    warnings: [],
  };
}

/**
 * End-to-end query flow wired through real adapters with mocked LLM +
 * embedding models. Exercises INV-3 (LLM_UNAVAILABLE → raw citations) and
 * INV-10 (scope cascade returns project, wiki, all in priority order).
 */
describe('Query E2E', () => {
  let dir: string;
  let service: QueryService;
  let throwingService: QueryService;

  const frontmatter = (title: string, updated: string) =>
    `---\ntitle: ${title}\nupdated: ${updated}\nsources: []\nsupersedes: null\ntags: []\nconfidence: 0.9\ncreated: ${updated}\n---\n`;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-e2e-'));
    const fs = new FsFileStore(dir);
    await fs.writeFile(
      'wiki/patterns/testing.md',
      frontmatter('Testing', '2026-04-09') +
        '## Summary\nUse testcontainers for integration tests.\n',
    );
    await fs.writeFile(
      'projects/cli-relay/architecture.md',
      frontmatter('Architecture', '2026-04-09') +
        '## Summary\nClean Architecture with ports/adapters.\n',
    );

    // Deterministic fake embedding: hash characters into fixed buckets, L2
    // normalise. Not semantically meaningful, but stable across runs so the
    // search ranking is reproducible.
    const dims = 16;
    const embed = (text: string): number[] => {
      const v = new Array(dims).fill(0);
      const lower = text.toLowerCase();
      for (let i = 0; i < lower.length; i++) {
        const c = lower.charCodeAt(i);
        v[c % dims] += 1;
        v[(c * 31 + 7) % dims] += 0.5;
      }
      let n = 0;
      for (const x of v) n += x * x;
      n = Math.sqrt(n) || 1;
      return v.map((x) => x / n);
    };

    const embedModel = new MockEmbeddingModelV2<string>({
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      doEmbed: async ({ values }) => ({
        embeddings: values.map((v: string) => embed(v)),
        usage: { tokens: values.length },
      }),
    });
    const embeddings = new AiSdkEmbeddingClient(embedModel, dims);

    const search = new RuVectorSearchEngine(path.join(dir, '.local/search.db'), embeddings);
    await search.index({
      path: 'wiki/patterns/testing.md',
      title: 'Testing',
      content: 'Use testcontainers for integration tests.',
      updated: '2026-04-09',
    });
    await search.index({
      path: 'projects/cli-relay/architecture.md',
      title: 'Architecture',
      content: 'Clean Architecture with ports/adapters.',
      updated: '2026-04-09',
    });

    const llmModel = new MockLanguageModelV2({
      doGenerate: async () => okGen('Use testcontainers.', 10, 5),
    });
    const llm = new AiSdkLlmClient(llmModel);
    const resolver = new GitProjectResolver(fs);

    service = new QueryService(search, llm, resolver, fs);

    const throwingLlm = new AiSdkLlmClient(
      new MockLanguageModelV2({
        doGenerate: async () => {
          throw new Error('LLM DOWN');
        },
      }),
    );
    throwingService = new QueryService(search, throwingLlm, resolver, fs);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('test_query_returnsAnswerAndCitations', async () => {
    const result = await service.query({ question: 'how to test' });
    expect(result.answer).toContain('testcontainers');
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it('test_query_scopeCascade_projectFirstThenWiki (INV-10)', async () => {
    const result = await service.query({ question: 'architecture', project: 'cli-relay' });
    expect(result.citations[0].page).toContain('projects/cli-relay');
    expect(result.scope_used).toBe('projects/cli-relay/');
    expect(result.project_used).toBe('cli-relay');
  });

  it('test_query_llmDown_stillReturnsCitations (INV-3)', async () => {
    const result = await throwingService.query({ question: 'how to test' });
    expect(result.answer).toBe('');
    expect(result.citations.length).toBeGreaterThan(0);
  });
});
