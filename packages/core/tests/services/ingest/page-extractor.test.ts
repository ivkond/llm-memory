import { describe, expect, it } from 'vitest';
import { LlmUnavailableError } from '../../../src/domain/errors.js';
import type { ILlmClient, LlmCompletionRequest, LlmCompletionResponse } from '../../../src/ports/index.js';
import { extractIngestPages } from '../../../src/services/ingest/page-extractor.js';

class StubLlmClient implements ILlmClient {
  constructor(private readonly response: LlmCompletionResponse) {}

  async complete(_request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    return this.response;
  }
}

describe('extractIngestPages', () => {
  it('parses fenced json response', async () => {
    const llm = new StubLlmClient({
      content:
        '```json\n[{"path":"wiki/tools/postgresql.md","title":"PostgreSQL","content":"## Summary"}]\n```',
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const pages = await extractIngestPages(llm, { uri: '/tmp/src.md', content: '# src' }, 'hint');
    expect(pages).toEqual([
      { path: 'wiki/tools/postgresql.md', title: 'PostgreSQL', content: '## Summary' },
    ]);
  });

  it('rejects empty model output array', async () => {
    const llm = new StubLlmClient({ content: '[]', usage: { inputTokens: 1, outputTokens: 1 } });

    await expect(extractIngestPages(llm, { uri: '/tmp/src.md', content: '# src' })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
  });
});
