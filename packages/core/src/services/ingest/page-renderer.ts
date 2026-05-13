import type { ExtractedPage } from './types.js';

/**
 * Emit a deterministic YAML frontmatter + body string for a single page.
 *
 * Core intentionally does not depend on gray-matter / js-yaml — those are
 * infra concerns. This minimal emitter handles the closed field set defined
 * by WikiPageFrontmatter and quotes any string that could trip a YAML
 * parser.
 */
export function renderIngestPageBody(page: ExtractedPage, sourceUri: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const fm = [
    '---',
    `title: ${yamlString(page.title)}`,
    `created: ${today}`,
    `updated: ${today}`,
    'confidence: 0.8',
    'sources:',
    `  - ${yamlString(sourceUri)}`,
    'supersedes: null',
    'tags: []',
    '---',
    '',
  ].join('\n');
  return `${fm}\n${page.content.trim()}\n`;
}

/** Quote strings that could trip a YAML parser. Anything matching a
 *  plain-scalar shape (letters, digits, spaces, `-` `_` `.` `/` `:`) is
 *  left as-is; everything else is double-quoted with JSON escaping. */
function yamlString(value: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/.test(value)) return value;
  return JSON.stringify(value);
}
