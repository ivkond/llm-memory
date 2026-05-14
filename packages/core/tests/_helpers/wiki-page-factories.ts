import type { WikiPageData } from '../../src/domain/wiki-page.js';
import type { FileInfo } from '../../src/ports/index.js';

export function makePageRecord(
  filePath: string,
  title: string,
  updated: string,
  content = 'body',
): { info: FileInfo; page: WikiPageData } {
  return {
    info: { path: filePath, updated },
    page: {
      frontmatter: {
        title,
        created: updated,
        updated,
        confidence: 0.9,
        sources: [],
        supersedes: null,
        tags: [],
      },
      content,
    },
  };
}
