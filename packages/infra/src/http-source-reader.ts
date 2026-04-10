import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import {
  estimateTokens,
  SourceNotFoundError,
  SourceParseError,
  type ISourceReader,
  type SourceContent,
} from '@llm-wiki/core';

/**
 * A resolved IP with its family. Mirrors `dns.promises.lookup({ all: true })`
 * but typed tightly so the injected stub in tests cannot drift.
 */
export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type DnsLookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

export interface HttpSourceReaderOptions {
  /** Request timeout in milliseconds. Default: 30_000. */
  timeoutMs?: number;
  /** Maximum response body size in bytes. Default: 2 MiB. */
  maxBytes?: number;
  /** Maximum number of redirect hops. Default: 3. */
  maxRedirects?: number;
  /**
   * Override `dns.promises.lookup`. Tests inject a stub that returns fixed
   * public / private addresses so SSRF checks can be exercised hermetically.
   */
  dnsLookup?: DnsLookupFn;
  /**
   * Override the global `fetch`. Tests inject a `vi.fn()` mock so no real
   * network I/O happens.
   */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

/**
 * Hostnames we refuse to resolve at all. A literal `localhost` lookup could
 * pick up from /etc/hosts and return a public IP, hiding the user's clear
 * intent; cloud metadata names are similarly unambiguous SSRF vectors.
 */
const FORBIDDEN_HOSTNAMES = new Set<string>([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
]);

/**
 * Build the default IP block list. Covers the ranges that an SSRF-safe
 * outbound client should refuse, drawn from RFC 6890 / RFC 4193 / RFC 4291:
 *
 *   IPv4:
 *     0.0.0.0/8         unspecified
 *     10.0.0.0/8        RFC 1918 private
 *     100.64.0.0/10     carrier-grade NAT
 *     127.0.0.0/8       loopback
 *     169.254.0.0/16    link-local (incl. AWS/GCP IMDS 169.254.169.254)
 *     172.16.0.0/12     RFC 1918 private
 *     192.168.0.0/16    RFC 1918 private
 *
 *   IPv6:
 *     ::                unspecified
 *     ::1               loopback
 *     fc00::/7          unique-local
 *     fe80::/10         link-local
 */
function buildDefaultBlockList(): BlockList {
  const list = new BlockList();
  list.addSubnet('0.0.0.0', 8, 'ipv4');
  list.addSubnet('10.0.0.0', 8, 'ipv4');
  list.addSubnet('100.64.0.0', 10, 'ipv4');
  list.addSubnet('127.0.0.0', 8, 'ipv4');
  list.addSubnet('169.254.0.0', 16, 'ipv4');
  list.addSubnet('172.16.0.0', 12, 'ipv4');
  list.addSubnet('192.168.0.0', 16, 'ipv4');
  list.addAddress('::', 'ipv6');
  list.addAddress('::1', 'ipv6');
  list.addSubnet('fc00::', 7, 'ipv6');
  list.addSubnet('fe80::', 10, 'ipv6');
  return list;
}

const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  const addrs = await dnsLookup(hostname, { all: true, verbatim: true });
  return addrs.map((a) => ({ address: a.address, family: a.family as 4 | 6 }));
};

/**
 * Reads http(s):// sources for `wiki_ingest`, hardened against SSRF and
 * resource-exhaustion attacks:
 *
 *   - Scheme allowlist: only `http:` / `https:`.
 *   - Host allowlist: DNS lookup + `net.BlockList` reject loopback, private,
 *     link-local, and cloud-metadata ranges. Literal IPs are checked without
 *     a DNS roundtrip.
 *   - Request timeout via `AbortController` (default 30 s).
 *   - Response body size cap enforced by streaming + counting bytes
 *     (default 2 MiB) — the ingest's 100 K-token limit comes later, after
 *     the body is already in memory, so we need a byte cap upstream to
 *     bound memory use.
 *   - Redirect limit (default 3 hops), with **host check re-applied on
 *     every hop** so a public domain cannot redirect to 127.0.0.1 or the
 *     metadata IP.
 *
 * Every option is constructor-injectable so tests can substitute a fake
 * fetch + fake DNS resolver and hermetically exercise each branch.
 */
export class HttpSourceReader implements ISourceReader {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly dnsLookup: DnsLookupFn;
  private readonly fetchImpl?: typeof fetch;
  private readonly blockList: BlockList;

  constructor(options: HttpSourceReaderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.dnsLookup = options.dnsLookup ?? defaultDnsLookup;
    this.fetchImpl = options.fetchImpl;
    this.blockList = buildDefaultBlockList();
  }

