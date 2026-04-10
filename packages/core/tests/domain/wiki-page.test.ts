import { describe, it, expect } from 'vitest';
import { WikiPage } from '../../src/domain/wiki-page.js';

describe('WikiPage', () => {
  it('test_fromParsedData_validData_constructsAllFields', () => {
    const page = WikiPage.fromParsedData('wiki/concepts/test.md', {
      frontmatter: {
        title: 'Test Page',
        created: '2026-04-09',
        updated: '2026-04-09',
        confidence: 0.9,
        sources: ['projects/cli-relay/practices.md'],
        supersedes: null,
        tags: ['testing', 'postgresql'],
      },
      content: '## Summary\n\nSome content here.\n\n## See also\n\n- [Other page](../tools/pg.md)',
    });

    expect(page.path).toBe('wiki/concepts/test.md');
    expect(page.title).toBe('Test Page');
    expect(page.confidence).toBe(0.9);
    expect(page.tags).toEqual(['testing', 'postgresql']);
    expect(page.sources).toEqual(['projects/cli-relay/practices.md']);
    expect(page.supersedes).toBeNull();
    expect(page.content).toContain('Some content here.');
    expect(page.crossrefs).toEqual(['../tools/pg.md']);
  });

  it('test_fromParsedData_missingTitle_usesFilename', () => {
    const page = WikiPage.fromParsedData('wiki/concepts/my-topic.md', {
      frontmatter: {
        title: undefined as unknown as string,
        created: '2026-04-09',
        updated: '2026-04-09',
        confidence: 0.5,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: 'Content.',
    });
    expect(page.title).toBe('my-topic');
  });

  it('test_toData_roundtrip_preservesContent', () => {
    const original = WikiPage.fromParsedData('wiki/test.md', {
      frontmatter: {
        title: 'Test Page',
        created: '2026-04-09',
        updated: '2026-04-09',
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: '## Summary\n\nContent here.',
    });

    const data = original.toData();
    const reparsed = WikiPage.fromParsedData('wiki/test.md', data);

    expect(reparsed.title).toBe(original.title);
    expect(reparsed.confidence).toBe(original.confidence);
    expect(reparsed.content).toContain('Content here.');
  });

  it('test_summary_extractsFirstParagraph', () => {
    const page = WikiPage.fromParsedData('wiki/test.md', {
      frontmatter: {
        title: 'Test',
        created: '2026-04-09',
        updated: '2026-04-09',
        confidence: 0.5,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content: '## Summary\n\nFirst paragraph is the summary.\n\n## Details\n\nMore details here.',
    });
    expect(page.summary).toBe('First paragraph is the summary.');
  });
});
