import { describe, it, expect } from 'vitest';
import { HealthPhase } from '../../../src/services/lint/health-phase.js';
import { HealthIssueType } from '../../../src/domain/health-issue.js';
import type { IFileStore, FileInfo } from '../../../src/ports/index.js';
import type { WikiPageData } from '../../../src/domain/wiki-page.js';

class FakeFileStore implements IFileStore {
  files: Record<string, WikiPageData> = {};
  async readFile(): Promise<string | null> {
    return null;
  }
  async writeFile(): Promise<void> {
    // HealthPhase is read-only — never writes through this fake.
  }
  async listFiles(dir: string): Promise<FileInfo[]> {
    return Object.keys(this.files)
      .filter((k) => k.startsWith(dir + '/') || k === dir)
      .map((k) => ({ path: k, updated: this.files[k].frontmatter.updated }));
  }
  async exists(p: string): Promise<boolean> {
    return p in this.files;
  }
  async readWikiPage(p: string): Promise<WikiPageData | null> {
    return this.files[p] ?? null;
  }
}

function page(updated: string, content: string, confidence = 0.8): WikiPageData {
  return {
    frontmatter: {
      title: 't',
      created: '2025-01-01',
      updated,
      confidence,
      sources: [],
      supersedes: null,
      tags: [],
    },
    content,
  };
}

describe('HealthPhase', () => {
  it('reports no issues for a healthy wiki', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/a.md'] = page('2026-04-01', '[b](b.md)');
    fs.files['wiki/b.md'] = page('2026-04-01', '[a](a.md)');
    const phase = new HealthPhase(fs, {
      now: () => new Date('2026-04-10T00:00:00Z'),
      staleDays: 365,
    });
    const result = await phase.run();
    expect(result.issues).toEqual([]);
  });

  it('flags orphan pages', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/a.md'] = page('2026-04-01', '');
    fs.files['wiki/b.md'] = page('2026-04-01', '');
    const phase = new HealthPhase(fs, {
      now: () => new Date('2026-04-10T00:00:00Z'),
      staleDays: 365,
    });
    const result = await phase.run();
    const orphans = result.issues.filter((i) => i.type === HealthIssueType.Orphan);
    expect(orphans.map((i) => i.page).sort()).toEqual(['wiki/a.md', 'wiki/b.md']);
  });

  it('flags stale pages older than threshold with low confidence', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/old.md'] = page('2024-01-01', '[x](x.md)', 0.3);
    fs.files['wiki/x.md'] = page('2026-04-01', '[old](old.md)');
    const phase = new HealthPhase(fs, {
      now: () => new Date('2026-04-10T00:00:00Z'),
      staleDays: 365,
    });
    const result = await phase.run();
    const stale = result.issues.filter((i) => i.type === HealthIssueType.Stale);
    expect(stale.map((i) => i.page)).toEqual(['wiki/old.md']);
  });

  it('does NOT flag old pages with high confidence as stale', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/old.md'] = page('2024-01-01', '[x](x.md)', 0.95);
    fs.files['wiki/x.md'] = page('2026-04-01', '[old](old.md)');
    const phase = new HealthPhase(fs, {
      now: () => new Date('2026-04-10T00:00:00Z'),
      staleDays: 365,
    });
    const result = await phase.run();
    expect(result.issues.filter((i) => i.type === HealthIssueType.Stale)).toEqual([]);
  });

  it('flags broken relative links', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/a.md'] = page('2026-04-01', 'See [missing](missing.md)');
    fs.files['wiki/b.md'] = page('2026-04-01', '[a](a.md)');
    const phase = new HealthPhase(fs, {
      now: () => new Date('2026-04-10T00:00:00Z'),
      staleDays: 365,
    });
    const result = await phase.run();
    const broken = result.issues.filter((i) => i.type === HealthIssueType.BrokenLink);
    expect(broken).toHaveLength(1);
    expect(broken[0].page).toBe('wiki/a.md');
    expect(broken[0].description).toContain('missing.md');
  });

  it('ignores wiki/index.md from orphan detection', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/index.md'] = page('2026-04-01', '');
    fs.files['wiki/a.md'] = page('2026-04-01', '[other](index.md)');
    const phase = new HealthPhase(fs, {
      now: () => new Date('2026-04-10T00:00:00Z'),
      staleDays: 365,
    });
    const result = await phase.run();
    const orphans = result.issues.filter((i) => i.type === HealthIssueType.Orphan);
    expect(orphans.map((i) => i.page)).toEqual(['wiki/a.md']);
  });

  it('flags pages with unresolved conflict sections', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/a.md'] = page(
      '2026-04-01',
      ['[b](b.md)', '', '## Unresolved conflicts', '- Source A says X', '- Source B says Y'].join(
        '\n',
      ),
    );
    fs.files['wiki/b.md'] = page('2026-04-01', '[a](a.md)');

    const phase = new HealthPhase(fs);
    const result = await phase.run();
    const contradictions = result.issues.filter((i) => i.type === HealthIssueType.Contradiction);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].page).toBe('wiki/a.md');
    expect(contradictions[0].description).toContain('2 item(s)');
  });

  it('recognizes "Conflicts" heading and numbered lists', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/a.md'] = page(
      '2026-04-01',
      ['[b](b.md)', '', '## Conflicts', '1. Claim one', '2. Claim two'].join('\n'),
    );
    fs.files['wiki/b.md'] = page('2026-04-01', '[a](a.md)');

    const phase = new HealthPhase(fs);
    const result = await phase.run();
    const contradictions = result.issues.filter((i) => i.type === HealthIssueType.Contradiction);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].description).toContain('2 item(s)');
  });

  it('does not flag prose mentions, empty sections, or fenced code headings', async () => {
    const fs = new FakeFileStore();
    fs.files['wiki/prose.md'] = page('2026-04-01', '[x](x.md)\nThis page discusses conflict resolution.');
    fs.files['wiki/empty.md'] = page('2026-04-01', '[x](x.md)\n## Unresolved conflicts');
    fs.files['wiki/code.md'] = page(
      '2026-04-01',
      ['[x](x.md)', '```md', '## Unresolved conflicts', '- not real', '```'].join('\n'),
    );
    fs.files['wiki/x.md'] = page('2026-04-01', '[prose](prose.md)\n[empty](empty.md)\n[code](code.md)');

    const phase = new HealthPhase(fs);
    const result = await phase.run();
    const contradictions = result.issues.filter((i) => i.type === HealthIssueType.Contradiction);
    expect(contradictions).toEqual([]);
  });
});
