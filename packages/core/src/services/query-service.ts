import type { SearchResult } from '../domain/search-result.js';
import { SearchEmptyError } from '../domain/errors.js';
import type { ISearchEngine, IndexEntry } from '../ports/search-engine.js';
import type { ILlmClient } from '../ports/llm-client.js';
import type { IProjectResolver } from '../ports/project-resolver.js';
import type { IFileStore } from '../ports/file-store.js';
import { WikiPage } from '../domain/wiki-page.js';

export interface QueryRequest {
  question: string;
  /** Explicit scope prefix (e.g. `wiki/patterns/`). Skips cascade when set. */
  scope?: string;
  /** Explicit project name — overrides projectResolver.resolve(cwd). */
  project?: string;
  /** Working directory used to derive project via projectResolver. */
  cwd?: string;
  /** Max raw search hits to request from the engine. Citation cap (20)
   *  is applied on top of this. */
  maxResults?: number;
  /** Passed straight through to the LLM as maxTokens. */
  maxTokens?: number;
}

export interface Citation {
  page: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  scope_used: string;
  project_used: string | null;
  citation_check: CitationFaithfulnessCheck;
}

export type CitationFaithfulnessStatus = 'verified' | 'unsupported' | 'unknown' | 'skipped';

export interface UnsupportedClaim {
  claim: string;
  citations: number[];
  reason: string;
}

export interface CitationFaithfulnessCheck {
  status: CitationFaithfulnessStatus;
  reason: string | null;
  invalid_citations: string[];
  unsupported_claims: UnsupportedClaim[];
}

const CITATION_CAP = 20;
const DEFAULT_MAX_RESULTS = 10;
const SYSTEM_PROMPT =
  'You are a wiki assistant. Answer the question concisely using only the provided context. ' +
  'Cite sources inline using [1], [2], … that reference the numbered context passages.';
const VERIFIER_SYSTEM_PROMPT =
  'You verify whether an answer is supported by numbered citation excerpts. ' +
  'Return strict JSON only, with keys: status, reason, unsupported_claims. ' +
  "status must be 'verified' or 'unsupported'.";
const MAX_VERIFIER_RESPONSE_CHARS = 20_000;

/**
 * Orchestrates `wiki_query`:
 *   1. Resolve the project (from req or via projectResolver).
 *   2. Build the scope cascade — explicit > project > cascade.
 *   3. Pre-search staleness sync: for each file the cascade may hit, if
 *      `file.updated > engine.lastIndexedAt(path)` re-index via
 *      searchEngine.index(). Keeps `wiki_recall` a pure file listing (per
 *      spec) and concentrates search coupling here.
 *   4. Walk the cascade; use the first scope that returns hits.
 *   5. Cap citations at 20.
 *   6. Call the LLM; on any failure, return raw citations with empty
 *      answer (INV-3).
 */
export class QueryService {
  constructor(
    private readonly searchEngine: ISearchEngine,
    private readonly llmClient: ILlmClient,
    private readonly projectResolver: IProjectResolver,
    private readonly fileStore: IFileStore,
  ) {}

  async query(req: QueryRequest): Promise<QueryResponse> {
    const project = req.project ?? (req.cwd ? await this.projectResolver.resolve(req.cwd) : null);

    const scopes = this.buildScopeCascade(req.scope, project);
    await this.syncStaleFiles(scopes);

    const maxResults = req.maxResults ?? DEFAULT_MAX_RESULTS;
    let results: SearchResult[] = [];
    let scopeUsed: string = scopes[0] ?? '';
    for (const scope of scopes) {
      results = await this.searchEngine.search({
        text: req.question,
        scope: scope || undefined,
        maxResults,
      });
      if (results.length > 0) {
        scopeUsed = scope;
        break;
      }
    }

    if (results.length === 0) {
      throw new SearchEmptyError(req.question);
    }

    const citations: Citation[] = results.slice(0, CITATION_CAP).map((r) => ({
      page: r.path,
      title: r.title,
      excerpt: r.excerpt,
      score: r.score,
    }));

    // INV-3: any LLM failure must still surface the raw search hits.
    try {
      const llmResponse = await this.llmClient.complete({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: this.buildPrompt(req.question, results) }],
        maxTokens: req.maxTokens,
        temperature: 0.1,
      });
      const synthesizedAnswer = llmResponse.content;
      const deterministicCheck = this.validateCitationReferences(synthesizedAnswer, citations.length);
      if (deterministicCheck.status !== 'verified') {
        return {
          answer: '',
          citations,
          scope_used: scopeUsed || 'all',
          project_used: project,
          citation_check: deterministicCheck,
        };
      }

      const verifierCheck = await this.verifyCitationFaithfulness(
        req.question,
        synthesizedAnswer,
        citations,
      );
      if (verifierCheck.status !== 'verified') {
        return {
          answer: '',
          citations,
          scope_used: scopeUsed || 'all',
          project_used: project,
          citation_check: verifierCheck,
        };
      }

