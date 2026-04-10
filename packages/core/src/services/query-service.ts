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
}

const CITATION_CAP = 20;
const DEFAULT_MAX_RESULTS = 10;
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
      for (const file of files) {
        const lastIndexed = await this.searchEngine.lastIndexedAt(file.path);
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
}
