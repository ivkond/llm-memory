import {
  LlmUnavailableError,
  SourceParseError,
  GitConflictError,
  IngestPathViolationError,
  ProjectScopeUnsupportedError,
  WikiError,
} from '../domain/errors.js';
import type { ISourceReader } from '../ports/source-reader.js';
import type { ILlmClient } from '../ports/llm-client.js';
import type { ISearchEngine } from '../ports/search-engine.js';
import type { IVersionControl } from '../ports/version-control.js';
import type { IFileStore, FileStoreFactory } from '../ports/file-store.js';
import type { IStateStore } from '../ports/state-store.js';
import { extractIngestPages, type ExtractedPage } from './ingest/page-extractor.js';
import { renderIngestPageBody } from './ingest/page-renderer.js';

/** Spec bound for wiki_ingest: max 100K tokens after extraction. */
export const MAX_SOURCE_TOKENS = 100_000;

export interface IngestRequest {
  source: string;
  hint?: string;
  project?: string;
}

export interface IngestResponse {
  pages_created: string[];
  pages_updated: string[];
  commit_sha: string;
}

/**
 * Orchestrates `wiki_ingest`:
 *
 *   1. Read the source via ISourceReader (path or URL).
 *   2. Enforce the 100K-token limit (INV pre-check, no worktree created yet).
 *   3. Create a git worktree (INV-13 — main branch untouched).
 *   4. Ask the LLM to extract structured pages from the source.
 *   5. Write pages through a worktree-scoped IFileStore.
 *   6. Commit, squash, and fast-forward merge into main.
 *   7. Re-index every merged file with the search engine.
 *   8. Remove the worktree and stamp `last_ingest` in the state store.
 *
 * Error paths:
 *   - Source read / size failures: fail fast before any worktree is created.
 *   - LLM failure / write failure: rewrap as LlmUnavailableError (for LLM)
 *     or propagate, and force-remove the worktree. `last_ingest` is NOT
 *     updated. INV-4.
 *   - Merge conflict: rethrow GitConflictError and leave the worktree on
 *     disk for manual recovery. `last_ingest` is NOT updated.
 *
 * `IFileStore` is root-bound (FsFileStore takes a single rootDir), so this
 * service takes a `FileStoreFactory` at construction time and builds a
 * fresh IFileStore scoped to `worktree.path` on each ingest. Wiring code
 * (MCP server / CLI) passes `(root) => new FsFileStore(root)`.
 */
export class IngestService {
  constructor(
    private readonly sourceReader: ISourceReader,
    private readonly llmClient: ILlmClient,
    private readonly searchEngine: ISearchEngine,
    private readonly versionControl: IVersionControl,
    private readonly mainFileStore: IFileStore,
    private readonly fileStoreFactory: FileStoreFactory,
    private readonly stateStore: IStateStore,
  ) {}

  async ingest(req: IngestRequest): Promise<IngestResponse> {
    if (req.project) {
      throw new ProjectScopeUnsupportedError('ingest', req.project);
    }
    // -- Pre-worktree checks --------------------------------------------------
    const source = await this.sourceReader.read(req.source); // may throw SourceNotFoundError / SourceParseError
    if (source.estimatedTokens > MAX_SOURCE_TOKENS) {
      throw new SourceParseError(
        source.uri,
        `source is ${source.estimatedTokens} tokens, exceeds limit of ${MAX_SOURCE_TOKENS}`,
      );
    }

    // -- Worktree-scoped ingest ----------------------------------------------
    const worktree = await this.versionControl.createWorktree('ingest');
    const worktreeStore = this.fileStoreFactory(worktree.path);

    let extractedPages: ExtractedPage[];
    try {
      extractedPages = await extractIngestPages(this.llmClient, source, req.hint);
    } catch (err) {
      // LLM or extraction failure: discard the worktree, DO NOT touch state.
      await this.safeRemoveWorktree(worktree.path, true);
      if (err instanceof WikiError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(message);
    }

    // Classify each extracted page as create-or-update so the response
    // distinguishes them (pages_created vs pages_updated).
    const pagesCreated: string[] = [];
    const pagesUpdated: string[] = [];
    for (const page of extractedPages) {
      const existed = await this.mainFileStore.exists(page.path);
      (existed ? pagesUpdated : pagesCreated).push(page.path);
    }

    // -- Write pages to the worktree ----------------------------------------
    const touchedPaths: string[] = [];
    try {
      for (const page of extractedPages) {
        const body = renderIngestPageBody(page, source.uri);
        await worktreeStore.writeFile(page.path, body);
        touchedPaths.push(page.path);
      }
    } catch (err) {
      await this.safeRemoveWorktree(worktree.path, true);
      throw err;
    }

    // -- Commit / squash / merge --------------------------------------------
    let commitSha: string;
    try {
      await this.versionControl.commitInWorktree(
        worktree.path,
        touchedPaths,
        `:memo: [ingest] ${source.uri}`,
      );
      await this.versionControl.squashWorktree(worktree.path, `:memo: [ingest] ${source.uri}`);
      commitSha = await this.versionControl.mergeWorktree(worktree.path);
    } catch (err) {
      if (err instanceof GitConflictError) {
        // Preserve the worktree for manual recovery; state is unchanged.
        throw err;
      }
      // Any other error: discard the worktree.
      await this.safeRemoveWorktree(worktree.path, true);
      throw err;
    }

    // -- Post-merge reindex + state stamp + worktree cleanup ----------------
    for (const path of touchedPaths) {
      const data = await this.mainFileStore.readWikiPage(path);
      if (!data) continue;
      await this.searchEngine.index({
        path,
        title: data.frontmatter.title,
        content: data.content,
        updated: data.frontmatter.updated,
      });
    }

    await this.safeRemoveWorktree(worktree.path);
    await this.stateStore.update({ last_ingest: new Date().toISOString() });

    return {
      pages_created: pagesCreated,
      pages_updated: pagesUpdated,
      commit_sha: commitSha,
    };
  }

  /** Remove a worktree, swallowing any secondary failure so the original
   *  error (usually a rethrow in the caller) propagates cleanly. */
  private async safeRemoveWorktree(worktreePath: string, force = false): Promise<void> {
    try {
      await this.versionControl.removeWorktree(worktreePath, force || undefined);
    } catch {
      // intentional: caller is already in an error or success path
    }
  }
}
