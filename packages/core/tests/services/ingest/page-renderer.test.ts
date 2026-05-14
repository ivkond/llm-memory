import { describe, expect, it, vi } from 'vitest';
import { renderIngestPageBody } from '../../../src/services/ingest/page-renderer.js';

describe('renderIngestPageBody', () => {
  it('renders deterministic frontmatter and trims content', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));

    const body = renderIngestPageBody(
      {
        path: 'wiki/tools/postgresql.md',
        title: 'PostgreSQL: Quick "Guide"',
        content: '\n\n## Summary\nBody\n\n',
      },
      'https://example.com/path?q=1',
    );

    expect(body).toContain('title: "PostgreSQL: Quick \\"Guide\\""');
    expect(body).toContain('created: 2026-05-13');
    expect(body).toContain('updated: 2026-05-13');
    expect(body).toContain('  - "https://example.com/path?q=1"');
    expect(body.endsWith('\n')).toBe(true);
    expect(body).toContain('\n## Summary\nBody\n');

    vi.useRealTimers();
  });
});
