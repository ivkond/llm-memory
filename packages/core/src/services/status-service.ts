import { WikiNotInitializedError } from '../domain/errors.js';
import type { IFileStore } from '../ports/file-store.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { ISearchEngine, IndexHealth } from '../ports/search-engine.js';
import type { IStateStore } from '../ports/state-store.js';

export interface StatusResponse {
  total_pages: number;
  projects: string[];
  unconsolidated: number;
  last_lint: string | null;
  last_ingest: string | null;
  index_health: IndexHealth;
}

/**
 * Orchestrates `wiki_status`.
 *
 * Reads (but never writes) across four ports:
 *   - `IFileStore`      → enumerate `wiki/` + `projects/`, derive project list
 *   - `IVerbatimStore`  → unconsolidated verbatim entries count
 *   - `ISearchEngine`   → index_health, lastIndexedAt for staleness check
 *   - `IStateStore`     → last_lint / last_ingest timestamps
 *
 * The search engine reports its own `health()`, but the service upgrades
 * that signal to `'stale'` when it sees a file on disk whose frontmatter
 * `updated` is newer than `searchEngine.lastIndexedAt(path)` (or has never
 * been indexed). `IngestService` / future `LintService` stamp `last_ingest`
 * / `last_lint` in the state store after each successful run — this service
 * only reads those fields.
 */
export class WikiStatusService {
  constructor(
    private readonly fileStore: IFileStore,
    private readonly verbatimStore: IVerbatimStore,
    private readonly searchEngine: ISearchEngine,
    private readonly stateStore: IStateStore,
  ) {}

  async status(): Promise<StatusResponse> {
    const wikiFiles = await this.fileStore.listFiles('wiki');
    const projectFiles = await this.fileStore.listFiles('projects');

    const hasWikiMarkers =
      (await this.fileStore.exists('.config/settings.shared.yaml')) &&
      (await this.fileStore.exists('wiki')) &&
      (await this.fileStore.exists('projects'));

    if (!hasWikiMarkers && wikiFiles.length === 0 && projectFiles.length === 0) {
      throw new WikiNotInitializedError('<root>');
    }

    const totalPages = wikiFiles.length + projectFiles.length;
    const projects = this.deriveProjectList(projectFiles.map((f) => f.path));
    const unconsolidated = await this.verbatimStore.countUnconsolidated();

    const indexHealth = await this.computeIndexHealth([...wikiFiles, ...projectFiles]);

    const state = await this.stateStore.load();

    return {
      total_pages: totalPages,
      projects,
      unconsolidated,
      last_lint: state.last_lint,
      last_ingest: state.last_ingest,
      index_health: indexHealth,
    };
  }

  /**
   * Extract the unique, sorted list of project names from `projects/<name>/…`
   * paths. Files that live directly under `projects/` with no subdirectory
   * are ignored.
   */
  private deriveProjectList(paths: string[]): string[] {
    const names = new Set<string>();
    for (const p of paths) {
      const parts = p.split('/');
      if (parts.length >= 3 && parts[0] === 'projects') {
        names.add(parts[1]);
      }
    }
    return [...names].sort();
  }

  /**
   * Combine the search engine's own health signal with a per-file staleness
   * check. Priority order:
   *   missing  > stale > ok
   * i.e. if the engine says missing we return missing without looking at
   * individual files; otherwise we scan and upgrade ok → stale when any
   * file's frontmatter updated is newer than its lastIndexedAt timestamp,
   * or when a file has never been indexed at all.
   */
  private async computeIndexHealth(
    files: { path: string; updated: string }[],
  ): Promise<IndexHealth> {
    const engineHealth = await this.searchEngine.health();
    if (engineHealth === 'missing') return 'missing';

    for (const file of files) {
      const lastIndexed = await this.searchEngine.lastIndexedAt(file.path);
      if (lastIndexed === null) return 'stale';
      if (new Date(file.updated) > new Date(lastIndexed)) return 'stale';
    }

    return engineHealth;
  }
}
