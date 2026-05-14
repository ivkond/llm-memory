import { HealthIssue, HealthIssueType } from '../../domain/health-issue.js';
import { WikiPage } from '../../domain/wiki-page.js';
import type { IFileStore, FileInfo } from '../../ports/file-store.js';

export interface HealthPhaseOptions {
  now?: () => Date;
  staleDays?: number;
  staleConfidenceThreshold?: number;
}

export interface HealthPhaseResult {
  issues: HealthIssue[];
}

const DEFAULT_STALE_DAYS = 365;
const DEFAULT_STALE_CONFIDENCE = 0.7;
const CONFLICT_HEADINGS = new Set(['unresolved conflicts', 'conflicts']);

export class HealthPhase {
  private readonly now: () => Date;
  private readonly staleMs: number;
  private readonly staleConfidence: number;

  constructor(
    private readonly worktreeFileStore: IFileStore,
    options: HealthPhaseOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.staleMs = (options.staleDays ?? DEFAULT_STALE_DAYS) * 24 * 60 * 60 * 1000;
    this.staleConfidence = options.staleConfidenceThreshold ?? DEFAULT_STALE_CONFIDENCE;
  }

  async run(): Promise<HealthPhaseResult> {
    const wikiFiles = await this.worktreeFileStore.listFiles('wiki');
    const projectFiles = await this.worktreeFileStore.listFiles('projects');
    const all: FileInfo[] = [...wikiFiles, ...projectFiles];

    const pages: WikiPage[] = [];
    for (const info of all) {
      const data = await this.worktreeFileStore.readWikiPage(info.path);
      if (data) pages.push(WikiPage.fromParsedData(info.path, data));
    }

    const issues: HealthIssue[] = [
      ...this.checkOrphans(pages),
      ...this.checkStale(pages),
      ...this.checkBrokenLinks(pages),
      ...this.checkContradictions(pages),
    ];
    return { issues };
  }

  private checkOrphans(pages: WikiPage[]): HealthIssue[] {
    const byPath = new Map(pages.map((p) => [p.path, p]));
    const inboundCount = new Map<string, number>();
    for (const page of pages) {
      for (const ref of page.crossrefs) {
        const resolved = this.resolveLink(page.path, ref);
        if (resolved && byPath.has(resolved)) {
          inboundCount.set(resolved, (inboundCount.get(resolved) ?? 0) + 1);
        }
      }
    }
    const issues: HealthIssue[] = [];
    for (const page of pages) {
      if (page.path === 'wiki/index.md') continue;
      if ((inboundCount.get(page.path) ?? 0) === 0) {
        issues.push(
          HealthIssue.create({
            type: HealthIssueType.Orphan,
            page: page.path,
            description: 'No inbound links from any other page',
          }),
        );
      }
    }
    return issues;
  }

  private checkStale(pages: WikiPage[]): HealthIssue[] {
    const now = this.now().getTime();
    const issues: HealthIssue[] = [];
    for (const page of pages) {
      const updated = Date.parse(page.updated);
      if (Number.isNaN(updated)) continue;
      const ageMs = now - updated;
      if (ageMs > this.staleMs && page.confidence < this.staleConfidence) {
        const days = Math.round(ageMs / (24 * 60 * 60 * 1000));
        issues.push(
          HealthIssue.create({
            type: HealthIssueType.Stale,
            page: page.path,
            description: `Last updated ${days} days ago (confidence ${page.confidence.toFixed(2)})`,
          }),
        );
      }
    }
    return issues;
  }

  private checkBrokenLinks(pages: WikiPage[]): HealthIssue[] {
    const byPath = new Set(pages.map((p) => p.path));
    const issues: HealthIssue[] = [];
    for (const page of pages) {
      for (const ref of page.crossrefs) {
        if (/^https?:/i.test(ref)) continue;
        const resolved = this.resolveLink(page.path, ref);
        if (!resolved) continue;
        if (!byPath.has(resolved)) {
          issues.push(
            HealthIssue.create({
              type: HealthIssueType.BrokenLink,
              page: page.path,
              description: `Broken link to ${ref} (resolved to ${resolved})`,
            }),
          );
        }
      }
    }
    return issues;
  }

  private checkContradictions(pages: WikiPage[]): HealthIssue[] {
    const issues: HealthIssue[] = [];
    for (const page of pages) {
      const count = this.countConflictItems(page.content);
      if (count === 0) continue;
      issues.push(
        HealthIssue.create({
          type: HealthIssueType.Contradiction,
          page: page.path,
          description: `Contains unresolved conflict section with ${count} item(s)`,
        }),
      );
    }
    return issues;
  }

  private countConflictItems(content: string): number {
    const lines = content.split(/\r?\n/);
    let inFence = false;
    let inConflictSection = false;
    let conflictLevel = 0;
    let count = 0;

    for (const line of lines) {
      const fence = line.match(/^(\s*)(`{3,}|~{3,})/);
      if (fence) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const heading = line.match(/^\s*(#{2,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        const title = heading[2].trim().toLowerCase();
        if (CONFLICT_HEADINGS.has(title)) {
          inConflictSection = true;
          conflictLevel = level;
          continue;
        }
        if (inConflictSection && level <= conflictLevel) {
          inConflictSection = false;
          conflictLevel = 0;
        }
      }

      if (!inConflictSection) continue;
      if (/^\s*[-*+]\s+\S/.test(line) || /^\s*\d+\.\s+\S/.test(line)) {
        count += 1;
      }
    }

    return count;
  }

  private resolveLink(sourcePath: string, link: string): string | null {
    if (link.startsWith('/')) return null;
    const fromSegments = sourcePath.split('/').slice(0, -1);
    const linkSegments = link.split('/');
    const stack = [...fromSegments];
    for (const seg of linkSegments) {
      if (seg === '.') continue;
      if (seg === '..') {
        if (stack.length === 0) return null;
        stack.pop();
        continue;
      }
      stack.push(seg);
    }
    return stack.join('/');
  }
}
