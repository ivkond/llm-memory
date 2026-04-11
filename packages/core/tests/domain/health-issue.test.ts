import { describe, it, expect } from 'vitest';
import { HealthIssue, HealthIssueType } from '../../src/domain/health-issue.js';

describe('HealthIssue', () => {
  it('carries type, page path, and human description', () => {
    const issue = HealthIssue.create({
      type: HealthIssueType.Orphan,
      page: 'wiki/tools/postgresql.md',
      description: 'No inbound links from any other page',
    });
    expect(issue.type).toBe('orphan');
    expect(issue.page).toBe('wiki/tools/postgresql.md');
    expect(issue.description).toContain('No inbound');
  });

  it('serialises to a plain object', () => {
    const issue = HealthIssue.create({
      type: HealthIssueType.Stale,
      page: 'wiki/a.md',
      description: 'Last updated > 365 days ago',
    });
    expect(issue.toData()).toEqual({
      type: 'stale',
      page: 'wiki/a.md',
      description: 'Last updated > 365 days ago',
    });
  });

  it('rejects empty page path', () => {
    expect(() =>
      HealthIssue.create({
        type: HealthIssueType.Orphan,
        page: '',
        description: 'x',
      }),
    ).toThrow(/page/i);
  });
});
