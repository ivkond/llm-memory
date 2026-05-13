import type { IFileStore } from '../ports/file-store.js';
import type { ISearchEngine, IndexEntry } from '../ports/search-engine.js';
import type { IStateStore } from '../ports/state-store.js';
import type { IVersionControl } from '../ports/version-control.js';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface DiagnosticFinding {
  severity: DiagnosticSeverity;
  component: 'wiki' | 'git' | 'index' | 'state';
  code: string;
  message: string;
  evidence?: string;
  repair_command?: string;
}

export interface DoctorResponse {
  ok: boolean;
  findings: DiagnosticFinding[];
}

export interface VerifyStateResponse {
  ok: boolean;
  findings: DiagnosticFinding[];
}

export interface RepairIndexRequest {
  dryRun?: boolean;
}

export interface RepairIndexResponse {
  dry_run: boolean;
  indexed: number;
  paths: string[];
}

export class RecoveryDiagnosticsService {
  constructor(
    private readonly fileStore: IFileStore,
    private readonly searchEngine: ISearchEngine,
    private readonly stateStore: IStateStore,
    private readonly versionControl: IVersionControl,
  ) {}

  async doctor(): Promise<DoctorResponse> {
    const findings: DiagnosticFinding[] = [];

    findings.push(...(await this.verifyWikiMarkers()));
    findings.push(...(await this.verifyIndexHealth()));
    findings.push(...(await this.verifyRuntimeState()));
    findings.push(...(await this.verifyGitState()));

    return { ok: !findings.some((f) => f.severity === 'error'), findings };
  }

  async verifyState(): Promise<VerifyStateResponse> {
    const findings: DiagnosticFinding[] = [];

    findings.push(...(await this.verifyWikiMarkers()));
    findings.push(...(await this.verifyRuntimeState()));

    return { ok: !findings.some((f) => f.severity === 'error'), findings };
  }

  async repairIndex(request: RepairIndexRequest = {}): Promise<RepairIndexResponse> {
    const dryRun = request.dryRun ?? false;
    const entries = await this.collectIndexEntries();

    if (!dryRun) {
      await this.searchEngine.rebuild(entries);
    }

    return {
      dry_run: dryRun,
      indexed: entries.length,
      paths: entries.map((e) => e.path),
    };
  }

  private async verifyWikiMarkers(): Promise<DiagnosticFinding[]> {
    const required = ['.config/settings.shared.yaml', 'wiki', 'projects', '.local'];
    const findings: DiagnosticFinding[] = [];

    for (const marker of required) {
      if (!(await this.fileStore.exists(marker))) {
        findings.push({
          severity: 'error',
          component: 'wiki',
          code: 'missing_wiki_marker',
          message: `Missing required wiki path: ${marker}`,
          evidence: marker,
          repair_command: 'llm-wiki init --force',
        });
      }
    }

    return findings;
  }

  private async verifyIndexHealth(): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = [];
    const health = await this.searchEngine.health();

    if (health === 'missing') {
      findings.push({
        severity: 'warning',
        component: 'index',
        code: 'index_missing',
        message: 'Search index is missing',
        repair_command: 'llm-wiki repair-index',
      });
    }

    if (health === 'stale') {
      findings.push({
        severity: 'warning',
        component: 'index',
        code: 'index_stale',
        message: 'Search index is stale',
        repair_command: 'llm-wiki repair-index',
      });
    }

    return findings;
  }

  private async verifyRuntimeState(): Promise<DiagnosticFinding[]> {
    try {
      await this.stateStore.load();
      return [];
    } catch (error) {
      return [
        {
          severity: 'error',
          component: 'state',
          code: 'state_unreadable',
          message: 'Failed to load runtime state',
          evidence: error instanceof Error ? error.message : String(error),
          repair_command: 'Move .local/state.yaml aside and rerun command',
        },
      ];
    }
  }

  private async verifyGitState(): Promise<DiagnosticFinding[]> {
    try {
      const dirty = await this.versionControl.hasUncommittedChanges();
      if (!dirty) {
        return [];
      }

      return [
        {
          severity: 'warning',
          component: 'git',
          code: 'git_dirty',
          message: 'Repository has uncommitted changes',
          repair_command: 'Commit or stash changes before recovery actions',
        },
      ];
    } catch (error) {
      return [
        {
          severity: 'error',
          component: 'git',
          code: 'git_unavailable',
          message: 'Failed to inspect git repository state',
          evidence: error instanceof Error ? error.message : String(error),
          repair_command: 'Ensure the wiki root is a valid git repository',
        },
      ];
    }
  }

  private async collectIndexEntries(): Promise<IndexEntry[]> {
    const files = [...(await this.fileStore.listFiles('wiki')), ...(await this.fileStore.listFiles('projects'))];

    const entries: IndexEntry[] = [];
    for (const info of files) {
      const page = await this.fileStore.readWikiPage(info.path);
      if (!page) {
        continue;
      }

      entries.push({
        path: info.path,
        title: page.frontmatter.title,
        content: page.content,
        updated: page.frontmatter.updated || info.updated,
      });
    }

    return entries;
  }
}
