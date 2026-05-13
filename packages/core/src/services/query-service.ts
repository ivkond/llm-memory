import { SearchResult } from '../domain/search-result.js';
import type { FreshnessStatus } from '../domain/search-result.js';
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
  /** Include stale citations in the final output when staleness mode excludes them. */
  includeStale?: boolean;
  /** Prefer fresh by default; exclude stale only when explicitly requested. */
  stalenessMode?: 'prefer_fresh' | 'exclude_stale';
}

export interface Citation {
  page: string;
  title: string;
  excerpt: string;
  score: number;
  updated?: string;
  confidence?: number;
  supersedes?: string | null;
  freshness_status: FreshnessStatus;
  freshness_reasons: string[];
  superseded_by?: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  scope_used: string;
  project_used: string | null;
}

const CITATION_CAP = 20;
const DEFAULT_MAX_RESULTS = 10;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const SYSTEM_PROMPT =
  'You are a wiki assistant. Answer the question concisely using only the provided context. ' +
  'Cite sources inline using [1], [2], … that reference the numbered context passages.';

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

    const filtered = await this.applyStalenessPolicy(results, req, scopeUsed);
    const topForResponse = filtered.slice(0, CITATION_CAP);
    const citations: Citation[] = topForResponse.map((r) => ({
      page: r.path,
      title: r.title,
      excerpt: r.excerpt,
      score: r.score,
      updated: r.metadata.updated,
      confidence: r.metadata.confidence,
      supersedes: r.metadata.supersedes ?? null,
      freshness_status: r.metadata.freshness_status ?? 'fresh',
      freshness_reasons: r.metadata.freshness_reasons ?? [],
      superseded_by: r.metadata.superseded_by,
    }));

    // INV-3: any LLM failure must still surface the raw search hits.
    try {
      const llmResponse = await this.llmClient.complete({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: this.buildPrompt(req.question, topForResponse) }],
        maxTokens: req.maxTokens,
        temperature: 0.1,
      });
      return {
        answer: llmResponse.content,
        citations,
        scope_used: scopeUsed || 'all',
        project_used: project,
      };
    } catch {
      return {
        answer: '',
        citations,
        scope_used: scopeUsed || 'all',
        project_used: project,
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
          confidence: page.confidence,
          supersedes: page.supersedes,
        };
        await this.searchEngine.index(entry);
      }
    }
  }

  private async applyStalenessPolicy(
    results: SearchResult[],
    req: QueryRequest,
    scopeUsed: string,
  ): Promise<SearchResult[]> {
    const mode = req.stalenessMode ?? 'prefer_fresh';
    const includeStale = req.includeStale ?? false;
    const supersededBy = await this.buildSupersessionMap(scopeUsed);

    const classified = results.map((result) => {
      const reasons: string[] = [];
      const supersededByPath = supersededBy.get(this.normalizePath(result.path));
      const confidence = result.metadata.confidence;
      if (supersededByPath) reasons.push('superseded');
      if (typeof confidence === 'number' && confidence < LOW_CONFIDENCE_THRESHOLD) {
        reasons.push('low_confidence');
      }
      const freshnessStatus: FreshnessStatus =
        reasons[0] === 'superseded'
          ? 'superseded'
          : reasons[0] === 'low_confidence'
            ? 'low_confidence'
            : 'fresh';
      return new SearchResult(result.path, result.title, result.excerpt, result.score, result.source, {
        ...result.metadata,
        freshness_status: freshnessStatus,
        freshness_reasons: reasons,
        superseded_by: supersededByPath,
      });
    });

    if (mode === 'exclude_stale' && !includeStale) {
      const filtered = classified.filter(
        (r) =>
          r.metadata.freshness_status !== 'superseded' &&
          r.metadata.freshness_status !== 'low_confidence',
      );
      if (filtered.length > 0) return filtered;
    }

    return [...classified].sort((a, b) => {
      const staleRank = this.staleRank(a.metadata.freshness_status);
      const staleRankB = this.staleRank(b.metadata.freshness_status);
      if (staleRank !== staleRankB) return staleRank - staleRankB;
      return b.score - a.score;
    });
  }

  private staleRank(status: FreshnessStatus | undefined): number {
    if (status === 'fresh' || status === undefined) return 0;
    if (status === 'low_confidence') return 1;
    return 2;
  }

  private async buildSupersessionMap(scope: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const directories =
      scope && scope !== 'all'
        ? [scope.replace(/\/$/, '')]
        : ['wiki', 'projects'];
    for (const dir of directories) {
      const files = await this.fileStore.listFiles(dir);
      for (const file of files) {
        const data = await this.fileStore.readWikiPage(file.path);
        if (!data) continue;
        const page = WikiPage.fromParsedData(file.path, data);
        if (!page.supersedes) continue;
        map.set(this.normalizePath(page.supersedes), page.path);
      }
    }
    return map;
  }

  private normalizePath(pathLike: string): string {
    return pathLike.trim().replace(/^\.\//, '').replace(/\/+/g, '/');
  }

  private buildPrompt(question: string, results: SearchResult[]): string {
    const context = results
      .slice(0, 10)
      .map((r, i) => `[${i + 1}] ${r.title} (${r.path})\n${r.excerpt}`)
      .join('\n\n');
    return `Question: ${question}\n\nContext:\n${context}\n\nAnswer with inline citations.`;
  }
}