      return {
        answer: synthesizedAnswer,
        citations,
        scope_used: scopeUsed || 'all',
        project_used: project,
        citation_check: verifierCheck,
      };
    } catch {
      return {
        answer: '',
        citations,
        scope_used: scopeUsed || 'all',
        project_used: project,
        citation_check: {
          status: 'skipped',
          reason: 'answer_unavailable',
          invalid_citations: [],
          unsupported_claims: [],
        },
      };
    }
  }

  /**
   * Build the ordered list of scope prefixes to try. When an explicit
   * `scope` is provided the cascade is a single-entry list — the caller
   * wants an exact scope. When a project is present, cascade through
   * `projects/<project>/` → `wiki/` → all. Otherwise, a single `all` scope.
   */
  private buildScopeCascade(explicitScope: string | undefined, project: string | null): string[] {
    if (explicitScope !== undefined) return [explicitScope];
    if (project) {
      return [`projects/${project}/`, 'wiki/', ''];
    }
    return [''];
  }

  /**
   * Pre-search staleness sync. Walks all files the cascade may read, and
   * re-indexes any whose frontmatter `updated` is newer than the engine's
   * recorded `lastIndexedAt`, or that have never been indexed at all.
   *
   * The file walk is keyed off the cascade scopes so an explicit
   * `wiki/patterns/` scope only syncs that subtree, not the whole wiki.
   */
  private async syncStaleFiles(scopes: string[]): Promise<void> {
    const directories = new Set<string>();
    for (const scope of scopes) {
      if (!scope) {
        directories.add('wiki');
        directories.add('projects');
      } else {
        directories.add(scope.replace(/\/$/, ''));
      }
    }

    for (const dir of directories) {
      const files = await this.fileStore.listFiles(dir);
      const lastIndexedMap = await this.searchEngine.lastIndexedAtMany(files.map((f) => f.path));
      for (const file of files) {
        const lastIndexed = lastIndexedMap[file.path] ?? null;
        const fileUpdated = file.updated;
        if (lastIndexed !== null && new Date(fileUpdated) <= new Date(lastIndexed)) {
          continue;
        }
        const data = await this.fileStore.readWikiPage(file.path);
        if (!data) continue;
        const page = WikiPage.fromParsedData(file.path, data);
        const entry: IndexEntry = {
          path: page.path,
          title: page.title,
          content: page.content,
          updated: page.updated,
        };
        await this.searchEngine.index(entry);
      }
    }
  }

  private buildPrompt(question: string, results: SearchResult[]): string {
    const context = results
      .slice(0, 10)
      .map((r, i) => `[${i + 1}] ${r.title} (${r.path})\n${r.excerpt}`)
      .join('\n\n');
    return `Question: ${question}\n\nContext:\n${context}\n\nAnswer with inline citations.`;
  }

  private validateCitationReferences(
    answer: string,
    citationCount: number,
  ): CitationFaithfulnessCheck {
    const refs = answer.match(/\[[^\]]+\]/g) ?? [];
    const invalid: string[] = [];
    for (const ref of refs) {
      const value = ref.slice(1, -1).trim();
      if (!/^\d+$/.test(value)) {
        invalid.push(ref);
        continue;
      }
      const index = Number.parseInt(value, 10);
      if (index < 1 || index > citationCount) {
        invalid.push(ref);
      }
    }
    if (invalid.length > 0) {
      return {
        status: 'unsupported',
        reason: 'invalid_citation_reference',
        invalid_citations: invalid,
        unsupported_claims: [],
      };
    }
    return { status: 'verified', reason: null, invalid_citations: [], unsupported_claims: [] };
  }

  private async verifyCitationFaithfulness(
    question: string,
    answer: string,
    citations: Citation[],
  ): Promise<CitationFaithfulnessCheck> {
    try {
      const verifierResponse = await this.llmClient.complete({
        system: VERIFIER_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: this.buildVerifierPrompt(question, answer, citations),
          },
        ],
        maxTokens: 300,
        temperature: 0,
      });
      const parsed = this.parseVerifierResponse(verifierResponse.content);
      if (!parsed) {
        return {
          status: 'unknown',
          reason: 'verifier_malformed_output',
          invalid_citations: [],
          unsupported_claims: [],
        };
      }
      return parsed;
    } catch {
      return {
        status: 'unknown',
        reason: 'verifier_unavailable',
        invalid_citations: [],
        unsupported_claims: [],
      };
    }
  }

  private buildVerifierPrompt(question: string, answer: string, citations: Citation[]): string {
    const citationText = citations
      .map((citation, index) => {
        return `[${index + 1}] ${citation.title} (${citation.page})\n${citation.excerpt}`;
      })
      .join('\n\n');
    return (
      `Question: ${question}\n\n` +
      `Answer:\n${answer}\n\n` +
      `Citations:\n${citationText}\n\n` +
      'Check whether each factual claim in the answer is supported by the cited excerpts. ' +
      'Return strict JSON only:\n' +
      '{"status":"verified|unsupported","reason":"string|null","unsupported_claims":[{"claim":"string","citations":[1],"reason":"string"}]}'
    );
  }

  private parseVerifierResponse(content: string): CitationFaithfulnessCheck | null {
    if (content.length > MAX_VERIFIER_RESPONSE_CHARS) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    if (value.status !== 'verified' && value.status !== 'unsupported') return null;

    const unsupportedClaimsRaw = Array.isArray(value.unsupported_claims)
      ? value.unsupported_claims
      : [];
    const unsupportedClaims: UnsupportedClaim[] = [];
    for (const claim of unsupportedClaimsRaw) {
      if (!claim || typeof claim !== 'object') return null;
      const c = claim as Record<string, unknown>;
      if (typeof c.claim !== 'string' || typeof c.reason !== 'string' || !Array.isArray(c.citations)) {
        return null;
      }
      const citations = c.citations.filter((n): n is number => Number.isInteger(n));
      unsupportedClaims.push({ claim: c.claim, citations, reason: c.reason });
    }

    if (value.status === 'verified' && unsupportedClaims.length > 0) {
      return null;
    }

    return {
      status: value.status,
      reason: typeof value.reason === 'string' ? value.reason : null,
      invalid_citations: [],
      unsupported_claims: unsupportedClaims,
    };
  }
}
