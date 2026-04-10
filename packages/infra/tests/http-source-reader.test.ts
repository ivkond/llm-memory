import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpSourceReader } from '../src/http-source-reader.js';
import { SourceNotFoundError, SourceParseError, estimateTokens } from '@llm-wiki/core';

/**
 * HttpSourceReader is unit-tested against an injected fetch function so
 * the test never touches the network.
 */
describe('HttpSourceReader', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeResponse(status: number, body: string, contentType?: string): Response {
    const headers = new Headers();
    if (contentType) headers.set('content-type', contentType);
    return new Response(body, { status, statusText: `status ${status}`, headers });
  }

  it('test_read_successfulFetch_returnsContentAndMetadata', async () => {
    const body = '# Hello\n\nBody.';
    globalThis.fetch = vi.fn().mockResolvedValue(makeResponse(200, body, 'text/markdown'));

    const reader = new HttpSourceReader();
    const source = await reader.read('https://example.com/docs.md');

    expect(source.uri).toBe('https://example.com/docs.md');
    expect(source.content).toBe(body);
    expect(source.mimeType).toBe('text/markdown');
    expect(source.bytes).toBe(Buffer.byteLength(body, 'utf-8'));
    expect(source.estimatedTokens).toBe(estimateTokens(body));
  });

  it('test_read_404_throwsSourceNotFound', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeResponse(404, 'not found'));
    const reader = new HttpSourceReader();
    await expect(reader.read('https://example.com/missing')).rejects.toBeInstanceOf(
      SourceNotFoundError,
    );
  });

  it('test_read_500_throwsSourceParseError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeResponse(500, 'oops'));
    const reader = new HttpSourceReader();
    await expect(reader.read('https://example.com/broken')).rejects.toBeInstanceOf(
      SourceParseError,
    );
  });

  it('test_read_networkError_throwsSourceParseError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'));
    const reader = new HttpSourceReader();
    await expect(reader.read('https://unreachable.example/')).rejects.toBeInstanceOf(
      SourceParseError,
    );
  });
});
