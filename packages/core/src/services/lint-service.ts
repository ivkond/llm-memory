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
  project?: string;
}

export type VerbatimStoreFactory = (fileStore: IFileStore) => IVerbatimStore;

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
    void req.project;
    const phaseSet = new Set<LintPhaseName>(req.phases ?? ALL_PHASES);

    const worktree = await this.deps.versionControl.createWorktree('lint');
    const wtFileStore = this.deps.fileStoreFactory(worktree.path);
    const wtVerbatimStore = this.deps.verbatimStoreFactory(wtFileStore);

    const touchedPaths = new Set<string>();
    let report: LintReport;
    let consolidateResult: ConsolidateRunResult | null;
    try {
      ({ report, consolidateResult } = await this.runPhases(
        phaseSet,
        wtFileStore,
        wtVerbatimStore,
        touchedPaths,
      ));
    } catch (err) {
      await this.safeRemoveWorktree(worktree.path, true);
      throw err;
    }

    const hasChanges =
      touchedPaths.size > 0 &&
      ((consolidateResult?.consolidatedCount ?? 0) > 0 || report.promoted > 0);

    const commitSha = hasChanges ? await this.commitAndMerge(worktree.path, touchedPaths) : null;

    if (hasChanges) {
      await this.reindexTouched(touchedPaths);
    }

    await this.deps.stateStore.update({ last_lint: this.now().toISOString() });
    await this.safeRemoveWorktree(worktree.path);

    await this.runArchival(consolidateResult);

    return commitSha ? report.withCommit(commitSha) : report;
  }

  private async runPhases(
    phaseSet: Set<LintPhaseName>,
    wtFileStore: IFileStore,
    wtVerbatimStore: IVerbatimStore,
    touchedPaths: Set<string>,
  ): Promise<{ report: LintReport; consolidateResult: ConsolidateRunResult | null }> {
    let report = LintReport.empty();
    let consolidateResult: ConsolidateRunResult | null = null;

    if (phaseSet.has('consolidate')) {
      consolidateResult = await this.deps.makeConsolidatePhase(wtFileStore, wtVerbatimStore).run();
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
      const result = await this.deps.makePromotePhase(wtFileStore).run();
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
      const result = await this.deps.makeHealthPhase(wtFileStore).run();
      report = report.merge(
        LintReport.from({
          consolidated: 0,
          promoted: 0,
          issues: result.issues,
          commitSha: null,
        }),
      );
    }

    return { report, consolidateResult };
  }

  private async commitAndMerge(worktreePath: string, touchedPaths: Set<string>): Promise<string> {
    const message = ':recycle: [lint] consolidate + promote';
    try {
      await this.deps.versionControl.commitInWorktree(worktreePath, [...touchedPaths], message);
      await this.deps.versionControl.squashWorktree(worktreePath, message);
      return await this.deps.versionControl.mergeWorktree(worktreePath);
    } catch (err) {
      if (err instanceof GitConflictError) throw err;
      await this.safeRemoveWorktree(worktreePath, true);
      throw err;
    }
  }

  private async reindexTouched(touchedPaths: Set<string>): Promise<void> {
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

  private async runArchival(consolidateResult: ConsolidateRunResult | null): Promise<void> {
    const archived = consolidateResult?.archivedEntries;
    if (!archived || archived.length === 0) return;
    const grouped = this.groupByMonthAndAgent(archived);
    for (const [archivePath, entries] of grouped) {
      await this.deps.archiver.createArchive(archivePath, entries);
    }
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
