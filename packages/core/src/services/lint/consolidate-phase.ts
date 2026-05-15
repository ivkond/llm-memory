import { LintPhaseError, LlmUnavailableError } from '../../domain/errors.js';
import type { IFileStore } from '../../ports/file-store.js';
import type { IVerbatimStore } from '../../ports/verbatim-store.js';
import type { ILlmClient } from '../../ports/llm-client.js';
import type { ArchiveEntry } from '../../ports/archiver.js';
import type { VerbatimEntry } from '../../domain/verbatim-entry.js';
import { stripCodeFence } from './strip-code-fence.js';

export const CONSOLIDATE_BATCH_LIMIT = 50;

export interface ConsolidatePhaseResult {
  consolidatedCount: number;
  touchedPaths: string[];
  archivedEntries?: ArchiveEntry[];
  reviewRecords?: ReviewRecord[];
  lowSignalCount?: number;
  reviewQueueCount?: number;
}

interface ProposedPage {
  path: string;
  title: string;
  content: string;
  source_entries: string[];
}

interface ProposedDecision {
  source_entry: string;
  reason: string;
  confidence: number;
}

export interface ReviewRecord {
  sourcePath: string;
  reason: string;
  confidence: number;
  kind: 'review' | 'low_signal';
}

const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

const CONSOLIDATE_SYSTEM_PROMPT =
  'You are a wiki editor. Merge verbatim memory entries into durable wiki or project pages. ' +
  'Respond with JSON object keys: pages, review, low_signal. ' +
  'pages format: {"path":"wiki/...","title":"...","content":"...","source_entries":["log/..."]}. ' +
  'review/low_signal format: {"source_entry":"log/...","reason":"...","confidence":0.0}. ' +
  'Use review for uncertain but potentially useful entries. Use low_signal for weak/noisy entries. ' +
  'An empty array for any key is valid.';

/**
 * Phase 1 of wiki_lint.
 *
 * Loads up to `CONSOLIDATE_BATCH_LIMIT` unconsolidated verbatim entries from
 * every known agent, asks the LLM to fold them into wiki/project pages, and
 * writes those pages via a worktree-scoped `IFileStore`. Every entry in the
 * batch is marked `consolidated: true` regardless of whether the LLM chose
 * to integrate it — re-emitting the same entry next lint run is waste, and
 * the LLM has already had one chance to use it. Pages targeting paths
 * outside `wiki/` or `projects/<name>/` are rejected before any marker is
 * flipped (INV-5 compliance relies on this — if we marked first and then
 * threw, re-runs would silently skip real data).
 *
 * Worktree discipline: the phase is handed a worktree-scoped `IFileStore`
 * and `IVerbatimStore` by `LintService`. It never touches main-branch paths.
 */
export class ConsolidatePhase {
  constructor(
    private readonly worktreeFileStore: IFileStore,
    private readonly worktreeVerbatimStore: IVerbatimStore,
    private readonly llmClient: ILlmClient,
    private readonly mainRepoRoot?: string,
  ) {}

  async run(): Promise<ConsolidatePhaseResult> {
    const batch = await this.collectBatch();
    if (batch.length === 0) {
      return { consolidatedCount: 0, touchedPaths: [] };
    }

    let pages: ProposedPage[];
    let reviewDecisions: ProposedDecision[];
    let lowSignalDecisions: ProposedDecision[];
    try {
      ({ pages, reviewDecisions, lowSignalDecisions } = await this.askLlm(batch));
    } catch (err) {
      if (err instanceof LlmUnavailableError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(message);
    }

    for (const page of pages) {
      this.validatePagePath(page.path);
    }

    const touchedPaths: string[] = [];
    for (const page of pages) {
      const body = this.renderPage(page);
      await this.worktreeFileStore.writeFile(page.path, body);
      touchedPaths.push(page.path);
    }

    const reviewRecords: ReviewRecord[] = [];
    const batchByPath = new Map(batch.map((entry) => [entry.filePath, entry] as const));
    const consumed = new Set<string>();
    for (const page of pages) {
      for (const source of page.source_entries) {
        if (batchByPath.has(source)) consumed.add(source);
      }
    }
    for (const decision of reviewDecisions) {
      if (!batchByPath.has(decision.source_entry)) continue;
      consumed.add(decision.source_entry);
      reviewRecords.push({
        sourcePath: decision.source_entry,
        reason: decision.reason,
        confidence: decision.confidence,
        kind: 'review',
      });
    }

    const lowSignalPaths = new Set<string>();
    for (const decision of lowSignalDecisions) {
      if (!batchByPath.has(decision.source_entry)) continue;
      consumed.add(decision.source_entry);
      lowSignalPaths.add(decision.source_entry);
      reviewRecords.push({
        sourcePath: decision.source_entry,
        reason: decision.reason,
        confidence: decision.confidence,
        kind: 'low_signal',
      });
    }

    for (const entry of batch) {
      if (!consumed.has(entry.filePath)) {
        lowSignalPaths.add(entry.filePath);
        reviewRecords.push({
          sourcePath: entry.filePath,
          reason: 'Model did not select this entry for consolidation',
          confidence: 0.2,
          kind: 'low_signal',
        });
      }
      await this.worktreeVerbatimStore.markConsolidated(entry.filePath);
    }

    const archivedEntries: ArchiveEntry[] | undefined = this.mainRepoRoot
      ? [...lowSignalPaths].map((entryPath) => ({
          sourcePath: `${this.mainRepoRoot}/${entryPath}`,
        }))
      : undefined;

    return {
      consolidatedCount: batch.length,
      touchedPaths,
      archivedEntries,
      reviewRecords,
      lowSignalCount: lowSignalPaths.size,
      reviewQueueCount: reviewRecords.filter((r) => r.kind === 'review').length,
    };
  }

  private async askLlm(batch: VerbatimEntry[]): Promise<{
    pages: ProposedPage[];
    reviewDecisions: ProposedDecision[];
    lowSignalDecisions: ProposedDecision[];
  }> {
    const userPayload = batch.map((e) => ({
      path: e.filePath,
      agent: e.agent,
      project: e.project,
      content: e.content,
    }));
    const response = await this.llmClient.complete({
      system: CONSOLIDATE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content:
            `Consolidate the following ${batch.length} entries. ` +
            'Reply with JSON: {"pages":[...], "review":[...], "low_signal":[...]}.\n\n' +
            JSON.stringify(userPayload, null, 2),
        },
      ],
      temperature: 0.1,
    });

