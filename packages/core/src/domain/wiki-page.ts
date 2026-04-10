export interface WikiPageFrontmatter {
  title: string;
  created: string;
  updated: string;
  confidence: number;
  sources: string[];
  supersedes: string | null;
  tags: string[];
}

export interface WikiPageData {
  frontmatter: WikiPageFrontmatter;
  content: string;
}

export class WikiPage {
  private constructor(
    public readonly path: string,
    public readonly title: string,
    public readonly created: string,
    public readonly updated: string,
    public readonly confidence: number,
    public readonly sources: string[],
    public readonly supersedes: string | null,
    public readonly tags: string[],
    public readonly content: string,
  ) {}

  static fromParsedData(filePath: string, data: WikiPageData): WikiPage {
    const basename = filePath.split('/').pop()?.replace('.md', '') ?? 'untitled';

    return new WikiPage(
      filePath,
      data.frontmatter.title ?? basename,
      data.frontmatter.created ?? new Date().toISOString().slice(0, 10),
      data.frontmatter.updated ?? new Date().toISOString().slice(0, 10),
      data.frontmatter.confidence ?? 0.5,
      data.frontmatter.sources ?? [],
      data.frontmatter.supersedes ?? null,
      data.frontmatter.tags ?? [],
      data.content.trim(),
    );
  }

  toData(): WikiPageData {
    return {
      frontmatter: {
        title: this.title,
        created: this.created,
        updated: this.updated,
        confidence: this.confidence,
        sources: this.sources,
        supersedes: this.supersedes,
        tags: this.tags,
      },
      content: this.content,
    };
  }

  get summary(): string {
    const lines = this.content.split('\n');
    const paragraphs: string[] = [];
    let current = '';

    for (const line of lines) {
      if (line.startsWith('#')) {
        if (current.trim()) paragraphs.push(current.trim());
        current = '';
        continue;
      }
      if (line.trim() === '') {
        if (current.trim()) paragraphs.push(current.trim());
        current = '';
        continue;
      }
      current += (current ? ' ' : '') + line.trim();
    }
    if (current.trim()) paragraphs.push(current.trim());

    return paragraphs[0] ?? '';
  }

  get crossrefs(): string[] {
    const linkRegex = /\[([^\]]*)\]\(([^)]+\.md)\)/g;
    const refs: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(this.content)) !== null) {
      refs.push(match[2]);
    }
    return refs;
  }
}
