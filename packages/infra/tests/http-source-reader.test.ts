import { describe, it, expect, vi } from 'vitest';
import {
  HttpSourceReader,
  type DnsLookupFn,
  type ResolvedAddress,
} from '../src/http-source-reader.js';
import { SourceNotFoundError, SourceParseError, estimateTokens } from '@llm-wiki/core';

/**
 * Helper: a DNS stub that maps hostnames to a fixed list of addresses.
 * Anything not listed resolves to a single public IPv4 (8.8.8.8).
 */
function mkDns(map: Record<string, ResolvedAddress[]> = {}): DnsLookupFn {
  return async (hostname: string): Promise<ResolvedAddress[]> => {
    if (hostname in map) return map[hostname];
    return [{ address: '8.8.8.8', family: 4 }];
  };
}

/**
 * Build a fresh Response for each test so the underlying body stream is
 * consumed exactly once.
 */
function makeResponse(
  status: number,
  body: string,
  contentType?: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers(extraHeaders);
  if (contentType) headers.set('content-type', contentType);
  return new Response(body, { status, statusText: `status ${status}`, headers });
}

describe('HttpSourceReader', () => {
  // ---- Happy path ---------------------------------------------------------

  it('test_read_successfulFetch_returnsContentAndMetadata', async () => {
    const body = '# Hello\n\nBody.';
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(200, body, 'text/markdown'));
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });

    const source = await reader.read('https://example.com/docs.md');

    expect(source.uri).toBe('https://example.com/docs.md');
    expect(source.content).toBe(body);
    expect(source.mimeType).toBe('text/markdown');
    expect(source.bytes).toBe(Buffer.byteLength(body, 'utf-8'));
    expect(source.estimatedTokens).toBe(estimateTokens(body));
  });

  // ---- Status mapping -----------------------------------------------------

  it('test_read_404_throwsSourceNotFound', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(404, 'not found'));
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('https://example.com/missing')).rejects.toBeInstanceOf(
      SourceNotFoundError,
    );
  });

  it('test_read_500_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(500, 'oops'));
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('https://example.com/broken')).rejects.toBeInstanceOf(
      SourceParseError,
    );
  });

  it('test_read_networkError_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed: ECONNREFUSED'));
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('https://unreachable.example/')).rejects.toBeInstanceOf(
      SourceParseError,
    );
  });

  // ---- Scheme allowlist (SSRF defence) ------------------------------------

  it('test_read_nonHttpScheme_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('ftp://example.com/data')).rejects.toBeInstanceOf(SourceParseError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_fileScheme_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('file:///etc/passwd')).rejects.toBeInstanceOf(SourceParseError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_invalidUrl_throwsSourceParseError', async () => {
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl: vi.fn() });
    await expect(reader.read('not a url at all')).rejects.toBeInstanceOf(SourceParseError);
  });

  // ---- Host blocklist (SSRF defence) --------------------------------------

  it('test_read_loopbackIpLiteral_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('http://127.0.0.1:8080/')).rejects.toBeInstanceOf(SourceParseError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_ipv6LoopbackLiteral_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('http://[::1]/')).rejects.toBeInstanceOf(SourceParseError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_awsMetadataIpLiteral_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    // 169.254.169.254 is the AWS / GCP / Azure instance-metadata IP.
    await expect(reader.read('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(
      SourceParseError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_privateIpLiteral_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('http://10.0.0.5/')).rejects.toBeInstanceOf(SourceParseError);
    await expect(reader.read('http://192.168.1.1/')).rejects.toBeInstanceOf(SourceParseError);
    await expect(reader.read('http://172.20.0.1/')).rejects.toBeInstanceOf(SourceParseError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_dnsResolvesToLoopback_throwsSourceParseError', async () => {
    // A public-looking hostname that resolves (via our stub) to 127.0.0.1
    // must still be rejected — this simulates a DNS rebinding-style attack
    // where an attacker-controlled domain points at a private address.
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({
      dnsLookup: mkDns({ 'evil.example.com': [{ address: '127.0.0.1', family: 4 }] }),
      fetchImpl,
    });
    await expect(reader.read('https://evil.example.com/docs.md')).rejects.toBeInstanceOf(
      SourceParseError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_dnsMultiAddress_anyPrivate_rejects', async () => {
    // If DNS returns multiple addresses and ANY of them is blocked, we
    // must refuse — otherwise an attacker could race the caller's resolver.
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({
      dnsLookup: mkDns({
        'mixed.example.com': [
          { address: '8.8.8.8', family: 4 },
          { address: '10.0.0.5', family: 4 },
        ],
      }),
      fetchImpl,
    });
    await expect(reader.read('https://mixed.example.com/')).rejects.toBeInstanceOf(
      SourceParseError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_literalLocalhostName_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('http://localhost:3000/')).rejects.toBeInstanceOf(SourceParseError);
    // The forbidden-hostname list short-circuits before DNS is consulted.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('test_read_metadataHostname_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn();
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(
      reader.read('http://metadata.google.internal/computeMetadata/v1/'),
    ).rejects.toBeInstanceOf(SourceParseError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // ---- Timeout ------------------------------------------------------------

  it('test_read_timeoutAborts_throwsSourceParseError', async () => {
    // fetch stub that resolves only after its signal aborts.
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const reader = new HttpSourceReader({
      dnsLookup: mkDns(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
    });
    await expect(reader.read('https://example.com/slow')).rejects.toBeInstanceOf(SourceParseError);
  });

  // ---- Response size cap --------------------------------------------------

  it('test_read_oversizedResponse_throwsSourceParseError', async () => {
    const oversized = 'x'.repeat(1024 * 10); // 10 KiB
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(200, oversized, 'text/plain'));
    const reader = new HttpSourceReader({
      dnsLookup: mkDns(),
      fetchImpl,
      maxBytes: 4096, // 4 KiB cap — lower than the body above
    });
    await expect(reader.read('https://example.com/big')).rejects.toBeInstanceOf(SourceParseError);
  });

  it('test_read_responseAtLimit_succeeds', async () => {
    const exact = 'y'.repeat(100);
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(200, exact, 'text/plain'));
    const reader = new HttpSourceReader({
      dnsLookup: mkDns(),
      fetchImpl,
      maxBytes: 100,
    });
    const source = await reader.read('https://example.com/exact');
    expect(source.content).toBe(exact);
  });

  // ---- Redirect handling --------------------------------------------------

  it('test_read_redirectToPublicHost_followsSuccessfully', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(302, '', undefined, { location: 'https://example.org/final' }),
      )
      .mockResolvedValueOnce(makeResponse(200, 'final body', 'text/markdown'));
    const reader = new HttpSourceReader({
      dnsLookup: mkDns(),
      fetchImpl,
      maxRedirects: 3,
    });

    const source = await reader.read('https://example.com/start');
    expect(source.content).toBe('final body');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('test_read_redirectToPrivateHost_rejected', async () => {
    // The first hop resolves cleanly to a public IP, then 302s at a
    // hostname that resolves to a loopback address. The second host
    // check MUST fire.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse(302, '', undefined, { location: 'http://evil.example.com/inner' }),
      );
    const reader = new HttpSourceReader({
      dnsLookup: mkDns({
        'evil.example.com': [{ address: '127.0.0.1', family: 4 }],
      }),
      fetchImpl,
      maxRedirects: 3,
    });
    await expect(reader.read('https://good.example/start')).rejects.toBeInstanceOf(
      SourceParseError,
    );
    // First fetch was made; second hop must be refused.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('test_read_redirectLoop_exceedsMax_throwsSourceParseError', async () => {
    // Every response is a 302 pointing at the same URL → we exceed the
    // redirect budget. With maxRedirects=2, the reader performs the
    // initial fetch plus 2 follow-ups (3 total) and then fails.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        makeResponse(302, '', undefined, { location: 'https://example.com/next' }),
      );
    const reader = new HttpSourceReader({
      dnsLookup: mkDns(),
      fetchImpl,
      maxRedirects: 2,
    });
    await expect(reader.read('https://example.com/start')).rejects.toBeInstanceOf(SourceParseError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('test_read_redirectMissingLocation_throwsSourceParseError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(302, ''));
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('https://example.com/start')).rejects.toBeInstanceOf(SourceParseError);
  });

  it('test_read_redirectToNonHttpScheme_throwsSourceParseError', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse(302, '', undefined, { location: 'ftp://evil.example/' }));
    const reader = new HttpSourceReader({ dnsLookup: mkDns(), fetchImpl });
    await expect(reader.read('https://example.com/start')).rejects.toBeInstanceOf(SourceParseError);
  });
});
