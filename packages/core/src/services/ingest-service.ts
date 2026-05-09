import {
  LlmUnavailableError,
  SourceParseError,
  GitConflictError,
  IngestPathViolationError,
  WikiError,
} from '../domain/errors.js';
import type { ISourceReader } from '../ports/source-reader.js';
import type { ILlmClient } from '../ports/llm-client.js';
import type { ISearchEngine } from '../ports/search-engine.js';
import type { IVersionControl } from '../ports/version-control.js';
import type { IFileStore, FileStoreFactory } from '../ports/file-store.js';
import type { IStateStore } from '../ports/state-store.js';

/** Spec bound for wiki_ingest: max 100K tokens after extraction. */
export const MAX_SOURCE_TOKENS = 100_000;

/** Project identifier shape — mirrors InvalidIdentifierError's regex. */
const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

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

interface ExtractedPage {
  path: string;
  title: string;
  content: string;
}

const INGEST_SYSTEM_PROMPT =
  'You are a wiki editor. Extract high-signal reference pages from the given source. ' +
  'Respond with a JSON array of objects: [{ "path": "wiki/...", "title": "...", "content": "..." }]. ' +
  'Prefer short, durable summaries. Cross-link related pages with relative markdown links.';

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
    void req.project;
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
      extractedPages = await this.extractPages(source, req.hint);
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
        const body = this.renderPageBody(page, source.uri);
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

  /**
   * Ask the LLM to extract structured wiki pages from the source content.
   * The prompt requires a JSON array response; anything else is treated as
   * a parse failure and surfaced as `LlmUnavailableError` by the caller.
   */
  private async extractPages(
    source: { uri: string; content: string },
    hint?: string,
  ): Promise<ExtractedPage[]> {
    const userMessage =
      (hint ? `Hint: ${hint}\n\n` : '') +
      `Source URI: ${source.uri}\n\nSource content:\n${source.content}\n\n` +
      'Reply with a JSON array of pages.';

    const response = await this.llmClient.complete({
      system: INGEST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.1,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.stripCodeFence(response.content));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(`model returned non-JSON: ${message}`);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new LlmUnavailableError('model returned empty or non-array page list');
    }

    const pages: ExtractedPage[] = [];
    for (const raw of parsed) {
      if (
        typeof raw !== 'object' ||
        raw === null ||
        typeof (raw as { path?: unknown }).path !== 'string' ||
        typeof (raw as { title?: unknown }).title !== 'string' ||
        typeof (raw as { content?: unknown }).content !== 'string'
      ) {
        throw new LlmUnavailableError('model returned malformed page entry');
      }
      const obj = raw as { path: string; title: string; content: string };
      // Validate the model-provided path BEFORE it reaches any filesystem
      // write. Anything that is not a wiki/ or projects/<name>/ markdown
      // file must be rejected — without this check an LLM could target
      // package.json, .github/workflows/, pnpm-lock.yaml, etc., and those
      // writes would survive the squash + fast-forward merge into main.
      this.validateTargetPath(obj.path);
      pages.push({ path: obj.path, title: obj.title, content: obj.content });
    }
    return pages;
  }

  /**
   * Validate that an LLM-provided page path is a safe ingest target.
   *
   * Rules:
   *  - Non-empty string.
   *  - Relative (no leading `/`), no backslashes (Windows-style segments),
   *    no empty / `.` / `..` segments (blocks traversal even before
   *    normalisation).
   *  - Must end in `.md`.
   *  - First segment must be `wiki` OR `projects/<name>` where `<name>`
   *    matches the project identifier regex.
   *
   * On violation, throws `IngestPathViolationError`. The outer `ingest()`
   * catch treats this as a `WikiError` and force-removes the worktree —
   * state is never written, main branch is never touched.
   */
  private validateTargetPath(requestedPath: string): void {
    if (typeof requestedPath !== 'string' || requestedPath.length === 0) {
      throw new IngestPathViolationError(requestedPath, 'path must be a non-empty string');
    }
    if (requestedPath.includes('\\')) {
      throw new IngestPathViolationError(requestedPath, 'path must not contain backslashes');
    }
    if (requestedPath.startsWith('/')) {
      throw new IngestPathViolationError(requestedPath, 'path must be relative');
    }
    if (/\0/.test(requestedPath)) {
      throw new IngestPathViolationError(requestedPath, 'path must not contain NUL bytes');
    }
    const segments = requestedPath.split('/');
    for (const seg of segments) {
      if (seg === '' || seg === '.' || seg === '..') {
        throw new IngestPathViolationError(requestedPath, `invalid segment "${seg}"`);
      }
    }
    if (!requestedPath.endsWith('.md')) {
      throw new IngestPathViolationError(requestedPath, 'path must have a .md extension');
    }
    if (segments[0] === 'wiki') {
      if (segments.length < 2) {
        throw new IngestPathViolationError(
          requestedPath,
          'wiki path must be wiki/<file>.md or deeper',
        );
      }
      return;
    }
    if (segments[0] === 'projects') {
      if (segments.length < 3) {
        throw new IngestPathViolationError(
          requestedPath,
          'projects path must be projects/<name>/<file>.md',
        );
      }
      if (!PROJECT_NAME_RE.test(segments[1])) {
        throw new IngestPathViolationError(requestedPath, `invalid project name "${segments[1]}"`);
      }
      return;
    }
    throw new IngestPathViolationError(
      requestedPath,
      'path must start with wiki/ or projects/<name>/',
    );
  }

  /** Some models wrap JSON output in ``` fences; trim them conservatively. */
  private stripCodeFence(content: string): string {
    const trimmed = content.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return fenceMatch ? fenceMatch[1] : trimmed;
  }

  /**
   * Emit a deterministic YAML frontmatter + body string for a single page.
   *
   * Core intentionally does not depend on gray-matter / js-yaml — those are
   * infra concerns. This minimal emitter handles the closed field set defined
   * by WikiPageFrontmatter and quotes any string that could trip a YAML
   * parser.
   */
  private renderPageBody(page: ExtractedPage, sourceUri: string): string {
    const today = new Date().toISOString().slice(0, 10);
    const fm = [
      '---',
      `title: ${this.yamlString(page.title)}`,
      `created: ${today}`,
      `updated: ${today}`,
      'confidence: 0.8',
      'sources:',
      `  - ${this.yamlString(sourceUri)}`,
      'supersedes: null',
      'tags: []',
      '---',
      '',
    ].join('\n');
    return `${fm}\n${page.content.trim()}\n`;
  }

  /** Quote strings that could trip a YAML parser. Anything matching a
   *  plain-scalar shape (letters, digits, spaces, `-` `_` `.` `/` `:`) is
   *  left as-is; everything else is double-quoted with JSON escaping. */
  private yamlString(value: string): string {
    if (/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/.test(value)) return value;
    return JSON.stringify(value);
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
