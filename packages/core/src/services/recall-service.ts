import { WikiPage } from '../domain/wiki-page.js';
import { WikiEmptyError } from '../domain/errors.js';
import type { IFileStore } from '../ports/file-store.js';
import type { IVerbatimStore } from '../ports/verbatim-store.js';
import type { IProjectResolver } from '../ports/project-resolver.js';

export interface RecallRequest {
  cwd: string;
  max_tokens?: number;
}

export interface RecallPageInfo {
  path: string;
  title: string;
  summary: string;
  updated: string;
}

export interface RecallResponse {
  project: string | null;
  pages: RecallPageInfo[];
  unconsolidated_count: number;
  total_pages: number;
}

const DEFAULT_MAX_TOKENS = 2048;
const PROJECT_BUDGET_RATIO = 0.7;
const APPROX_TOKENS_PER_PAGE = 50;

export class RecallService {
  constructor(
    private readonly fileStore: IFileStore,
    private readonly verbatimStore: IVerbatimStore,
    private readonly projectResolver: IProjectResolver,
  ) {}

  async recall(req: RecallRequest): Promise<RecallResponse> {
    const maxTokens = req.max_tokens ?? DEFAULT_MAX_TOKENS;
    const project = await this.projectResolver.resolve(req.cwd);

    const projectPages = project
      ? await this.loadPageInfos(`projects/${project}`)
      : [];

    const wikiPages = await this.loadPageInfos('wiki');

    if (projectPages.length === 0 && wikiPages.length === 0) {
      throw new WikiEmptyError();
    }

    // Budget allocation
    const totalBudget = Math.floor(maxTokens / APPROX_TOKENS_PER_PAGE);

    let projectBudget: number;
    let wikiBudget: number;

    if (project && projectPages.length > 0) {
      projectBudget = Math.floor(totalBudget * PROJECT_BUDGET_RATIO);
      wikiBudget = totalBudget - projectBudget;

      // If project doesn't use full budget, give remainder to wiki
      const actualProjectCount = Math.min(projectPages.length, projectBudget);
      const remainder = projectBudget - actualProjectCount;
      projectBudget = actualProjectCount;
      wikiBudget += remainder;
    } else {
      projectBudget = 0;
      wikiBudget = totalBudget;
    }

    const selectedProject = projectPages.slice(0, projectBudget);
    const selectedWiki = wikiPages.slice(0, wikiBudget);
    const pages = [...selectedProject, ...selectedWiki];

    const unconsolidatedCount = await this.verbatimStore.countUnconsolidated();

    return {
      project,
      pages,
      unconsolidated_count: unconsolidatedCount,
      total_pages: projectPages.length + wikiPages.length,
    };
  }

  private async loadPageInfos(directory: string): Promise<RecallPageInfo[]> {
    const files = await this.fileStore.listFiles(directory);
    const infos: RecallPageInfo[] = [];

    for (const file of files) {
      try {
        const data = await this.fileStore.readWikiPage(file.path);
        if (!data) continue;

        const page = WikiPage.fromParsedData(file.path, data);
        infos.push({
          path: page.path,
          title: page.title,
          summary: page.summary,
          updated: page.updated,
        });
      } catch {
        // Skip malformed pages
      }
    }

    // Sort by frontmatter `updated` for deterministic ordering
    infos.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

    return infos;
  }
}