  async read(uri: string): Promise<SourceContent> {
    const parsed = this.parseUri(uri);
    await this.assertSafeHost(parsed, uri);

    let current = parsed;
    let response: Response | undefined;
    for (let hop = 0; ; hop++) {
      response = await this.fetchOnce(current.toString(), uri);

      if (this.isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new SourceParseError(
            uri,
            `${response.status} redirect missing Location header`,
          );
        }
        if (hop >= this.maxRedirects) {
          throw new SourceParseError(
            uri,
            `exceeded maximum of ${this.maxRedirects} redirects`,
          );
        }
        // Resolve the Location header against the current URL so relative
        // redirects work. Re-run the full scheme + host check on the new
        // target — this is the critical guard against open-redirect SSRF.
        try {
          current = new URL(location, current);
        } catch {
          throw new SourceParseError(uri, `invalid redirect target: ${location}`);
        }
        if (current.protocol !== 'http:' && current.protocol !== 'https:') {
          throw new SourceParseError(
            uri,
            `redirect to unsupported scheme: ${current.protocol}`,
          );
        }
        await this.assertSafeHost(current, uri);
        // Drain the intermediate response body so the underlying connection
        // can be released before we fetch the next hop.
        try {
          await response.body?.cancel();
        } catch {
          /* ignore */
        }
        continue;
      }
      break;
    }

    if (!response) {
      throw new SourceParseError(uri, 'no response received');
    }
    if (response.status === 404) {
      throw new SourceNotFoundError(uri);
    }
    if (!response.ok) {
      throw new SourceParseError(uri, `HTTP ${response.status} ${response.statusText}`);
    }

    const content = await this.readCappedBody(response, uri);
    const mimeType = this.primaryMimeType(response.headers.get('content-type') ?? undefined);
    return {
      uri,
      content,
      mimeType,
      bytes: Buffer.byteLength(content, 'utf-8'),
      estimatedTokens: estimateTokens(content),
    };
  }

  // --- URL / host validation -----------------------------------------------

  private parseUri(uri: string): URL {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      throw new SourceParseError(uri, 'invalid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new SourceParseError(uri, `unsupported scheme: ${url.protocol}`);
    }
    return url;
  }

  private async assertSafeHost(url: URL, originalUri: string): Promise<void> {
    // Node's URL keeps the brackets in `hostname` for IPv6 literals
    // (`http://[::1]/` → `"[::1]"`), so strip them before passing to
    // `isIP` / the block list.
    const rawHostname = url.hostname;
    const hostname =
      rawHostname.startsWith('[') && rawHostname.endsWith(']')
        ? rawHostname.slice(1, -1)
        : rawHostname;

    if (!hostname) {
      throw new SourceParseError(originalUri, 'URL has no hostname');
    }

    const normalised = hostname.toLowerCase();
    if (FORBIDDEN_HOSTNAMES.has(normalised)) {
      throw new SourceParseError(originalUri, `blocked hostname: ${hostname}`);
    }

    const literalFamily = isIP(hostname);
    let addresses: ResolvedAddress[];

    if (literalFamily === 0) {
      try {
        addresses = await this.dnsLookup(hostname);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new SourceParseError(originalUri, `DNS lookup failed for ${hostname}: ${message}`);
      }
      if (addresses.length === 0) {
        throw new SourceParseError(originalUri, `no addresses resolved for ${hostname}`);
      }
    } else {
      addresses = [{ address: hostname, family: literalFamily as 4 | 6 }];
    }

    for (const addr of addresses) {
      const family = addr.family === 6 ? 'ipv6' : 'ipv4';
      if (this.blockList.check(addr.address, family)) {
        throw new SourceParseError(
          originalUri,
          `host ${hostname} resolves to blocked address ${addr.address}`,
        );
      }
    }
  }

  // --- Network I/O ---------------------------------------------------------

  private async fetchOnce(url: string, originalUri: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const fetchImpl = this.fetchImpl ?? globalThis.fetch;
    try {
      // redirect: 'manual' — we handle redirects ourselves so we can re-run
      // the host check on the new target.
      return await fetchImpl(url, { signal: controller.signal, redirect: 'manual' });
    } catch (err) {
      if ((err as Error | undefined)?.name === 'AbortError') {
        throw new SourceParseError(
          originalUri,
          `request timed out after ${this.timeoutMs}ms`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new SourceParseError(originalUri, `network error: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async readCappedBody(response: Response, uri: string): Promise<string> {
    if (!response.body) {
      // Should not happen for fetch Responses but keep a safety net.
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf-8') > this.maxBytes) {
        throw new SourceParseError(uri, `response exceeded ${this.maxBytes} bytes`);
      }
      return text;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength;
        if (received > this.maxBytes) {
          try {
            await reader.cancel('size limit exceeded');
          } catch {
            /* ignore */
          }
          throw new SourceParseError(uri, `response exceeded ${this.maxBytes} bytes`);
        }
        chunks.push(value);
      }
    } catch (err) {
      if (err instanceof SourceParseError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new SourceParseError(uri, `failed to read body: ${message}`);
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return buffer.toString('utf-8');
  }

  private isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  private primaryMimeType(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const semi = header.indexOf(';');
    return (semi === -1 ? header : header.slice(0, semi)).trim();
  }
}
