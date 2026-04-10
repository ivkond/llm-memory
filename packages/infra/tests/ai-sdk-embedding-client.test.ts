import { describe, it, expect } from 'vitest';
import { MockEmbeddingModelV2 } from 'ai/test';
import { AiSdkEmbeddingClient } from '../src/ai-sdk-embedding-client.js';

describe('AiSdkEmbeddingClient', () => {
  const stubVector = Array.from({ length: 8 }, (_, i) => i / 10);

  it('test_embed_returnsVectorsOfCorrectDimensionality', async () => {
    const model = new MockEmbeddingModelV2<string>({
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      doEmbed: async ({ values }) => ({
        embeddings: values.map(() => stubVector),
        usage: { tokens: values.length },
      }),
    });
    const client = new AiSdkEmbeddingClient(model, stubVector.length);

    const vectors = await client.embed(['one', 'two', 'three']);

    expect(vectors).toHaveLength(3);
    expect(vectors[0]).toHaveLength(stubVector.length);
    expect(client.dimensions()).toBe(stubVector.length);
  });

  it('test_embed_emptyBatch_returnsEmpty', async () => {
    const model = new MockEmbeddingModelV2<string>({
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      doEmbed: async () => ({
        embeddings: [],
        usage: { tokens: 0 },
      }),
    });
    const client = new AiSdkEmbeddingClient(model, 8);

    expect(await client.embed([])).toEqual([]);
  });

  it('test_embed_providerThrows_propagatesError', async () => {
    const model = new MockEmbeddingModelV2<string>({
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      doEmbed: async () => {
        throw new Error('rate limit');
      },
    });
    const client = new AiSdkEmbeddingClient(model, 8);

    await expect(client.embed(['x'])).rejects.toThrow('rate limit');
  });
});
