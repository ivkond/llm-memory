import { describe, it, expect } from 'vitest';
import { HealthIssue, HealthIssueSeverity, HealthIssueType } from '../../src/domain/health-issue.js';

describe('HealthIssue', () => {
  it('carries type, page path, and human description', () => {
    const issue = HealthIssue.create({
      code: 'HEALTH_ORPHAN_PAGE',
      type: HealthIssueType.Orphan,
      severity: HealthIssueSeverity.Warning,
      page: 'wiki/tools/postgresql.md',
      description: 'No inbound links from any other page',
    });
    expect(issue.code).toBe('HEALTH_ORPHAN_PAGE');
    expect(issue.type).toBe('orphan');
    expect(issue.severity).toBe('warning');
    expect(issue.page).toBe('wiki/tools/postgresql.md');
    expect(issue.description).toContain('No inbound');
  });

  it('serialises to a plain object', () => {
    const issue = HealthIssue.create({
      code: 'HEALTH_STALE_PAGE',
      type: HealthIssueType.Stale,
      severity: HealthIssueSeverity.Warning,
      page: 'wiki/a.md',
      description: 'Last updated > 365 days ago',
    });
    expect(issue.toData()).toEqual({
      code: 'HEALTH_STALE_PAGE',
      type: 'stale',
      severity: 'warning',
      page: 'wiki/a.md',
      description: 'Last updated > 365 days ago',
    });
  });

  it('rejects empty page path', () => {
    expect(() =>
      HealthIssue.create({
        code: 'HEALTH_ORPHAN_PAGE',
        type: HealthIssueType.Orphan,
        severity: HealthIssueSeverity.Warning,
        page: '',
        description: 'x',
      }),
    ).toThrow(/page/i);
  });
});
