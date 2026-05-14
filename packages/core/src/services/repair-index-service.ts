import type { IFileStore, FileInfo } from '../ports/file-store.js';
import type { ISearchEngine, IndexEntry } from '../ports/search-engine.js';

export interface RepairIndexRequest {
  dryRun?: boolean;
}

export type RepairIndexStatus = 'noop' | 'planned' | 'rebuilt';

export interface RepairIndexResponse {
  status: RepairIndexStatus;
  dry_run: boolean;
  candidates: number;
  indexed: number;
  skipped: number;
  paths: string[];
}

const OPERATIONAL_SEGMENTS = new Set(['log', '.local', '.archive', '.worktrees']);

export class RepairIndexService {
  constructor(
    private readonly fileStore: IFileStore,
    private readonly searchEngine: ISearchEngine,
  ) {}

  async repair(req: RepairIndexRequest = {}): Promise<RepairIndexResponse> {
    const dryRun = req.dryRun ?? false;
    const all = await this.listCandidates();
    const paths = all.map((f) => f.path);

    const entries: IndexEntry[] = [];
    for (const file of all) {
      const page = await this.fileStore.readWikiPage(file.path);
      if (!page) continue;
      entries.push({
        path: file.path,
        title: page.frontmatter.title,
        content: page.content,
        updated: page.frontmatter.updated,
      });
    }

    if (!dryRun && entries.length > 0) {
      await this.searchEngine.rebuild(entries);
    }

    const status: RepairIndexStatus =
      entries.length === 0 ? 'noop' : dryRun ? 'planned' : 'rebuilt';

    return {
      status,
      dry_run: dryRun,
      candidates: paths.length,
      indexed: dryRun ? 0 : entries.length,
      skipped: paths.length - entries.length,
      paths,
    };
  }

  private async listCandidates(): Promise<FileInfo[]> {
    const [wikiFiles, projectFiles] = await Promise.all([
      this.fileStore.listFiles('wiki'),
      this.fileStore.listFiles('projects'),
    ]);

    return [...wikiFiles, ...projectFiles].filter((f) => this.isRepairCandidate(f.path));
  }

  private isRepairCandidate(relativePath: string): boolean {
    if (!relativePath.endsWith('.md')) return false;
    if (!relativePath.startsWith('wiki/') && !relativePath.startsWith('projects/')) return false;

    const segments = relativePath.split('/');
    for (const segment of segments) {
      if (OPERATIONAL_SEGMENTS.has(segment)) return false;
    }

    return true;
  }
}