    const trimmed = stripCodeFence(response.content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new LlmUnavailableError(`model returned non-JSON: ${message}`);
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new LlmUnavailableError('model response must be a JSON object');
    }

    const pages = this.parsePages((parsed as { pages?: unknown }).pages);
    const reviewDecisions = this.parseDecisions((parsed as { review?: unknown }).review);
    const lowSignalDecisions = this.parseDecisions(
      (parsed as { low_signal?: unknown }).low_signal,
    );
    return { pages, reviewDecisions, lowSignalDecisions };
  }

  private parsePages(rawPages: unknown): ProposedPage[] {
    if (rawPages == null) return [];
    if (!Array.isArray(rawPages)) {
      throw new LlmUnavailableError('model response "pages" must be an array');
    }
    const result: ProposedPage[] = [];
    for (const raw of rawPages) {
      if (
        typeof raw !== 'object' ||
        raw === null ||
        typeof (raw as { path?: unknown }).path !== 'string' ||
        typeof (raw as { title?: unknown }).title !== 'string' ||
        typeof (raw as { content?: unknown }).content !== 'string' ||
        !Array.isArray((raw as { source_entries?: unknown }).source_entries)
      ) {
        throw new LlmUnavailableError('malformed page entry in model response');
      }
      const obj = raw as ProposedPage;
      result.push({
        path: obj.path,
        title: obj.title,
        content: obj.content,
        source_entries: obj.source_entries,
      });
    }
    return result;
  }

  private parseDecisions(raw: unknown): ProposedDecision[] {
    if (raw == null) return [];
    if (!Array.isArray(raw)) {
      throw new LlmUnavailableError('model response decisions must be arrays');
    }
    const result: ProposedDecision[] = [];
    for (const item of raw) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as { source_entry?: unknown }).source_entry !== 'string' ||
        typeof (item as { reason?: unknown }).reason !== 'string' ||
        typeof (item as { confidence?: unknown }).confidence !== 'number'
      ) {
        throw new LlmUnavailableError('malformed decision entry in model response');
      }
      result.push({
        source_entry: (item as { source_entry: string }).source_entry,
        reason: (item as { reason: string }).reason,
        confidence: Math.max(0, Math.min(1, (item as { confidence: number }).confidence)),
      });
    }
    return result;
  }
  
  private async collectBatch(): Promise<VerbatimEntry[]> {
    const agents = await this.worktreeVerbatimStore.listAgents();
    const batch: VerbatimEntry[] = [];
    for (const agent of agents) {
      if (batch.length >= CONSOLIDATE_BATCH_LIMIT) break;
      const unconsolidated = await this.worktreeVerbatimStore.listUnconsolidated(agent);
      unconsolidated.sort((a, b) => a.path.localeCompare(b.path));
      for (const info of unconsolidated) {
        if (batch.length >= CONSOLIDATE_BATCH_LIMIT) break;
        const entry = await this.worktreeVerbatimStore.readEntry(info.path);
        if (entry) batch.push(entry);
      }
    }
    return batch;
  }


  private validatePagePath(requestedPath: string): void {
    if (!requestedPath || requestedPath.includes('\\') || requestedPath.startsWith('/')) {
      throw new LintPhaseError('consolidate', `invalid path ${JSON.stringify(requestedPath)}`);
    }
    const segments = requestedPath.split('/');
    for (const seg of segments) {
      if (seg === '' || seg === '.' || seg === '..') {
        throw new LintPhaseError('consolidate', `invalid path segment in ${requestedPath}`);
      }
    }
    if (!requestedPath.endsWith('.md')) {
      throw new LintPhaseError('consolidate', `path must end with .md: ${requestedPath}`);
    }
    if (segments[0] === 'wiki' && segments.length >= 2) return;
    if (segments[0] === 'projects' && segments.length >= 3 && PROJECT_NAME_RE.test(segments[1])) {
      return;
    }
    throw new LintPhaseError(
      'consolidate',
      `path must be wiki/... or projects/<name>/...: ${requestedPath}`,
    );
  }

  private renderPage(page: ProposedPage): string {
    const today = new Date().toISOString().slice(0, 10);
    const sources = page.source_entries.map((s) => `  - ${this.yamlString(s)}`).join('\n');
    const fm = [
      '---',
      `title: ${this.yamlString(page.title)}`,
      `created: ${today}`,
      `updated: ${today}`,
      'confidence: 0.8',
      sources.length > 0 ? `sources:\n${sources}` : 'sources: []',
      'supersedes: null',
      'tags: []',
      '---',
      '',
    ].join('\n');
    return `${fm}\n${page.content.trim()}\n`;
  }

  private yamlString(value: string): string {
    if (/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/.test(value)) return value;
    return JSON.stringify(value);
  }
}
