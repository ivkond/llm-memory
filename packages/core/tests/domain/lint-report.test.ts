import { describe, it, expect } from 'vitest';
import { LintReport } from '../../src/domain/lint-report.js';
import { HealthIssueSeverity, HealthIssueType } from '../../src/domain/health-issue.js';

describe('LintReport', () => {
  it('defaults every counter to zero', () => {
    const report = LintReport.empty();
    expect(report.consolidated).toBe(0);
    expect(report.promoted).toBe(0);
    expect(report.issues).toEqual([]);
    expect(report.commitSha).toBeNull();
  });

  it('merges two reports by summing counters and concatenating issues', () => {
    const a = LintReport.from({
      consolidated: 3,
      promoted: 1,
      issues: [
        {
          code: 'HEALTH_ORPHAN_PAGE',
          type: HealthIssueType.Orphan,
          severity: HealthIssueSeverity.Warning,
          page: 'a.md',
          description: 'x',
        },
      ],
      commitSha: null,
    });
    const b = LintReport.from({
      consolidated: 2,
      promoted: 4,
      issues: [
        {
          code: 'HEALTH_STALE_PAGE',
          type: HealthIssueType.Stale,
          severity: HealthIssueSeverity.Warning,
          page: 'b.md',
          description: 'y',
        },
      ],
      commitSha: null,
    });
    const merged = a.merge(b);
    expect(merged.consolidated).toBe(5);
    expect(merged.promoted).toBe(5);
    expect(merged.issues).toHaveLength(2);
  });

  it('withCommit returns a copy carrying the SHA', () => {
    const base = LintReport.empty();
    const sealed = base.withCommit('abc123');
    expect(sealed.commitSha).toBe('abc123');
    expect(base.commitSha).toBeNull();
  });
});
