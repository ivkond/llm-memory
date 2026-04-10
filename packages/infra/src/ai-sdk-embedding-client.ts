import { embedMany, type EmbeddingModel } from 'ai';
import type { IEmbeddingClient } from '@llm-wiki/core';

/**
 * Thin adapter from the domain's `IEmbeddingClient` port to the Vercel AI
 * SDK's `embedMany()` function. The embedding dimensionality is supplied at
 * construction time because AI SDK doesn't expose it through the model
 * interface — the caller knows which model they picked and how wide it is.
 */
export class AiSdkEmbeddingClient implements IEmbeddingClient {
  constructor(
    private readonly model: EmbeddingModel<string>,
    private readonly dims: number,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const result = await embedMany({ model: this.model, values: texts });
    return result.embeddings;
  }

  dimensions(): number {
    return this.dims;
  }
}
