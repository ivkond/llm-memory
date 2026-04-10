export interface SourceContent {
  /** Canonical URI of the source (absolute path or URL). */
  uri: string;
  /** Raw text content. */
  content: string;
  /** Optional mime type hint, e.g. 'text/markdown'. */
  mimeType?: string;
  /** Size in bytes of the raw content (used for transport-layer bounds only). */
  bytes: number;
  /** Estimated token count of `content`. This is the field enforced by
   *  `wiki_ingest`'s 100K-token limit (spec: "Source max 100K tokens after
   *  extraction"). Adapters MUST populate it using a deterministic estimator —
   *  for MVP: `Math.ceil(content.length / 4)` (OpenAI-style ~4 chars/token).
   *  A real tokenizer can be swapped in later without changing this contract. */
  estimatedTokens: number;
}

export interface ISourceReader {
  /** Read a source by URI (local path or http(s):// URL).
   *  Throws SourceNotFoundError or SourceParseError on failure. */
  read(uri: string): Promise<SourceContent>;
}

/** Shared deterministic token estimator. ~4 chars/token (OpenAI-style).
 *  All ISourceReader adapters MUST use this so the public 100K-token bound
 *  on wiki_ingest is computed consistently. */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
