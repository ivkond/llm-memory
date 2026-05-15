import type { HealthIssue } from './health-issue.js';

export interface LintReportData {
  consolidated: number;
  promoted: number;
  lowSignal?: number;
  reviewQueue?: number;
  issues: HealthIssue[];
  commitSha: string | null;
}

export class LintReport {
  private constructor(
    public readonly consolidated: number,
    public readonly promoted: number,
    public readonly lowSignal: number,
    public readonly reviewQueue: number,
    public readonly issues: readonly HealthIssue[],
    public readonly commitSha: string | null,
  ) {}

  static empty(): LintReport {
    return new LintReport(0, 0, 0, 0, [], null);
  }

  static from(data: LintReportData): LintReport {
    return new LintReport(
      data.consolidated,
      data.promoted,
      data.lowSignal ?? 0,
      data.reviewQueue ?? 0,
      [...data.issues],
      data.commitSha,
    );
  }

  merge(other: LintReport): LintReport {
    return new LintReport(
      this.consolidated + other.consolidated,
      this.promoted + other.promoted,
      this.lowSignal + other.lowSignal,
      this.reviewQueue + other.reviewQueue,
      [...this.issues, ...other.issues],
      other.commitSha ?? this.commitSha,
    );
  }

  withCommit(sha: string): LintReport {
    return new LintReport(
      this.consolidated,
      this.promoted,
      this.lowSignal,
      this.reviewQueue,
      [...this.issues],
      sha,
    );
  }

  toData(): LintReportData {
    return {
      consolidated: this.consolidated,
      promoted: this.promoted,
      lowSignal: this.lowSignal,
      reviewQueue: this.reviewQueue,
      issues: [...this.issues],
      commitSha: this.commitSha,
    };
  }
}
