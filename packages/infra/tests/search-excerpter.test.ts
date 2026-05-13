import { describe, expect, it } from 'vitest';
import { excerptFirstParagraph } from '../src/search/search-excerpter.js';

describe('excerptFirstParagraph', () => {
  it('skips headings and blank lines and returns first paragraph', () => {
    const input = '# Title\n\n## Subtitle\n\nFirst sentence.\nSecond sentence.\n\nThird paragraph.';
    expect(excerptFirstParagraph(input)).toBe('First sentence. Second sentence.');
  });

  it('truncates to 240 characters with ellipsis', () => {
    const base = 'a'.repeat(260);
    const result = excerptFirstParagraph(base);
    expect(result.length).toBe(240);
    expect(result.endsWith('...')).toBe(true);
  });
});
