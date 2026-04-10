export interface IEmbeddingClient {
  /** Generate embeddings for one or more texts. */
  embed(texts: string[]): Promise<number[][]>;

  /** Get the dimensionality of the embedding model. */
  dimensions(): number;
}
