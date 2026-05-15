import { HealthIssue, type HealthIssueData } from './health-issue.js';

export interface LintReportData {
  consolidated: number;
  promoted: number;
  issues: HealthIssueData[];
  commitSha: string | null;
}

export class LintReport {
  private constructor(
    public readonly consolidated: number,
    public readonly promoted: number,
    public readonly issues: readonly HealthIssue[],
    public readonly commitSha: string | null,
  ) {}

  static empty(): LintReport {
    return new LintReport(0, 0, [], null);
  }

  static from(data: LintReportData): LintReport {
    return new LintReport(
      data.consolidated,
      data.promoted,
      data.issues.map((issue) => HealthIssue.create(issue)),
      data.commitSha,
    );
  }

  merge(other: LintReport): LintReport {
    return new LintReport(
      this.consolidated + other.consolidated,
      this.promoted + other.promoted,
      [...this.issues, ...other.issues],
      other.commitSha ?? this.commitSha,
    );
  }

  withCommit(sha: string): LintReport {
    return new LintReport(this.consolidated, this.promoted, [...this.issues], sha);
  }

  toData(): LintReportData {
    return {
      consolidated: this.consolidated,
      promoted: this.promoted,
      issues: this.issues.map((issue) => issue.toData()),
      commitSha: this.commitSha,
    };
  }
}
