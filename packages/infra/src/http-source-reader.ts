import {
  estimateTokens,
  SourceNotFoundError,
  SourceParseError,
  type ISourceReader,
  type SourceContent,
} from '@llm-wiki/core';

/**
 * Reads http(s):// sources for `wiki_ingest`.
 *
 * Uses the global `fetch` (Node 18+). Failure mapping:
 *   - 404 -> SourceNotFoundError
 *   - any other non-2xx, or a transport-level error -> SourceParseError
 *
 * Network I/O bounds (timeouts, size limits) are enforced in the IngestService
 * via the `estimatedTokens` / 100K-token cap, not here — the reader does one
 * job and does it synchronously from the caller's point of view.
 */
export class HttpSourceReader implements ISourceReader {
  async read(uri: string): Promise<SourceContent> {
    let response: Response;
    try {
      response = await fetch(uri);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new SourceParseError(uri, `network error: ${message}`);
    }

    if (response.status === 404) {
      throw new SourceNotFoundError(uri);
    }
    if (!response.ok) {
      throw new SourceParseError(uri, `HTTP ${response.status} ${response.statusText}`);
    }

    let content: string;
    try {
      content = await response.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new SourceParseError(uri, `failed to read body: ${message}`);
    }

    const contentType = response.headers.get('content-type') ?? undefined;
    return {
      uri,
      content,
      mimeType: this.primaryMimeType(contentType),
      bytes: Buffer.byteLength(content, 'utf-8'),
      estimatedTokens: estimateTokens(content),
    };
  }

  /** Strip any `; charset=…` suffix from a Content-Type header. */
  private primaryMimeType(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const semi = header.indexOf(';');
    return (semi === -1 ? header : header.slice(0, semi)).trim();
  }
}
