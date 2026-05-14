export interface IngestRenderablePage {
  path: string;
  title: string;
  content: string;
}

/**
 * Emit a deterministic YAML frontmatter + body string for a single page.
 */
export function renderIngestPageBody(page: IngestRenderablePage, sourceUri: string): string {
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

/**
 * Quote strings that could trip a YAML parser.
 */
function yamlString(value: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9 \-_./:]*$/.test(value)) return value;
  return JSON.stringify(value);
}
