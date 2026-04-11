import path from 'node:path';
import { GitConflictError } from '../domain/errors.js';
import { LintReport } from '../domain/lint-report.js';
import type { IFileStore, FileStoreFactory } from '../ports/file-store.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { IVersionControl } from '../ports/version-control.js';
import type { IStateStore } from '../ports/state-store.js';
import type { ISearchEngine } from '../ports/search-engine.js';
import type { IArchiver, ArchiveEntry } from '../ports/archiver.js';
import type { HealthIssue } from '../domain/health-issue.js';

export type LintPhaseName = 'consolidate' | 'promote' | 'health';

export interface ConsolidateRunResult {
  consolidatedCount: number;
  touchedPaths: string[];
  archivedEntries?: ArchiveEntry[];
}

export interface PromoteRunResult {
  promotedCount: number;
  touchedPaths: string[];
}

export interface HealthRunResult {
  issues: HealthIssue[];
}

export interface LintPhase<N extends LintPhaseName> {
  readonly name: N;
  run(): Promise<
    N extends 'consolidate'
      ? ConsolidateRunResult
      : N extends 'promote'
        ? PromoteRunResult
        : HealthRunResult
  >;
}

export interface LintRequest {
  phases?: LintPhaseName[];
}

export interface VerbatimStoreFactory {
  (fileStore: IFileStore): IVerbatimStore;
}

export interface LintServiceDeps {
  mainRepoRoot: string;
  mainFileStore: IFileStore;
  mainVerbatimStore: IVerbatimStore;
  versionControl: IVersionControl;
  searchEngine: ISearchEngine;
  fileStoreFactory: FileStoreFactory;
  verbatimStoreFactory: VerbatimStoreFactory;
  stateStore: IStateStore;
  archiver: IArchiver;
  makeConsolidatePhase: (fs: IFileStore, vs: IVerbatimStore) => LintPhase<'consolidate'>;
  makePromotePhase: (fs: IFileStore) => LintPhase<'promote'>;
  makeHealthPhase: (fs: IFileStore) => LintPhase<'health'>;
  now?: () => Date;
}

const ALL_PHASES: LintPhaseName[] = ['consolidate', 'promote', 'health'];

export class LintService {
  private readonly now: () => Date;

  constructor(private readonly deps: LintServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async lint(req: LintRequest = {}): Promise<LintReport> {
    const phaseSet = new Set<LintPhaseName>(req.phases ?? ALL_PHASES);

    const worktree = await this.deps.versionControl.createWorktree('lint');
    const wtFileStore = this.deps.fileStoreFactory(worktree.path);
    const wtVerbatimStore = this.deps.verbatimStoreFactory(wtFileStore);

    let report = LintReport.empty();
    let consolidateResult: ConsolidateRunResult | null = null;
    const touchedPaths = new Set<string>();

    try {
      if (phaseSet.has('consolidate')) {
        const phase = this.deps.makeConsolidatePhase(wtFileStore, wtVerbatimStore);
        consolidateResult = await phase.run();
        for (const p of consolidateResult.touchedPaths) touchedPaths.add(p);
        touchedPaths.add('log');
        report = report.merge(
          LintReport.from({
            consolidated: consolidateResult.consolidatedCount,
            promoted: 0,
            issues: [],
            commitSha: null,
          }),
        );
      }

      if (phaseSet.has('promote')) {
        const phase = this.deps.makePromotePhase(wtFileStore);
        const result = await phase.run();
        for (const p of result.touchedPaths) touchedPaths.add(p);
        report = report.merge(
          LintReport.from({
            consolidated: 0,
            promoted: result.promotedCount,
            issues: [],
            commitSha: null,
          }),
        );
      }

      if (phaseSet.has('health')) {
        const phase = this.deps.makeHealthPhase(wtFileStore);
        const result = await phase.run();
        report = report.merge(
          LintReport.from({
            consolidated: 0,
            promoted: 0,
            issues: result.issues,
            commitSha: null,
          }),
        );
      }
    } catch (err) {
      await this.safeRemoveWorktree(worktree.path, true);
      throw err;
    }

    const hasChanges =
      touchedPaths.size > 0 &&
      ((consolidateResult?.consolidatedCount ?? 0) > 0 || report.promoted > 0);

    let commitSha: string | null = null;
    if (hasChanges) {
      try {
        await this.deps.versionControl.commitInWorktree(
          worktree.path,
          [...touchedPaths],
          ':recycle: [lint] consolidate + promote',
        );
        await this.deps.versionControl.squashWorktree(
          worktree.path,
          ':recycle: [lint] consolidate + promote',
        );
        commitSha = await this.deps.versionControl.mergeWorktree(worktree.path);
      } catch (err) {
        if (err instanceof GitConflictError) throw err;
        await this.safeRemoveWorktree(worktree.path, true);
        throw err;
      }
    }

    if (hasChanges) {
      for (const p of touchedPaths) {
        if (!p.startsWith('wiki/') && !p.startsWith('projects/')) continue;
        const data = await this.deps.mainFileStore.readWikiPage(p);
        if (!data) continue;
        await this.deps.searchEngine.index({
          path: p,
          title: data.frontmatter.title,
          content: data.content,
          updated: data.frontmatter.updated,
        });
      }
    }

    await this.deps.stateStore.update({ last_lint: this.now().toISOString() });
    await this.safeRemoveWorktree(worktree.path);

    if (consolidateResult?.archivedEntries && consolidateResult.archivedEntries.length > 0) {
      const grouped = this.groupByMonthAndAgent(consolidateResult.archivedEntries);
      for (const [archivePath, entries] of grouped) {
        await this.deps.archiver.createArchive(archivePath, entries);
      }
    }

    return commitSha ? report.withCommit(commitSha) : report;
  }

  private groupByMonthAndAgent(entries: ArchiveEntry[]): Map<string, ArchiveEntry[]> {
    const groups = new Map<string, ArchiveEntry[]>();
    for (const entry of entries) {
      const normalised = entry.sourcePath.split(path.sep).join('/');
      const segments = normalised.split('/');
      const logIdx = segments.lastIndexOf('log');
      if (logIdx === -1 || segments.length < logIdx + 4) continue;
      const agent = segments[logIdx + 1];
      const raw = segments[logIdx + 2];
      const filename = segments[logIdx + 3] ?? '';
      if (raw !== 'raw') continue;
      const yearMonth = filename.slice(0, 7);
      const archivePath = `${this.deps.mainRepoRoot}/.archive/${yearMonth}-${agent}.7z`;
      const bucket = groups.get(archivePath) ?? [];
      bucket.push(entry);
      groups.set(archivePath, bucket);
    }
    return groups;
  }

  private async safeRemoveWorktree(worktreePath: string, force = false): Promise<void> {
    try {
      await this.deps.versionControl.removeWorktree(worktreePath, force || undefined);
    } catch {
      // caller is already on an error or success path
    }
  }
}
